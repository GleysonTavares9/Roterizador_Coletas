import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileDown, TrendingUp, TrendingDown, Minus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import * as XLSX from 'xlsx';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RouteSummary {
    id?: string; // Route ID
    closure_id?: number; // Closure ID
    vehicle_plate: string;
    unit_name: string;
    date: string;
    // Dados planejados (da otimização)
    planned_km: number;
    planned_weight: number;
    planned_time: number;
    planned_points: number;
    // Dados executados (do fechamento)
    executed_km: number;
    executed_time?: number;
    status: string;
}

export default function RoutesPage() {

    // Estados para resumo comparativo
    const [summaryData, setSummaryData] = useState<RouteSummary[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [units, setUnits] = useState<string[]>([]);
    const [filters, setFilters] = useState({
        vehicle: '',
        date: new Date().toISOString().split('T')[0],
        unit: '',
        status: ''  // Novo filtro por status
    });

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ type: 'route' | 'closure', id: any } | null>(null);

    useEffect(() => {
        loadVehicles();
        loadSummaryData();
    }, []);

    useEffect(() => {
        loadSummaryData();
    }, [filters, vehicles]); // Adicionado vehicles para recalcular quando os veículos forem carregados

    const loadVehicles = async () => {
        try {
            const response = await fetch('/api/vehicles');
            if (response.ok) {
                const data = await response.json();
                setVehicles(data);

                // Extrair unidades únicas
                const uniqueUnits = [...new Set(data.map((v: any) => v.unit_name).filter(Boolean))];
                setUnits(uniqueUnits as string[]);
            }
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    };


    const loadSummaryData = async () => {
        try {
//             console.log('🔍 Carregando resumo para data:', filters.date);
            const targetDate = filters.date;

            // Buscar rotas da tabela 'routes' direto pela DATA (mais robusto)
//             console.log(' Buscando rotas da tabela routes para data:', targetDate);
            const { data: routesData, error: routesError } = await supabase
                .from('routes')
                .select('*, route_points(*)')
                .eq('route_date', targetDate);

            if (routesError) {
                console.error('❌ Erro ao buscar rotas:', routesError);
                setSummaryData([]);
                return;
            }

            const routes = routesData || [];
//             console.log('🚛 Rotas encontradas:', routes.length);
            if (routes.length > 0) {
//                 console.log('📋 Primeira rota:', routes[0]);
            }

            // Buscar fechamentos do dia
            const { data: closures, error: closuresError } = await supabase
                .from('fleet_closures')
                .select('*')
                .eq('closure_date', targetDate);

            if (closuresError) {
                console.error('❌ Erro ao buscar fechamentos:', closuresError);
                // Continua mesmo com erro, apenas não terá dados de fechamento
            }

//             console.log('✅ Fechamentos encontrados:', closures?.length || 0);

            // Combinar dados
            const summary: RouteSummary[] = routes.map((route: any) => {
                // Usar vehicle_plate do banco (já vem correto da tabela routes)
                const vehiclePlate = (route.vehicle_plate || 'N/A').trim().toUpperCase();
                const closure = (closures || []).find((c: any) => c.vehicle_plate.trim().toUpperCase() === vehiclePlate);

                // Buscar veículo normalizando a placa
                const vehicle = vehicles.find(v => v.plate.trim().toUpperCase() === vehiclePlate);

                // Usar dados salvos no banco (já calculados na roteirização)
                const totalDistance = route.total_distance_km || route.total_distance || 0;
                const totalWeight = route.total_weight || 0;
                const totalTime = route.total_time || 0;
                const pointsCount = route.point_count || route.route_points?.length || 0;

                const summaryItem = {
                    id: route.id,
                    closure_id: closure?.id,
                    vehicle_plate: vehiclePlate,
                    unit_name: vehicle?.unit_name || 'N/A',
                    date: targetDate,
                    planned_km: totalDistance,
                    planned_weight: totalWeight,
                    planned_time: totalTime,
                    planned_points: pointsCount,
                    executed_km: closure ? (closure.km_end - closure.km_start) : 0,
                    executed_time: closure?.total_time,
                    status: closure ? 'Concluído' : 'Pendente'
                };

//                 console.log('📦 Item resumo:', summaryItem);
                return summaryItem;
            });

            // Aplicar filtros
            let filtered = summary;
            if (filters.vehicle) {
                filtered = filtered.filter(s => s.vehicle_plate === filters.vehicle);
            }
            if (filters.unit) {
                filtered = filtered.filter(s => s.unit_name === filters.unit);
            }
            if (filters.status) {
                filtered = filtered.filter(s => s.status === filters.status);
            }

//             console.log('✅ Resumo final:', filtered.length, 'itens');
            setSummaryData(filtered);

        } catch (error) {
            console.error('❌ Erro ao carregar resumo:', error);
        }
    };

    const handleExport = () => {
        if (summaryData.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const wb = XLSX.utils.book_new();

        // Formatar dados para exportação (nomes de colunas amigáveis)
        const exportData = summaryData.map(item => {
            const kmVariance = item.executed_km > 0
                ? ((item.executed_km - item.planned_km) / item.planned_km * 100).toFixed(1) + '%'
                : '-';

            return {
                'Veículo': item.vehicle_plate,
                'Unidade': item.unit_name,
                'Data': item.date,
                'Pontos Planejados': item.planned_points,
                'KM Planejado': Number(item.planned_km.toFixed(1)),
                'KM Executado': item.executed_km > 0 ? Number(item.executed_km.toFixed(1)) : 'N/A',
                'Variação KM': kmVariance,
                'Peso Total (kg)': Number(item.planned_weight.toFixed(0)),
                'Tempo Estimado (min)': Number(item.planned_time.toFixed(0)),
                'Status': item.status
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Ajustar largura das colunas
        const colWidths = [
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
            { wch: 15 }, { wch: 12 }
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, "Resumo de Rotas");
        XLSX.writeFile(wb, `Resumo_Rotas_${filters.date}.xlsx`);
    };

    const getVarianceIcon = (planned: number, executed: number) => {
        if (executed === 0) return <Minus className="w-4 h-4 text-gray-400" />;
        const diff = ((executed - planned) / planned) * 100;
        if (diff > 5) return <TrendingUp className="w-4 h-4 text-red-500" />;
        if (diff < -5) return <TrendingDown className="w-4 h-4 text-green-500" />;
        return <Minus className="w-4 h-4 text-blue-500" />;
    };

    const getVarianceColor = (planned: number, executed: number) => {
        if (executed === 0) return 'text-gray-500';
        const diff = ((executed - planned) / planned) * 100;
        if (diff > 5) return 'text-red-600 font-bold';
        if (diff < -5) return 'text-green-600 font-bold';
        return 'text-blue-600';
    };

    const handleDeleteClick = (item: RouteSummary) => {
        if (item.status === 'Concluído' && item.closure_id) {
            setItemToDelete({ type: 'closure', id: item.closure_id });
            setDeleteModalOpen(true);
        } else if (item.id) {
            setItemToDelete({ type: 'route', id: item.id });
            setDeleteModalOpen(true);
        }
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            if (itemToDelete.type === 'closure') {
                await supabase.from('fleet_closures').delete().eq('id', itemToDelete.id);
            } else {
                await supabase.from('routes').delete().eq('id', itemToDelete.id);
            }
            // Success
            loadSummaryData();
        } catch (error) {
            console.error('Erro ao excluir:', error);
        } finally {
            setDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Gestão de Rotas</h2>
                    <p className="text-muted-foreground">Planejamento e acompanhamento diário.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleExport} disabled={summaryData.length === 0} className="bg-green-600 hover:bg-green-700 text-white">
                        <FileDown className="w-4 h-4 mr-2" />
                        Exportar Excel
                    </Button>
                </div>
            </div>

            {/* Card de Resumo Comparativo */}
            <Card>
                <CardHeader>
                    <CardTitle>Resumo Comparativo - Planejado vs Executado</CardTitle>
                    <CardDescription>Compare os dados da roteirização com o que foi executado</CardDescription>

                    {/* Filtros */}
                    <div className="flex gap-4 mt-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Data:</label>
                            <input
                                type="date"
                                value={filters.date}
                                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Veículo:</label>
                            <select
                                value={filters.vehicle}
                                onChange={(e) => setFilters({ ...filters, vehicle: e.target.value })}
                                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[150px]"
                            >
                                <option value="">Todos</option>
                                {vehicles.map(v => (
                                    <option key={v.plate} value={v.plate}>{v.plate}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Unidade:</label>
                            <select
                                value={filters.unit}
                                onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
                                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[150px]"
                            >
                                <option value="">Todas</option>
                                {units.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Status:</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[150px]"
                            >
                                <option value="">Todos</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Concluído">Concluído</option>
                            </select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    {summaryData.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhum dado encontrado para os filtros selecionados
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-[900px]">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-semibold">Veículo</th>
                                            <th className="text-left p-3 font-semibold">Unidade</th>
                                            <th className="text-center p-3 font-semibold">Pontos</th>
                                            <th className="text-center p-3 font-semibold">KM Planejado</th>
                                            <th className="text-center p-3 font-semibold">KM Executado</th>
                                            <th className="text-center p-3 font-semibold">Variação</th>
                                            <th className="text-center p-3 font-semibold">Peso (kg)</th>
                                            <th className="text-center p-3 font-semibold">Tempo (min)</th>
                                            <th className="text-center p-3 font-semibold">Status</th>
                                            <th className="text-center p-3 font-semibold">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryData.map((item, idx) => {
                                            const kmVariance = item.executed_km > 0
                                                ? ((item.executed_km - item.planned_km) / item.planned_km * 100).toFixed(1)
                                                : '-';

                                            return (
                                                <tr key={idx} className="border-b hover:bg-muted/50">
                                                    <td className="p-3 font-medium">{item.vehicle_plate}</td>
                                                    <td className="p-3">{item.unit_name}</td>
                                                    <td className="p-3 text-center">{item.planned_points}</td>
                                                    <td className="p-3 text-center">{item.planned_km.toFixed(1)} km</td>
                                                    <td className="p-3 text-center">
                                                        {item.executed_km > 0 ? `${item.executed_km.toFixed(1)} km` : '-'}
                                                    </td>
                                                    <td className={`p-3 text-center ${getVarianceColor(item.planned_km, item.executed_km)}`}>
                                                        <div className="flex items-center justify-center gap-1">
                                                            {getVarianceIcon(item.planned_km, item.executed_km)}
                                                            {kmVariance !== '-' && `${kmVariance}%`}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center">{item.planned_weight.toFixed(0)} kg</td>
                                                    <td className="p-3 text-center">{item.planned_time.toFixed(0)} min</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'Concluído'
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                                            }`}>
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteClick(item)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                                            title={item.status === 'Concluído' ? "Excluir Fechamento (Reverter)" : "Excluir Rota Planejada"}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>{/* min-w wrapper */}
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {itemToDelete?.type === 'closure' ? 'Excluir Fechamento?' : 'Excluir Rota Planejada?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {itemToDelete?.type === 'closure'
                                ? 'Isso removerá os dados de execução e reverterá o status para Pendente.'
                                : 'Isso removerá permanentemente o planejamento desta rota.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                            Sim, Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
