import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { API_URL } from '@/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon, Loader2, Play, Download, Database, Trash2 } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"

export default function CalendarPage() {
    const [loading, setLoading] = useState(false);
    const [points, setPoints] = useState<any[]>([]);
    const [calendarData, setCalendarData] = useState<any[]>([]);
    const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [year, setYear] = useState<string>(String(new Date().getFullYear()));
    const [filterDate, setFilterDate] = useState<string>(''); // Filtro de data para a tabela
    const [filterRoute, setFilterRoute] = useState<string>(''); // Filtro de rota


    useEffect(() => {
        fetchPoints();
        // Carregar dados automaticamente ao abrir a página
        loadInitialData();
    }, []);

    // Recarregar quando mês ou ano mudar
    useEffect(() => {
        if (calendarData.length === 0) {
            handleLoadFromDB();
        }
    }, [month, year]);

    const loadInitialData = async () => {
        // Tentar carregar dados salvos do mês atual
        await handleLoadFromDB();
    };

    const fetchPoints = async () => {
        const { data, error } = await supabase.from('collection_points').select('*');
        if (data) setPoints(data);
        if (error) console.error(error);
    };

    const handleGenerate = async () => {
        if (points.length === 0) {
            alert('Sem pontos para gerar calendário. Importe dados primeiro.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/generate-calendar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    points: points,
                    month: parseInt(month),
                    year: parseInt(year)
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Erro ao gerar calendário');
            }

            const result = await response.json();
            setCalendarData(result.calendar);
        } catch (error) {
            console.error('Error:', error);
            alert('Falha ao gerar calendário. Verifique se o backend está rodando na porta 5000.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (points.length === 0) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/download-calendar-excel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    points: points,
                    month: parseInt(month),
                    year: parseInt(year)
                }),
            });

            if (!response.ok) throw new Error('Falha no download');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Calendario_${month}_${year}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error) {
            console.error('Download error:', error);
            alert('Erro ao baixar Excel.');
        } finally {
            setLoading(false);
        }
    };

    const [currentPage, setCurrentPage] = useState(0);
    const ITEMS_PER_PAGE = 50;

    const handleDelete = async () => {
        if (!confirm(`Tem certeza que deseja excluir todo o calendário de ${months.find(m => m.value === month)?.label}/${year}?`)) return;

        setLoading(true);
        try {
            const start = new Date(parseInt(year), parseInt(month) - 1, 1);
            const end = new Date(parseInt(year), parseInt(month), 0);

            const { error } = await supabase
                .from('calendar_events')
                .delete()
                .gte('date', start.toISOString().split('T')[0])
                .lte('date', end.toISOString().split('T')[0]);

            if (error) throw error;

            setCalendarData([]);
            alert('Calendário excluído com sucesso.');
        } catch (error: any) {
            console.error('Delete error:', error);
            alert('Erro ao excluir: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveDB = async () => {
        if (calendarData.length === 0) return;
        setLoading(true);
        try {
            // Check for existing data first to prevent duplicates
            const start = new Date(parseInt(year), parseInt(month) - 1, 1);
            const end = new Date(parseInt(year), parseInt(month), 0);

            const { count, error: countError } = await supabase
                .from('calendar_events')
                .select('*', { count: 'exact', head: true })
                .gte('date', start.toISOString().split('T')[0])
                .lte('date', end.toISOString().split('T')[0]);

            if (countError) throw countError;

            if (count && count > 0) {
                if (!confirm(`Existem ${count} registros salvos para este período. Deseja sobrescrevê-los? (Os anteriores serão apagados)`)) {
                    setLoading(false);
                    return;
                }
                // Delete existing
                const { error: delError } = await supabase
                    .from('calendar_events')
                    .delete()
                    .gte('date', start.toISOString().split('T')[0])
                    .lte('date', end.toISOString().split('T')[0]);

                if (delError) throw delError;
            }

            // Prepare payload
            const payload = calendarData.map(item => ({
                date: item.Data, // Note: Format dd/mm/yyyy might need conversion to yyyy-mm-dd for DB depending on type
                client_name: item.Cliente,
                cost_vector_name: item.Vetor_Custo_Nome,
                route_name: item.Rota,
                unit_name: item.Unidade,
                address: item['Endereço'],
                city: item.Cidade,
                neighborhood: item.Bairro,
                frequency: item.Periodicidade,
                avg_weight: item.Media_Por_Coleta || 0,
                latitude: item.Latitude,
                longitude: item.Longitude,
                status: 'pending'
            }));

            // We need to convert dd/mm/yyyy to yyyy-mm-dd for postgres date type usually
            const formattedPayload = payload.map((p: any) => {
                const [d, m, y] = p.date.split('/');
                return {
                    ...p,
                    date: `${y}-${m}-${d}` // ISO format
                };
            });

            // Batch insert to avoid payload limits
            const BATCH_SIZE = 1000;
            for (let i = 0; i < formattedPayload.length; i += BATCH_SIZE) {
                const batch = formattedPayload.slice(i, i + BATCH_SIZE);
                const { error } = await supabase.from('calendar_events').insert(batch);
                if (error) throw error;
            }

            alert('Calendário salvo com sucesso no banco de dados!');
        } catch (error: any) {
            console.error('Save error:', error);
            alert('Erro ao salvar no banco. Verifique se a tabela "calendar_events" existe.\nErro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadFromDB = async () => {
        setLoading(true);
        try {
            const start = new Date(parseInt(year), parseInt(month) - 1, 1);
            const end = new Date(parseInt(year), parseInt(month), 0);

            let allData: any[] = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: batch, error } = await supabase
                    .from('calendar_events')
                    .select('*')
                    .gte('date', start.toISOString().split('T')[0])
                    .lte('date', end.toISOString().split('T')[0])
                    .range(from, from + step - 1);

                if (error) throw error;

                if (batch && batch.length > 0) {
                    allData = [...allData, ...batch];
                    from += step;
                    if (batch.length < step) hasMore = false; // Reached end
                } else {
                    hasMore = false;
                }
            }

            if (allData.length === 0) {
                console.log('Nenhum dado encontrado no banco para este período.');
                setCalendarData([]);
                return;
            }

            const formattedData = allData.map(item => {
                const [y, m, d] = item.date.split('-');
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

                return {
                    Data: `${d}/${m}/${y}`,
                    Dia_Semana: days[dateObj.getDay()],
                    Rota: item.route_name,
                    Unidade: item.unit_name,
                    Cliente: item.client_name,
                    Vetor_Custo_Nome: item.cost_vector_name,
                    'Endereço': item.address,
                    Cidade: item.city,
                    Bairro: item.neighborhood,
                    Periodicidade: item.frequency,
                    Media_Por_Coleta: item.avg_weight,
                    Latitude: item.latitude,
                    Longitude: item.longitude
                };
            });

            setCalendarData(formattedData);
            console.log(`${formattedData.length} registros carregados do banco de dados.`);

        } catch (error: any) {
            console.error('Load error:', error);
            alert('Erro ao carregar do banco: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar dados por data e/ou rota
    const filteredData = calendarData.filter(item => {
        // Filtro de data
        if (filterDate) {
            const [year, month, day] = filterDate.split('-');
            const formattedFilterDate = `${day}/${month}/${year}`;
            if (item.Data !== formattedFilterDate) return false;
        }

        // Filtro de rota
        if (filterRoute && item.Rota !== filterRoute) {
            return false;
        }

        return true;
    });

    // Extrair rotas únicas para o dropdown
    const uniqueRoutes = [...new Set(calendarData.map(item => item.Rota))].filter(Boolean).sort();

    const paginatedData = filteredData.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

    const months = [
        { value: '1', label: 'Janeiro' },
        { value: '2', label: 'Fevereiro' },
        { value: '3', label: 'Março' },
        { value: '4', label: 'Abril' },
        { value: '5', label: 'Maio' },
        { value: '6', label: 'Junho' },
        { value: '7', label: 'Julho' },
        { value: '8', label: 'Agosto' },
        { value: '9', label: 'Setembro' },
        { value: '10', label: 'Outubro' },
        { value: '11', label: 'Novembro' },
        { value: '12', label: 'Dezembro' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Calendário de Coletas</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Gere e gerencie o calendário de coletas mensal.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5" /> Configuração
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="space-y-2 w-full md:w-48">
                        <label className="text-sm font-medium">Mês</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2 w-full md:w-32">
                        <label className="text-sm font-medium">Ano</label>
                        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
                    </div>
                    <div className="space-y-2 flex-1">
                        <div className="text-xs text-muted-foreground mb-1">
                            Pontos Base: <span className="font-semibold text-foreground">{points.length}</span>
                        </div>
                        <div className="text-sm text-blue-600 font-medium whitespace-nowrap">
                            {calendarData.length > 0 ? `${calendarData.length} Coletas Geradas` : 'Nenhuma coleta gerada'}
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto flex-wrap">
                        <Button onClick={handleGenerate} disabled={loading || points.length === 0} className="flex-1 min-w-[100px]">
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            Gerar
                        </Button>
                        <Button onClick={handleLoadFromDB} disabled={loading} variant="secondary" className="flex-1 min-w-[140px] border border-input bg-background hover:bg-slate-100">
                            <Database className="w-4 h-4 mr-2" />
                            Carregar Salvos
                        </Button>
                        <Button onClick={handleSaveDB} disabled={loading || calendarData.length === 0} variant="secondary" className="flex-1 min-w-[100px]">
                            <Database className="w-4 h-4 mr-2" />
                            Salvar BD
                        </Button>
                        <Button onClick={handleDelete} disabled={loading} variant="destructive" className="flex-1 min-w-[100px]" title="Excluir calendário deste mês">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                        </Button>
                        <Button onClick={handleDownload} disabled={loading || points.length === 0} variant="outline" className="flex-1 min-w-[100px]">
                            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {calendarData.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                        <CardTitle className="text-base">
                            Resultado ({filteredData.length} {(filterDate || filterRoute) ? 'filtradas' : 'coletas'} {(filterDate || filterRoute) && `de ${calendarData.length} total`})
                        </CardTitle>
                        <div className="flex items-center gap-4">
                            {/* Filtro de Data */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Filtrar por data:</label>
                                <input
                                    type="date"
                                    value={filterDate}
                                    onChange={(e) => {
                                        setFilterDate(e.target.value);
                                        setCurrentPage(0); // Reset para primeira página ao filtrar
                                    }}
                                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                />
                                {filterDate && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setFilterDate('')}
                                        className="h-9"
                                    >
                                        Limpar
                                    </Button>
                                )}
                            </div>

                            {/* Filtro de Rota */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Rota:</label>
                                <select
                                    value={filterRoute}
                                    onChange={(e) => {
                                        setFilterRoute(e.target.value);
                                        setCurrentPage(0);
                                    }}
                                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[150px]"
                                >
                                    <option value="">Todas</option>
                                    {uniqueRoutes.map(route => (
                                        <option key={route} value={route}>{route}</option>
                                    ))}
                                </select>
                                {filterRoute && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setFilterRoute('')}
                                        className="h-9"
                                    >
                                        Limpar
                                    </Button>
                                )}
                            </div>
                            {/* Paginação */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Página {currentPage + 1} de {totalPages}</span>
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>{'<'}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1}>{'>'}</Button>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="border-t max-h-[600px] overflow-x-auto overflow-y-auto">
                            <div className="min-w-[800px]">{/* Força largura mínima para scroll horizontal */}
                                <Table>
                                    <TableHeader className="sticky top-0 bg-secondary/90 backdrop-blur z-10">
                                        <TableRow>
                                            <TableHead className="w-[90px]">Data</TableHead>
                                            <TableHead className="w-[50px]">Dia</TableHead>
                                            <TableHead className="w-[120px]">Rota</TableHead>
                                            <TableHead className="w-[80px]">Unid.</TableHead>
                                            <TableHead className="w-[150px]">Cliente</TableHead>
                                            <TableHead className="w-[150px]">Vetor de Custo</TableHead>
                                            <TableHead className="w-[200px]">Endereço</TableHead>
                                            <TableHead className="w-[100px]">Cidade</TableHead>
                                            <TableHead className="w-[100px]">Bairro</TableHead>
                                            <TableHead className="w-[120px]">Periodicidade</TableHead>
                                            <TableHead className="w-[60px]">Peso</TableHead>
                                            <TableHead className="w-[80px]">Lat</TableHead>
                                            <TableHead className="w-[80px]">Lon</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedData.map((item, idx) => (
                                            <TableRow key={idx} className="hover:bg-blue-50/50 even:bg-slate-50 transition-colors">
                                                <TableCell className="py-2 text-xs font-medium whitespace-nowrap border-r">{item.Data}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">{item.Dia_Semana}</TableCell>
                                                <TableCell className="py-2 border-r">
                                                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 whitespace-nowrap shadow-sm">
                                                        {item.Rota}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">{item.Unidade}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">
                                                    <div className="font-medium truncate">{item.Cliente}</div>
                                                </TableCell>
                                                <TableCell className="py-2 text-xs max-w-[250px] border-r">
                                                    <div className="text-blue-600 font-semibold truncate" title={item.Vetor_Custo_Nome}>
                                                        {item.Vetor_Custo_Nome || '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2 text-xs max-w-[300px] truncate border-r" title={item['Endereço']}>{item['Endereço']}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">{item.Cidade}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">{item.Bairro}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r">{item.Periodicidade}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r text-center">{item.Media_Por_Coleta || 0}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap border-r font-mono text-muted-foreground">{item.Latitude || ''}</TableCell>
                                                <TableCell className="py-2 text-xs whitespace-nowrap font-mono text-muted-foreground">{item.Longitude || ''}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>{/* Fecha min-w wrapper */}
                        </div>
                    </CardContent>
                </Card>
            )
            }
        </div >
    );
}
