
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { distributePointsCompact, type OptimizationSettings } from './pizzaAlgorithm';
import { extractCoordinates, generatePointId, type Point } from './geoUtils';

export interface Vehicle {
    placa: string;
    capacidade: number;
    unidade?: string;
}

export interface Depot {
    LATITUDE: number | string;
    LONGITUDE: number | string;
    UNIDADE?: string;
}

export class OptimizationService {
    private supabase: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    async runOptimizationFromDb(
        unidade: string,
        data_especifica: string,
        month?: string,
        year?: string,
        inputSettings: OptimizationSettings = {}
    ) {
        const settings = await this.getMergedSettings(inputSettings);
        let points = await this.fetchCalendarEvents(unidade, data_especifica, month, year);
        const fleet = await this.fetchFleet(unidade);
        const deposits = await this.fetchDepots();

        if (points.length === 0) throw new Error(`Nenhum evento encontrado.`);

        // 1. Generate consistent point_ids
        for (const p of points) {
            const coords = extractCoordinates(p);
            p.point_id = generatePointId(p.Cliente || '', p.Endereco || '', coords?.lat, coords?.lon);
        }

        // 2. Apply Fixed Assignments (Memory)
        points = await this.applyFixedAssignments(points, unidade);

        const pointsByDate: Record<string, Point[]> = {};
        for (const p of points) {
            const dateKey = p.Data ? String(p.Data).substring(0, 10) : 'Sem Data';
            if (!pointsByDate[dateKey]) pointsByDate[dateKey] = [];
            pointsByDate[dateKey].push(p);
        }

        const dateList = Object.keys(pointsByDate).sort();
        let lastRunId = null;

        for (const date of dateList) {
            const dayPoints = pointsByDate[date];
            const referenceDepot = this.getBestDepot(deposits, dayPoints);

            const { distribution, unserved } = distributePointsCompact(
                dayPoints,
                fleet,
                referenceDepot,
                settings
            );

            const dayStats = this.calculateStatsForDay(distribution, unserved);
            const runId = await this.exportRoutes(distribution, dayStats, { ...settings, target_date: date }, deposits);
            if (runId) {
                lastRunId = runId;
                // 3. Save new assignments to memory
                await this.saveRouteAssignments(distribution, unidade);
            }
        }

        return { run_id: lastRunId, statistics: { total_points: points.length } };
    }

    private async getMergedSettings(inputSettings: OptimizationSettings): Promise<OptimizationSettings> {
        try {
            const { data } = await this.supabase.from('optimization_settings').select('*').order('id', { ascending: false }).limit(1);
            if (data && data.length > 0) {
                const db = data[0];
                return {
                    maxHours: db.max_hours ?? 10,
                    serviceTime: db.service_time ?? 15,
                    avgSpeed: db.avg_speed ?? 40,
                    maxPointsPerVehicle: db.max_points_per_vehicle ?? 35,
                    forceFulfill: db.force_fulfill ?? false,
                    ...inputSettings
                };
            }
        } catch (e) { }
        return { maxHours: 10, serviceTime: 15, avgSpeed: 40, maxPointsPerVehicle: 35, forceFulfill: false, ...inputSettings };
    }

    private async fetchCalendarEvents(unidade: string, date: string, month?: string, year?: string): Promise<Point[]> {
        const allEvents: any[] = [];
        const batchSize = 1000;
        let offset = 0;

        // Calculate date range if month/year provided
        let startDate: string | null = null;
        let endDate: string | null = null;

        if (month && year) {
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            startDate = `${year}-${month.padStart(2, '0')}-01`;

            // Calculate last day of month
            const lastDay = new Date(yearNum, monthNum, 0).getDate();
            endDate = `${year}-${month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            console.log(`📅 Filtering events between ${startDate} and ${endDate}`);
        }

        // Fetch with pagination
        while (true) {
            let query = this.supabase.from('calendar_events').select('*');

            // Date filter
            if (date && date.toLowerCase() !== 'tudo') {
                query = query.eq('date', date);
            } else if (startDate && endDate) {
                query = query.gte('date', startDate).lte('date', endDate);
            }

            // Unit filter
            if (unidade && unidade.toLowerCase() !== 'todas') {
                query = query.ilike('unit_name', `%${unidade}%`);
            }

            // Apply pagination
            const { data, error } = await query.range(offset, offset + batchSize - 1);

            if (error) {
                console.error('Error fetching calendar events:', error);
                break;
            }

            if (!data || data.length === 0) break;

            allEvents.push(...data);

            if (data.length < batchSize) break;

            offset += batchSize;
        }

        console.log(`✅ Total events loaded from Supabase: ${allEvents.length}`);

        return allEvents.map(e => ({
            Data: e.date,
            Cliente: e.client_name,
            Endereco: e.address,
            Latitude: e.latitude,
            Longitude: e.longitude,
            weight: e.avg_weight || 0,
            Cidade: e.city,
            Bairro: e.neighborhood,
            Unidade: e.unit_name,
            Periodicidade: e.frequency,
            JanelaInicio: e.start_time,
            JanelaFim: e.end_time,
            Observacoes: e.notes,
            Tipo_Residuo: e.waste_type,
            Telefone: e.phone,
            ...e
        }));
    }

    private async fetchFleet(unidade: string): Promise<Vehicle[]> {
        let query = this.supabase.from('vehicles').select('*');
        if (unidade && unidade.toLowerCase() !== 'todas') query = query.eq('unit_name', unidade);
        const { data } = await query;
        return (data || []).map(v => ({ placa: v.plate || v.license_plate, capacidade: v.capacity_kg || 1000, unidade: v.unit_name }));
    }

    private async fetchDepots(): Promise<Depot[]> {
        const { data } = await this.supabase.from('depots').select('*');
        return (data || []).map(d => ({ LATITUDE: d.latitude, LONGITUDE: d.longitude, UNIDADE: d.name || d.unit_name }));
    }

    private async applyFixedAssignments(points: Point[], unidade: string): Promise<Point[]> {
        try {
            let query = this.supabase.from('route_assignments').select('*').eq('is_active', true);
            if (unidade && unidade.toLowerCase() !== 'todas') query = query.eq('unit_name', unidade);
            const { data } = await query;
            if (data) {
                const assignments = new Map(data.map(a => [a.point_id, a.vehicle_plate]));
                for (const p of points) {
                    if (p.point_id && assignments.has(p.point_id)) {
                        p.fixed_vehicle = assignments.get(p.point_id);
                    }
                }
            }
        } catch (e) { }
        return points;
    }

    private async saveRouteAssignments(distribution: Record<string, Point[]>, unidade: string) {
        try {
            const assignments = [];
            const timestamp = new Date().toISOString();
            for (const [placa, points] of Object.entries(distribution)) {
                for (const p of points) {
                    if (p.point_id) {
                        assignments.push({
                            point_id: p.point_id,
                            point_name: p.Cliente,
                            point_address: p.Endereco,
                            vehicle_plate: placa,
                            unit_name: unidade !== 'Todas' ? unidade : p.Unidade,
                            last_used_at: timestamp,
                            updated_at: timestamp
                        });
                    }
                }
            }
            if (assignments.length > 0) {
                // Use upsert to update memory
                await this.supabase.from('route_assignments').upsert(assignments, { onConflict: 'point_id,unit_name' });
            }
        } catch (e) { }
    }

    private getBestDepot(deposits: Depot[], points: Point[]): Depot {
        if (deposits.length <= 1) return deposits[0];
        let sumLat = 0, sumLon = 0, count = 0;
        for (const p of points) {
            const c = extractCoordinates(p);
            if (c) { sumLat += c.lat; sumLon += c.lon; count++; }
        }
        if (count === 0) return deposits[0];
        const center = { lat: sumLat / count, lon: sumLon / count };
        let best = deposits[0], minDist = Infinity;
        for (const d of deposits) {
            const dist = Math.pow(Number(d.LATITUDE) - center.lat, 2) + Math.pow(Number(d.LONGITUDE) - center.lon, 2);
            if (dist < minDist) { minDist = dist; best = d; }
        }
        return best;
    }

    private calculateStatsForDay(distribution: Record<string, Point[]>, unserved: Point[]) {
        let totalPoints = unserved.length;
        for (const route of Object.values(distribution)) totalPoints += route.length;
        return { total_rotas: Object.keys(distribution).length, total_points: totalPoints, pontos_nao_atendidos: unserved };
    }

    private async getRouteGeometry(points: Point[], deposit: Depot): Promise<any> {
        try {
            if (!deposit || !deposit.LATITUDE || !deposit.LONGITUDE) return null;

            const coords = [];
            // Depósito (Início)
            coords.push(`${deposit.LONGITUDE},${deposit.LATITUDE}`);

            // Pontos Intermediários
            for (const p of points) {
                const c = extractCoordinates(p);
                if (c) coords.push(`${c.lon},${c.lat}`);
            }

            // Se tiver muitos pontos, o URL pode ficar muito longo. OSRM aceita POST, mas o demo server é limitado.
            // Para URLs longas (> ~80 pontos), ignoramos por segurança e deixamos o frontend resolver parcialmente.
            if (coords.length > 80) return null;

            // Rota completa (depósito -> pontos -> depósito [opcional, mas bom pra visualização completa])
            // Adicionar retorno ao depósito:
            coords.push(`${deposit.LONGITUDE},${deposit.LATITUDE}`);

            const url = `http://router.project-osrm.org/route/v1/driving/${coords.join(';')}?overview=full&geometries=geojson`;

            // Pequeno delay para evitar Rate Limit se rodar muitas rotas simultaneamente
            await new Promise(r => setTimeout(r, 100));

            const response = await fetch(url);
            if (!response.ok) return null;

            const data: any = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                return data.routes[0].geometry;
            }
        } catch (e) {
            console.error('Erro ao buscar geometria OSRM no backend:', e);
        }
        return null;
    }

    private async exportRoutes(distribution: Record<string, Point[]>, stats: any, settings: any, deposits: Depot[]) {
        try {
            const { data: runData } = await this.supabase.from('optimization_runs').insert([{
                total_routes: stats.total_rotas, total_points: stats.total_points, total_vehicles: Object.keys(distribution).length, status: 'completed', settings: settings
            }]).select();
            if (!runData) return null;
            const runId = runData[0].id;

            let territoryIndex = 0;
            for (const [placa, points] of Object.entries(distribution)) {
                territoryIndex++;
                const weightSum = points.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);

                // Calcular Geometria
                const bestDepot = this.getBestDepot(deposits, points);
                const geometry = await this.getRouteGeometry(points, bestDepot);

                // Add territory_id to the route
                const { data: routeData } = await this.supabase.from('routes').insert([{
                    run_id: runId,
                    vehicle_plate: placa,
                    route_date: settings.target_date,
                    total_weight: weightSum,
                    point_count: points.length,
                    status: 'planned',
                    territory_id: territoryIndex, // Assign sequential territory ID
                    geometry: geometry // Salvar geometria calculada!
                }]).select();

                if (!routeData) continue;
                const routeId = routeData[0].id;
                const pointsToInsert = points.map((p, idx) => ({
                    route_id: routeId, sequence: idx + 1, client_name: p.Cliente || '', address: p.Endereco || '', latitude: extractCoordinates(p)?.lat, longitude: extractCoordinates(p)?.lon, weight: p.weight || 0
                }));
                if (pointsToInsert.length > 0) await this.supabase.from('route_points').insert(pointsToInsert);
            }
            if (stats.pontos_nao_atendidos?.length > 0) {
                const unservedToInsert = stats.pontos_nao_atendidos.map((p: any) => ({
                    run_id: runId, client_name: p.Cliente || '', address: p.Endereco || '', latitude: extractCoordinates(p)?.lat, longitude: extractCoordinates(p)?.lon, weight: p.weight || 0, reason: p.reason || 'Capacidade/Tempo insuficiente'
                }));
                await this.supabase.from('optimization_unserved_points').insert(unservedToInsert);
            }
            return runId;
        } catch (e) { return null; }
    }
}
