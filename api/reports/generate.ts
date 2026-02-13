
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

/**
 * Função para calcular distância entre dois pontos (Haversine)
 */
function calcDist(lat1: number, lon1: number, lat2: number, lon2: number) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Formata minutos em string HH:MM
 */
function formatMinutes(minutes: number) {
    const totalMinutes = Math.max(0, Math.floor(minutes));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { run_id } = req.query;

    if (!run_id) {
        return res.status(400).json({ error: 'ID da execução (run_id) é obrigatório.' });
    }

    // Suportar múltiplos IDs (separados por vírgula ou em array)
    const runIds = typeof run_id === 'string' ? run_id.split(',').filter(id => id.trim()) : (Array.isArray(run_id) ? run_id : [run_id]);

    const supabaseUrl = process.env.SUPABASE_URL || 'https://dbhhsyeqsreyekevffsl.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. Buscar dados no Supabase para todos os IDs
        const { data: runs, error: runError } = await supabase.from('optimization_runs').select('*').in('id', runIds);
        if (runError || !runs || runs.length === 0) throw new Error('Nenhuma execução encontrada no banco de dados.');

        const { data: routes } = await supabase.from('routes').select('*').in('run_id', runIds).order('route_date', { ascending: true });
        const actualRouteIds = routes?.map(r => r.id) || [];

        const { data: routePoints } = await supabase.from('route_points')
            .select('*')
            .in('route_id', actualRouteIds);

        const { data: unserved } = await supabase.from('optimization_unserved_points').select('*').in('run_id', runIds);
        const { data: depots } = await supabase.from('depots').select('*');

        // Usar as configurações da primeira execução como base (ou um merge se necessário)
        const settings = runs[0].settings || {};
        const startTimeStr = settings.startTime || "07:00";
        const startTime = startTimeStr.split(':').reduce((h: any, m: any) => h * 60 + +m, 0);
        const avgSpeed = settings.avgSpeed || 35;
        const serviceTime = Number(settings.serviceTime) || 5;

        // 2. Processar dados para as abas
        const resumenFrota: any[] = [];
        const detalhesRotas: any[] = [];
        const pontosNaoAtendidos: any[] = [];

        for (const route of (routes || [])) {
            const points = (routePoints || [])
                .filter((p: any) => p.route_id === route.id)
                .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));

            // Encontrar depósito da unidade ou usar o primeiro
            const depot = depots?.find(d =>
                (d.name && route.unit_name && d.name.toLowerCase().includes(route.unit_name.toLowerCase())) ||
                (d.unit_name && route.unit_name && d.unit_name.toLowerCase().includes(route.unit_name.toLowerCase()))
            ) || depots?.[0] || { latitude: -2.53, longitude: -44.30, address: 'Depósito Padrão' };

            let currentTime = startTime;
            let totalDist = 0;
            let currentLat = Number(depot.latitude);
            let currentLon = Number(depot.longitude);
            let lunchDone = false;

            // 🏭 Saída do Depósito
            detalhesRotas.push({
                'Data': route.route_date,
                'Veículo': route.vehicle_plate,
                'Sequência': 0,
                'Tipo': '🏭 SAÍDA',
                'Cliente': 'Depósito',
                'Endereço': depot.address || depot.name || 'Início da Rota',
                'Peso (kg)': 0,
                'Distância (km)': 0,
                'Horário Chegada': formatMinutes(startTime),
                'Horário Saída': formatMinutes(startTime)
            });

            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const pLat = Number(p.latitude);
                const pLon = Number(p.longitude);

                const dist = calcDist(currentLat, currentLon, pLat, pLon);
                const travelTime = (dist / avgSpeed) * 60;

                let arrivalTime = currentTime + travelTime;

                // Lógica de Almoço (Se passar das 12:00 e ainda não almoçou)
                if (arrivalTime >= 12 * 60 && !lunchDone) {
                    const lunchStart = Math.max(arrivalTime, 12 * 60);
                    detalhesRotas.push({
                        'Data': route.route_date,
                        'Veículo': route.vehicle_plate,
                        'Sequência': `${i + 1}A`,
                        'Tipo': '🍽️ ALMOÇO',
                        'Cliente': 'Intervalo',
                        'Endereço': 'Pausa para Refeição',
                        'Peso (kg)': 0,
                        'Distância (km)': 0,
                        'Horário Chegada': formatMinutes(lunchStart),
                        'Horário Saída': formatMinutes(lunchStart + 60)
                    });
                    arrivalTime = lunchStart + 60;
                    lunchDone = true;
                }

                const departureTime = arrivalTime + serviceTime;

                detalhesRotas.push({
                    'Data': route.route_date,
                    'Veículo': route.vehicle_plate,
                    'Sequência': i + 1,
                    'Tipo': '📍 COLETA',
                    'Cliente': p.client_name,
                    'Endereço': p.address,
                    'Peso (kg)': p.weight,
                    'Distância (km)': Number(dist.toFixed(2)),
                    'Horário Chegada': formatMinutes(arrivalTime),
                    'Horário Saída': formatMinutes(departureTime)
                });

                totalDist += dist;
                currentTime = departureTime;
                currentLat = pLat;
                currentLon = pLon;
            }

            // 🏭 Retorno ao Depósito
            const distRetorno = calcDist(currentLat, currentLon, Number(depot.latitude), Number(depot.longitude));
            const travelTimeRetorno = (distRetorno / avgSpeed) * 60;
            totalDist += distRetorno;

            detalhesRotas.push({
                'Data': route.route_date,
                'Veículo': route.vehicle_plate,
                'Sequência': points.length + 1,
                'Tipo': '🏭 RETORNO',
                'Cliente': 'Depósito',
                'Endereço': depot.address || depot.name || 'Fim da Rota',
                'Peso (kg)': 0,
                'Distância (km)': Number(distRetorno.toFixed(2)),
                'Horário Chegada': formatMinutes(currentTime + travelTimeRetorno),
                'Horário Saída': formatMinutes(currentTime + travelTimeRetorno)
            });

            resumenFrota.push({
                'Data': route.route_date,
                'Veículo': route.vehicle_plate,
                'Pontos': route.point_count,
                'Peso Total (kg)': Number(route.total_weight.toFixed(1)),
                'Capacidade (kg)': 1000,
                'Utilização (%)': Number(((route.total_weight / 1000) * 100).toFixed(1)),
                'Distância Total (km)': Number(totalDist.toFixed(2)),
                'Tempo Total': formatMinutes(currentTime + travelTimeRetorno - startTime)
            });
        }

        // Pontos Não Atendidos
        for (const p of (unserved || [])) {
            pontosNaoAtendidos.push({
                'Cliente': p.client_name,
                'Endereço': p.address,
                'Peso (kg)': p.weight,
                'Motivo': p.reason || 'Capacidade excedida'
            });
        }

        // 3. Gerar Excel
        const wb = XLSX.utils.book_new();

        const wsResumo = XLSX.utils.json_to_sheet(resumenFrota);
        XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo da Frota");

        const wsDetalhes = XLSX.utils.json_to_sheet(detalhesRotas);
        XLSX.utils.book_append_sheet(wb, wsDetalhes, "Detalhes das Rotas");

        if (pontosNaoAtendidos.length > 0) {
            const wsNaoAtendidos = XLSX.utils.json_to_sheet(pontosNaoAtendidos);
            XLSX.utils.book_append_sheet(wb, wsNaoAtendidos, "Pontos Não Atendidos");
        }

        // Exportar como Buffer para o Express
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="relatorio_rotas_${run_id}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);

    } catch (error: any) {
        console.error('Report Generation Error:', error);
        return res.status(500).json({ error: 'Erro ao gerar relatório.', message: error.message });
    }
}
