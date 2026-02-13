import * as XLSX from 'xlsx';
import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Save, X, Search, ArrowRight, ArrowLeft, MapPin, Download } from 'lucide-react';
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

interface Point {
    id: string;
    client_name: string;
    cost_vector_name?: string;
    address: string;
    latitude: number;
    longitude: number;
    avg_weight: number;
    unit_name: string;
    route: string;
    frequency: string;
    city: string;
    neighborhood: string;
    uf: string;
}

export default function PointManagement() {
    const [points, setPoints] = useState<Point[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Point>>({});
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const ITEMS_PER_PAGE = 20;

    // Delete Confirmation State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        fetchPoints();
    }, [page, search]);

    const fetchPoints = async () => {
        let query = supabase.from('collection_points').select('*')
            .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1)
            .order('client_name');

        if (search) {
            query = query.ilike('client_name', `%${search}%`);
        }

        const { data } = await query;
        if (data) setPoints(data);
    };

    const handleExport = async () => {
        let query = supabase.from('collection_points').select('*').order('client_name');

        if (search) {
            query = query.ilike('client_name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) {
            alert("Erro ao exportar: " + error.message);
            return;
        }

        if (!data || data.length === 0) {
            alert("Nenhum dado para exportar.");
            return;
        }

        // Formatar para Excel
        const exportData = data.map(p => ({
            'Cliente': p.client_name,
            'Vetor de Custo': p.cost_vector_name,
            'Endereço': p.address,
            'Bairro': p.neighborhood,
            'Cidade': p.city,
            'UF': p.uf,
            'Latitude': p.latitude,
            'Longitude': p.longitude,
            'Peso Médio': p.avg_weight,
            'Unidade': p.unit_name,
            'Rota Padrão': p.route,
            'Frequência': p.frequency
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Pontos de Coleta");
        XLSX.writeFile(wb, `Pontos_Coleta_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await supabase.from('collection_points').delete().eq('id', deleteId);
        setDeleteId(null);
        fetchPoints();
    };

    const startEdit = (point: Point) => {
        setEditingId(point.id);
        setEditForm(point);
    };

    const saveEdit = async () => {
        if (!editingId || !editForm.client_name) return;

        const payload: any = {
            client_name: editForm.client_name,
            cost_vector_name: editForm.cost_vector_name,
            address: editForm.address,
            latitude: editForm.latitude,
            longitude: editForm.longitude,
            avg_weight: Number(editForm.avg_weight),
            unit_name: editForm.unit_name,
            route: editForm.route,
            frequency: editForm.frequency,
            city: editForm.city,
            neighborhood: editForm.neighborhood,
            uf: editForm.uf
        };

        // Remove undefined keys so they don't overwrite with null if not intended (or just send whatever)
        // Ideally DB has default, but here we just send what we have.

        await supabase.from('collection_points').update(payload).eq('id', editingId);
        setEditingId(null);
        fetchPoints();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg">
                <h3 className="text-xl font-bold">Pontos de Coleta</h3>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} title="Baixar lista completa">
                        <Download className="w-4 h-4 mr-2" />
                        Exportar
                    </Button>
                    <div className="flex items-center gap-2 border rounded-md px-2 bg-white">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar cliente..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                            className="w-64 border-none focus-visible:ring-0"
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <div className="min-w-[1000px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Rota / Frequência</TableHead>
                                <TableHead>Cidade / Endereço</TableHead>
                                <TableHead>Coordenadas</TableHead>
                                <TableHead>Peso Médio</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {points.map(point => (
                                <TableRow key={point.id}>
                                    <TableCell>
                                        {editingId === point.id ?
                                            <div className="space-y-1">
                                                <Input value={editForm.client_name} onChange={e => setEditForm({ ...editForm, client_name: e.target.value })} placeholder="Cliente" />
                                                <Input value={editForm.cost_vector_name} onChange={e => setEditForm({ ...editForm, cost_vector_name: e.target.value })} placeholder="Vetor de custo nome" className="text-xs" />
                                                <Input value={editForm.unit_name} onChange={e => setEditForm({ ...editForm, unit_name: e.target.value })} placeholder="Unidade" />
                                            </div>
                                            :
                                            <div>
                                                <div className="font-medium">{point.client_name}</div>
                                                {point.cost_vector_name && <div className="text-xs text-blue-600 font-medium">{point.cost_vector_name}</div>}
                                                <div className="text-xs text-muted-foreground">{point.unit_name}</div>
                                            </div>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {editingId === point.id ?
                                            <div className="space-y-1">
                                                <Input value={editForm.route} onChange={e => setEditForm({ ...editForm, route: e.target.value })} placeholder="Rota" />
                                                <Input value={editForm.frequency} onChange={e => setEditForm({ ...editForm, frequency: e.target.value })} placeholder="Frequência" />
                                            </div>
                                            :
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{point.route && point.route !== 'N/I' ? point.route : <span className="text-muted-foreground italic">Sem Rota</span>}</span>
                                                <span className="text-xs text-muted-foreground">{point.frequency || '-'}</span>
                                            </div>
                                        }
                                    </TableCell>
                                    <TableCell className="max-w-md">
                                        {editingId === point.id ?
                                            <div className="space-y-1">
                                                <Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} placeholder="Cidade" />
                                                <div className="flex gap-1">
                                                    <Input value={editForm.neighborhood} onChange={e => setEditForm({ ...editForm, neighborhood: e.target.value })} placeholder="Bairro" className="flex-1" />
                                                    <Input value={editForm.uf} onChange={e => setEditForm({ ...editForm, uf: e.target.value })} placeholder="UF" className="w-16" />
                                                </div>
                                                <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Endereço" />
                                            </div>
                                            :
                                            <div>
                                                <div className="font-medium text-sm">{point.city || '-'} {point.neighborhood ? ` - ${point.neighborhood}` : ''} {point.uf ? `(${point.uf})` : ''}</div>
                                                <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={point.address}>{point.address}</div>
                                            </div>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {editingId === point.id ?
                                            <div className="space-y-1">
                                                <Input type="number" step="any" value={editForm.latitude} onChange={e => setEditForm({ ...editForm, latitude: parseFloat(e.target.value) })} placeholder="Lat" />
                                                <Input type="number" step="any" value={editForm.longitude} onChange={e => setEditForm({ ...editForm, longitude: parseFloat(e.target.value) })} placeholder="Lon" />
                                            </div>
                                            :
                                            <div className="flex flex-col text-xs text-muted-foreground">
                                                <div><span className="font-semibold">Lat:</span> {point.latitude?.toFixed(5) || '-'}</div>
                                                <div><span className="font-semibold">Lon:</span> {point.longitude?.toFixed(5) || '-'}</div>
                                                {(point.latitude && point.longitude) && (
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-1"
                                                    >
                                                        <MapPin className="w-3 h-3" /> Ver no mapa
                                                    </a>
                                                )}
                                            </div>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {editingId === point.id ?
                                            <Input type="number" value={editForm.avg_weight} onChange={e => setEditForm({ ...editForm, avg_weight: Number(e.target.value) })} />
                                            : (
                                                <div className="flex items-center">
                                                    {point.avg_weight > 0 ? (
                                                        <span className="font-medium">{point.avg_weight} <span className="text-xs text-muted-foreground">kg</span></span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs italic">N/I</span>
                                                    )}
                                                </div>
                                            )
                                        }
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {editingId === point.id ? (
                                            <div className="flex flex-col gap-1 items-end">
                                                <Button size="sm" variant="default" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                                            </div>
                                        ) : (
                                            <>
                                                <Button size="sm" variant="ghost" onClick={() => startEdit(point)}><Pencil className="w-4 h-4 text-blue-500" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => setDeleteId(point.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex justify-between items-center mt-4">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {page + 1}</span>
                <Button variant="outline" disabled={points.length < ITEMS_PER_PAGE} onClick={() => setPage(p => p + 1)}>
                    Próxima <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Ponto?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação excluirá permanentemente o ponto e todo seu histórico de coletas futuras.
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
