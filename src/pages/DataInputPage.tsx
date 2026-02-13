import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Save, CheckCircle, Truck, MapPin, Building2, UploadCloud, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/services/supabase';

import FleetManagement from '@/pages/Management/FleetManagement';
import DepotManagement from '@/pages/Management/DepotManagement';
import PointManagement from '@/pages/Management/PointManagement';
import DriverManagement from '@/pages/Management/DriverManagement';

// Helper types
type UploadType = 'frota' | 'pontos' | 'unidades' | 'drivers';

interface UploadSectionProps {
    title: string;
    description: string;
    type: UploadType;
    icon: React.ReactNode;
    onUpload: (data: any[], type: UploadType) => void;
    onDownloadTemplate?: (type: UploadType) => void;
    isUploading: boolean;
    hasData: boolean;
}

function UploadSection({ title, description, type, icon, onUpload, onDownloadTemplate, isUploading, hasData }: UploadSectionProps) {
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = (event) => {
                const bstr = event.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                onUpload(data, type);
            };

            reader.readAsBinaryString(file);
        }
    };

    return (
        <Card className="border-border/50 hover:border-primary/50 transition-colors">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            {icon}
                        </div>
                        <div>
                            <CardTitle className="text-lg">{title}</CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                    </div>
                    {onDownloadTemplate && (
                        <Button
                            variant="outline"
                            size="sm"
                            title="Baixar planilha de exemplo"
                            onClick={() => onDownloadTemplate(type)}
                            className="text-xs h-8"
                        >
                            <Download className="w-3 h-3 mr-2" />
                            Modelo
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                        <label className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-center w-full h-32 px-4 transition bg-secondary/50 border-2 border-dashed border-muted-foreground/25 rounded-md appearance-none cursor-pointer hover:border-primary focus:outline-none">
                                <span className="flex flex-col items-center space-y-2">
                                    {isUploading ? (
                                        <span className="animate-pulse">Processando...</span>
                                    ) : hasData ? (
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                    ) : (
                                        <>
                                            <Upload className="w-6 h-6 text-muted-foreground" />
                                            <span className="font-medium text-muted-foreground text-sm">Clique p/ selecionar arquivo</span>
                                        </>
                                    )}
                                </span>
                                <input type="file" name="file_upload" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                            </div>
                        </label>
                    </div>
                    {hasData && <div className="text-xs text-green-600 font-medium flex items-center justify-center"><CheckCircle className="w-3 h-3 mr-1" /> Arquivo carregado</div>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function DataInputPage() {
    const [loading, setLoading] = useState(false);
    // ... existings states ...

    // ... existing useEffect ...

    // ... existing fetchStats ...

    // ... existing findValue & parseNumber ...

    const handleDownloadTemplate = (type: UploadType) => {
        let headers: string[] = [];
        let example: any = {};
        let fileName = '';

        if (type === 'frota') {
            headers = ['PLACA', 'MODELO', 'FABRICANTE', 'IMPLEMENTO', 'BOMBONAS', 'MÉDIA CAPACIDADE C/B', 'MÉDIA CAPACIDADE C/G', 'UNIDADE'];
            example = {
                'PLACA': 'ABC-1234',
                'MODELO': 'ACCELO 815',
                'FABRICANTE': 'MERCEDES',
                'IMPLEMENTO': 'BAU',
                'BOMBONAS': 40,
                'MÉDIA CAPACIDADE C/B': 2340,
                'MÉDIA CAPACIDADE C/G': 3500,
                'UNIDADE': 'Matriz'
            };
            fileName = 'Modelo_Importacao_Frota.xlsx';
        } else if (type === 'drivers') {
            headers = ['NOME', 'CPF', 'CNH', 'UNIDADE'];
            example = {
                'NOME': 'João da Silva',
                'CPF': '12345678900',
                'CNH': '12345678900',
                'UNIDADE': 'Matriz'
            };
            fileName = 'Modelo_Importacao_Motoristas.xlsx';
        } else if (type === 'pontos') {
            headers = ['Cliente', 'Vetor de custo nome', 'Endereco', 'Cidade', 'Bairro', 'Estado', 'Media Por Coleta', 'Periodicidade', 'Rota', 'Latitude', 'Longitude'];
            example = {
                'Cliente': 'Mercado Exemplo Ltda',
                'Vetor de custo nome': 'Mercado Exemplo - Matriz',
                'Endereco': 'Av. Paulista, 1000',
                'Cidade': 'São Paulo',
                'Bairro': 'Bela Vista',
                'Estado': 'SP',
                'Media Por Coleta': 50,
                'Periodicidade': 'SEMANAL',
                'Rota': 'ROTA 01',
                'Latitude': -23.561684,
                'Longitude': -46.655981
            };
            fileName = 'Modelo_Importacao_Pontos.xlsx';
        } else if (type === 'unidades') {
            headers = ['Unidade', 'Latitude', 'Longitude'];
            example = {
                'Unidade': 'Matriz - SP',
                'Latitude': -23.550520,
                'Longitude': -46.633308
            };
            fileName = 'Modelo_Importacao_Unidades.xlsx';
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([example], { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");

        // Adicionar aba de instruções para Pontos (Periodicidade)
        if (type === 'pontos') {
            const helpData = [
                ['Tipo', 'Exemplos Válidos (Copie e Cole)'],
                ['Semanal Padrão', 'SEMANAL (Considera Seg à Sex)'],
                ['Dias Específicos', 'SEMANAL - SEGUNDA, QUARTA, SEXTA'],
                ['Dias Específicos', 'SEMANAL - TERÇA E QUINTA'],
                ['Mensal Padrão', 'MENSAL (Considera 1º dia do mês)'],
                ['Mensal Específico', 'MENSAL - 1ª TERÇA'],
                ['Mensal Específico', 'MENSAL - 2ª QUARTA'],
                ['Mensal Última', 'MENSAL - ÚLTIMA SEXTA'],
                ['Quinzenal', 'QUINZENAL - 1ª E 3ª QUARTA'],
                ['Diário', 'DIÁRIO (Domingo a Domingo)']
            ];
            const wsHelp = XLSX.utils.aoa_to_sheet(helpData);

            // Ajustar largura das colunas
            wsHelp['!cols'] = [{ wch: 20 }, { wch: 40 }];

            XLSX.utils.book_append_sheet(wb, wsHelp, "Instruções Periodicidade");
        }

        XLSX.writeFile(wb, fileName);
    };

    // ... existing handleUpload & saveData ...

    const [dbStats, setDbStats] = useState({ frota: 0, pontos: 0, unidades: 0, drivers: 0 });
    const [data, setData] = useState<{
        frota: any[];
        pontos: any[];
        unidades: any[];
        drivers: any[];
    }>({
        frota: [],
        pontos: [],
        unidades: [],
        drivers: []
    });

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        const { count: frotaCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true });
        const { count: pontosCount } = await supabase.from('collection_points').select('*', { count: 'exact', head: true });
        const { count: unidadesCount } = await supabase.from('depots').select('*', { count: 'exact', head: true });
        const { count: driversCount } = await supabase.from('drivers').select('*', { count: 'exact', head: true });

        setDbStats({
            frota: frotaCount || 0,
            pontos: pontosCount || 0,
            unidades: unidadesCount || 0,
            drivers: driversCount || 0
        });
    };

    // Column mapping helpers
    const findValue = (row: any, keys: string[]) => {
        for (const k of keys) {
            if (row[k] !== undefined) return row[k];
            // Case insensitive check
            const keyLower = k.toLowerCase();
            const found = Object.keys(row).find(rk => rk.toLowerCase() === keyLower);
            if (found) return row[found];
        }
        return null;
    };

    // Helper function to cleaner parse numbers (handles "12,34" and "12.34")
    const parseNumber = (val: any): number | null => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const clean = val.replace(',', '.').trim();
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    };

    const handleUpload = (uploadedData: any[], type: UploadType) => {
        let processed: any[] = [];

        // Helper to extract lat/lon from row
        const extractCoords = (row: any) => {
            let lat = parseNumber(findValue(row, ['LATITUDE', 'Latitude', 'Lat']));
            let lon = parseNumber(findValue(row, ['LONGITUDE', 'Longitude', 'Lon', 'Long']));

            if (lat === null || lon === null) {
                // Try combined columns
                const combined = findValue(row, ['LATITUDE / LONGITUDE', 'Coordenadas', 'Coodernadas', 'Lat/Lon', 'Geolocalizacao']);
                if (combined && typeof combined === 'string') {
                    const parts = combined.split(/[\/,\s]+/).filter((p: string) => p.trim() !== '');
                    if (parts.length >= 2) {
                        lat = parseNumber(parts[0]);
                        lon = parseNumber(parts[1]);
                    }
                }
            }
            return { lat, lon };
        };

        if (type === 'frota') {
            const firstRow = uploadedData[0];
            console.log("Processando Frota. Colunas encontradas:", Object.keys(firstRow));
            console.log("Amostra da linha 1 raw:", JSON.stringify(firstRow, null, 2));

            processed = uploadedData.map(row => {
                // Determine capacity - Prioritize C/B (With Drums) for Optimization as requested
                let capacityCB = parseNumber(findValue(row, ['MÉDIA CAPACIDADE C/B', 'Media C/B', 'Capacidade C/B']));
                let capacityCG = parseNumber(findValue(row, ['MÉDIA CAPACIDADE C/G', 'Media C/G', 'Capacidade C/G']));
                let capacityGeneric = parseNumber(findValue(row, ['CAPACIDADE_KG', 'Capacidade', 'Peso', 'Carga']));

                // Logic: Use C/B if exists > 0, else C/G, else Generic
                let capacity = capacityCB || capacityCG || capacityGeneric;

                return {
                    plate: String(findValue(row, ['PLACA', 'Placa', 'Veiculo', 'Carro', 'ID Veiculo']) || '').trim(),
                    capacity_kg: capacity || 0,
                    unit_name: findValue(row, ['UNIDADE', 'Unidade', 'Base', 'Filial']),
                    manufacturer: findValue(row, ['FABRICANTE', 'Fabricante', 'Marca']),
                    model: findValue(row, ['MODELO', 'Modelo', 'Tipo Veiculo']),
                    implement: findValue(row, ['IMPLEMENTO', 'Implemento', 'Carroceria']),
                    drums_capacity: parseNumber(findValue(row, ['BOMBONAS', 'Bombonas', 'Qtd Bombonas'])) || 0,
                    avg_capacity_cb: parseNumber(findValue(row, ['MÉDIA CAPACIDADE C/B', 'Media C/B', 'Capacidade C/B'])) || 0,
                    avg_capacity_cg: parseNumber(findValue(row, ['MÉDIA CAPACIDADE C/G', 'Media C/G', 'Capacidade C/G'])) || 0
                };
            }).filter(v => v.plate && v.plate.length > 3);

            console.log("Frota processada (Amostra):", JSON.stringify(processed[0], null, 2));
        }
        else if (type === 'unidades') {
            processed = uploadedData.map(row => {
                const { lat, lon } = extractCoords(row);
                return {
                    name: String(findValue(row, ['UNIDADE', 'Unidade', 'Nome', 'Deposito', 'Base', 'Nome da Base', 'unidade']) || '').trim(),
                    latitude: lat,
                    longitude: lon
                };
            }).filter(d => d.name && d.latitude !== null);
        }
        else if (type === 'drivers') {
            processed = uploadedData.map(row => ({
                name: String(findValue(row, ['NOME', 'Nome', 'Motorista']) || '').trim(),
                cpf: String(findValue(row, ['CPF', 'cpf']) || '').replace(/\D/g, ''),
                cnh: String(findValue(row, ['CNH', 'cnh']) || '').replace(/\D/g, ''),
                unit: String(findValue(row, ['UNIDADE', 'Unidade', 'Base']) || '')
            })).filter(d => d.name && d.cpf.length > 5);
        }
        else if (type === 'pontos') {
            const firstRow = uploadedData[0];
            console.log("Processando Pontos. Colunas encontradas:", Object.keys(firstRow));
            console.log("Amostra da linha 1 raw:", JSON.stringify(firstRow, null, 2));

            processed = uploadedData.map(row => {
                const { lat, lon } = extractCoords(row);
                const p = {
                    client_name: findValue(row, ['Vetor de custo apelido', 'Cliente', 'CLIENTE', 'Nome', 'Razao Social', 'Fantasia', 'Destinatario', 'Nome do Cliente']),
                    cost_vector_name: findValue(row, ['Vetor de custo nome', 'Vetor de Custo Nome', 'VETOR DE CUSTO NOME', 'Nome Completo', 'Razão Social Completa']),
                    address: findValue(row, ['Endereco', 'ENDERECO', 'Logradouro', 'Rua', 'Endereço', 'Endereco Completo']),
                    latitude: lat,
                    longitude: lon,
                    avg_weight: parseNumber(findValue(row, ['Media Por Coleta', 'Media_Por_Coleta', 'PESO', 'Peso', 'KG', 'Volume', 'Peso Medio', 'Peso Médio', 'Media', 'Média', 'Volume Médio'])) || 0,
                    unit_name: findValue(row, ['Regiao', 'Unidade', 'Setor', 'Area']) || 'Geral',
                    // New Fields for Calendar Gen
                    route: findValue(row, ['Rotas Padrão', 'Rota', 'ROTA', 'Route', 'Rota Padrao', 'Rota Padrão', 'Rota Fixa']) || 'N/I',
                    frequency: findValue(row, ['Periodicidade', 'PERIODICIDADE', 'Frequencia', 'Frequência', 'Agenda']) || 'MENSAL',
                    city: findValue(row, ['Cidade', 'CIDADE', 'City', 'Municipio', 'Município']) || '',
                    neighborhood: findValue(row, ['Bairro', 'BAIRRO', 'Neighborhood', 'Localidade']) || '',
                    uf: findValue(row, ['Estado', 'ESTADO', 'UF', 'U.F.', 'State']) || '' // Added UF
                };
                return p;
            }).filter(p => p.client_name);
            console.log("Pontos processados (Amostra):", JSON.stringify(processed[0], null, 2));
        }

        if (processed.length === 0 && uploadedData.length > 0) {
            alert(`Atenção: Nenhum dado válido encontrado para ${type}. Verifique os nomes das colunas no Excel.`);
            console.warn("Colunas encontradas:", Object.keys(uploadedData[0]));
        }

        setData(prev => ({
            ...prev,
            [type]: processed
        }));
        console.log(`Dados processados para ${type}: `, processed.length, 'registros válidos');
    };

    const saveDataToSupabase = async () => {
        setLoading(true);
        try {
            // 1. Save Frota (Already Processed)
            if (data.frota.length > 0) {
                // Deduplicate by plate
                const vehicles = Array.from(new Map(data.frota.map((item: any) => [item.plate, item])).values());

                // Sanitize payload to only include columns that exist in DB
                const payload = vehicles.map((v: any) => ({
                    plate: v.plate,
                    capacity_kg: v.capacity_kg,
                    unit_name: v.unit_name,
                    manufacturer: v.manufacturer,
                    model: v.model,
                    implement: v.implement,
                    drums_capacity: v.drums_capacity,
                    avg_capacity_cb: v.avg_capacity_cb,
                    avg_capacity_cg: v.avg_capacity_cg
                }));

                const { error } = await supabase.from('vehicles').upsert(payload, { onConflict: 'plate' });
                if (error) throw new Error('Erro ao salvar frota: ' + error.message);
            }

            // 2. Save Unidades (Depots)
            if (data.unidades.length > 0) {
                // Deduplicate by name
                const depots = Array.from(new Map(data.unidades.map((item: any) => [item.name, item])).values());
                const { error } = await supabase.from('depots').upsert(depots, { onConflict: 'name' });
                if (error) throw new Error('Erro ao salvar unidades: ' + error.message);
            }

            // 3. Save Pontos (Collection Points)
            if (data.pontos.length > 0) {
                // A. Fetch existing points to map IDs (Workaround for missing SQL Unique Constraint)
                const { data: existingPoints, error: fetchError } = await supabase
                    .from('collection_points')
                    .select('id, client_name');

                if (fetchError) throw new Error('Erro ao verificar duplicatas: ' + fetchError.message);

                const existingMap = new Map((existingPoints || []).map(p => [p.client_name?.toLowerCase().trim(), p.id]));

                // B. Prepare data with IDs where they exist
                const pointsToSave = data.pontos.map((item: any) => {
                    const payload: any = { ...item };
                    // Remove fields that might not exist in DB yet to avoid 400 error
                    // delete payload.uf; // ENABLE THIS LINE IF 'uf' COLUMN EXISTS IN DB

                    // Normalize client name for checking
                    const key = item.client_name?.toLowerCase().trim();
                    const existingId = existingMap.get(key);

                    if (existingId) {
                        return { ...payload, id: existingId };
                    }
                    return payload;
                });

                // C. Deduplicate input (in case 2 rows in Excel have same client)
                const uniquePointsToSave = Array.from(new Map(pointsToSave.map((item: any) => [item.client_name, item])).values());

                // D. Upsert in chunks
                const chunkSize = 100;
                for (let i = 0; i < uniquePointsToSave.length; i += chunkSize) {
                    const chunk = uniquePointsToSave.slice(i, i + chunkSize);
                    // No onConflict param needed efficiently if we provide IDs for updates
                    const { error } = await supabase.from('collection_points').upsert(chunk);

                    if (error) {
                        console.error('Save error:', error);
                        throw new Error(`Erro ao salvar lote de pontos: ${error.message}`);
                    }
                }
            }

            if (data.drivers.length > 0) {
                const { error } = await supabase.from('drivers').upsert(data.drivers, { onConflict: 'cpf' });
                if (error) {
                    console.error('Save error:', error);
                    throw new Error(`Erro ao salvar motoristas: ${error.message}`);
                }
            }

            await fetchStats(); // Refresh stats
            alert('Dados salvos/atualizados com sucesso!');
            // clear data
            setData({ frota: [], pontos: [], unidades: [], drivers: [] });

        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const hasAnyData = data.frota.length > 0 || data.pontos.length > 0 || data.unidades.length > 0 || data.drivers.length > 0;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Gerenciamento de Dados</h2>
                    <p className="text-muted-foreground">Importe, visualize e edite seus dados operacionais.</p>
                </div>
            </div>

            <Tabs defaultValue="upload" className="space-y-4">
                <div className="overflow-x-auto">
                    <TabsList className="w-full sm:w-auto inline-flex">
                        <TabsTrigger value="upload" className="flex-1 sm:flex-none"><UploadCloud className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Importação (Excel)</span><span className="sm:hidden">Upload</span></TabsTrigger>
                        <TabsTrigger value="frota" className="flex-1 sm:flex-none"><Truck className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Gerenciar Frota</span><span className="sm:hidden">Frota</span></TabsTrigger>
                        <TabsTrigger value="unidades" className="flex-1 sm:flex-none"><Building2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Unidades</span><span className="sm:hidden">Unid.</span></TabsTrigger>
                        <TabsTrigger value="drivers" className="flex-1 sm:flex-none"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg> <span className="hidden sm:inline">Motoristas</span><span className="sm:hidden">Mot.</span></TabsTrigger>
                        <TabsTrigger value="pontos" className="flex-1 sm:flex-none"><MapPin className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Pontos de Coleta</span><span className="sm:hidden">Pontos</span></TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="upload" className="space-y-4">
                    {/* Database Stats Section */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Stats Cards ... */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Frota no Sistema</CardTitle>
                                <Truck className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dbStats.frota}</div>
                                <p className="text-xs text-muted-foreground">veículos cadastrados</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pontos de Coleta</CardTitle>
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dbStats.pontos}</div>
                                <p className="text-xs text-muted-foreground">clientes na base</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Unidades Operacionais</CardTitle>
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dbStats.unidades}</div>
                                <p className="text-xs text-muted-foreground">depósitos ativos</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Motoristas</CardTitle>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dbStats.drivers}</div>
                                <p className="text-xs text-muted-foreground">cadastrados</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex justify-end mb-4">
                        <Button disabled={!hasAnyData || loading} onClick={saveDataToSupabase}>
                            {loading ? <span className="animate-spin mr-2">⏳</span> : <Save className="w-4 h-4 mr-2" />}
                            Salvar Upload no Sistema
                        </Button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-4">
                        <UploadSection
                            title="Adicionar Frota"
                            description="Importe arquivo de cadastro de veículos (Placa, Capacidade)."
                            type="frota"
                            icon={<Truck className="w-5 h-5" />}
                            onUpload={handleUpload}
                            onDownloadTemplate={handleDownloadTemplate}
                            isUploading={false}
                            hasData={data.frota.length > 0}
                        />
                        <UploadSection
                            title="Adicionar Pontos"
                            description="Base de clientes e endereços para roteirização."
                            type="pontos"
                            icon={<MapPin className="w-5 h-5" />}
                            onUpload={handleUpload}
                            onDownloadTemplate={handleDownloadTemplate}
                            isUploading={false}
                            hasData={data.pontos.length > 0}
                        />
                        <UploadSection
                            title="Adicionar Unidades"
                            description="Locais de partida/chegada dos veículos."
                            type="unidades"
                            icon={<Building2 className="w-5 h-5" />}
                            onUpload={handleUpload}
                            onDownloadTemplate={handleDownloadTemplate}
                            isUploading={false}
                            hasData={data.unidades.length > 0}
                        />
                        <UploadSection
                            title="Importar Motoristas"
                            description="Cadastro de motoristas com CPF e CNH."
                            type="drivers"
                            icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
                            onUpload={handleUpload}
                            onDownloadTemplate={handleDownloadTemplate}
                            isUploading={false}
                            hasData={data.drivers.length > 0}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="frota">
                    <FleetManagement />
                </TabsContent>

                <TabsContent value="unidades">
                    <DepotManagement />
                </TabsContent>

                <TabsContent value="pontos">
                    <PointManagement />
                </TabsContent>

                <TabsContent value="drivers">
                    <DriverManagement />
                </TabsContent>
            </Tabs>
        </div>
    );
}
