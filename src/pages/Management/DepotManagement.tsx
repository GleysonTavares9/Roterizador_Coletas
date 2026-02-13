import * as XLSX from 'xlsx';
import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Plus, Save, X, Download } from 'lucide-react';
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

interface Depot {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

export default function DepotManagement() {
    const [depots, setDepots] = useState<Depot[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Depot>>({});
    const [isCreating, setIsCreating] = useState(false);

    // Delete Confirmation State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        fetchDepots();
    }, []);

    const fetchDepots = async () => {
        const { data } = await supabase.from('depots').select('*').order('name');
        if (data) setDepots(data);
    };

    const handleExport = () => {
        if (!depots || depots.length === 0) {
            alert("Nenhum dado para exportar.");
            return;
        }

        // Formatar para Excel
        const exportData = depots.map(d => ({
            'Nome da Unidade': d.name,
            'Latitude': d.latitude,
            'Longitude': d.longitude
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Unidades");
        XLSX.writeFile(wb, `Unidades_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await supabase.from('depots').delete().eq('id', deleteId);
        setDeleteId(null);
        fetchDepots();
    };

    const startEdit = (depot: Depot) => {
        setEditingId(depot.id);
        setEditForm(depot);
    };

    const saveEdit = async () => {
        if (!editingId || !editForm.name) return;
        await supabase.from('depots').update({
            name: editForm.name,
            latitude: Number(editForm.latitude), // FORCE NUMBER
            longitude: Number(editForm.longitude) // FORCE NUMBER
        }).eq('id', editingId);
        setEditingId(null);
        fetchDepots();
    };

    const createDepot = async () => {
        if (!editForm.name) return;
        await supabase.from('depots').insert([{
            name: editForm.name,
            latitude: Number(editForm.latitude) || 0, // FORCE NUMBER
            longitude: Number(editForm.longitude) || 0 // FORCE NUMBER
        }]);
        setIsCreating(false);
        setEditForm({});
        fetchDepots();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg">
                <h3 className="text-xl font-bold">Gerenciar Unidades</h3>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport} title="Baixar lista">
                        <Download className="w-4 h-4 mr-2" /> Exportar
                    </Button>
                    <Button onClick={() => { setIsCreating(true); setEditForm({}); }}>
                        <Plus className="w-4 h-4 mr-2" /> Nova Unidade
                    </Button>
                </div>
            </div>

            {isCreating && (
                <div className="flex gap-2 p-4 border rounded bg-white shadow-sm items-end animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1">
                        <label className="text-xs font-medium">Nome</label>
                        <Input value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="CD Principal" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium">Latitude</label>
                        <Input type="number" step="0.000001" value={editForm.latitude || ''} onChange={e => setEditForm({ ...editForm, latitude: Number(e.target.value) })} placeholder="-23.550520" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium">Longitude</label>
                        <Input type="number" step="0.000001" value={editForm.longitude || ''} onChange={e => setEditForm({ ...editForm, longitude: Number(e.target.value) })} placeholder="-46.633308" />
                    </div>
                    <Button onClick={createDepot} size="sm" className="mb-[2px]"><Save className="w-4 h-4 mr-2" /> Salvar</Button>
                    <Button variant="ghost" onClick={() => setIsCreating(false)} size="sm" className="mb-[2px]"><X className="w-4 h-4" /></Button>
                </div>
            )}

            <div className="rounded-md border overflow-x-auto">
                <div className="min-w-[600px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Latitude</TableHead>
                                <TableHead>Longitude</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {depots.map(depot => (
                                <TableRow key={depot.id}>
                                    <TableCell className="font-medium">
                                        {editingId === depot.id ?
                                            <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                            : depot.name}
                                    </TableCell>
                                    <TableCell>
                                        {editingId === depot.id ?
                                            <Input type="number" value={editForm.latitude} onChange={e => setEditForm({ ...editForm, latitude: Number(e.target.value) })} />
                                            : depot.latitude}
                                    </TableCell>
                                    <TableCell>
                                        {editingId === depot.id ?
                                            <Input type="number" value={editForm.longitude} onChange={e => setEditForm({ ...editForm, longitude: Number(e.target.value) })} />
                                            : depot.longitude}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {editingId === depot.id ? (
                                            <>
                                                <Button size="sm" variant="default" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button size="sm" variant="ghost" onClick={() => startEdit(depot)}><Pencil className="w-4 h-4 text-blue-500" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => setDeleteId(depot.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Unidade?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação excluirá permanentemente a unidade. Certifique-se de que não há veículos ou rotas vinculadas a ela.
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
