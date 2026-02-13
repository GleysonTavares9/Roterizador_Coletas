
import * as XLSX from 'xlsx';
import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Plus, Save, Search, Download } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Label } from "@/components/ui/label"

interface Vehicle {
    id: string;
    plate: string;
    capacity_kg: number;
    unit_name: string;
    manufacturer?: string;
    model?: string;
    implement?: string;
    drums_capacity?: number;
    avg_capacity_cb?: number; // Capacidade C/B
    avg_capacity_cg?: number; // Capacidade C/G
}

export default function FleetManagement() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentVehicle, setCurrentVehicle] = useState<Partial<Vehicle>>({});

    // Delete Confirmation State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        fetchVehicles();
    }, []);

    const fetchVehicles = async () => {
        const { data } = await supabase.from('vehicles').select('*').order('plate');
        if (data) setVehicles(data);
    };

    const handleExport = () => {
        if (!vehicles || vehicles.length === 0) {
            alert("Nenhum dado para exportar.");
            return;
        }

        const dataToExport = vehicles.filter(v =>
            v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.unit_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (dataToExport.length === 0) {
            alert("Nenhum dado encontrado com o filtro atual.");
            return;
        }

        // Formatar para Excel
        const exportData = dataToExport.map(v => ({
            'Placa': v.plate,
            'Unidade': v.unit_name,
            'Fabricante': v.manufacturer,
            'Modelo': v.model,
            'Implemento': v.implement,
            'Capacidade (kg)': v.capacity_kg,
            'Bombonas': v.drums_capacity,
            'Média C/B': v.avg_capacity_cb,
            'Média C/G': v.avg_capacity_cg
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Frota");
        XLSX.writeFile(wb, `Frota_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await supabase.from('vehicles').delete().eq('id', deleteId);
        setDeleteId(null);
        fetchVehicles();
    };

    const handleSave = async () => {
        if (!currentVehicle.plate) return;

        const vehicleData = {
            plate: currentVehicle.plate.toUpperCase().trim(),
            capacity_kg: Number(currentVehicle.capacity_kg) || 0,
            unit_name: currentVehicle.unit_name || 'Geral',
            manufacturer: currentVehicle.manufacturer,
            model: currentVehicle.model,
            implement: currentVehicle.implement,
            drums_capacity: Number(currentVehicle.drums_capacity) || 0,
            avg_capacity_cb: Number(currentVehicle.avg_capacity_cb) || 0,
            avg_capacity_cg: Number(currentVehicle.avg_capacity_cg) || 0
        };

        if (currentVehicle.id) {
            // Update
            const { error } = await supabase.from('vehicles').update(vehicleData).eq('id', currentVehicle.id);
            if (error) {
                console.error('Erro ao atualizar:', error);
                alert('Erro ao salvar. Verifique se as colunas existem no banco.');
            }
        } else {
            // Create
            const { error } = await supabase.from('vehicles').insert([vehicleData]);
            if (error) {
                console.error('Erro ao criar:', error);
                alert('Erro ao criar. Verifique se as colunas existem no banco.');
            }
        }

        setIsDialogOpen(false);
        setCurrentVehicle({});
        fetchVehicles();
    };

    const openEdit = (vehicle: Vehicle) => {
        setCurrentVehicle(vehicle);
        setIsDialogOpen(true);
    };

    const openNew = () => {
        setCurrentVehicle({});
        setIsDialogOpen(true);
    };

    const filteredVehicles = vehicles.filter(v =>
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.unit_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4 font-sans">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Gerenciar Frota</h3>
                    <p className="text-sm text-slate-500">Cadastro e edição de veículos</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport} title="Baixar lista">
                        <Download className="w-4 h-4 mr-2" /> Exportar
                    </Button>
                    <Button onClick={openNew}>
                        <Plus className="w-4 h-4 mr-2" /> Novo Veículo
                    </Button>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-slate-400" />
                <Input
                    placeholder="Buscar por placa ou unidade..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="min-w-[1200px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead>Unidade</TableHead>
                                    <TableHead>Placa</TableHead>
                                    <TableHead>Fabricante</TableHead>
                                    <TableHead>Modelo</TableHead>
                                    <TableHead>Implemento</TableHead>
                                    <TableHead>Bombonas</TableHead>
                                    <TableHead className="text-right">Cap. (kg)</TableHead>
                                    <TableHead className="text-right">Méd. C/B</TableHead>
                                    <TableHead className="text-right">Méd. C/G</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredVehicles.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                            Nenhum veículo encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredVehicles.map(vehicle => (
                                        <TableRow key={vehicle.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-medium text-slate-700">{vehicle.unit_name}</TableCell>
                                            <TableCell className="font-bold">{vehicle.plate}</TableCell>
                                            <TableCell>{vehicle.manufacturer || '-'}</TableCell>
                                            <TableCell>{vehicle.model || '-'}</TableCell>
                                            <TableCell>{vehicle.implement || '-'}</TableCell>
                                            <TableCell>{vehicle.drums_capacity || '-'}</TableCell>
                                            <TableCell className="text-right font-mono">{vehicle.capacity_kg}</TableCell>
                                            <TableCell className="text-right font-mono">{vehicle.avg_capacity_cb || '-'}</TableCell>
                                            <TableCell className="text-right font-mono">{vehicle.avg_capacity_cg || '-'}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(vehicle)}>
                                                    <Pencil className="w-4 h-4 text-blue-600" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId(vehicle.id)}>
                                                    <Trash2 className="w-4 h-4 text-red-600" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>{/* min-w wrapper */}
                </div>
            </div>

            {/* Dialog de Edição/Criação */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{currentVehicle.id ? 'Editar Veículo' : 'Novo Veículo'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do veículo. Clique em salvar quando terminar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Placa *</Label>
                                <Input
                                    value={currentVehicle.plate || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, plate: e.target.value })}
                                    placeholder="ABC-1234"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Unidade</Label>
                                <Input
                                    value={currentVehicle.unit_name || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, unit_name: e.target.value })}
                                    placeholder="Ex: Matriz"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Fabricante</Label>
                                <Input
                                    value={currentVehicle.manufacturer || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, manufacturer: e.target.value })}
                                    placeholder="Ex: Volvo"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Modelo</Label>
                                <Input
                                    value={currentVehicle.model || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, model: e.target.value })}
                                    placeholder="Ex: FH 540"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Implemento</Label>
                                <Input
                                    value={currentVehicle.implement || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, implement: e.target.value })}
                                    placeholder="Ex: Baú"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Capacidade (kg)</Label>
                                <Input
                                    type="number"
                                    value={currentVehicle.capacity_kg || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, capacity_kg: Number(e.target.value) })}
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Capacidade Bombonas</Label>
                                <Input
                                    type="number"
                                    value={currentVehicle.drums_capacity || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, drums_capacity: Number(e.target.value) })}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Média Cap. C/B</Label>
                                <Input
                                    type="number"
                                    value={currentVehicle.avg_capacity_cb || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, avg_capacity_cb: Number(e.target.value) })}
                                    placeholder="0.0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Média Cap. C/G</Label>
                                <Input
                                    type="number"
                                    value={currentVehicle.avg_capacity_cg || ''}
                                    onChange={e => setCurrentVehicle({ ...currentVehicle, avg_capacity_cg: Number(e.target.value) })}
                                    placeholder="0.0"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Salvar Veículo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Veículo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o veículo da sua base de dados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
