import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { API_URL } from '@/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route as RouteIcon, Loader2, Calendar, Download, Save, XCircle, Eraser, Activity } from 'lucide-react';
import RouteMap from '@/components/RouteMap';

export default function OptimizationPage() {
    const [loading, setLoading] = useState(false);
    const [calendarData, setCalendarData] = useState<any[]>([]);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('Todas');
    const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [year, setYear] = useState<string>(String(new Date().getFullYear()));

    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [jobStatus, setJobStatus] = useState<string>('');
    const [progress, setProgress] = useState<number>(0); // Progresso contínuo 0-100
    const [runId, setRunId] = useState<string | string[]>(''); // ID ou Lista de IDs para buscar rotas
    const [reportUrl, setReportUrl] = useState<string>('');
    const [availableOptimizations, setAvailableOptimizations] = useState<any[]>([]);
    const [filterDate, setFilterDate] = useState<string>(''); // Data para filtrar otimizações - vazio = todas
    const [forceFulfill, setForceFulfill] = useState<boolean>(false);
    const [currentJobId, setCurrentJobId] = useState<string>(''); // ID do job em execução
    const [advancedSettings, setAdvancedSettings] = useState({
        maxHours: 10,
        startTime: "07:00",
        lunchStart: "12:00",
        lunchDuration: 60,
        serviceTime: 15,
        avgSpeed: 60,
        maxPointsPerVehicle: 60,
        minPointsPerVehicle: 10,
        maxDistRedistribution: 3.0,
        maxDistSobras: 8.0,
        clusteringBias: 1.0
    });

    const clearAssignments = async () => {
        if (!confirm('⚠️ ATENÇÃO: Tem certeza que deseja apagar a MEMÓRIA DE ROTAS? \n\nIsso fará com que o sistema esqueça quais veículos atendem cada cliente e recalcule as melhores bolhas geográficas do zero na próxima otimização.')) {
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/assignments/clear?unit_name=${selectedUnit}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('✅ Memória de rotas limpa com sucesso!');
            } else {
                alert('❌ Erro ao limpar memória de rotas.');
            }
        } catch (error) {
            console.error('Error clearing assignments:', error);
            alert('❌ Erro de conexão ao tentar limpar a memória.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOptimizations();
    }, []);

    useEffect(() => {
        // Carregar settings do DB
        fetch(`${API_URL}/api/settings`)
            .then(res => res.json())
            .then(data => {
                if (data && Object.keys(data).length > 0) {
                    setAdvancedSettings(prev => ({
                        ...prev,
                        maxHours: Number(data.max_hours || data.maxHours) || 10,
                        startTime: data.start_time || data.startTime || "07:00",
                        lunchStart: data.lunch_start || data.lunchStart || "12:00",
                        lunchDuration: Number(data.lunch_duration || data.lunchDuration) || 60,
                        serviceTime: Number(data.service_time || data.serviceTime) || 15,
                        avgSpeed: Number(data.avg_speed || data.avgSpeed) || 60,
                        maxPointsPerVehicle: Number(data.max_points_per_vehicle || data.maxPointsPerVehicle) || 35,
                        minPointsPerVehicle: Number(data.min_points_per_vehicle || data.minPointsPerVehicle) || 10,
                        maxDistRedistribution: Number(data.max_dist_redistribution || data.maxDistRedistribution) || 3.0,
                        maxDistSobras: Number(data.max_dist_sobras || data.maxDistSobras) || 8.0,
                        clusteringBias: Number(data.clustering_bias || data.clusteringBias) || 1.0
                    }));
                    if (data.force_fulfill !== undefined) {
                        setForceFulfill(data.force_fulfill);
                    } else if (data.forceFulfill !== undefined) {
                        setForceFulfill(data.forceFulfill);
                    }
                }
            })
            .catch(err => console.error("Erro ao carregar settings:", err));
    }, []);

    // Auto-incrementar progresso durante otimização
    useEffect(() => {
        if (loading && progress < 95) {
            const interval = setInterval(() => {
                setProgress(prev => {
                    // Incremento mais rápido no início, mais lento perto do fim
                    const increment = prev < 30 ? 2 : prev < 60 ? 1 : 0.5;
                    return Math.min(prev + increment, 95);
                });
            }, 500); // Atualiza a cada 500ms
            return () => clearInterval(interval);
        } else if (!loading && jobStatus.includes('concluída')) {
            setProgress(100);
        } else if (!loading) {
            setProgress(0);
        }
    }, [loading, progress, jobStatus]);

    useEffect(() => {
        if (runId && typeof runId === 'string' && runId !== '') {
            setReportUrl(`${API_URL}/api/reports/generate?run_id=${runId}`);
        } else if (Array.isArray(runId) && runId.length > 0) {
            // Unir todos os IDs da lista para gerar um relatório consolidado com todas as datas/rotas
            setReportUrl(`${API_URL}/api/reports/generate?run_id=${runId.join(',')}`);
        }
    }, [runId]);

    const fetchOptimizations = async () => {
        try {
            console.log('Fetching optimizations from API...');
            const response = await fetch(`${API_URL}/api/optimizations`);
            if (response.ok) {
                const data = await response.json();
                console.log('Optimizations received:', data);
                if (data.optimizations && data.optimizations.length > 0) {
                    setAvailableOptimizations(data.optimizations);

                    // Auto-select the most relevant optimization
                    if (!runId || runId === '') {
                        const target = filterDate || selectedDate;
                        const matching = data.optimizations.find((opt: any) => {
                            const optDate = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                            return optDate === target;
                        });

                        if (matching) {
                            setRunId(matching.id);
                        } else {
                            setRunId(data.optimizations[0].id);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch optimizations:', error);
        }
    };

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

    const loadCalendarData = async () => {
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
                    if (batch.length < step) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            if (allData.length === 0) {
                alert('Nenhum dado encontrado no banco para este período.');
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

            // Extract unique units
            const units = [...new Set(formattedData.map(item => item.Unidade).filter(Boolean))].sort();
            setAvailableUnits(['Todas', ...units]);

            // Default selection: empty (all dates) or first available? Maybe keep empty to force choice or optimize all.
            // User usually wants specific date. Let's start with empty which means "All" or force them to pick.
            // Based on UI, "Data Específica" implies picking one.
            // Mover a lógica de filtro para manter a data atual ativa

            // Do not force filter to today as it might hide the optimizations from the selected period
            // setFilterDate(today); 
            console.log('Calendar data loaded for current month');

            alert(`${formattedData.length} eventos de coleta carregados com sucesso!`);

        } catch (error: any) {
            console.error('Load error:', error);
            alert('Erro ao carregar do banco: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const optimizeFromDb = async () => {
        setLoading(true);
        setProgress(0); // Reset progress for new run
        setJobStatus('Iniciando otimização direta do banco...');
        try {
            const response = await fetch(`${API_URL}/api/optimize-from-db`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidade: selectedUnit,
                    data_especifica: selectedDate, // Send YYYY-MM-DD directly
                    month: month,
                    year: year,
                    settings: {
                        forceFulfill: forceFulfill,
                        ...advancedSettings
                    }
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Erro ao iniciar otimização do banco');
            }

            const result = await response.json();
            setJobStatus('Otimização iniciada. Processando dados...');

            // Monitorar status do job
            monitorJob(result.job_id);

        } catch (error: any) {
            console.error('Error:', error);
            alert('Falha ao otimizar rotas: ' + error.message);
            setJobStatus('');
            setLoading(false);
        }
    };

    const cancelOptimization = async () => {
        if (!currentJobId) return;

        const confirmCancel = window.confirm(
            '⚠️ Tem certeza que deseja cancelar a otimização em andamento?\n\nTodo o progresso será perdido.'
        );

        if (!confirmCancel) return;

        try {
            setJobStatus('Cancelando otimização...');

            // Aqui você pode adicionar uma chamada à API para cancelar o job se o backend suportar
            // const response = await fetch(`${API_URL}/api/cancel/${currentJobId}`, { method: 'POST' });

            setLoading(false);
            setProgress(0);
            setJobStatus('Otimização cancelada pelo usuário.');
            setCurrentJobId('');

        } catch (error) {
            console.error('Erro ao cancelar:', error);
            alert('Erro ao cancelar otimização');
        }
    };

    const monitorJob = async (id: string) => {
        setCurrentJobId(id); // Armazenar ID do job atual
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`${API_URL}/api/status/${id}`);
                const status = await response.json();

                setJobStatus(status.message || status.status);

                if (status.status === 'completed') {
                    clearInterval(interval);
                    setLoading(false); // Stop loading spinner
                    setProgress(100); // Complete progress bar
                    setJobStatus('Otimização concluída!');

                    // Buscar resultados
                    const resultsResponse = await fetch(`${API_URL}/api/results/${id}`);
                    const results = await resultsResponse.json();

                    if (results.run_id) {
                        setRunId(results.run_id);
                    }

                    // Set filter to today's date to show only current optimization
                    const today = new Date().toISOString().split('T')[0];
                    setFilterDate(today);

                    // Refresh optimizations list
                    fetchOptimizations();
                } else if (status.status === 'error') {
                    clearInterval(interval);
                    setLoading(false);
                    setJobStatus(`Erro na otimização: ${status.message}`);
                    alert(`Erro na otimização: ${status.message}`);
                } else {
                    // Update status while running
                    setJobStatus(status.message || status.status);
                }
            } catch (error) {
                console.error('Error monitoring job:', error);
            }
        }, 2000); // Check every 2 seconds
    };

    // Extrair lista de datas únicas das otimizações
    // Extrair lista de datas únicas das otimizações
    // Extrair lista de datas únicas das otimizações, filtradas pelo mês/ano selecionados
    const uniqueDates = Array.from(new Set(availableOptimizations
        .filter(opt => {
            const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
            if (!target) return false;
            if (target === 'tudo' || target === 'Múltiplas Datas') return true; // Lotes sempre visíveis? Ou filtrar por mês?

            const [y, m] = target.split('-');
            return y === year && parseInt(m) === parseInt(month);
        })
        .map(opt => {
            const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
            return target;
        }))).filter(d => d).sort().reverse();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Otimização de Rotas</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Carregue dados do calendário e otimize as rotas de coleta.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAssignments}
                        disabled={loading}
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 w-full sm:w-auto"
                        title="Reseta a memória de qual veículo atende cada cliente"
                    >
                        <Eraser className="w-4 h-4 mr-2" />
                        Limpar Memória
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" /> Carregar Dados do Calendário
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
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
                            <input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <Button onClick={loadCalendarData} disabled={loading} className="flex-1">
                                <div className="flex items-center">
                                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                                    Carregar Dados
                                </div>
                            </Button>
                        </div>
                    </div>

                    {calendarData.length > 0 && (
                        <div className="border-t pt-4 space-y-4">
                            <div className="p-4 bg-green-50 rounded-lg">
                                <p className="font-medium text-green-900">Dados Carregados</p>
                                <p className="text-sm text-green-700">{calendarData.length} eventos de coleta</p>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-medium text-sm">Filtros para Otimização</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Unidade</label>
                                        <select
                                            value={selectedUnit}
                                            onChange={(e) => setSelectedUnit(e.target.value)}
                                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {availableUnits.map(unit => (
                                                <option key={unit} value={unit}>{unit}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-sm font-medium">Data com Rotas</label>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    id="fullMonth"
                                                    checked={selectedDate === 'tudo'}
                                                    onChange={(e) => setSelectedDate(e.target.checked ? 'tudo' : '')}
                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                                <label htmlFor="fullMonth" className="text-xs font-bold text-blue-700 cursor-pointer uppercase">Mês Inteiro</label>
                                            </div>
                                        </div>

                                        <input
                                            type="date"
                                            value={selectedDate === 'tudo' ? '' : selectedDate}
                                            disabled={selectedDate === 'tudo'}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <p className="text-[10px] text-muted-foreground italic leading-tight">
                                            {selectedDate === 'tudo' ?
                                                '💡 Modo Lote: O sistema processará todos os dias do mês de uma vez.' :
                                                '💡 Escolha um dia específico ou marque "Mês Inteiro" para otimização em massa.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="border rounded-md p-4 bg-slate-50">
                                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                        ⚙️ Configurações Avançadas
                                    </h4>
                                    <div className="flex items-start space-x-2">
                                        <input
                                            type="checkbox"
                                            id="forceFulfill"
                                            checked={forceFulfill}
                                            onChange={(e) => setForceFulfill(e.target.checked)}
                                            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <div className="grid gap-1.5 leading-none">
                                            <label
                                                htmlFor="forceFulfill"
                                                className="text-sm font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                                Forçar atendimento de todos os pontos
                                            </label>
                                            <p className="text-xs text-muted-foreground">
                                                Ignora restrições de jornada/capacidade para garantir que nenhum ponto fique sem rota.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-4 pt-4 border-t">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Início da Jornada</label>
                                            <input
                                                type="time"
                                                value={advancedSettings.startTime}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, startTime: e.target.value })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Jornada Máxima (h)</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.maxHours}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, maxHours: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Tempo de Serviço (min)</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.serviceTime}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, serviceTime: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Início Almoço</label>
                                            <input
                                                type="time"
                                                value={advancedSettings.lunchStart}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, lunchStart: e.target.value })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Duração Almoço (min)</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.lunchDuration}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, lunchDuration: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Velocidade Média (km/h)</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.avgSpeed}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, avgSpeed: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Máx. Pontos/Veículo</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.maxPointsPerVehicle}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, maxPointsPerVehicle: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Mín. Pontos/Veículo</label>
                                            <input
                                                type="number"
                                                value={advancedSettings.minPointsPerVehicle}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, minPointsPerVehicle: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Viés Lon. (Cluster)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={advancedSettings.clusteringBias}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, clusteringBias: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                                title="1.0 = Normal. Maior que 1 força rotas horizontais."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Raio Red (km)</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={advancedSettings.maxDistRedistribution}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, maxDistRedistribution: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                                title="Distância máxima para tentar realocar sobras em rotas vizinhas."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Max Sobras km</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={advancedSettings.maxDistSobras}
                                                onChange={e => setAdvancedSettings({ ...advancedSettings, maxDistSobras: Number(e.target.value) })}
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                                                title="Se o ponto sobrar e estiver mais longe que isso do depósito, é ignorado."
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <Button onClick={async () => {
                                            try {
                                                const res = await fetch(`${API_URL}/api/settings`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ...advancedSettings, forceFulfill })
                                                });
                                                if (res.ok) {
                                                    const result = await res.json();
                                                    alert("✅ Configurações salvas como padrão!");
                                                    // Sincronizar estado imediatamente
                                                    if (result.data) {
                                                        const d = result.data;
                                                        setAdvancedSettings({
                                                            maxHours: Number(d.maxHours) || advancedSettings.maxHours,
                                                            startTime: d.startTime || advancedSettings.startTime,
                                                            lunchStart: d.lunchStart || advancedSettings.lunchStart,
                                                            lunchDuration: Number(d.lunchDuration) || advancedSettings.lunchDuration,
                                                            serviceTime: Number(d.serviceTime) || advancedSettings.serviceTime,
                                                            avgSpeed: Number(d.avgSpeed) || advancedSettings.avgSpeed,
                                                            maxPointsPerVehicle: Number(d.maxPointsPerVehicle) || advancedSettings.maxPointsPerVehicle,
                                                            minPointsPerVehicle: Number(d.minPointsPerVehicle) || advancedSettings.minPointsPerVehicle,
                                                            maxDistRedistribution: Number(d.maxDistRedistribution) || advancedSettings.maxDistRedistribution,
                                                            maxDistSobras: Number(d.maxDistSobras) || advancedSettings.maxDistSobras,
                                                            clusteringBias: Number(d.clusteringBias) || advancedSettings.clusteringBias
                                                        });
                                                    }
                                                } else {
                                                    alert("❌ Erro ao salvar configurações.");
                                                }
                                            } catch (e) {
                                                console.error(e);
                                                alert("Erro de conexão com o servidor.");
                                            }
                                        }} variant="outline" size="sm" className="text-xs h-8">
                                            <Save className="w-3 h-3 mr-2" />
                                            Salvar Padrão
                                        </Button>
                                    </div>
                                </div>

                                <Button onClick={optimizeFromDb} disabled={loading} className="w-full">
                                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RouteIcon className="w-4 h-4 mr-2" />}
                                    Otimizar Rotas
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {
                jobStatus && (
                    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <RouteIcon className="w-5 h-5" /> Status da Otimização
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Progress Bar */}
                                {(loading || jobStatus.includes('concluída') || progress === 100) && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-semibold text-muted-foreground">Progresso da Otimização</span>
                                            <span className="text-lg font-bold text-primary">
                                                {Math.round(progress)}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-secondary/50 rounded-full h-4 overflow-hidden shadow-inner border border-border/50">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ease-in-out flex items-center justify-end pr-2 ${progress >= 100
                                                    ? 'bg-gradient-to-r from-green-500 via-green-600 to-green-700'
                                                    : 'bg-gradient-to-r from-blue-500 via-primary to-blue-700 animate-pulse'
                                                    }`}
                                                style={{ width: `${progress}%` }}
                                            >
                                                {progress < 100 && (
                                                    <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Status Message */}
                                <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border/50">
                                    <span>{loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}</span>
                                    {jobStatus.includes('concluída') && !loading && (
                                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                    {jobStatus.includes('erro') && !loading && (
                                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </div>
                                    )}
                                    <p className={`text-sm font-medium ${jobStatus.includes('concluída') ? 'text-green-700' :
                                        jobStatus.includes('erro') ? 'text-red-700' :
                                            'text-foreground'
                                        }`}>
                                        {jobStatus}
                                    </p>
                                </div>

                                {/* Cancel Button - Only show during optimization */}
                                {loading && currentJobId && (
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            onClick={cancelOptimization}
                                            variant="destructive"
                                            className="gap-2"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            Cancelar Otimização
                                        </Button>
                                    </div>
                                )}

                                {reportUrl && (
                                    <div className="flex gap-2 pt-2">
                                        <Button onClick={() => window.open(reportUrl, '_blank')} variant="default" className="gap-2">
                                            <Download className="w-4 h-4" />
                                            Baixar Relatório
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-6">
                        <CardTitle className="text-lg">Visualizar Rotas Otimizadas</CardTitle>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Escolha o Dia
                                </span>
                                <select
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={filterDate}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        setFilterDate(newDate);
                                        console.log('Filter date changed to:', newDate || 'Todas as Datas');

                                        // Filter optimizations for this date/period
                                        const optsOnDate = availableOptimizations.filter(opt => {
                                            if (!newDate) return true;

                                            const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;

                                            // Especial para lotes
                                            if (newDate === 'tudo' || newDate === 'Múltiplas Datas') {
                                                return target === 'tudo' || target === 'Múltiplas Datas';
                                            }

                                            // Comparação direta (YYYY-MM-DD)
                                            if (target === newDate) return true;

                                            // Fallback por data de criação
                                            const createdDate = opt.created_at.split('T')[0];
                                            let optDateParams = opt.date;
                                            if (opt.date && opt.date.includes('/')) {
                                                const [d, m, y] = opt.date.split('/');
                                                optDateParams = `${y}-${m}-${d}`;
                                            }
                                            return createdDate === newDate || optDateParams === newDate;
                                        });

                                        if (optsOnDate.length > 0) {
                                            const allIds = optsOnDate.map(o => o.id);
                                            setRunId(allIds);
                                        } else {
                                            setRunId('');
                                        }
                                    }}
                                >
                                    <option value="">Todas as Datas</option>

                                    {/* Agrupar por Unidade para melhor hierarquia */}
                                    {(() => {
                                        const groups: Record<string, string[]> = {};

                                        // Filtrar otimizações pelo mês/ano
                                        const filteredOpts = availableOptimizations.filter(opt => {
                                            const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                            if (!target) return false;
                                            const [y, m] = target.split('-');
                                            return y === year && parseInt(m) === parseInt(month);
                                        });

                                        filteredOpts.forEach(opt => {
                                            const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                            const unit = opt.settings?.unidade || 'Sem Unidade';
                                            const key = unit;
                                            if (!groups[key]) groups[key] = [];
                                            if (!groups[key].includes(target)) groups[key].push(target);
                                        });

                                        return Object.entries(groups).sort().map(([unit, dates]) => (
                                            <optgroup key={unit} label={`Unidade: ${unit}`}>
                                                {dates.sort().reverse().map(date => (
                                                    <option key={`${date}|${unit}`} value={date}>
                                                        {date === 'tudo' ? '📅 MÊS COMPLETO' : date.split('-').reverse().join('/')}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ));
                                    })()}
                                </select>
                            </div>

                            {availableOptimizations.length > 0 && (
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                                        <Activity className="w-3 h-3" /> Execução (Horário)
                                    </span>
                                    <select
                                        className="h-10 w-full sm:min-w-[240px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={Array.isArray(runId) ? 'all' : runId}
                                        onChange={(e) => {
                                            if (e.target.value === 'all') {
                                                const filtered = availableOptimizations.filter(opt => {
                                                    if (!filterDate) return true;
                                                    const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                                    if (target === filterDate) return true;
                                                    const createdDate = opt.created_at.split('T')[0];
                                                    let optDateParams = opt.date;
                                                    if (opt.date && opt.date.includes('/')) {
                                                        const [d, m, y] = opt.date.split('/');
                                                        optDateParams = `${y}-${m}-${d}`;
                                                    }
                                                    return createdDate === filterDate || optDateParams === filterDate;
                                                });
                                                setRunId(filtered.map(f => f.id));
                                            } else {
                                                setRunId(e.target.value);
                                            }
                                        }}
                                        disabled={availableOptimizations.length === 0}
                                    >
                                        <option value="all">🌐 TODOS OS HORÁRIOS / EXECUÇÕES</option>
                                        {availableOptimizations
                                            .filter(opt => {
                                                if (!filterDate) return true;
                                                const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                                if (target === filterDate) return true;

                                                const createdDate = opt.created_at.split('T')[0];
                                                let optDateParams = opt.date;
                                                if (opt.date && opt.date.includes('/')) {
                                                    const [d, m, y] = opt.date.split('/');
                                                    optDateParams = `${y}-${m}-${d}`;
                                                }
                                                return createdDate === filterDate || optDateParams === filterDate;
                                            })
                                            .map(opt => {
                                                const createdAtRaw = opt.created_at || '';
                                                const timeStr = createdAtRaw.includes('T')
                                                    ? createdAtRaw.split('T')[1].substring(0, 5)
                                                    : (createdAtRaw.includes(' ') ? createdAtRaw.split(' ')[1].substring(0, 5) : '00:00');

                                                const datePart = createdAtRaw.split('T')[0].split(' ')[0];
                                                const dateStr = datePart.includes('-') ? datePart.split('-').reverse().join('/') : datePart;

                                                const targetDate = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                                const formattedTarget = targetDate && targetDate.includes('-')
                                                    ? targetDate.split('-').reverse().join('/')
                                                    : (targetDate || 'Data Indefinida');

                                                // Buscar nomes das rotas (se disponível)
                                                const routeNames = opt.route_names && opt.route_names.length > 0
                                                    ? opt.route_names.join(', ')
                                                    : `${opt.total_routes ?? 0} rotas`;

                                                return (
                                                    <option key={opt.id} value={opt.id}>
                                                        {dateStr} às {timeStr} ➔ Programado para: {formattedTarget} ({routeNames})
                                                    </option>
                                                );
                                            })}

                                        {/* Fallback option if list is empty */}
                                        {availableOptimizations.filter(opt => {
                                            if (!filterDate) return true;
                                            const target = opt.settings?.target_date || opt.settings?.data_especifica;
                                            if (target === filterDate) return true;

                                            const createdDate = opt.created_at.split('T')[0];
                                            let optDateParams = opt.date;
                                            if (opt.date && opt.date.includes('/')) {
                                                const [d, m, y] = opt.date.split('/');
                                                optDateParams = `${y}-${m}-${d}`;
                                            }
                                            return createdDate === filterDate || optDateParams === filterDate;
                                        }).length === 0 && (
                                                <option value="">Nenhuma otimização encontrada neste dia</option>
                                            )}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                    {(() => {
                        if (Array.isArray(runId)) return null; // No modo consolidado não mostramos aviso de execução específica
                        const currentOpt = availableOptimizations.find(opt => opt.id === runId);
                        return currentOpt?.total_routes === 0 && (
                            <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm flex items-center gap-2">
                                ⚠️ <b>Atenção:</b> Esta execução não gerou rotas. Verifique se os dados de entrada estavam corretos ou tente otimizar novamente.
                            </div>
                        );
                    })()}
                </CardHeader>
                <CardContent className="p-0">
                    {runId ? (
                        <RouteMap
                            runId={runId}
                            availableDates={uniqueDates}
                            onDateChange={(date) => {
                                setFilterDate(date);
                                // Buscar todas as execuções que batem com o filtro
                                const opts = availableOptimizations.filter(opt => {
                                    if (!date || date === '' || date === 'all' || date === 'Todas as Datas') return true;
                                    const target = opt.settings?.target_date || opt.settings?.data_especifica || opt.date;
                                    return target === date || opt.created_at.split('T')[0] === date;
                                });

                                if (opts.length > 0) {
                                    // Se for lote/todas as datas, manda o array completo, senão manda só a primeira execução
                                    if (!date || date === '' || date === 'all' || date === 'Todas as Datas') {
                                        setRunId(opts.map(o => o.id));
                                    } else {
                                        setRunId(opts[0].id);
                                    }
                                } else if (!date) {
                                    // Se limpou a data, volta para "congelar" todas as otimizações
                                    setRunId(availableOptimizations.map(o => o.id));
                                }
                            }}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-[700px] bg-slate-50 rounded-lg">
                            <div className="text-center p-8">
                                <div className="text-6xl mb-4">🗺️</div>
                                <h3 className="text-xl font-semibold mb-2">Nenhuma otimização carregada</h3>
                                <p className="text-muted-foreground">
                                    Carregue os dados do calendário e execute a otimização para visualizar o mapa
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
