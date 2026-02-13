import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Activity, DollarSign, Truck, Package } from 'lucide-react';
import { supabase } from '@/services/supabase';

interface EfficiencyData {
    vehicle_plate: string;
    planned_km: number;
    executed_km: number;
    efficiency: number; // executed / planned
    status: 'good' | 'warning' | 'bad';
}

interface DashboardMetrics {
    totalCost: number;
    totalDeliveries: number;
    activeVehicles: number;
    efficiency: number;
    recentOptimizations: Array<{
        id: string;
        created_at: string;
        total_routes: number;
        status: string;
    }>;
    vehicleEfficiency: EfficiencyData[];
}

export default function Dashboard() {
    const [metrics, setMetrics] = useState<DashboardMetrics>({
        totalCost: 0,
        totalDeliveries: 0,
        activeVehicles: 0,
        efficiency: 0,
        recentOptimizations: [],
        vehicleEfficiency: []
    });
    const [loading, setLoading] = useState(true);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterUnit, setFilterUnit] = useState<string>('Todas');
    const [availableUnits] = useState<string[]>([]);

    useEffect(() => {
        loadDashboardData();
    }, [filterDate]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
//             console.log('🔍 Buscando dados do dashboard para:', filterDate);

            // 1. Buscar otimizações (para pegar o run_id do dia e histórico)
            const { data: optimizations, error: optError } = await supabase
                .from('optimization_runs')
                .select('*')
                .order('created_at', { ascending: false });

            if (optError) throw optError;

            // 2. Buscar fechamentos do dia (para eficiência)
            const { data: closures, error: closError } = await supabase
                .from('fleet_closures')
                .select('*')
                .eq('closure_date', filterDate);

            if (closError) throw closError;

            // 2b. Custo Total DO DIA (consistente com o filtro TUDO)
            const totalDayCost = closures?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 0;

            // 3. Buscar rotas planejadas do dia (Planejado)
            // 3. Buscar rotas planejadas do dia (Planejado)
            // MUDANÇA: Buscar direto por DATA para ser mais robusto
            let plannedRoutes: any[] = [];
            const { data: routes, error: routeError } = await supabase
                .from('routes')
                .select('*')
                .eq('route_date', filterDate);

            if (!routeError) plannedRoutes = routes || [];

//             console.log('📊 Rotas planejadas encontradas:', plannedRoutes.length);

            // 4. Veículos ativos serão baseados nas rotas do dia
            // const vehiclesCount = plannedRoutes.length;

            // --- CÁLCULOS ---

            // Custo Total (Já calculado acima: totalMonthCost)

            // Entregas (Pontos planejados)
            const totalDeliveries = plannedRoutes.reduce((sum, r) => sum + (r.point_count || 0), 0);

            // Veículos Ativos (que têm rota hoje)
            const activeVehicles = plannedRoutes.length;

            // ... (código de eficiência igual) ...

            // Eficiência por Veículo
            const efficiencyList: EfficiencyData[] = plannedRoutes.map(route => {
                const plate = (route.vehicle_plate || '').trim().toUpperCase();
                const closure = closures?.find(c => c.vehicle_plate.trim().toUpperCase() === plate);

                const planned = route.total_distance_km || route.total_distance || 0;
                const executed = closure ? (closure.km_end - closure.km_start) : 0;

                // Eficiência: Quão próximo o executado foi do planejado?
                // Se executou 105km de 100km planejado = 5% desvio.
                // Aqui vamos usar uma métrica simples: % do planejado que foi executado.
                // 100% é perfeito. >100% andou mais. <100% andou menos (atalho ou não completou).
                let eff = 0;
                if (planned > 0) {
                    eff = executed > 0 ? (planned / executed) * 100 : 0;
                    // Inverti lógica para: Executado / Planejado (Desvio percentual)
                    // Se planejou 100 e andou 80 -> 80% (Economia/Eficiencia?)
                    // Se planejou 100 e andou 120 -> 120% (Gastou mais)
                    if (executed > 0 && planned > 0) eff = (planned / executed) * 100;
                    // Inverti: (Planejado / Executado). 
                    // Ex: Plan 100, Exec 100 -> 100%
                    // Ex: Plan 100, Exec 200 -> 50% (Andou muito = ruim)
                    // Ex: Plan 100, Exec 50 -> 200% (Andou metade = "bom" mas suspeito)
                    // Vamos usar desvio abs? Não, vamos usar simplificado: Executado / Planejado (Desvio)
                    eff = (executed / planned) * 100;
                }

                let status: 'good' | 'warning' | 'bad' = 'good';
                const deviation = Math.abs(eff - 100);
                if (deviation > 20) status = 'bad'; // >20% desvio
                else if (deviation > 10) status = 'warning'; // >10% desvio

                return {
                    vehicle_plate: plate,
                    planned_km: planned,
                    executed_km: executed,
                    efficiency: eff,
                    status
                };
            });

            // Adicionar veículos que rodaram mas não tinham rota (extras)
            closures?.forEach(c => {
                const plate = c.vehicle_plate.trim().toUpperCase();
                if (!efficiencyList.find(e => e.vehicle_plate === plate)) {
                    efficiencyList.push({
                        vehicle_plate: plate,
                        planned_km: 0,
                        executed_km: c.km_end - c.km_start,
                        efficiency: 0, // Infinito/Indefinido
                        status: 'bad'
                    });
                }
            });

            // Eficiência Geral (Média das eficiências válidas)
            const validEfficiencies = efficiencyList.filter(e => e.planned_km > 0 && e.executed_km > 0);
            const avgEfficiency = validEfficiencies.length > 0
                ? validEfficiencies.reduce((sum, e) => sum + e.efficiency, 0) / validEfficiencies.length
                : 0;

            // Formatar otimizações DO DIA
            const recentOpts = (optimizations || [])
                .filter(opt => opt.created_at.startsWith(filterDate))
                .slice(0, 5)
                .map(opt => ({
                    id: opt.id,
                    created_at: opt.created_at,
                    total_routes: opt.total_routes || 0,
                    status: opt.status
                }));

            setMetrics({
                totalCost: totalDayCost,
                totalDeliveries,
                activeVehicles, // Usar variável local calculada
                efficiency: avgEfficiency,
                recentOptimizations: recentOpts,
                vehicleEfficiency: efficiencyList
            });

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-8"
        >
            <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-sm md:text-base text-muted-foreground">Visão geral da sua operação de logística.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Unidade:</label>
                        <select
                            value={filterUnit}
                            onChange={(e) => setFilterUnit(e.target.value)}
                            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm w-full sm:w-auto"
                        >
                            <option value="Todas">Todas</option>
                            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Data:</label>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm w-full sm:w-auto"
                        />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                    {
                        title: "Custo Total",
                        value: formatCurrency(metrics.totalCost),
                        icon: DollarSign,
                        desc: "Nesta data"
                    },
                    {
                        title: "Entregas",
                        value: metrics.totalDeliveries.toString(),
                        icon: Package,
                        desc: "Total de pontos"
                    },
                    {
                        title: "Veículos Ativos",
                        value: metrics.activeVehicles.toString(),
                        icon: Truck,
                        desc: "Frota disponível"
                    },
                    {
                        title: "Eficiência",
                        value: `${metrics.efficiency.toFixed(1)}%`,
                        icon: Activity,
                        desc: "Taxa de sucesso"
                    },
                ].map((stat, i) => (
                    <motion.div key={i} variants={item}>
                        <Card className="hover:shadow-lg transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm hover:-translate-y-1">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {stat.title}
                                </CardTitle>
                                <stat.icon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stat.value}</div>
                                <p className="text-xs text-muted-foreground">
                                    {stat.desc}
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <motion.div variants={item} className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>Otimizações do Dia</CardTitle>
                        <CardDescription>Últimas roteirizações realizadas</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        {metrics.recentOptimizations.length === 0 ? (
                            <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-md bg-secondary/20">
                                <span className="flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Nenhuma otimização realizada ainda
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {metrics.recentOptimizations.map((opt) => (
                                    <div key={opt.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                                        <div>
                                            <p className="font-medium">Otimização #{opt.id.slice(0, 8)}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {formatDate(opt.created_at)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-primary">{opt.total_routes} rotas</p>
                                            <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600">
                                                {opt.status || 'Concluído'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="col-span-3 border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>Ações Rápidas</CardTitle>
                        <CardDescription>
                            Acesso rápido às funcionalidades
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <button
                                onClick={() => window.location.href = '/roteirizacao'}
                                className="w-full p-4 text-left rounded-lg border bg-card hover:bg-primary hover:text-primary-foreground transition-all group"
                            >
                                <p className="font-medium">Nova Roteirização</p>
                                <p className="text-sm text-muted-foreground group-hover:text-primary-foreground/80">
                                    Criar nova otimização de rotas
                                </p>
                            </button>
                            <button
                                onClick={() => window.location.href = '/fechamento-frota'}
                                className="w-full p-4 text-left rounded-lg border bg-card hover:bg-primary hover:text-primary-foreground transition-all group"
                            >
                                <p className="font-medium">Fechar Frota</p>
                                <p className="text-sm text-muted-foreground group-hover:text-primary-foreground/80">
                                    Registrar KM do dia
                                </p>
                            </button>
                            <button
                                onClick={() => window.location.href = '/custos'}
                                className="w-full p-4 text-left rounded-lg border bg-card hover:bg-primary hover:text-primary-foreground transition-all group"
                            >
                                <p className="font-medium">Gerenciar Custos</p>
                                <p className="text-sm text-muted-foreground group-hover:text-primary-foreground/80">
                                    Configurar custos operacionais
                                </p>
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Tabela de Eficiência - Novo Componente */}
            <motion.div variants={item}>
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>Análise de Eficiência por Veículo</CardTitle>
                        <CardDescription>Comparativo entre planejado e executado</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <div className="min-w-[700px]">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3">Veículo</th>
                                            <th className="px-4 py-3">KM Planejado</th>
                                            <th className="px-4 py-3">KM Executado</th>
                                            <th className="px-4 py-3 text-center">Eficiência</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {metrics.vehicleEfficiency.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                                    Nenhum dado de rota ou fechamento para esta data.
                                                </td>
                                            </tr>
                                        ) : (
                                            metrics.vehicleEfficiency.map((v, i) => (
                                                <tr key={i} className="hover:bg-muted/50 transition-colors">
                                                    <td className="px-4 py-3 font-medium">{v.vehicle_plate}</td>
                                                    <td className="px-4 py-3">{v.planned_km.toFixed(1)} km</td>
                                                    <td className="px-4 py-3">{v.executed_km.toFixed(1)} km</td>
                                                    <td className="px-4 py-3 text-center font-bold">
                                                        {v.efficiency.toFixed(1)}%
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${v.status === 'good' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                            v.status === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                            }`}>
                                                            {v.status === 'good' ? 'Eficiente' :
                                                                v.status === 'warning' ? 'Atenção' : 'Crítico'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>{/* min-w wrapper */}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
}
