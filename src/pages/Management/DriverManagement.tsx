
import * as XLSX from 'xlsx';
import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Plus, Search, User, Camera, Download } from 'lucide-react';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface Driver {
    id: string;
    name: string;
    cpf: string;
    cnh: string;
    unit: string;
    active: boolean;
    photo_url?: string;
}

export default function DriverManagement() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentDriver, setCurrentDriver] = useState<Partial<Driver>>({ active: true });
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [uploadingDetails, setUploadingDetails] = useState(false);

    useEffect(() => {
        fetchDrivers();
    }, []);

    const fetchDrivers = async () => {
        const { data } = await supabase.from('drivers').select('*').order('name');
        if (data) setDrivers(data);
    };

    const handleExport = () => {
        if (!drivers || drivers.length === 0) {
            alert("Nenhum dado para exportar.");
            return;
        }

        const dataToExport = drivers.filter(d =>
            d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.cpf?.includes(searchTerm)
        );

        if (dataToExport.length === 0) {
            alert("Nenhum dado encontrado com o filtro atual.");
            return;
        }

        // Formatar para Excel
        const exportData = dataToExport.map(d => ({
            'Nome': d.name,
            'CPF': d.cpf,
            'CNH': d.cnh,
            'Unidade': d.unit,
            'Status': d.active ? 'Ativo' : 'Inativo'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Motoristas");
        XLSX.writeFile(wb, `Motoristas_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await supabase.from('drivers').delete().eq('id', deleteId);
        setDeleteId(null);
        fetchDrivers();
    };

    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!event.target.files || event.target.files.length === 0) {
                return;
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `driver-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${fileName}`;

            setUploadingDetails(true);

            // Upload image using consistent 'avatars' bucket
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // Get public URL
            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            if (data) {
                setCurrentDriver(prev => ({ ...prev, photo_url: data.publicUrl }));
            }

        } catch (error: any) {
            console.error('Erro no upload:', error);
            alert('Erro ao fazer upload da imagem: ' + error.message);
        } finally {
            setUploadingDetails(false);
        }
    };

    const handleSave = async () => {
        if (!currentDriver.name || !currentDriver.cpf) {
            alert('Nome e CPF são obrigatórios');
            return;
        }

        const driverData = {
            name: currentDriver.name.toUpperCase().trim(),
            cpf: currentDriver.cpf.replace(/\D/g, ''),
            cnh: currentDriver.cnh?.replace(/\D/g, ''),
            unit: currentDriver.unit,
            active: currentDriver.active,
            photo_url: currentDriver.photo_url
        };

        if (currentDriver.id) {
            const { error } = await supabase.from('drivers').update(driverData).eq('id', currentDriver.id);
            if (error) alert('Erro ao atualizar: ' + error.message);
        } else {
            const { error } = await supabase.from('drivers').insert([driverData]);
            if (error) alert('Erro ao criar: ' + error.message);
        }

        setIsDialogOpen(false);
        setCurrentDriver({ active: true });
        fetchDrivers();
    };

    const openEdit = (driver: Driver) => {
        setCurrentDriver(driver);
        setIsDialogOpen(true);
    };

    const openNew = () => {
        setCurrentDriver({ active: true, unit: 'Matriz' });
        setIsDialogOpen(true);
    };

    // Filter
    const filteredDrivers = drivers.filter(d =>
        d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.cpf?.includes(searchTerm)
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border">
                <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Motoristas Cadastrados</h2>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={handleExport} title="Baixar lista">
                        <Download className="w-5 h-5 text-gray-500" />
                    </Button>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome ou CPF..."
                            className="pl-8 w-64"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={openNew}>
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Motorista
                    </Button>
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Foto</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>CPF</TableHead>
                            <TableHead>CNH</TableHead>
                            <TableHead>Unidade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredDrivers.map((driver) => (
                            <TableRow key={driver.id}>
                                <TableCell>
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
                                        {driver.photo_url ? (
                                            <img src={driver.photo_url} alt={driver.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-5 h-5 text-muted-foreground" />
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium">{driver.name}</TableCell>
                                <TableCell>{driver.cpf}</TableCell>
                                <TableCell>{driver.cnh || '-'}</TableCell>
                                <TableCell>{driver.unit || '-'}</TableCell>
                                <TableCell>
                                    <Badge variant={driver.active ? "default" : "destructive"}>
                                        {driver.active ? "Ativo" : "Inativo"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(driver)}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(driver.id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredDrivers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                    Nenhum motorista encontrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Dialog Form */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{currentDriver.id ? 'Editar Motorista' : 'Novo Motorista'}</DialogTitle>
                        <DialogDescription>
                            Preencha os dados do motorista abaixo.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center justify-center py-4 gap-4">
                        <div className="relative group cursor-pointer" onClick={() => document.getElementById('driver-photo-upload')?.click()}>
                            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground/25 hover:border-primary transition-colors">
                                {currentDriver.photo_url ? (
                                    <img src={currentDriver.photo_url} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <Camera className="w-8 h-8 text-muted-foreground" />
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <span className="text-white text-xs font-medium">Alterar</span>
                            </div>
                            <input
                                id="driver-photo-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePhotoUpload}
                                disabled={uploadingDetails}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Clique para adicionar uma foto</p>
                    </div>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Nome</Label>
                            <Input
                                id="name"
                                className="col-span-3"
                                value={currentDriver.name || ''}
                                onChange={e => setCurrentDriver({ ...currentDriver, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="cpf" className="text-right">CPF</Label>
                            <Input
                                id="cpf"
                                className="col-span-3"
                                value={currentDriver.cpf || ''}
                                onChange={e => setCurrentDriver({ ...currentDriver, cpf: e.target.value })}
                                maxLength={14}
                                placeholder="Apenas números"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="cnh" className="text-right">CNH</Label>
                            <Input
                                id="cnh"
                                className="col-span-3"
                                value={currentDriver.cnh || ''}
                                onChange={e => setCurrentDriver({ ...currentDriver, cnh: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="unit" className="text-right">Unidade</Label>
                            <Input
                                id="unit"
                                className="col-span-3"
                                value={currentDriver.unit || ''}
                                onChange={e => setCurrentDriver({ ...currentDriver, unit: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="active" className="text-right">Ativo</Label>
                            <div className="flex items-center col-span-3">
                                <input
                                    type="checkbox"
                                    id="active"
                                    checked={currentDriver.active}
                                    onChange={e => setCurrentDriver({ ...currentDriver, active: e.target.checked })}
                                    className="w-4 h-4"
                                />
                                <label htmlFor="active" className="ml-2 text-sm text-gray-600">Sim, motorista está ativo na frota.</label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSave} disabled={uploadingDetails}>
                            {uploadingDetails ? 'Enviando foto...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Isso excluirá permanentemente o motorista.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
