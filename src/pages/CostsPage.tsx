
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Fuel, Wrench, Save, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '@/services/supabase';

interface VehicleCost {
    id?: number;
    vehicle_plate: string;
    fuel_consumption: number;
    fuel_price: number;
    maintenance_cost_per_km: number;
    is_active: boolean;
}

interface VehicleInfo {
    plate: string;
    implement: string;
    model: string;
}

export default function CostsPage() {
    const [costs, setCosts] = useState<VehicleCost[]>([]);
    const [vehiclesInfo, setVehiclesInfo] = useState<VehicleInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState<VehicleCost>({
        vehicle_plate: '',
        fuel_consumption: 0,
        fuel_price: 0,
        maintenance_cost_per_km: 0,
        is_active: true
    });
    const [replicateModel, setReplicateModel] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Vehicles basic info
            const { data: vData } = await supabase
                .from('vehicles')
                .select('plate, implement, model')
                .order('plate');

            if (vData) {
                setVehiclesInfo(vData);
                console.log('✅ Veículos carregados:', vData.length);
            }

            // 2. Fetch Costs
            const { data: cData, error } = await supabase
                .from('vehicle_costs')
                .select('*')
                .order('vehicle_plate');

            if (error) {
                console.error("Erro Supabase (Costs):", error);
                throw error;
            }

            if (cData) setCosts(cData);

        } catch (error: any) {
            console.error('Erro ao carregar dados:', error);
            if (error.code === '42P01') {
                alert("A tabela 'vehicle_costs' não foi encontrada no banco de dados.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.vehicle_plate) {
            alert('❌ Selecione um veículo');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                vehicle_plate: formData.vehicle_plate,
                fuel_consumption: formData.fuel_consumption,
                fuel_price: formData.fuel_price,
                maintenance_cost_per_km: formData.maintenance_cost_per_km,
                is_active: formData.is_active
            };

            let error;

            let payloadList = [];

            if (replicateModel) {
                // Bulk Logic
                const currentVehicle = vehiclesInfo.find(v => v.plate === formData.vehicle_plate);
                if (currentVehicle?.model) {
                    const sameModelVehicles = vehiclesInfo.filter(v => v.model === currentVehicle.model);
                    payloadList = sameModelVehicles.map(v => ({
                        vehicle_plate: v.plate, // Different Plate
                        fuel_consumption: formData.fuel_consumption,
                        fuel_price: formData.fuel_price,
                        maintenance_cost_per_km: formData.maintenance_cost_per_km,
                        is_active: formData.is_active
                    }));
                } else {
                    // Fallback if no model
                    payloadList = [payload];
                }
            } else {
                // Single Logic
                payloadList = [payload];
            }

            // We use Upsert for everything to simplify bulk operations
            // Warning: editingId usage logic is simpler if we just upsert by unique key (vehicle_plate would be ideal unique key)
            // But since 'id' is PK, we handle single edit carefully. 
            // For bulk, let's assume we want to update ALL based on plate match (upsert).

            if (editingId && !replicateModel) {
                // Update Single by ID (Normal)
                const { error: err } = await supabase
                    .from('vehicle_costs')
                    .update(payload)
                    .eq('id', editingId);
                error = err;
            } else {
                // Create OR Bulk Strategy (Split into Update/Insert to avoid GENERATED ALWAYS ID error)

                const plates = payloadList.map(p => p.vehicle_plate);
                // Fetch existing IDs to decide between Update vs Insert
                const { data: existingCosts } = await supabase
                    .from('vehicle_costs')
                    .select('id, vehicle_plate')
                    .in('vehicle_plate', plates);

                const updates = [];
                const inserts = [];

                for (const item of payloadList) {
                    const match = existingCosts?.find(e => e.vehicle_plate === item.vehicle_plate);
                    if (match) {
                        // Remove ID from payload to avoid "cannot insert non-DEFAULT value into column id"
                        // We use ID only for the .eq() clause
                        updates.push({ ...item, target_id: match.id });
                    } else {
                        // Clean Insert (No ID)
                        inserts.push(item);
                    }
                }

                let lastError = null;

                // 1. Process Updates (Sequential to keep it simple and safe)
                if (updates.length > 0) {
                    for (const up of updates) {
                        const { target_id, ...data } = up;
                        const { error } = await supabase
                            .from('vehicle_costs')
                            .update(data)
                            .eq('id', target_id);
                        if (error) lastError = error;
                    }
                }

                // 2. Process Inserts (Bulk is fine here as they have no IDs)
                if (inserts.length > 0) {
                    const { error } = await supabase
                        .from('vehicle_costs')
                        .insert(inserts);
                    if (error) lastError = error;
                }

                error = lastError;
            }

            if (error) {
                console.error('Erro ao salvar:', error);
                alert(`❌ Erro ao salvar: ${error.message} (Código: ${error.code})`);
                if (error.code === '42501') {
                    alert("Erro de Permissão (RLS). Você precisa liberar acesso a tabela 'vehicle_costs' no Supabase.");
                }
            } else {
                alert('✅ Custos salvos com sucesso!');
                loadData();
                resetForm();
            }
        } catch (error) {
            console.error('Erro inesperado:', error);
            alert('❌ Erro inesperado ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (cost: VehicleCost) => {
        setFormData(cost);
        setEditingId(cost.id || null);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deseja realmente excluir este registro?')) return;

        try {
            const { error } = await supabase.from('vehicle_costs').delete().eq('id', id);
            if (error) {
                alert('Erro ao excluir: ' + error.message);
            } else {
                alert('✅ Registro excluído!');
                loadData();
                // If we deleted the currently edited item, reset form
                if (editingId === id) resetForm();
            }
        } catch (error) {
            console.error('Erro ao excluir:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            vehicle_plate: '',
            fuel_consumption: 0,
            fuel_price: 0,
            maintenance_cost_per_km: 0,
            is_active: true
        });
        setEditingId(null);
        setReplicateModel(false);
    };

    // Filter available vehicles (exclude ones that already have costs, unless editing)
    const availableVehicles = vehiclesInfo.filter(v =>
        !costs.some(cost => cost.vehicle_plate === v.plate) ||
        (editingId && formData.vehicle_plate === v.plate)
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Custos Operacionais</h2>
                    <p className="text-muted-foreground">Configure os custos de cada veículo da frota</p>
                </div>
            </div>

            {/* Formulário de Cadastro */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        {editingId ? 'Editar Custos' : 'Novo Registro de Custos'}
                    </CardTitle>
                    <CardDescription>
                        Informe os dados operacionais do veículo para cálculo automático de custos
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Placa do Veículo (Selecione)</label>
                            <select
                                value={formData.vehicle_plate}
                                onChange={(e) => setFormData({ ...formData, vehicle_plate: e.target.value })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                disabled={editingId !== null}
                            >
                                <option value="">Selecione...</option>
                                {availableVehicles.map(v => (
                                    <option key={v.plate} value={v.plate}>
                                        {v.plate} - {v.implement || 'Sem Implemento'}
                                    </option>
                                ))}
                            </select>
                            {vehiclesInfo.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Nenhum veículo cadastrado no sistema
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Fuel className="w-4 h-4" />
                                Consumo (km/L)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.fuel_consumption}
                                onChange={(e) => setFormData({ ...formData, fuel_consumption: parseFloat(e.target.value) })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="8.5"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Preço Combustível (R$/L)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.fuel_price}
                                onChange={(e) => setFormData({ ...formData, fuel_price: parseFloat(e.target.value) })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="5.50"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Wrench className="w-4 h-4" />
                                Manutenção (R$/km)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.maintenance_cost_per_km}
                                onChange={(e) => setFormData({ ...formData, maintenance_cost_per_km: parseFloat(e.target.value) })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="0.50"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-4">
                        {/* Checkbox de Replicação Inteligente */}
                        {(() => {
                            const currentVehicle = vehiclesInfo.find(v => v.plate === formData.vehicle_plate);
                            if (currentVehicle?.model) {
                                const sameModelCount = vehiclesInfo.filter(v => v.model === currentVehicle.model).length;
                                if (sameModelCount > 1) {
                                    return (
                                        <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-100 rounded-md">
                                            <input
                                                type="checkbox"
                                                id="replicateByModel"
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={replicateModel}
                                                onChange={(e) => setReplicateModel(e.target.checked)}
                                            />
                                            <label htmlFor="replicateByModel" className="text-sm text-blue-800 cursor-pointer select-none">
                                                <strong>Replicar custos de forma inteligente?</strong>
                                                <br />
                                                Aplicar para todos os <strong>{sameModelCount}</strong> veículos do modelo <strong>{currentVehicle.model}</strong>
                                            </label>
                                        </div>
                                    );
                                }
                            }
                            return null;
                        })()}

                        <div className="flex gap-2">
                            <Button onClick={handleSave} disabled={loading} className="gap-2">
                                <Save className="w-4 h-4" />
                                {loading ? 'Processando...' : editingId ? 'Atualizar' : 'Salvar Custos'}
                            </Button>
                            {editingId && (
                                <Button onClick={resetForm} variant="outline">
                                    Cancelar
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabela de Custos */}
            <Card>
                <CardHeader>
                    <CardTitle>Custos Cadastrados</CardTitle>
                    <CardDescription>Veículos com configuração de custos operacionais</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <div className="min-w-[900px]">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="p-3 text-left text-sm font-medium">Placa</th>
                                        <th className="p-3 text-left text-sm font-medium">Implemento</th>
                                        <th className="p-3 text-left text-sm font-medium">Consumo (km/L)</th>
                                        <th className="p-3 text-left text-sm font-medium">Combustível (R$/L)</th>
                                        <th className="p-3 text-left text-sm font-medium">Manutenção (R$/km)</th>
                                        <th className="p-3 text-left text-sm font-medium">Custo/km Total</th>
                                        <th className="p-3 text-left text-sm font-medium">Status</th>
                                        <th className="p-3 text-right text-sm font-medium">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {costs.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                                Nenhum custo cadastrado. Adicione o primeiro registro acima.
                                            </td>
                                        </tr>
                                    ) : (
                                        costs.map((cost) => {
                                            const vehicleInfo = vehiclesInfo.find(v => v.plate === cost.vehicle_plate);
                                            const implement = vehicleInfo?.implement || '-';

                                            return (
                                                <tr key={cost.id} className="border-b hover:bg-muted/50 transition-colors">
                                                    <td className="p-3 font-medium">{cost.vehicle_plate}</td>
                                                    <td className="p-3 text-sm text-muted-foreground">{implement}</td>
                                                    <td className="p-3">{cost.fuel_consumption.toFixed(1)}</td>
                                                    <td className="p-3">R$ {cost.fuel_price.toFixed(2)}</td>
                                                    <td className="p-3">R$ {cost.maintenance_cost_per_km.toFixed(2)}</td>
                                                    <td className="p-3 font-semibold text-primary">
                                                        R$ {((cost.fuel_price / cost.fuel_consumption) + cost.maintenance_cost_per_km).toFixed(2)}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${cost.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                                            }`}>
                                                            {cost.is_active ? 'Ativo' : 'Inativo'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleEdit(cost)}
                                                                className="p-2 hover:bg-primary/10 text-primary rounded-md transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => cost.id && handleDelete(cost.id)}
                                                                className="p-2 hover:bg-destructive/10 text-destructive rounded-md transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
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
        </motion.div>
    );
}
