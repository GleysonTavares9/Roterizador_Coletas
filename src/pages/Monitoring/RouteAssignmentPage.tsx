
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { supabase } from '../../services/supabase';
import { Truck } from 'lucide-react';
import { Badge } from '../../components/ui/badge';

export default function RouteAssignmentPage() {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [routes, setRoutes] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();

        // Inscrever para atualizações em tempo real das rotas
        const channel = supabase
            .channel('db_changes_routes')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'routes', filter: `route_date=eq.${selectedDate}` },
                (payload) => {
                    console.log('Realtime update received:', payload);
                    setRoutes(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedDate]);

    const fetchData = async () => {
        setLoading(true);
        // 1. Fetch Drivers
        const { data: driversData } = await supabase.from('drivers').select('*').eq('active', true).order('name');
        setDrivers(driversData || []);

        // 2. Fetch Routes
        const { data: routesData } = await supabase
            .from('routes')
            .select('*, driver:drivers(name), route_points(id)')
            .eq('route_date', selectedDate)
            .order('vehicle_plate');

        setRoutes(routesData || []);
        setLoading(false);
    };

    const handleDriverChange = async (routeId: string, driverId: string) => {
        // Optimistic UI update
        setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, driver_id: driverId } : r));

        const empty = driverId === "";
        const val = empty ? null : driverId;

        const { error } = await supabase.from('routes').update({ driver_id: val }).eq('id', routeId);
        if (error) {
            console.error(error);
            alert('Erro ao salvar vínculo!');
            fetchData(); // Revert on error
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Atribuição de Motoristas</h2>
                    <p className="text-muted-foreground">Vincule os motoristas aos veículos/rotas do dia.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Data da Operação:</span>
                    <input
                        type="date"
                        className="border rounded p-2 text-sm"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {routes.map(route => (
                    <Card key={route.id} className={route.driver_id ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}>
                        <CardHeader className="pb-3 border-b border-gray-100 bg-white/50">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Truck className="w-5 h-5" />
                                        {route.vehicle_plate}
                                    </CardTitle>
                                    <div className="flex gap-1">
                                        <Badge variant={route.driver_id ? "default" : "secondary"} className={route.driver_id ? "bg-green-600 hover:bg-green-700" : ""}>
                                            {route.driver_id ? "Vinculado" : "Sem Motorista"}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground mt-1">
                                    <div className="flex items-center gap-1">
                                        <span>📦</span>
                                        <span className="font-medium">{route.route_points?.length || route.point_count || 0} pts</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span>⚖️</span>
                                        <span className="font-medium">{route.total_weight ? Number(route.total_weight).toFixed(1) : 0} kg</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span>📏</span>
                                        <span className="font-medium">{route.total_distance ? Number(route.total_distance).toFixed(1) : 0} km</span>
                                    </div>
                                    <div className="flex items-center gap-1" title="Duração Estimada">
                                        <span>⏱️</span>
                                        <span className="font-medium">
                                            {route.total_time ? (() => {
                                                const totalMin = Math.round(route.total_time);
                                                const h = Math.floor(totalMin / 60);
                                                const m = totalMin % 60;
                                                return `${h}h ${String(m).padStart(2, '0')}min`;
                                            })() : '-'}
                                        </span>
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <span>📅</span> {route.route_date ? route.route_date.split('-').reverse().join('/') : selectedDate.split('-').reverse().join('/')}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <label className="text-sm font-medium mb-1 block">Motorista Responsável:</label>
                            <div className="flex gap-2">
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={route.driver_id || ''}
                                    onChange={(e) => handleDriverChange(route.id, e.target.value)}
                                >
                                    <option value="">-- Sem Motorista --</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {routes.length === 0 && !loading && (
                <div className="text-center py-10 text-muted-foreground">
                    Nenhuma rota encontrada para esta data.
                </div>
            )}

            {loading && <div className="text-center py-10">Carregando...</div>}
        </div>
    );
}
