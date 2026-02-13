import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Truck, Calendar, Save, Filter, Trash2 } from 'lucide-react';
import { supabase } from '@/services/supabase';
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

interface FleetClosure {
    id?: number;
    vehicle_plate: string;
    closure_date: string;
    run_id?: string;
    km_start: number;
    km_end: number;
    km_traveled?: number;
    fuel_cost?: number;
    maintenance_cost?: number;
    total_cost?: number;
    notes?: string;
}

interface OptimizationRun {
    id: string;
    created_at: string;
    total_routes: number;
}

export default function FleetClosurePage() {
    const [closures, setClosures] = useState<FleetClosure[]>([]);
    const [optimizations, setOptimizations] = useState<OptimizationRun[]>([]);
    const [vehicles, setVehicles] = useState<string[]>([]);
    const [vehiclesData, setVehiclesData] = useState<any[]>([]); // Dados completos dos veículos
    const [units, setUnits] = useState<string[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [routesForDate, setRoutesForDate] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<FleetClosure>({
        vehicle_plate: '',
        closure_date: new Date().toISOString().split('T')[0],
        km_start: 0,
        km_end: 0,
        notes: ''
    });

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<number | null>(null);

    useEffect(() => {
        loadVehicles();
        loadOptimizations();
    }, []);

    useEffect(() => {
        loadClosures();
        loadRoutesForDate();
    }, [formData.closure_date, optimizations]);


    // Recarregar rotas quando houver novo fechamento
    useEffect(() => {
        if (closures.length > 0) {
            loadRoutesForDate();
        }
    }, [closures]); // Mudado de closures.length para closures

    const loadVehicles = async () => {
        try {
            const response = await fetch('/api/vehicles');
            if (response.ok) {
                const data = await response.json();
                setVehiclesData(data); // Guardar dados completos
                setVehicles(data.map((v: any) => v.plate));

                // Extrair unidades únicas
                const uniqueUnits = [...new Set(data.map((v: any) => v.unit_name).filter(Boolean))];
                setUnits(uniqueUnits as string[]);
                //                 console.log('✅ Unidades disponíveis:', uniqueUnits);
            }
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    };

    const loadOptimizations = async () => {
        try {
            const response = await fetch('/api/optimizations');
            if (response.ok) {
                const data = await response.json();
                setOptimizations(data.optimizations || []);
            }
        } catch (error) {
            console.error('Erro ao carregar otimizações:', error);
        }
    };

    const loadRoutesForDate = async () => {
        try {
            //             console.log('🔍 Buscando rotas para data:', formData.closure_date);
            // console.log('📊 Otimizações disponíveis:', optimizations.map(o => ({
            //     id: o.id.slice(0, 8),
            //     created_at: o.created_at,
            //     date: o.created_at.split('T')[0]
            // })));

            // Buscar otimização do dia selecionado
            const optimization = optimizations.find(opt => {
                const optDate = opt.created_at.split('T')[0];
                //                 console.log(`Comparando: ${optDate} === ${formData.closure_date} = ${optDate === formData.closure_date}`);
                return optDate === formData.closure_date;
            });

            //             console.log('✅ Otimização encontrada:', optimization ? optimization.id.slice(0, 8) : 'Nenhuma');

            if (optimization) {
                // MUDANÇA: Buscar direto do Supabase para garantir dados completos (KM, etc)
                const { data: routesData, error } = await supabase
                    .from('routes')
                    .select('*, route_points(*)')
                    .eq('run_id', optimization.id);

                if (error) {
                    console.error('❌ Erro Supabase Routes:', error);
                    setRoutesForDate([]);
                } else {
                    // Mapear para garantir compatibilidade com o formato esperado pelo componente
                    const allRoutes = (routesData || []).map((r: any) => ({
                        ...r,
                        points: r.route_points || [], // Garante array de pontos
                        vehicle_plate: r.vehicle_plate, // Garante nome correto do campo
                        total_distance: r.total_distance // Garante distância
                    }));

                    // Normalizar data do formulário (YYYY-MM-DD)
                    const targetDate = formData.closure_date;
                    //                     console.log(`📅 Filtrando fechamentos para data: ${targetDate}`);

                    // Filtrar rotas que já foram fechadas
                    const closedPlates = closures
                        .filter(c => {
                            const dbDate = c.closure_date.split('T')[0];
                            return dbDate === targetDate;
                        })
                        .map(c => c.vehicle_plate.trim().toUpperCase());

                    //                     console.log('🚫 Placas fechadas no banco:', closedPlates);

                    const availableRoutes = allRoutes.filter(
                        (route: any) => {
                            const plate = (route.vehicle_plate || route.vehicle || '').trim().toUpperCase();
                            const isClosed = closedPlates.includes(plate);
                            // if (isClosed) console.log(`🚫 Filtrando rota fechada: ${plate}`);
                            return !isClosed;
                        }
                    );

                    setRoutesForDate(availableRoutes);
                    //                     console.log('✅ Rotas disponíveis:', availableRoutes.length, 'de', allRoutes.length);
                    //                     console.log('🚫 Placas já fechadas:', closedPlates);
                }
            } else {
                //                 console.log('⚠️ Nenhuma otimização encontrada para', formData.closure_date);
                setRoutesForDate([]);
            }
        } catch (error) {
            console.error('Erro ao carregar rotas do dia:', error);
            setRoutesForDate([]);
        }
    };

    const loadClosures = async () => {
        try {
            const response = await fetch(`/api/fleet-closures?date=${formData.closure_date}`);
            if (response.ok) {
                const data = await response.json();
                setClosures(data);
            }
        } catch (error) {
            console.error('Erro ao carregar fechamentos:', error);
        }
    };

    const handleDelete = (id: number) => {
        setItemToDelete(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            const { error } = await supabase
                .from('fleet_closures')
                .delete()
                .eq('id', itemToDelete);

            if (error) {
                console.error('Erro ao excluir:', error);
                alert('Erro ao excluir: ' + error.message);
            } else {
                // Success
                loadClosures();
                loadRoutesForDate();
            }
        } catch (error) {
            console.error('Erro ao excluir:', error);
        } finally {
            setDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    const handleSelectRoute = (route: any) => {
        //         console.log('🎯 Rota selecionada:', route);

        // O campo pode ser 'vehicle' ou 'vehicle_plate'
        const vehiclePlate = route.vehicle_plate || route.vehicle || '';
        //         console.log('📋 Placa da rota:', vehiclePlate);

        // Preencher formulário com dados da rota
        const newFormData = {
            ...formData,
            vehicle_plate: vehiclePlate,
            closure_date: formData.closure_date,
            km_start: route.initial_km ?? 0,
            km_end: route.final_km ?? (route.total_distance ? Math.round(route.total_distance) : 0),
            notes: `Rota com ${route.points?.length || 0} pontos. ${route.final_km ? 'KM obtido do motorista.' : 'KM sugerido pelo planejamento.'}`
        };

        //         console.log('✅ Novo formData:', newFormData);
        setFormData(newFormData);

        // Scroll suave para o formulário
        setTimeout(() => {
            document.querySelector('#form-fechamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const handleSave = async () => {
        if (!formData.vehicle_plate || formData.km_end <= formData.km_start) {
            alert('❌ Preencha todos os campos corretamente. KM final deve ser maior que KM inicial.');
            return;
        }

        setLoading(true);
        try {
            //             console.log('💾 Salvando fechamento:', formData);

            // Salvar direto no Supabase (km_traveled é calculado automaticamente)
            const { error } = await supabase
                .from('fleet_closures')
                .insert([{
                    vehicle_plate: formData.vehicle_plate,
                    closure_date: formData.closure_date,
                    km_start: formData.km_start,
                    km_end: formData.km_end,
                    notes: formData.notes || ''
                }])
                .select();

            if (error) {
                console.error('❌ Erro do Supabase:', error);
                alert('❌ Erro: ' + error.message);
            } else {
                //                 console.log('✅ Fechamento salvo:', data);
                alert('✅ Fechamento registrado com sucesso!');
                await loadClosures(); // Recarregar fechamentos
                await loadRoutesForDate(); // Recarregar rotas para remover a fechada
                resetForm();
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            alert('❌ Erro ao salvar fechamento');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            vehicle_plate: '',
            closure_date: new Date().toISOString().split('T')[0],
            km_start: 0,
            km_end: 0,
            notes: ''
        });
    };

    // Filtrar rotas e fechamentos por unidade
    const filteredRoutes = routesForDate.filter(route => {
        if (!selectedUnit) return true; // Se não há filtro, mostrar todas
        // Buscar a unidade do veículo da rota
        const vehicle = vehiclesData.find(v => v.plate === route.vehicle_plate);
        return vehicle?.unit_name === selectedUnit;
    });

    const filteredClosures = closures.filter(closure => {
        if (!selectedUnit) return true; // Se não há filtro, mostrar todas
        // Buscar a unidade do veículo do fechamento
        const vehicle = vehiclesData.find(v => v.plate === closure.vehicle_plate);
        return vehicle?.unit_name === selectedUnit;
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Fechamento de Frota</h2>
                    <p className="text-muted-foreground">Registre o KM inicial e final de cada veículo</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Unidade:</label>
                    <select
                        value={selectedUnit}
                        onChange={(e) => setSelectedUnit(e.target.value)}
                        className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[150px]"
                    >
                        <option value="">Todas</option>
                        {units.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Rotas do Dia Selecionado */}
            {filteredRoutes.length > 0 && (
                <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardHeader>
                        <CardTitle className="text-blue-900 dark:text-blue-100">
                            🚛 Rotas do Dia {formData.closure_date.split('-').reverse().join('/')}
                        </CardTitle>
                        <CardDescription className="text-blue-700 dark:text-blue-300">
                            {filteredRoutes.length} rota(s) pendente(s) de fechamento
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 md:grid-cols-3">
                            {filteredRoutes.map((route, index) => {
                                const vehicle = vehiclesData.find(v =>
                                    (v.plate || '').trim().toUpperCase() === (route.vehicle_plate || route.vehicle || '').trim().toUpperCase()
                                );
                                // Debug COMPLETO
                                //                                 console.log('📦 Rota Objeto Completo:', route);

                                return (
                                    <button
                                        key={route.id || index}
                                        onClick={() => handleSelectRoute(route)}
                                        className="p-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 transition-all hover:scale-105 text-left"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="font-bold text-blue-900 dark:text-blue-100">{route.vehicle_plate || route.vehicle || 'N/A'}</div>
                                            <div className="text-xs font-medium px-2 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                                {vehicle?.unit_name || 'N/A'}
                                            </div>
                                        </div>
                                        <div className="text-sm text-blue-700 dark:text-blue-300">
                                            {route.points?.length || 0} pontos • <span className="font-bold">{route.final_km ? `${route.final_km} km (Real)` : `${route.total_distance?.toFixed(1) || '0'} km (Plan)`}</span>
                                        </div>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                            Clique para fechar
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {routesForDate.length === 0 && formData.closure_date && (
                <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                    <CardContent className="p-6 text-center">
                        <div className="text-green-900 dark:text-green-100 font-medium">
                            ✅ Todas as rotas do dia {formData.closure_date.split('-').reverse().join('/')} já foram fechadas!
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Formulário de Fechamento */}
            <Card id="form-fechamento">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="w-5 h-5" />
                        Novo Fechamento
                    </CardTitle>
                    <CardDescription>
                        Informe os dados do veículo e a quilometragem rodada
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-6">
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium">Veículo</label>
                            <select
                                value={formData.vehicle_plate}
                                onChange={(e) => setFormData({ ...formData, vehicle_plate: e.target.value })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">Selecione...</option>
                                {vehicles.map(plate => (
                                    <option key={plate} value={plate}>{plate}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Data
                            </label>
                            <input
                                type="date"
                                value={formData.closure_date}
                                onChange={(e) => setFormData({ ...formData, closure_date: e.target.value })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">KM Inicial</label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.km_start}
                                onChange={(e) => setFormData({ ...formData, km_start: parseFloat(e.target.value) })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="0.0"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">KM Final</label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.km_end}
                                onChange={(e) => setFormData({ ...formData, km_end: parseFloat(e.target.value) })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="0.0"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">KM Rodado</label>
                            <input
                                type="number"
                                value={(formData.km_end - formData.km_start).toFixed(1)}
                                disabled
                                className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-bold"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        <label className="text-sm font-medium">Observações</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Adicione observações sobre a rota, ocorrências, etc..."
                        />
                    </div>

                    <div className="flex gap-2 mt-4">
                        <Button onClick={handleSave} disabled={loading} className="gap-2">
                            <Save className="w-4 h-4" />
                            {loading ? 'Salvando...' : 'Registrar Fechamento'}
                        </Button>
                        <Button onClick={resetForm} variant="outline">
                            Limpar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Filtro e Lista de Fechamentos */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Fechamentos Registrados</CardTitle>
                            <CardDescription>Histórico de fechamentos da frota</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-muted-foreground" />
                            <input
                                type="date"
                                value={formData.closure_date}
                                onChange={(e) => setFormData({ ...formData, closure_date: e.target.value })}
                                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <div className="min-w-[1000px]">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="p-3 text-left text-sm font-medium">Veículo</th>
                                        <th className="p-3 text-left text-sm font-medium">Unidade</th>
                                        <th className="p-3 text-left text-sm font-medium">Data</th>
                                        <th className="p-3 text-left text-sm font-medium">KM Inicial</th>
                                        <th className="p-3 text-left text-sm font-medium">KM Final</th>
                                        <th className="p-3 text-left text-sm font-medium">KM Rodado</th>
                                        <th className="p-3 text-left text-sm font-medium">Custo Total</th>
                                        <th className="p-3 text-left text-sm font-medium">Observações</th>
                                        <th className="p-3 text-right text-sm font-medium">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClosures.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                                Nenhum fechamento registrado para esta data.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredClosures.map((closure) => {
                                            const vehicle = vehiclesData.find(v => v.plate === closure.vehicle_plate);
                                            return (
                                                <tr key={closure.id} className="border-b hover:bg-muted/50 transition-colors">
                                                    <td className="p-3 font-medium">{closure.vehicle_plate}</td>
                                                    <td className="p-3">{vehicle?.unit_name || '-'}</td>
                                                    <td className="p-3">{new Date(closure.closure_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                                    <td className="p-3">{closure.km_start.toFixed(1)} km</td>
                                                    <td className="p-3">{closure.km_end.toFixed(1)} km</td>
                                                    <td className="p-3 font-bold text-primary">{closure.km_traveled?.toFixed(1)} km</td>
                                                    <td className="p-3 font-bold text-green-600">
                                                        {closure.total_cost ? `R$ ${closure.total_cost.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="p-3 text-sm text-muted-foreground max-w-xs truncate">
                                                        {closure.notes || '-'}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => closure.id && handleDelete(closure.id)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Fechamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o registro de fechamento do veículo.
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
        </motion.div >
    );
}
