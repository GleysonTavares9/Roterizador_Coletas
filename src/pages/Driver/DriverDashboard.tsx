
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ChevronRight, LogOut, MapPin, Truck, ArrowLeft, Navigation, Clock, Scale } from 'lucide-react';
import { supabase } from '@/services/supabase';

interface DriverRoute {
    id: string;
    vehicle_plate: string;
    route_date: string;
    total_points: number;
    status: string;
    total_distance_km: number;
    total_time?: number;
    total_weight?: number;
}

export default function DriverDashboard() {
    const navigate = useNavigate();
    const [driver, setDriver] = useState<any>(null);
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [routes, setRoutes] = useState<DriverRoute[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Verificar sessão
        const session = localStorage.getItem('driver_session');
        if (!session) {
            navigate('/driver/login');
            return;
        }
        const drv = JSON.parse(session);
        setDriver(drv);

        fetchAvailableDates(drv.id);
    }, []);

    const fetchAvailableDates = async (driverId: string) => {
        setLoading(true);
        try {
            // Buscar rotas atribuidas ao motorista para extrair datas
            // Supabase distinct workaround or simple fetch all
            const { data, error } = await supabase
                .from('routes')
                .select('route_date, status')
                .eq('driver_id', driverId)
                .order('route_date', { ascending: false });

            if (error) throw error;

            // Extrair datas únicas
            const uniqueDates = Array.from(new Set(data?.map(r => r.route_date as string) || [])).sort().reverse();
            setDates(uniqueDates);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchRoutesForDate = async (date: string) => {
        setLoading(true);
        try {
            // Buscamos também os pontos para calcular totais dinamicamente (fallback)
            const { data, error } = await supabase
                .from('routes')
                .select('*, points:route_points(weight, status)')
                .eq('driver_id', driver.id)
                .eq('route_date', date)
                .order('vehicle_plate');

            if (error) throw error;

            // Processar rotas para garantir totais
            const processedRoutes = data?.map(r => {
                // Cálculo dinâmico do peso total
                const points = r.points || [];
                const calculatedWeight = points.reduce((sum: number, p: any) => sum + (p.weight || 0), 0);

                return {
                    ...r,
                    // Se o total_weight vier do banco, usa. Se não, usa o calculado.
                    total_weight: r.total_weight || calculatedWeight,
                    // Se total_points vier zerado, usa o array length
                    total_points: r.total_points || points.length
                };
            });

            setRoutes(processedRoutes || []);
            setSelectedDate(date);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('driver_session');
        navigate('/driver/login');
    };

    const handleSelectRoute = (routeId: string) => {
        navigate(`/driver/route/${routeId}`);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d} /${m}/${y} `;
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'Pendente';
            case 'in_progress': return 'Em Execução';
            case 'completed': return 'Concluída';
            case 'canceled': return 'Cancelada';
            default: return 'Criada';
        }
    };

    if (loading && !driver) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">Carregando...</div>;

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Header */}
            <div className="bg-[#0c3773] text-white p-4 shadow-md sticky top-0 z-10">
                <div className="flex justify-between items-center max-w-md mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
                            {driver?.name?.charAt(0) || 'M'}
                        </div>
                        <div>
                            <p className="text-sm opacity-80">Bem vindo,</p>
                            <h1 className="font-bold leading-none">{driver?.name?.split(' ')[0]}</h1>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleLogout}>
                        <LogOut className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            <div className="p-4 max-w-md mx-auto space-y-4">
                {selectedDate ? (
                    // View: Lista de Rotas
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                            <Button variant="outline" size="icon" onClick={() => setSelectedDate(null)} className="h-8 w-8">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                            <h2 className="font-semibold text-lg">Rotas de {formatDate(selectedDate)}</h2>
                        </div>

                        {routes.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Nenhuma rota encontrada para este dia.</p>
                        ) : (
                            routes.map(route => {
                                // Data fallbacks to match Monitoring Logic
                                const distance = (route as any).total_distance ?? route.total_distance_km ?? 0;
                                const weight = (route as any).total_weight ?? route.total_weight ?? 0;
                                const totalMinutes = route.total_time ?? 0;

                                const hrs = Math.floor(totalMinutes / 60);
                                const mins = totalMinutes % 60;

                                return (
                                    <Card
                                        key={route.id}
                                        className="cursor-pointer overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] group"
                                        onClick={() => handleSelectRoute(route.id)}
                                    >
                                        {/* Header e Estatísticas (Bloco Azul Único) */}
                                        {/* Header e Estatísticas (Bloco Azul Único) */}
                                        <div className="bg-[#0c3773] p-5 text-white relative overflow-hidden">
                                            {/* Header Superior */}
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Truck className="w-6 h-6 text-white" />
                                                        <h3 className="text-3xl font-bold tracking-tight">{route.vehicle_plate}</h3>
                                                    </div>
                                                    <div className="text-white/90 text-sm font-medium pl-8">
                                                        Motorista: <span className="uppercase font-bold text-white">{driver?.name}</span>
                                                    </div>
                                                </div>
                                                <span className={`
                                                    px-3 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider shadow-sm
                                                    ${route.status === 'completed' ? 'bg-emerald-500 text-white' :
                                                        route.status === 'in_progress' ? 'bg-blue-400 text-white animate-pulse' :
                                                            'bg-white/20 text-white backdrop-blur-sm'}
                                                `}>
                                                    {getStatusLabel(route.status || 'created')}
                                                </span>
                                            </div>

                                            {/* Grid de Estatísticas (Estilo Vidro / Glassmorphism) */}
                                            <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/10 py-3 relative z-10 mt-2">
                                                <div className="grid grid-cols-4 gap-0 divide-x divide-white/20">
                                                    {/* Pontos */}
                                                    <div className="flex flex-col items-center justify-center px-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-90">
                                                            <MapPin className="w-3 h-3" /> Pts
                                                        </div>
                                                        <span className="font-bold text-2xl leading-none text-white">{route.total_points}</span>
                                                    </div>

                                                    {/* Distância */}
                                                    <div className="flex flex-col items-center justify-center px-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-90">
                                                            <Navigation className="w-3 h-3" /> Dist
                                                        </div>
                                                        <div className="font-bold text-2xl leading-none text-white">
                                                            {distance.toFixed(1)} <span className="text-sm font-medium text-blue-100">km</span>
                                                        </div>
                                                    </div>

                                                    {/* Tempo */}
                                                    <div className="flex flex-col items-center justify-center px-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-90">
                                                            <Clock className="w-3 h-3" /> Tempo
                                                        </div>
                                                        <div className="font-bold text-2xl leading-none text-white whitespace-nowrap">
                                                            {hrs}h<span className="text-xl">{mins > 0 ? mins : ''}</span>
                                                        </div>
                                                    </div>

                                                    {/* Carga */}
                                                    <div className="flex flex-col items-center justify-center px-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-90">
                                                            <Scale className="w-3 h-3" /> Carga
                                                        </div>
                                                        <div className="font-bold text-2xl leading-none text-white">
                                                            {weight ? weight.toFixed(0) : '--'} <span className="text-sm font-medium text-blue-100">kg</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer Branco */}
                                        <div className="bg-white p-4 flex justify-between items-center group-hover:bg-slate-50 transition-colors">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-2">
                                                ACESSAR ROTA
                                            </span>
                                            <div className="bg-white w-8 h-8 rounded-full shadow-sm border border-slate-200 flex items-center justify-center text-blue-600">
                                                <ChevronRight className="w-5 h-5" />
                                            </div>
                                        </div>
                                    </Card>
                                )
                            })
                        )}
                    </div>
                ) : (
                    // View: Lista de Datas
                    <div className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                        <h2 className="font-semibold text-lg text-muted-foreground uppercase tracking-wider text-xs mb-2">Selecione uma data</h2>

                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-lg animate-pulse" />)}
                            </div>
                        ) : dates.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Nenhuma rota agendada para você.</p>
                            </div>
                        ) : (
                            dates.map(date => (
                                <Card
                                    key={date}
                                    className="hover:bg-accent cursor-pointer transition-colors"
                                    onClick={() => fetchRoutesForDate(date)}
                                >
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-primary/10 p-3 rounded-full text-primary">
                                                <Calendar className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-lg">{formatDate(date)}</span>
                                                <span className="text-xs text-muted-foreground">Toque para ver rotas</span>
                                            </div>
                                        </div>
                                        <ChevronRight className="text-muted-foreground w-5 h-5" />
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
