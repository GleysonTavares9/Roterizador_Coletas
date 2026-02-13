import { useState, memo, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Map as MapIcon, Loader2, Filter } from 'lucide-react';

import { API_URL } from '@/config';

// Componente memorizado para evitar re-renderização (piscar) ao selecionar filtros
const MapDisplay = memo(({ html }: { html: string }) => {
    // Injetar estilos responsivos para mobile no HTML do mapa
    const responsiveHtml = html.replace(
        '</head>',
        `<style>
            @media (max-width: 768px) {
                #resumo-container {
                    top: 60px !important;
                    left: 10px !important;
                    width: auto !important;
                    max-width: calc(100vw - 20px) !important;
                    max-height: 40vh !important;
                    font-size: 11px !important;
                    padding: 10px !important;
                }
                .leaflet-top.leaflet-left {
                    top: 10px !important;
                }
                .leaflet-control-layers {
                    max-width: 250px !important;
                }
            }
        </style></head>`
    );

    return (
        <iframe
            className="w-full h-[75vh] md:h-[700px] border-none rounded-lg shadow-inner bg-slate-50"
            srcDoc={responsiveHtml}
            title="Mapa Interativo"
        />
    );
});

export default function MapPage() {
    const [loading, setLoading] = useState(false);
    const [calendarData, setCalendarData] = useState<any[]>([]);
    const [mapHtml, setMapHtml] = useState<string>('');

    // Filtros e Dados
    const [availableRoutes, setAvailableRoutes] = useState<string[]>([]);
    const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
    const [units, setUnits] = useState<string[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('Todas');
    const [depotsData, setDepotsData] = useState<any[]>([]); // Dados brutos dos depósitos

    const [totalPoints, setTotalPoints] = useState(0);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'DOWNLOAD_EXCEL') {
                // For direct map view, we might not have a run_id, but the user clicked Excel.
                // We can trigger the current download logic or suggest generating a report.
                alert('Para baixar o Excel completo com cálculos de tempo, use a aba "Roterização" selecionando uma execução específica.');
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const loadCalendarData = async () => {
        setLoading(true);
        try {
            // 0. Carregar Depósitos (Sempre necessário para visualização)
            const { data: depots } = await supabase.from('depots').select('*');
            setDepotsData(depots || []);

            // 1. TENTATIVA PRIORITÁRIA: Buscar 'Próxima Coleta' REAL da tabela calendar_events
            const todayISO = new Date().toISOString().split('T')[0];
            const { data: calendarEvents } = await supabase
                .from('calendar_events')
                .select('*')
                .gte('date', todayISO)
                .order('date', { ascending: true }); // Ordenar por data garante que pegamos a mais próxima

            if (calendarEvents && calendarEvents.length > 0) {
                console.log(`Encontrados ${calendarEvents.length} eventos futuros no calendário.`);

                // Deduplicar: Pegar apenas a PRIMEIRA (mais próxima) ocorrência para cada cliente único
                const uniquePointsMap = new Map();

                calendarEvents.forEach(event => {
                    // Chave única: Unidade + Rota + Cliente + Endereço (para garantir unicidade do ponto)
                    const key = `${event.unit_name}-${event.route_name}-${event.client_name || event.address}`;
                    if (!uniquePointsMap.has(key)) {
                        uniquePointsMap.set(key, event);
                    }
                });

                const uniquePoints = Array.from(uniquePointsMap.values());
                console.log(`Pontos únicos para o mapa: ${uniquePoints.length}`);

                // Formatar dados para o Mapa
                const formattedData = uniquePoints.map(item => {
                    // Converter YYYY-MM-DD para DD/MM/YYYY
                    let dateFormatted = item.date;
                    if (item.date && item.date.includes('-')) {
                        const [y, m, d] = item.date.split('-');
                        dateFormatted = `${d}/${m}/${y}`;
                    }

                    return {
                        ...item,
                        Data: dateFormatted,
                        Rota: item.route_name,
                        Unidade: item.unit_name,
                        Cliente: item.client_name,
                        'Endereço': item.address,
                        Cidade: item.city,
                        Bairro: item.neighborhood,
                        Periodicidade: item.frequency,
                        Latitude: item.latitude,
                        Longitude: item.longitude,
                        Media_Por_Coleta: item.avg_weight
                    };
                });

                setCalendarData(formattedData);

                // Atualizar Filtros de Rotas e Unidades
                const uniqueRoutes = [...new Set(formattedData.map(item => item.Rota))].sort();
                setAvailableRoutes(uniqueRoutes);

                const uniqueUnits = [...new Set(formattedData.map((item: any) => item.Unidade))].filter(Boolean) as string[];
                setUnits(uniqueUnits);

                setLoading(false);
                return; // SUCESSO! Ignora o fallback antigo
            }

            // 2. FALLBACK: Se não houver calendário gerado, carregar Pontos Crus
            console.warn("Sem calendário gerado. Usando modo fallback (cálculo estimativo).");
            // 1. Carregar Pontos de Coleta
            let allPoints: any[] = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: batch, error } = await supabase
                    .from('collection_points')
                    .select('*')
                    .range(from, from + step - 1);

                if (error) throw error;

                if (batch && batch.length > 0) {
                    allPoints = [...allPoints, ...batch];
                    from += step;
                    if (batch.length < step) hasMore = false;
                } else {
                    hasMore = false;
                }
            }



            if (allPoints.length === 0) {
                alert('Nenhum ponto de coleta encontrado no banco.');
                setCalendarData([]);
                setAvailableRoutes([]);
                setUnits([]);
                return;
            }

            // Function to calculate next collection date (SIMPLIFICADA)
            // Função para calcular próxima data baseada na periodicidade
            const getNextDate = (frequency: string) => {
                if (!frequency) return new Date().toLocaleDateString('pt-BR');
                const freqUpper = frequency.toUpperCase();
                const today = new Date();

                // Mapeamento de dias
                const daysMap: { [key: string]: number } = {
                    'DOMINGO': 0, 'DOM': 0,
                    'SEGUNDA': 1, 'SEG': 1, '2ª': 1, '2A': 1,
                    'TERÇA': 2, 'TERCA': 2, 'TER': 2, '3ª': 2, '3A': 2,
                    'QUARTA': 3, 'QUA': 3, '4ª': 3, '4A': 3,
                    'QUINTA': 4, 'QUI': 4, '5ª': 4, '5A': 4,
                    'SEXTA': 5, 'SEX': 5, '6ª': 5, '6A': 5,
                    'SABADO': 6, 'SÁBADO': 6, 'SAB': 6
                };

                // DIÁRIO
                if (freqUpper.includes('DIÁRIO') || freqUpper.includes('DIARIO')) {
                    // Próximo dia (amanhã)
                    const next = new Date(today);
                    next.setDate(today.getDate() + 1);
                    return next.toLocaleDateString('pt-BR');
                }

                // SEMANAL com dias específicos (ex: "SEMANAL - SEGUNDA, QUARTA")
                if (freqUpper.includes('SEMANAL')) {
                    const targetDays: number[] = [];
                    // Procurar dias na string
                    Object.keys(daysMap).forEach(day => {
                        if (freqUpper.includes(day)) targetDays.push(daysMap[day]);
                    });

                    if (targetDays.length > 0) {
                        targetDays.sort((a, b) => a - b);
                        const currentDay = today.getDay();

                        // Tentar achar dia ainda nesta semana
                        let nextDay = targetDays.find(d => d >= currentDay); // Inclui hoje
                        let daysToAdd = 0;

                        if (nextDay !== undefined) {
                            daysToAdd = nextDay - currentDay;
                        } else {
                            // Próxima semana: dias até fim da semana + dia do primeiro alvo
                            daysToAdd = (7 - currentDay) + targetDays[0];
                        }

                        const next = new Date(today);
                        next.setDate(today.getDate() + daysToAdd);
                        return next.toLocaleDateString('pt-BR');
                    }
                    // Se semanal sem dias, assume +7
                    const next = new Date(today);
                    next.setDate(today.getDate() + 7);
                    return next.toLocaleDateString('pt-BR');
                }

                // QUINZENAL
                if (freqUpper.includes('QUINZENAL')) {
                    const next = new Date(today);
                    next.setDate(today.getDate() + 15);
                    return next.toLocaleDateString('pt-BR');
                }

                // MENSAL
                if (freqUpper.includes('MENSAL')) {
                    const next = new Date(today);
                    next.setMonth(today.getMonth() + 1);
                    // Tentar manter o dia, reduzindo se necessário (ex: 31 jan -> 28 fev)
                    return next.toLocaleDateString('pt-BR');
                }

                // Default
                return new Date().toLocaleDateString('pt-BR');
            };

            const formattedData = allPoints.map(item => {
                // Tenta normalizar nome da unidade
                const unitName = (item.unit_name || item.unit || '').trim();

                return {
                    Data: getNextDate(item.frequency || ''),
                    Dia_Semana: '', // Não crítico para visualização geral
                    Rota: item.route_name || item.route || 'Sem Rota',
                    Unidade: unitName || 'Sem Unidade',
                    Cliente: item.client_name || 'Cliente não informado',
                    'Endereço': item.address || '',
                    Cidade: item.city || '',
                    Bairro: item.neighborhood || '',
                    Periodicidade: item.frequency || 'Não informada',
                    Media_Por_Coleta: item.avg_weight || 0,
                    Latitude: item.latitude,
                    Longitude: item.longitude
                };
            });

            setCalendarData(formattedData);

            // Extrair Unidades únicas dos PONTOS e DEPÓSITOS
            const uniqueUnits = new Set<string>();
            formattedData.forEach(p => uniqueUnits.add(p.Unidade));
            if (depots) depots.forEach(d => uniqueUnits.add(d.unit_name || d.name));

            const sortedUnits = Array.from(uniqueUnits).filter(u => u && u !== 'Sem Unidade').sort();
            setUnits(['Todas', ...sortedUnits]);

            // Atualizar rotas disponíveis (inicialmente todas)
            updateAvailableRoutes(formattedData, 'Todas');

        } catch (error: any) {
            console.error('Load error:', error);
            alert('Erro ao carregar dados: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Atualiza lista de rotas baseado na unidade selecionada
    const updateAvailableRoutes = (data: any[], unit: string) => {
        let filtered = data;
        if (unit !== 'Todas') {
            filtered = data.filter(d => d.Unidade === unit);
        }
        const routes = [...new Set(filtered.map(item => item.Rota))].sort();
        setAvailableRoutes(routes);
        setSelectedRoutes(routes); // Seleciona todas as novas rotas disponíveis por padrão
    };

    const handleUnitChange = (unit: string) => {
        setSelectedUnit(unit);
        updateAvailableRoutes(calendarData, unit);
    };

    const generateMap = async () => {
        if (calendarData.length === 0) {
            alert('Carregue os dados primeiro.');
            return;
        }

        setLoading(true);
        setMapHtml('');
        try {
            // Filtrar dados antes de enviar
            let filteredPoints = calendarData;
            if (selectedUnit !== 'Todas') {
                filteredPoints = calendarData.filter(d => d.Unidade === selectedUnit);
            }

            // Filtrar depósitos também
            let filteredDepots = depotsData;

            // Validar coordenadas dos depósitos
            const validDepots = depotsData.filter(d => d.latitude && d.longitude);
            if (validDepots.length < depotsData.length) {
                console.warn(`Atenção: ${depotsData.length - validDepots.length} depósitos sem coordenadas.`);
            }

            if (selectedUnit !== 'Todas') {
                const sel = selectedUnit.trim().toUpperCase();

                // Tentar encontrar correspondência flexível
                const matches = validDepots.filter(d => {
                    const uName = (d.unit_name || d.name || '').trim().toUpperCase();
                    return uName === sel || uName.includes(sel) || sel.includes(uName);
                });

                if (matches.length > 0) {
                    filteredDepots = matches;
                } else {
                    console.warn(`Nenhum depósito correspondente exato para "${selectedUnit}". Mostrando todos.`);
                    // Fallback: Se não achar, mostra todos (melhor que nada para debug)
                    filteredDepots = validDepots;
                }
            } else {
                filteredDepots = validDepots;
            }

            console.log(`Gerando mapa para Unidade: ${selectedUnit}`);
            console.log(`Pontos: ${filteredPoints.length}, Rotas: ${selectedRoutes.length}`);
            console.log(`Depósitos enviados (${filteredDepots.length}):`, filteredDepots.map(d => d.name || d.unit_name));

            const response = await fetch(`${API_URL}/api/generate-map`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    calendarData: filteredPoints,
                    routes: selectedRoutes,
                    depots: filteredDepots // Enviando depósitos
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Erro ao gerar mapa');
            }

            const result = await response.json();
            setMapHtml(result.html);
            setTotalPoints(result.totalPoints);
        } catch (error) {
            console.error('Error:', error);
            alert('Falha ao gerar mapa. Verifique se o backend está rodando.');
        } finally {
            setLoading(false);
        }
    };

    const toggleRoute = (route: string) => {
        setSelectedRoutes(prev =>
            prev.includes(route)
                ? prev.filter(r => r !== route)
                : [...prev, route]
        );
    };

    const selectAll = () => setSelectedRoutes(availableRoutes);
    const deselectAll = () => setSelectedRoutes([]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Mapa Interativo</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Visualize os pontos de coleta e unidades no mapa.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MapIcon className="w-5 h-5" /> Configuração
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            Carregue pontos e depósitos do sistema.
                        </p>
                        <Button onClick={loadCalendarData} disabled={loading} className="w-full sm:w-auto">
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapIcon className="w-4 h-4 mr-2" />}
                            Carregar Dados
                        </Button>
                    </div>

                    {calendarData.length > 0 && (
                        <div className="border-t pt-4 space-y-4">

                            {/* Filtro de Unidade */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-muted/30 p-3 rounded-md">
                                <span className="text-sm font-medium whitespace-nowrap">Filtrar por Unidade:</span>
                                <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={selectedUnit}
                                    onChange={(e) => handleUnitChange(e.target.value)}
                                >
                                    {units.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Filtro de Rotas */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Filter className="w-4 h-4" />
                                    <span className="text-sm font-medium">Filtrar por Rotas</span>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        ({selectedRoutes.length}/{availableRoutes.length} selecionadas)
                                    </span>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                                    <Button size="sm" variant="outline" onClick={selectAll} className="flex-1 md:flex-none">Todas</Button>
                                    <Button size="sm" variant="outline" onClick={deselectAll} className="flex-1 md:flex-none">Nenhuma</Button>
                                    <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)} className="flex-1 md:flex-none">
                                        {showFilters ? 'Ocultar' : 'Mostrar'}
                                    </Button>
                                </div>
                            </div>

                            {showFilters && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-4 bg-slate-50 rounded-md border">
                                    {availableRoutes.map(route => (
                                        <div key={route} className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id={`route-${route}`}
                                                checked={selectedRoutes.includes(route)}
                                                onChange={() => toggleRoute(route)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                            />
                                            <label
                                                htmlFor={`route-${route}`}
                                                className="text-xs font-medium leading-none cursor-pointer truncate w-full"
                                                title={route}
                                            >
                                                {route}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4">
                                <Button onClick={generateMap} disabled={loading || selectedRoutes.length === 0} className="w-full">
                                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapIcon className="w-4 h-4 mr-2" />}
                                    Gerar Mapa
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {mapHtml && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Mapa Interativo ({totalPoints} pontos)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0" style={{ overflow: 'hidden' }}>
                        <MapDisplay html={mapHtml} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
