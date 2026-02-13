
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ChevronRight, LogOut, MapPin, Truck, ArrowLeft, Navigation, Clock, Scale } from 'lucide-react';

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
            // Buscar rotas atribuidas ao motorista via API Segura
            const response = await fetch(`/api/driver-routes?driverId=${driverId}`);
            if (!response.ok) throw new Error('Falha ao buscar datas');

            const uniqueDates = await response.json();
            setDates(uniqueDates || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchRoutesForDate = async (date: string) => {
        setLoading(true);
        try {
            // Buscar rotas para a data via API Segura
            const response = await fetch(`/api/driver-routes?driverId=${driver.id}&date=${date}`);
            if (!response.ok) throw new Error('Falha ao buscar rotas');

            const data = await response.json();

            // Processar rotas para garantir totais
            const processedRoutes = data?.map((r: any) => {
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
        <div className="min-h-screen bg-slate-400 flex flex-col items-center justify-center md:py-8 font-sans selection:bg-blue-100">
            {/* SMARTPHONE FRAME CONTAINER */}
            <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[95vh] w-full max-w-[440px] shadow-2xl overflow-hidden">
                {/* Smartphone Speaker/Camera Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-32 bg-gray-800 rounded-b-2xl z-[100] flex items-center justify-center">
                    <div className="w-10 h-1 bg-gray-700 rounded-full"></div>
                </div>

                <div className="flex-1 bg-white flex flex-col h-full w-full relative overflow-x-hidden rounded-[1.5rem]">
                    {/* Header */}
                    <div className="bg-[#0c3773] text-white p-6 pt-12 shadow-md relative z-10 shrink-0">
                        <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg border-2 border-white/10">
                                    {driver?.name?.charAt(0) || 'M'}
                                </div>
                                <div>
                                    <p className="text-xs text-blue-200 font-medium uppercase tracking-wider">Bem vindo,</p>
                                    <h1 className="font-bold text-xl leading-none">{driver?.name?.split(' ')[0]}</h1>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 -mr-2" onClick={handleLogout}>
                                <LogOut className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {selectedDate ? (
                            // View: Lista de Rotas
                            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-2 mb-4 sticky top-0 bg-slate-50 z-10 py-2 border-b border-slate-200/60 backdrop-blur-sm">
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedDate(null)} className="h-8 w-8 -ml-1 text-slate-600 hover:bg-slate-200">
                                        <ArrowLeft className="w-5 h-5" />
                                    </Button>
                                    <h2 className="font-bold text-slate-800">Rotas de {formatDate(selectedDate)}</h2>
                                </div>

                                {routes.length === 0 ? (
                                    <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl">
                                        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Truck className="w-8 h-8 text-slate-400" />
                                        </div>
                                        <p className="text-slate-500 font-medium">Nenhuma rota encontrada.</p>
                                        <p className="text-xs text-slate-400 mt-1">Fale com seu supervisor.</p>
                                    </div>
                                ) : (
                                    routes.map(route => {
                                        // Data fallbacks
                                        const distance = (route as any).total_distance ?? route.total_distance_km ?? 0;
                                        const weight = (route as any).total_weight ?? route.total_weight ?? 0;
                                        const totalMinutes = route.total_time ?? 0;

                                        const hrs = Math.floor(totalMinutes / 60);
                                        const mins = totalMinutes % 60;

                                        return (
                                            <Card
                                                key={route.id}
                                                className="cursor-pointer overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] group rounded-xl"
                                                onClick={() => handleSelectRoute(route.id)}
                                            >
                                                {/* Header e Estatísticas (Bloco Azul Único) */}
                                                <div className="bg-[#0c3773] p-5 text-white relative overflow-hidden">
                                                    {/* Header Superior */}
                                                    <div className="flex justify-between items-start mb-6 relative z-10">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Truck className="w-6 h-6 text-blue-200" />
                                                                <h3 className="text-3xl font-extrabold tracking-tight">{route.vehicle_plate}</h3>
                                                            </div>
                                                        </div>
                                                        <span className={`
                                                    px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white/10
                                                    ${route.status === 'completed' ? 'bg-emerald-500 text-white' :
                                                                route.status === 'in_progress' ? 'bg-blue-400 text-white animate-pulse' :
                                                                    'bg-slate-700/50 text-white backdrop-blur-sm'}
                                                `}>
                                                            {getStatusLabel(route.status || 'created')}
                                                        </span>
                                                    </div>

                                                    {/* Grid de Estatísticas (Estilo Vidro / Glassmorphism) */}
                                                    <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 py-3 relative z-10">
                                                        <div className="grid grid-cols-4 gap-0 divide-x divide-white/10">
                                                            {/* Pontos */}
                                                            <div className="flex flex-col items-center justify-center px-1">
                                                                <div className="flex items-center gap-1.5 text-[9px] uppercase text-blue-200 font-bold mb-1 tracking-wider">
                                                                    <MapPin className="w-3 h-3" /> Pts
                                                                </div>
                                                                <span className="font-bold text-xl leading-none text-white">{route.total_points}</span>
                                                            </div>

                                                            {/* Distância */}
                                                            <div className="flex flex-col items-center justify-center px-1">
                                                                <div className="flex items-center gap-1.5 text-[9px] uppercase text-blue-200 font-bold mb-1 tracking-wider">
                                                                    <Navigation className="w-3 h-3" /> Dist
                                                                </div>
                                                                <div className="font-bold text-xl leading-none text-white">
                                                                    {distance.toFixed(0)} <span className="text-[10px] font-medium text-blue-300">km</span>
                                                                </div>
                                                            </div>

                                                            {/* Tempo */}
                                                            <div className="flex flex-col items-center justify-center px-1">
                                                                <div className="flex items-center gap-1.5 text-[9px] uppercase text-blue-200 font-bold mb-1 tracking-wider">
                                                                    <Clock className="w-3 h-3" /> Tempo
                                                                </div>
                                                                <div className="font-bold text-xl leading-none text-white whitespace-nowrap">
                                                                    {hrs}h<span className="text-base">{mins > 0 ? mins : ''}</span>
                                                                </div>
                                                            </div>

                                                            {/* Carga */}
                                                            <div className="flex flex-col items-center justify-center px-1">
                                                                <div className="flex items-center gap-1.5 text-[9px] uppercase text-blue-200 font-bold mb-1 tracking-wider">
                                                                    <Scale className="w-3 h-3" /> Carga
                                                                </div>
                                                                <div className="font-bold text-xl leading-none text-white">
                                                                    {weight ? (weight > 1000 ? (weight / 1000).toFixed(1) : weight.toFixed(0)) : '--'} <span className="text-[10px] font-medium text-blue-300">{weight > 1000 ? 't' : 'kg'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Footer Branco */}
                                                <div className="bg-white p-4 flex justify-between items-center group-hover:bg-blue-50/50 transition-colors">
                                                    <span className="text-xs font-bold text-[#0c3773] uppercase tracking-widest pl-2">
                                                        ACESSAR ROTA
                                                    </span>
                                                    <div className="bg-[#0c3773] w-8 h-8 rounded-full shadow-lg shadow-blue-200 flex items-center justify-center text-white">
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
                            <div className="space-y-4 animate-in slide-in-from-left-4 duration-300 pt-2">
                                <div className="px-1 mb-4">
                                    <h2 className="font-bold text-xl text-slate-800">Suas Agendas</h2>
                                    <p className="text-sm text-slate-500">Selecione uma data para ver suas rotas.</p>
                                </div>

                                {loading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse shadow-sm" />)}
                                    </div>
                                ) : dates.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200 mx-2">
                                        <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="font-medium text-slate-600">Nenhuma rota agendada.</p>
                                        <p className="text-sm mt-1">Aproveite seu descanso!</p>
                                    </div>
                                ) : (
                                    dates.map(date => (
                                        <Card
                                            key={date}
                                            className="hover:scale-[1.02] cursor-pointer transition-all border-0 shadow-md bg-white overflow-hidden group rounded-xl"
                                            onClick={() => fetchRoutesForDate(date)}
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#0c3773] group-hover:bg-blue-600 transition-colors"></div>
                                            <CardContent className="p-4 pl-6 flex justify-between items-center">
                                                <div className="flex items-center gap-4">
                                                    <div className="bg-blue-50 p-3 rounded-full text-[#0c3773] group-hover:bg-blue-100 transition-colors">
                                                        <Calendar className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-lg text-slate-800">{formatDate(date)}</span>
                                                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Toque para ver</span>
                                                    </div>
                                                </div>
                                                <ChevronRight className="text-slate-300 group-hover:text-[#0c3773] w-6 h-6 transition-colors" />
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
