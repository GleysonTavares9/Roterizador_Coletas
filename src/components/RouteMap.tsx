import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_URL } from '@/config';
import { supabase } from '@/services/supabase';
import * as XLSX from 'xlsx';

interface RouteMapProps {
    runId: string | string[];
    availableDates?: string[]; // Datas vindas do filtro superior
    onDateChange?: (date: string) => void; // Callback para sincronizar com o topo
}

interface RouteStats {
    id: string;
    vehicle: string;
    date: string;
    points: number;
    weight: number;
    distance: number;
    color: string;
    routeId?: string;
    driverId?: string;
    unidade?: string;
    utilizacao: number;
    dist_to_depot: number;
    points_data?: any[];
}

import React from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("RouteMap Error Boundary caught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
                    <h3 className="font-bold">Algo deu errado ao carregar o mapa.</h3>
                    <pre className="text-xs mt-2 overflow-auto max-h-40">{this.state.error?.toString()}</pre>
                </div>
            );
        }

        return this.props.children;
    }
}

function RouteMapContent({ runId, availableDates, onDateChange: _onDateChange }: RouteMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const layerGroupRef = useRef<L.LayerGroup | null>(null);
    const legendControlRef = useRef<L.Control | null>(null);
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set(['all']));
    const routeCache = useRef<Map<string, any>>(new Map()); // Cache para geometrias OSRM
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const dateDropdownRef = useRef<HTMLDivElement>(null);

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
                setIsDateDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    const [selectedVehicle, setSelectedVehicle] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedUnit, setSelectedUnit] = useState<string>('all');
    const [routesData, setRoutesData] = useState<any>(null);
    const [routeStats, setRouteStats] = useState<RouteStats[]>([]);
    const [showSummary, setShowSummary] = useState(true);
    const [activeTab, setActiveTab] = useState('resumo');
    const [deleting, setDeleting] = useState(false);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [optimizationSettings, setOptimizationSettings] = useState<any>(null);
    const [visibleRoutes, setVisibleRoutes] = useState<Set<string>>(new Set());
    const [isFullScreen, setIsFullScreen] = useState(false);
    const initialBoundsSet = useRef<string | null>(null); // Track which runId we centered for
    const [showClusters, setShowClusters] = useState(false);
    const clusterLayerRef = useRef<L.LayerGroup | null>(null);
    const [mapType, setMapType] = useState<'traditional' | 'light' | 'dark' | 'satellite'>('traditional');
    const tileLayerRef = useRef<L.TileLayer | null>(null);

    // Toggle Tela Cheia
    const toggleFullScreen = () => {
        setIsFullScreen(!isFullScreen);
        // Forçar redimensionamento do mapa após a transição
        setTimeout(() => {
            mapRef.current?.invalidateSize();
        }, 100);
    };

    // Bloquear scroll do body quando em tela cheia
    useEffect(() => {
        if (isFullScreen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isFullScreen]);

    // Recentrar mapa nas rotas visíveis
    const recenterMap = () => {
        //         console.log('🎯 Recentrar clicado');

        // Usar a referência do mapa que já está armazenada
        const map = mapRef.current;
        if (!map) {
            console.error('Instância do mapa não encontrada em mapRef');
            return;
        }

        if (!routesData?.routes) {
            console.error('Sem dados de rotas');
            return;
        }

        //         console.log('Filtrando rotas...', {
        //             total: routesData.routes.length,
        //             selectedDates: Array.from(selectedDates),
        //             selectedVehicle,
        //             visibleRoutes: visibleRoutes.size
        //         });

        let routesToDraw = routesData.routes.filter((r: any) => {
            const dateStr = String(r.date || '').trim();
            const matchesDate = selectedDates.has('all') || selectedDates.has(dateStr);
            const vehicleStr = String(r.vehicle || '').trim();
            const selectedVehicleStr = String(selectedVehicle).trim();
            const matchesVehicle = selectedVehicle === 'all' || vehicleStr === selectedVehicleStr;
            const isVisible = visibleRoutes.has(r.id);

            return matchesDate && matchesVehicle && isVisible;
        });

        // Fallback: Se não encontrar nada filtrado, tenta mostrar tudo
        if (routesToDraw.length === 0) {
            console.warn('Filtro retornou vazio, tentando mostrar todas as rotas disponíveis...');
            routesToDraw = routesData.routes;
        }

        //         console.log('Rotas filtradas:', routesToDraw.length);

        const pointsForZoom = routesToDraw.flatMap((r: any) =>
            r.points
                .filter((p: any) => p.lat != null && p.lng != null)
                .map((p: any) => [p.lat, p.lng])
        );

        //         console.log('Pontos para zoom:', pointsForZoom.length);

        if (pointsForZoom.length > 0) {
            const bounds = L.latLngBounds(pointsForZoom as [number, number][]);
            //             console.log('Aplicando fitBounds...', bounds);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            //             console.log('✅ Mapa recentrado!');
        } else {
            console.warn('Nenhum ponto válido encontrado para centralizar');
            alert('Nenhum ponto válido encontrado para centralizar o mapa.');
        }
    };

    // Desenhar territórios master (clusters)
    const drawClusters = () => {
        if (!mapRef.current || !routesData?.routes) return;

        const map = mapRef.current;

        // Remover camada anterior se existir
        if (clusterLayerRef.current) {
            map.removeLayer(clusterLayerRef.current);
            clusterLayerRef.current = null;
        }

        if (!showClusters) return;

        // Criar nova camada
        const clusterLayer = L.layerGroup().addTo(map);
        clusterLayerRef.current = clusterLayer;

        // Agrupar pontos por território (usando territory_id do K-Means vindo do backend)
        const territorios = new Map<any, any[]>();

        // Filtrar rotas antes de gerar clusters
        const routesToProcess = routesData.routes.filter((r: any) => {
            const dateStr = String(r.date || '').trim();
            const matchesDate = selectedDates.has('all') || selectedDates.has(dateStr);
            const vehicleStr = String(r.vehicle || '').trim();
            const selectedVehicleStr = String(selectedVehicle).trim();
            const matchesVehicle = selectedVehicle === 'all' || vehicleStr === selectedVehicleStr;
            const isVisible = visibleRoutes.has(r.id);

            return matchesDate && matchesVehicle && isVisible;
        });

        routesToProcess.forEach((route: any) => {
            // Usar o territory_id salvo pelo backend
            const territoryId = route.territory_id !== undefined ? route.territory_id : '0';

            if (!territorios.has(territoryId)) {
                territorios.set(territoryId, []);
            }

            route.points.forEach((p: any) => {
                if (p.lat != null && p.lng != null) {
                    territorios.get(territoryId)!.push([p.lat, p.lng]);
                }
            });
        });

        // Cores MAIS FORTES e vibrantes para os territórios
        const colors = [
            '#FF0000', // Vermelho Puro
            '#00FF00', // Verde Lima
            '#0000FF', // Azul Real
            '#FF00FF', // Magenta
            '#00FFFF', // Ciano
            '#FFA500', // Laranja Vibrante
            '#8000FF', // Roxo Elétrico
            '#FFD700'  // Ouro
        ];
        let colorIndex = 0;

        // Desenhar cada território
        territorios.forEach((points, territoryId) => {
            if (points.length === 0) return;

            const color = colors[colorIndex % colors.length];
            colorIndex++;

            if (points.length < 3) {
                // Para 1 ou 2 pontos, desenhar círculo ao redor
                const center = points[0];
                L.circle(center as [number, number], {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.4,
                    radius: 500, // 500m radius fallback
                    interactive: true
                }).bindPopup(`Território ${territoryId} (Pequeno)`).addTo(clusterLayer);
                return;
            }

            const hull = convexHull(points);

            if (hull.length >= 3) {
                // Desenhar polígono com MAIOR DESTAQUE
                const polygon = L.polygon(hull as [number, number][], {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.25, // Aumentado para maior visibilidade
                    weight: 3,         // Borda mais grossa
                    dashArray: '',    // Borda sólida para ser bem visível
                    interactive: true
                }).addTo(clusterLayer);

                // Efeito de destaque ainda mais forte ao passar o mouse
                polygon.on('mouseover', (e: any) => {
                    e.target.setStyle({
                        fillOpacity: 0.5,
                        weight: 5
                    });
                });

                polygon.on('mouseout', (e: any) => {
                    e.target.setStyle({
                        fillOpacity: 0.25,
                        weight: 3
                    });
                });

                polygon.bindPopup(`
                    <div style="font-family: Arial; padding: 5px;">
                        <strong>🗺️ Território Master ${territoryId}</strong><br>
                        <small>${points.length} pontos nesta região</small>
                    </div>
                `);

                // Adicionar label no centro do polígono
                const center = getPolygonCenter(hull);
                L.marker(center as [number, number], {
                    icon: L.divIcon({
                        className: 'cluster-label',
                        html: `<div style="background: ${color}; color: white; padding: 2px 10px; border-radius: 12px; font-weight: bold; font-size: 11px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: nowrap; border: 1px solid rgba(255,255,255,0.5);">Território ${territoryId}</div>`,
                        iconSize: [100, 24],
                        iconAnchor: [50, 12]
                    }),
                    interactive: false
                }).addTo(clusterLayer);
            }
        });

        // Colocar territórios no fundo para não cobrir as rotas
        // clusterLayer.bringToBack(); // Opcional, dependendo da preferência
    };

    // Função auxiliar: Convex Hull (Graham Scan)
    const convexHull = (points: any[]): any[] => {
        if (points.length < 3) return points;

        // Ordenar pontos
        const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

        // Lower hull
        const lower: any[] = [];
        for (const p of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        // Upper hull
        const upper: any[] = [];
        for (let i = sorted.length - 1; i >= 0; i--) {
            const p = sorted[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        upper.pop();
        lower.pop();
        return lower.concat(upper);
    };

    const cross = (o: any, a: any, b: any) => {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };

    const getPolygonCenter = (points: any[]): any => {
        const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
        return [sum[0] / points.length, sum[1] / points.length];
    };

    // Fechar tela cheia com ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullScreen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // Redesenhar clusters quando necessário
    useEffect(() => {
        drawClusters();
    }, [showClusters, routesData, selectedDates, selectedVehicle, visibleRoutes]);

    // Efeito para sincronizar as rotas visíveis quando os dados carregam
    useEffect(() => {
        if (routesData?.routes) {
            const allIds = routesData.routes.map((r: any) => r.id);
            setVisibleRoutes(new Set(allIds));

            // Se as rotas carregadas pertencem a uma única data, selecionamos essa data no filtro interno
            // Se houver múltiplas, selecionar 'all'
            const uniqueDatesInRun = [...new Set(routesData.routes.map((r: any) => r.date))].sort() as string[];

            if (uniqueDatesInRun.length === 1) {
                setSelectedDates(new Set([uniqueDatesInRun[0]]));
            } else {
                setSelectedDates(new Set(['all']));
            }
        }
    }, [routesData]);

    // Master Toggle: controla apenas as rotas que passaram nos filtros atuais
    const toggleAllRotation = () => {
        const currentFilteredIds = currentFilteredRoutes.map((r: any) => r.id);
        if (currentFilteredIds.length === 0) return;

        const allCurrentVisible = currentFilteredIds.every((id: string) => visibleRoutes.has(id));

        const newVisible = new Set(visibleRoutes);
        if (allCurrentVisible) {
            // Se todas as atuais estão visíveis, esconder apenas as atuais
            currentFilteredIds.forEach((id: string) => newVisible.delete(id));
        } else {
            // Caso contrário, mostrar todas as atuais
            currentFilteredIds.forEach((id: string) => newVisible.add(id));
        }
        setVisibleRoutes(newVisible);
    };

    const toggleRouteVisibility = (id: string) => {
        const newVisible = new Set(visibleRoutes);
        if (newVisible.has(id)) newVisible.delete(id);
        else newVisible.add(id);
        setVisibleRoutes(newVisible);
    };

    useEffect(() => {
        const loadDrivers = async () => {
            const { data } = await supabase.from('drivers').select('id, name').order('name');
            setDrivers(data || []);
        };
        loadDrivers();
    }, []);

    const handleAssignDriver = async (routeId: string, driverId: string) => {
        if (!routeId) return;
        const { error } = await supabase.from('routes').update({ driver_id: driverId ? driverId : null }).eq('id', routeId);

        if (error) {
            alert('Erro ao vincular motorista');
        } else {
            // No need to update state manually if Realtime is working, but it's safer
            setRouteStats(prev => prev.map(s => s.routeId === routeId ? { ...s, driverId } : s));
            setRoutesData((prev: any) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    routes: prev.routes.map((r: any) => r.id === routeId ? { ...r, driver_id: driverId } : r)
                };
            });
        }
    };

    // Realtime Sync for Driver Assignments
    useEffect(() => {
        const channel = supabase
            .channel('map_routes_sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'routes' }, (payload) => {
                const updatedRoute = payload.new;
                setRouteStats(prev => prev.map(s => s.id === updatedRoute.id ? { ...s, driverId: updatedRoute.driver_id } : s));
                setRoutesData((prev: any) => {
                    if (!prev || !prev.routes) return prev;
                    return {
                        ...prev,
                        routes: prev.routes.map((r: any) => r.id === updatedRoute.id ? { ...r, driver_id: updatedRoute.driver_id } : r)
                    };
                });
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // Cores vibrantes para as rotas
    // Gerar 120 cores distintas (HSL com Golden Ratio)
    const generateDistinctColors = (count: number) => {
        const colors = [];
        const goldenRatio = 0.618033988749895;

        for (let i = 0; i < count; i++) {
            const hue = (i * goldenRatio) % 1.0;
            const saturation = i % 2 === 0 ? 0.95 : 0.85;
            const lightness = i % 3 === 0 ? 0.55 : (i % 2 === 0 ? 0.50 : 0.40);

            // HSL to RGB conversion
            const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
            const p = 2 * lightness - q;

            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const r = Math.round(hue2rgb(p, q, hue + 1 / 3) * 255);
            const g = Math.round(hue2rgb(p, q, hue) * 255);
            const b = Math.round(hue2rgb(p, q, hue - 1 / 3) * 255);

            const toHex = (c: number) => {
                const hex = c.toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            };

            colors.push(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
        }
        return colors;
    };

    const routeColors = generateDistinctColors(120);

    const deleteOptimization = async () => {
        if (!runId) return;

        const confirmDelete = window.confirm(
            `Tem certeza que deseja deletar esta otimização?\n\nIsso removerá todas as rotas e dados relacionados do banco de dados.`
        );

        if (!confirmDelete) return;

        setDeleting(true);
        try {
            const response = await fetch(`${API_URL}/api/optimization/${runId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Erro ao deletar otimização');
            }

            alert('Otimização deletada com sucesso! Recarregue a página para ver as mudanças.');
            window.location.reload();
        } catch (error) {
            console.error('Erro ao deletar:', error);
            alert('Erro ao deletar otimização. Verifique o console para mais detalhes.');
        } finally {
            setDeleting(false);
        }
    };

    const exportToExcel = () => {
        if (!routesData || !routesData.routes || routesData.routes.length === 0) {
            alert('Não há rotas para exportar');
            return;
        }

        // Usar configurações do banco ou valores padrão
        const START_TIME = optimizationSettings?.INICIO_JORNADA || "07:00";
        const LUNCH_START = optimizationSettings?.INICIO_ALMOCO || "12:00";
        const LUNCH_DURATION = optimizationSettings?.DURACAO_ALMOCO || 60;
        const SERVICE_TIME = optimizationSettings?.TEMPO_SERVICO || 15;
        const AVG_SPEED = optimizationSettings?.VELOCIDADE_MEDIA || 40;

        // Função para calcular distância Haversine
        const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        const exportData: any[] = [];

        routesData.routes.forEach((route: any) => {
            let totalMinutes = 7 * 60; // 07:00
            let addedLunch = false;

            // Saída do depósito
            exportData.push({
                'Veículo': route.vehicle,
                'Data': route.date,
                'Seq': 0,
                'Tipo': '🏭 SAÍDA',
                'Cliente': 'Depósito',
                'Horário': START_TIME,
                'Serviço (min)': 0,
                'Dist (km)': 0,
                'Viagem (min)': 0,
                'Peso (kg)': 0
            });

            route.points.forEach((point: any, idx: number) => {
                const prevPoint = idx === 0 ? null : route.points[idx - 1];
                let distance = 0;

                if (idx === 0 && routesData.depots[0]) {
                    distance = calculateDistance(routesData.depots[0].lat, routesData.depots[0].lng, point.lat, point.lng);
                } else if (prevPoint) {
                    distance = calculateDistance(prevPoint.lat, prevPoint.lng, point.lat, point.lng);
                }

                const travelTime = (distance / AVG_SPEED) * 60;
                totalMinutes += travelTime;

                // Verificar almoço
                if (!addedLunch && totalMinutes >= 12 * 60) {
                    exportData.push({
                        'Veículo': route.vehicle,
                        'Data': route.date,
                        'Seq': `${idx}A`,
                        'Tipo': '🍽️ ALMOÇO',
                        'Cliente': 'Parada',
                        'Horário': LUNCH_START,
                        'Serviço (min)': LUNCH_DURATION,
                        'Dist (km)': 0,
                        'Viagem (min)': 0,
                        'Peso (kg)': 0
                    });
                    totalMinutes += LUNCH_DURATION;
                    addedLunch = true;
                }

                const h = Math.floor(totalMinutes / 60);
                const m = Math.round(totalMinutes % 60);
                const arrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

                exportData.push({
                    'Veículo': route.vehicle,
                    'Data': route.date,
                    'Seq': idx + 1,
                    'Tipo': '📍 COLETA',
                    'Cliente': point.client,
                    'Endereço': point.address,
                    'Horário': arrivalTime,
                    'Serviço (min)': SERVICE_TIME,
                    'Dist (km)': distance.toFixed(2),
                    'Viagem (min)': Math.round(travelTime),
                    'Peso (kg)': point.weight
                });

                totalMinutes += SERVICE_TIME;
            });

            // Retorno ao depósito
            if (route.points.length > 0 && routesData.depots[0]) {
                const lastPoint = route.points[route.points.length - 1];
                const returnDist = calculateDistance(lastPoint.lat, lastPoint.lng, routesData.depots[0].lat, routesData.depots[0].lng);
                const returnTime = (returnDist / AVG_SPEED) * 60;
                totalMinutes += returnTime;

                const h = Math.floor(totalMinutes / 60);
                const m = Math.round(totalMinutes % 60);

                exportData.push({
                    'Veículo': route.vehicle,
                    'Data': route.date,
                    'Seq': route.points.length + 1,
                    'Tipo': '🏭 RETORNO',
                    'Cliente': 'Depósito',
                    'Horário': `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
                    'Serviço (min)': 0,
                    'Dist (km)': returnDist.toFixed(2),
                    'Viagem (min)': Math.round(returnTime),
                    'Peso (kg)': 0
                });
            }
        });

        const summaryData = routeStats.map(stat => ({
            'Veículo': stat.vehicle,
            'Data': stat.date,
            'Pontos': stat.points,
            'Peso (kg)': stat.weight.toFixed(1),
            'Dist (km)': stat.distance.toFixed(1),
            'Motorista': drivers.find(d => d.id === stat.driverId)?.name || 'Não atribuído',
            'Início': START_TIME,
            'Almoço': LUNCH_START
        }));

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Cronograma Detalhado');
        const ws2 = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');

        XLSX.writeFile(wb, `rotas_detalhadas_${new Date().toISOString().split('T')[0]}.xlsx`);
    };


    // Cache simples para evitar refetching do mesmo runId
    const dataCache = useRef<Record<string, any>>({});

    useEffect(() => {
        if (!containerRef.current || !runId) return;

        if (!mapRef.current) {
            mapRef.current = L.map(containerRef.current, {
                attributionControl: true,
                zoomControl: false
            }).setView([-19.8157, -43.9542], 12); // Padrão BH

            if (mapRef.current.attributionControl) {
                mapRef.current.attributionControl.setPrefix('');
            }

            tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© Sistema de Roteirização | © OpenStreetMap',
                maxZoom: 19
            }).addTo(mapRef.current);

            L.control.zoom({ position: 'bottomleft' }).addTo(mapRef.current);
            layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
        }

        const fetchRouteData = async () => {
            try {
                const runIds = Array.isArray(runId) ? runId : [runId];
                if (runIds.length === 0 || !runIds[0]) return;

                const cacheKey = runIds.sort().join(',');
                if (dataCache.current[cacheKey]) {
                    //                     console.log('🚀 Carregando dados do cache local');
                    setRoutesData(dataCache.current[cacheKey]);
                    return;
                }

                //                 console.log('📡 Buscando dados otimizados do Supabase...');

                // BUSCA PARALELA (Muito mais rápido)
                const [runsRes, routesRes, depotsRes, unservedRes, vehiclesRes] = await Promise.all([
                    supabase.from('optimization_runs').select('id, settings').in('id', runIds),
                    supabase.from('routes')
                        .select(`
                            id, vehicle_plate, route_date, territory_id, run_id, geometry, total_distance,
                            route_points (sequence, client_name, address, latitude, longitude, weight)
                        `)
                        .in('run_id', runIds)
                        .order('route_date', { ascending: true }),
                    supabase.from('depots').select('name, latitude, longitude').limit(1),
                    supabase.from('optimization_unserved_points')
                        .select('client_name, address, latitude, longitude, weight, reason')
                        .in('run_id', runIds),
                    supabase.from('vehicles').select('plate, unit_name')
                ]);

                if (routesRes.error) throw routesRes.error;

                const settingsMap: Record<string, any> = {};
                const dateMap: Record<string, string> = {};
                if (runsRes.data) {
                    runsRes.data.forEach(run => {
                        settingsMap[run.id] = run.settings;
                        const target = run.settings?.target_date || run.settings?.data_especifica;
                        if (target) dateMap[run.id] = target;
                    });
                    setOptimizationSettings(settingsMap[runIds[0]]);
                }

                // Mapa de placa -> unidade
                const vehicleUnitMap: Record<string, string> = {};
                if (vehiclesRes.data) {
                    vehiclesRes.data.forEach(v => {
                        if (v.plate) vehicleUnitMap[v.plate.trim()] = v.unit_name || 'Sem Unidade';
                    });
                }

                const formattedRoutes = (routesRes.data || []).map((route: any) => {
                    let cleanDate = 'S/D';
                    if (route.route_date) {
                        const raw = String(route.route_date).trim();
                        const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
                        cleanDate = match ? match[1] : raw.split('T')[0].split(' ')[0];
                    } else if (dateMap[route.run_id]) {
                        cleanDate = dateMap[route.run_id];
                    }
                    const plate = String(route.vehicle_plate || '').trim();
                    return {
                        id: route.id,
                        vehicle: plate || 'Sem Placa',
                        date: cleanDate,
                        unidade: vehicleUnitMap[plate] || 'Sem Unidade',
                        territory_id: route.territory_id,
                        geometry: route.geometry,
                        total_distance: route.total_distance || 0,
                        points: (route.route_points || []).map((p: any) => ({
                            sequence: p.sequence,
                            client: p.client_name,
                            address: p.address,
                            lat: p.latitude,
                            lng: p.longitude,
                            weight: p.weight
                        }))
                    };
                });

                const data = {
                    routes: formattedRoutes,
                    depots: (depotsRes.data || []).map(d => ({ name: d.name, lat: d.latitude, lng: d.longitude })),
                    unserved_points: (unservedRes.data || []).map((p: any) => ({
                        client: p.client_name, lat: p.latitude, lng: p.longitude, weight: p.weight, reason: p.reason
                    }))
                };

                // Alimentar cache e estado
                dataCache.current[cacheKey] = data;
                setRoutesData(data);
                setVisibleRoutes(new Set(formattedRoutes.map(r => r.id)));

            } catch (error) {
                console.error('❌ Erro na otimização de dados:', error);
                setRoutesData({ routes: [], depots: [], unserved: [] });
            }
        };

        fetchRouteData();
    }, [JSON.stringify(runId)]);

    // Efeito para trocar o estilo do mapa
    useEffect(() => {
        if (!mapRef.current || !tileLayerRef.current) return;

        const map = mapRef.current;

        map.eachLayer(l => {
            if (l instanceof L.TileLayer) map.removeLayer(l);
        });

        const newUrl = mapType === 'traditional'
            ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            : mapType === 'light'
                ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                : mapType === 'dark'
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

        const newAttr = mapType === 'traditional'
            ? '© Sistema de Roteirização | © OpenStreetMap'
            : mapType === 'light' || mapType === 'dark'
                ? '© Sistema de Roteirização | © CARTO'
                : '© Sistema de Roteirização | © Esri | Source: Esri, Maxar, Earthstar Geographics';

        tileLayerRef.current = L.tileLayer(newUrl, {
            attribution: newAttr,
            maxZoom: mapType === 'satellite' ? 18 : 19
        }).addTo(map);

        // Se for satélite, adicionar os nomes das ruas por cima para não ficar perdido
        if (mapType === 'satellite') {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
                attribution: '© CARTO',
                pane: 'markerPane', // Garante que fica visível acima do satélite
                zIndex: 1000
            }).addTo(map);
        }

    }, [mapType]);

    useEffect(() => {
        if (!mapRef.current || !routesData || !layerGroupRef.current) return;

        const map = mapRef.current;
        const layerGroup = layerGroupRef.current;

        // Limpar camadas e estatísticas anteriores
        layerGroup.clearLayers();
        setRouteStats([]);

        // Remover legenda anterior
        if (legendControlRef.current) {
            map.removeControl(legendControlRef.current);
            legendControlRef.current = null;
        }

        const { routes, depots, unserved_points } = routesData;

        // Usar a lista pré-filtrada do memo
        let filteredRoutes = currentFilteredRoutes;

        // Rotas que serão efetivamente DESENHADAS no mapa
        const routesToDraw = filteredRoutes.filter((r: any) => visibleRoutes.has(r.id));

        // Cores para cada veículo
        const vehicleColors: Record<string, string> = {};
        // Usar todas as rotas para garantir consistência de cores mesmo filtrado
        routes.forEach((r: any, idx: number) => {
            if (!vehicleColors[r.vehicle]) {
                vehicleColors[r.vehicle] = routeColors[idx % routeColors.length];
            }
        });

        // Adicionar depósitos
        depots.forEach((depot: any) => {
            if (depot.lat == null || depot.lng == null) return;

            const icon = L.divIcon({
                className: 'depot-marker',
                html: `<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">🏭</div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            L.marker([depot.lat, depot.lng], { icon })
                .addTo(layerGroup)
                .bindPopup(`<div style="font-family: Arial;"><h3 style="margin: 0 0 5px 0; font-size: 14px;">🏭 ${depot.name}</h3></div>`);
        });

        // Adicionar rotas com geometria OSRM
        const loadRoutes = async () => {
            // Inicializar estatísticas (sidebar) com todas as rotas filtradas por texto
            const depotLat = depots[0]?.lat || -2.53;
            const depotLng = depots[0]?.lng || -44.30;

            const initialStats: RouteStats[] = filteredRoutes.map((r: any) => {
                const weight = r.points.reduce((s: number, p: any) => s + p.weight, 0);
                const firstPoint = r.points[0];
                let distToDepot = 9999;
                if (firstPoint && firstPoint.lat) {
                    const R = 6371;
                    const dLat = (firstPoint.lat - depotLat) * Math.PI / 180;
                    const dLon = (firstPoint.lng - depotLng) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(depotLat * Math.PI / 180) * Math.cos(firstPoint.lat * Math.PI / 180) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    distToDepot = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                }

                return {
                    id: r.id,
                    vehicle: r.vehicle,
                    date: r.date,
                    points: r.points.length,
                    weight: weight,
                    distance: r.total_distance || 0, // Usar distância salva no banco
                    color: vehicleColors[r.vehicle],
                    routeId: r.id,
                    driverId: r.driver_id,
                    unidade: r.unidade || 'Sem Unidade',
                    utilizacao: (weight / 1000) * 100,
                    dist_to_depot: distToDepot,
                    points_data: r.points
                };
            });
            setRouteStats(initialStats);

            // Desenhar apenas as rotas marcadas (routesToDraw)
            const routePromises = routesToDraw.map(async (route: any) => {
                const color = vehicleColors[route.vehicle];
                const points = [...route.points]
                    .sort((a: any, b: any) => a.sequence - b.sequence)
                    .filter((p: any) => p.lat != null && !isNaN(p.lat) && p.lng != null && !isNaN(p.lng));

                if (points.length === 0) return;

                // Adicionar marcadores numerados
                points.forEach((point: any, idx: number) => {
                    const sequenceNumber = idx + 1;
                    const icon = L.divIcon({
                        className: 'numbered-marker',
                        html: `<div style="background: ${color}; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${sequenceNumber}</div>`,
                        iconSize: [22, 22],
                        iconAnchor: [11, 11]
                    });

                    L.marker([point.lat, point.lng], { icon })
                        .addTo(layerGroup)
                        .bindPopup(`
                            <div style="min-width: 220px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${color}; padding-bottom: 5px; margin-bottom: 8px;">
                                    <span style="color: ${color}; font-weight: bold; font-size: 14px;">Parada #${sequenceNumber}</span>
                                    <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;">${route.vehicle}</span>
                                </div>
                                <div style="font-size: 13px;">
                                    <p style="margin: 0; font-weight: 600;">${point.client}</p>
                                    <p style="margin: 4px 0; color: #666; font-size: 11px;">📍 ${point.address}</p>
                                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
                                        <span>⚖️ ${point.weight} kg</span>
                                    </div>
                                </div>
                            </div>
                        `);
                });

                // --- GESTÃO DE TRAJETÓRIA (OTIMIZADA) ---
                // Se o banco já tem a geometria completa, usamos e ignoramos OSRM
                if (route.geometry) {
                    try {
                        const latlngs = route.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
                        L.polyline(latlngs, { color, weight: 4, opacity: 0.8 }).addTo(layerGroup);
                        return; // SUCESSO - Não chama OSRM
                    } catch (e) { console.error('Geometria inválida no banco:', e); }
                }

                // Fallback: Se não tem geometria salva, tenta cache ou OSRM
                if (points.length > 0) {
                    const depot = depots.length > 0 ? depots[0] : null;

                    // Se não tem depósito, traça apenas entre os pontos. Se tem, traça Depot -> Pontos -> Depot
                    const coordsArray = depot
                        ? [{ lat: depot.lat, lng: depot.lng }, ...points]
                        : points;

                    const outboundCoords = coordsArray.map(p => `${p.lng},${p.lat}`).join(';');

                    let returnCoords = null;
                    if (depot && points.length > 0) {
                        returnCoords = `${points[points.length - 1].lng},${points[points.length - 1].lat};${depot.lng},${depot.lat}`;
                    }

                    const outboundKey = `out_${route.id}_${points.length}_${depot ? 'w' : 'wo'}`;
                    const returnKey = `ret_${route.id}_${points.length}_${depot ? 'w' : 'wo'}`;

                    // Ida
                    let geometry;
                    if (routeCache.current.has(outboundKey)) {
                        geometry = routeCache.current.get(outboundKey).geometry;
                    } else {
                        const res = await fetch(`http://router.project-osrm.org/route/v1/driving/${outboundCoords}?overview=full&geometries=geojson`);
                        const data = await res.json();
                        if (data.code === 'Ok' && data.routes?.[0]) {
                            geometry = data.routes[0].geometry;
                            routeCache.current.set(outboundKey, { geometry, distance: data.routes[0].distance });
                        }
                    }

                    // Checagem pós-fetch: evitar renderizar rota se o filtro mudou enquanto esperava o OSRM
                    if (geometry && visibleRoutes.has(route.id)) {
                        const latlngs = geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
                        L.polyline(latlngs, { color, weight: 4, opacity: 0.8 }).addTo(layerGroup);
                    }

                    // Volta
                    let retGeom;
                    if (returnCoords) {
                        if (routeCache.current.has(returnKey)) {
                            retGeom = routeCache.current.get(returnKey).geometry;
                        } else {
                            try {
                                const res = await fetch(`http://router.project-osrm.org/route/v1/driving/${returnCoords}?overview=full&geometries=geojson`);
                                const data = await res.json();
                                if (data.code === 'Ok' && data.routes?.[0]) {
                                    retGeom = data.routes[0].geometry;
                                    routeCache.current.set(returnKey, { geometry: retGeom, distance: data.routes[0].distance });
                                }
                            } catch (e) {
                                console.warn('Falha ao buscar retorno OSRM:', e);
                            }
                        }

                        if (retGeom && visibleRoutes.has(route.id)) {
                            const latlngs = retGeom.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
                            L.polyline(latlngs, { color, weight: 4, opacity: 0.5, dashArray: '8, 8' }).addTo(layerGroup);
                        }
                    }
                }
            });

            await Promise.all(routePromises);
        };

        loadRoutes();

        // Pontos não atendidos (Só mostra se Veículo for 'all')
        if (selectedVehicle === 'all' && unserved_points && unserved_points.length > 0) {
            unserved_points.forEach((point: any) => {
                if (point.lat == null || isNaN(point.lat) || point.lng == null || isNaN(point.lng)) return;

                const icon = L.divIcon({
                    className: 'unserved-marker',
                    html: `<div style="background: #FF0000; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 2px 5px rgba(255,0,0,0.4);">⚠️</div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                L.marker([point.lat, point.lng], { icon })
                    .addTo(layerGroup)
                    .bindPopup(`
                        <div style="min-width: 220px; font-family: Arial;">
                            <div style="background: #FF0000; color: white; padding: 8px; margin: -9px -9px 8px -9px; border-radius: 3px 3px 0 0;">
                                <strong style="font-size: 13px;">⚠️ NÃO ATENDIDO</strong>
                            </div>
                            <div style="font-size: 11px;">
                                <p style="margin: 3px 0;"><b>👤</b> ${point.client}</p>
                                <p style="margin: 3px 0;"><b>📍</b> ${point.address}</p>
                                <p style="margin: 3px 0;"><b>⚖️</b> ${point.weight.toFixed(1)} kg</p>
                                <p style="margin: 3px 0; color: #d00;"><b>Razão:</b> ${point.reason || 'Sem capacidade/tempo'}</p>
                            </div>
                        </div>
                    `);
            });
        }

        // Ajustar zoom FOCADO APENAS NO QUE ESTÁ DESENHADO
        const pointsForZoom = [
            ...routesToDraw.flatMap((r: any) => r.points
                .filter((p: any) => p.lat != null && !isNaN(p.lat) && p.lng != null && !isNaN(p.lng))
                .map((p: any) => [p.lat, p.lng])),
            ...depots
                .filter((d: any) => d.lat != null && !isNaN(d.lat) && d.lng != null && !isNaN(d.lng))
                .map((d: any) => [d.lat, d.lng])
        ];

        // Adicionar pontos não atendidos ao zoom se estiverem visíveis
        // Adicionar pontos não atendidos ao zoom se estiverem visíveis
        if (selectedVehicle === 'all' && unserved_points) {
            unserved_points.forEach((p: any) => {
                if (p.lat != null && !isNaN(p.lat) && p.lng != null && !isNaN(p.lng)) {
                    pointsForZoom.push([p.lat, p.lng]);
                }
            });
        }

        if (pointsForZoom.length > 0) {
            const bounds = L.latLngBounds(pointsForZoom as [number, number][]);

            // Reset bounds focus if runId OR filters changed
            const datesKey = Array.from(selectedDates).sort().join(',');
            const currentRunKey = `${Array.isArray(runId) ? runId.join(',') : runId}_${datesKey}_${selectedVehicle}`;

            if (initialBoundsSet.current !== currentRunKey) {
                //                 console.log('🔄 Centralizando mapa para novos filtros:', currentRunKey);
                setTimeout(() => {
                    map.fitBounds(bounds, { padding: [100, 100], maxZoom: 15 });
                    map.invalidateSize();
                }, 100);
                initialBoundsSet.current = currentRunKey;
            }
        }

    }, [routesData, selectedDates, selectedVehicle, visibleRoutes, runId]);

    // Meses disponíveis nos dados atuais
    const availableMonths = useMemo(() => {
        if (!routesData?.routes) return [];
        const mStrings = new Set<string>();
        routesData.routes.forEach((r: any) => {
            const d = String(r.date || '');
            if (!d) return;

            let month = '';
            if (d.includes('-')) {
                const parts = d.split('-');
                if (parts[0].length === 4) month = parts[1];
                else if (parts[2] && parts[2].length === 4) month = parts[1];
            } else if (d.includes('/')) {
                const parts = d.split('/');
                if (parts[2] && parts[2].length === 4) month = parts[1];
                else if (parts[0].length === 4) month = parts[1];
            }

            if (month && !isNaN(parseInt(month))) {
                mStrings.add(month.padStart(2, '0'));
            }
        });
        return Array.from(mStrings).sort();
    }, [routesData]);

    // Unidades disponíveis (Hierarquia: depende do Mês)
    const availableUnits = useMemo(() => {
        if (!routesData?.routes) return [];
        const units = new Set<string>();
        routesData.routes.forEach((r: any) => {
            // Filtrar pelo mês selecionado antes de listar unidades
            if (selectedMonth !== 'all') {
                const d = String(r.date || '');
                let month = '';
                if (d.includes('-')) month = d.split('-')[1];
                else if (d.includes('/')) month = d.split('/')[1];
                if (month !== selectedMonth) return;
            }
            if (r.unidade) units.add(r.unidade);
        });
        return Array.from(units).sort();
    }, [routesData, selectedMonth]);

    // Veículos disponíveis (Hierarquia: depende do Mês e da Unidade)
    const availableVehicles = useMemo(() => {
        if (!routesData?.routes) return [];
        const vehicles = new Set<string>();
        routesData.routes.forEach((r: any) => {
            // Filtrar pelo mês
            if (selectedMonth !== 'all') {
                const d = String(r.date || '');
                let month = '';
                if (d.includes('-')) month = d.split('-')[1];
                else if (d.includes('/')) month = d.split('/')[1];
                if (month !== selectedMonth) return;
            }
            // Filtrar pela unidade
            if (selectedUnit !== 'all' && r.unidade !== selectedUnit) return;

            if (r.vehicle) vehicles.add(r.vehicle);
        });
        return Array.from(vehicles).sort();
    }, [routesData, selectedMonth, selectedUnit]);

    // --- FILTRAGEM CENTRALIZADA (Memoized) ---
    const currentFilteredRoutes = useMemo(() => {
        if (!routesData?.routes) return [];
        return routesData.routes.filter((r: any) => {
            const dateStr = String(r.date || '').trim();

            // Filtro de Mês
            if (selectedMonth !== 'all') {
                let month = '';
                if (dateStr.includes('-')) month = dateStr.split('-')[1];
                else if (dateStr.includes('/')) month = dateStr.split('/')[1];

                if (parseInt(month) !== parseInt(selectedMonth)) return false;
            }

            // Filtro de Unidade
            if (selectedUnit !== 'all') {
                const rUnit = String(r.unidade || r.unit_name || '').trim();
                if (rUnit !== selectedUnit) return false;
            }

            const matchesDate = selectedDates.has('all') || selectedDates.has(dateStr);
            const vehicleStr = String(r.vehicle || '').trim();
            const selectedVehicleStr = String(selectedVehicle).trim();
            const matchesVehicle = selectedVehicle === 'all' || vehicleStr === selectedVehicleStr;
            return matchesDate && matchesVehicle;
        });
    }, [routesData, selectedMonth, selectedUnit, selectedDates, selectedVehicle]);

    // Datas disponíveis (Hierarquia: depende do Mês, Unidade e Veículo)
    const hierarchicalDates = useMemo(() => {
        if (!routesData?.routes) return [];
        const dates = new Set<string>();
        routesData.routes.forEach((r: any) => {
            const d = String(r.date || '');
            if (!d || d === 'S/D') return;

            // Filtrar pelo mês
            if (selectedMonth !== 'all') {
                let month = '';
                if (d.includes('-')) month = d.split('-')[1];
                else if (d.includes('/')) month = d.split('/')[1];
                if (month !== selectedMonth) return;
            }
            // Filtrar pela unidade
            if (selectedUnit !== 'all' && r.unidade !== selectedUnit) return;
            // Filtrar pelo veículo
            if (selectedVehicle !== 'all' && r.vehicle !== selectedVehicle) return;

            dates.add(d);
        });

        const list = Array.from(dates).sort();
        // Se houver datas passadas via prop, intersecciona (Segurança)
        if (availableDates && availableDates.length > 0) {
            return list.filter(d => availableDates.includes(d));
        }
        return list;
    }, [routesData, selectedMonth, selectedUnit, selectedVehicle, availableDates]);

    // Ordenar estatísticas (Premium Logic)
    const sortedStats = useMemo(() => {
        return [...routeStats].sort((a, b) => {
            if (activeTab === 'placa') return a.vehicle.localeCompare(b.vehicle);
            if (activeTab === 'peso') return b.weight - a.weight;
            if (activeTab === 'pts') return b.points - a.points;
            if (activeTab === 'prox') return a.dist_to_depot - b.dist_to_depot;
            return b.utilizacao - a.utilizacao;
        });
    }, [routeStats, activeTab]);

    return (
        <div className={`route-map-container ${isFullScreen ? 'fullscreen' : ''}`} style={{ position: isFullScreen ? 'static' : 'relative', width: '100%' }}>
            <style>{`
                .route-map-container {
                    height: 700px;
                    overflow: hidden;
                    position: relative;
                }
                .route-map-container.fullscreen {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 999999 !important;
                    background: white;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .map-toolbar {
                    position: absolute;
                    top: 15px;
                    left: 15px;
                    z-index: 2000;
                    background: rgba(255, 255, 255, 0.98);
                    padding: 6px 12px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    backdrop-filter: blur(8px);
                    max-width: calc(100% - 70px);
                }
                .map-sidebar {
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    width: 310px;
                    z-index: 1500;
                    background: rgba(255, 255, 255, 0.98);
                    box-shadow: -4px 0 15px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
                    pointer-events: auto;
                    border-left: 1px solid #e2e8f0;
                }
                .map-sidebar.hidden {
                    transform: translateX(100%) !important;
                    opacity: 0;
                    pointer-events: none;
                }

                @media (max-width: 768px) {
                    .route-map-container {
                        height: 60vh;
                    }
                    .route-map-container.fullscreen {
                        height: 100vh;
                    }
                    .map-toolbar {
                        left: 5px;
                        right: 5px;
                        top: 5px;
                        max-width: none;
                        overflow-x: auto;
                        padding: 6px;
                        gap: 4px;
                        justify-content: flex-start;
                        white-space: nowrap;
                    }
                    .map-sidebar {
                        width: 280px;
                        top: 0;
                        bottom: 0;
                        right: 0;
                        left: auto;
                        height: 100%;
                    }
                    .map-sidebar.hidden {
                        transform: translateX(100%) !important;
                    }
                    .leaflet-bottom.leaflet-left {
                        bottom: 20px !important;
                    }
                }
            `}</style>

            {/* Toolbar Principal Premium - Ajustada para a Esquerda */}
            <div className="map-toolbar">
                <div style={{ display: 'flex', gap: '3px', paddingRight: '8px', borderRight: '1px solid #e2e8f0' }}>
                    <button title="Centralizar" onClick={recenterMap} style={{ background: '#3b82f6', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>🎯</button>
                    <button onClick={() => setShowClusters(!showClusters)} title="Territórios" style={{ background: showClusters ? '#8b5cf6' : '#f1f5f9', border: 'none', color: showClusters ? 'white' : '#64748b', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>📦</button>
                    <button
                        onClick={() => {
                            if (mapType === 'traditional') setMapType('light');
                            else if (mapType === 'light') setMapType('dark');
                            else if (mapType === 'dark') setMapType('satellite');
                            else setMapType('traditional');
                        }}
                        title={`Mapa atual: ${mapType === 'traditional' ? 'Tradicional' : mapType === 'light' ? 'Limpo (Carto)' : mapType === 'dark' ? 'Escuro' : 'Satélite'}`}
                        style={{
                            background: mapType !== 'traditional' ? '#0ea5e9' : '#f1f5f9',
                            border: 'none',
                            color: mapType !== 'traditional' ? 'white' : '#64748b',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        {mapType === 'traditional' ? '🌍' : mapType === 'light' ? '🗺️' : mapType === 'dark' ? '🌙' : '🛰️'}
                    </button>
                    <button onClick={toggleFullScreen} title={isFullScreen ? "Sair da Tela Cheia" : "Tela Cheia"} style={{ background: isFullScreen ? '#ef4444' : '#f1f5f9', border: 'none', color: isFullScreen ? 'white' : '#64748b', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>{isFullScreen ? '↙️' : '↗️'}</button>
                </div>

                <div ref={dateDropdownRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                        style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white',
                            fontSize: '11px', fontWeight: '600', color: '#475569', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: '6px', minWidth: '85px', transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ fontSize: '14px' }}>📅</span> {selectedDates.has('all') ? 'Datas' : `${selectedDates.size} sel.`}
                    </button>
                    {isDateDropdownOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ddd', padding: '10px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '180px', maxHeight: '250px', overflowY: 'auto', zIndex: 3000 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                                <input type="checkbox" checked={selectedDates.has('all')} onChange={() => setSelectedDates(selectedDates.has('all') ? new Set() : new Set(['all']))} /> <b>Todas</b>
                            </label>
                            {hierarchicalDates.map(d => (
                                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
                                    <input type="checkbox" checked={selectedDates.has('all') || selectedDates.has(d)} onChange={() => {
                                        const n = new Set(selectedDates);
                                        if (n.has('all')) {
                                            n.delete('all');
                                            hierarchicalDates.forEach(v => { if (v !== d) n.add(v); });
                                        }
                                        else if (n.has(d)) n.delete(d);
                                        else n.add(d);
                                        setSelectedDates(n);
                                    }} /> {d.split('-').reverse().join('/')}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Filtro de Mês */}
                <select
                    value={selectedMonth}
                    onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        setSelectedUnit('all');
                        setSelectedVehicle('all');
                    }}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: '500', color: '#475569', cursor: 'pointer', outline: 'none', width: '110px' }}
                >
                    <option value="all">📅 Meses</option>
                    {availableMonths.map(m => (
                        <option key={m} value={m}>{['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][parseInt(m) - 1]}</option>
                    ))}
                </select>

                {/* Filtro de Unidade */}
                <select
                    value={selectedUnit}
                    onChange={(e) => {
                        setSelectedUnit(e.target.value);
                        setSelectedVehicle('all'); // Resetar veículo ao mudar unidade
                    }}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: '500', color: '#475569', cursor: 'pointer', outline: 'none', width: '130px' }}
                >
                    <option value="all">🏢 Todas Unidades</option>
                    {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                    ))}
                </select>

                <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: '500', color: '#475569', cursor: 'pointer', outline: 'none', width: '130px' }}
                >
                    <option value="all">🚛 Todos Veículos</option>
                    {availableVehicles.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', color: '#475569', cursor: 'pointer', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    <input
                        type="checkbox"
                        checked={currentFilteredRoutes.length > 0 && currentFilteredRoutes.every((r: any) => visibleRoutes.has(r.id))}
                        onChange={toggleAllRotation}
                        style={{ cursor: 'pointer' }}
                    /> 👁️ Ver Tudo
                </label>

                <div style={{ display: 'flex', gap: '8px', paddingLeft: '10px', borderLeft: '1px solid #e2e8f0' }}>
                    <button onClick={deleteOptimization} disabled={deleting} style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', opacity: deleting ? 0.7 : 1 }}>{deleting ? '...' : 'DELETAR'}</button>
                    <button onClick={exportToExcel} style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>EXCEL</button>
                </div>
            </div>

            {/* Sidebar Premium */}
            <div className={`map-sidebar ${!showSummary ? 'hidden' : ''}`}>
                <div style={{ padding: '15px', borderBottom: '2px solid #22c55e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                    <b style={{ fontSize: '16px' }}>📊 Resumo</b>
                    <button onClick={() => setShowSummary(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                </div>

                {/* Abas de Ordenação */}
                <div style={{ display: 'flex', background: '#f8fafc', padding: '2px' }}>
                    {['resumo', 'placa', 'peso', 'pts', 'prox'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            flex: 1, padding: '8px 2px', border: 'none', background: activeTab === tab ? 'white' : 'transparent',
                            fontSize: '10px', fontWeight: '800', color: activeTab === tab ? '#22c55e' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.2s', borderBottom: activeTab === tab ? '2px solid #22c55e' : 'none',
                            textTransform: 'uppercase'
                        }}>{tab === 'pts' ? 'PONTOS' : tab}</button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {sortedStats.map((s) => (
                        <div key={s.id} style={{
                            marginBottom: '10px', padding: '12px', background: 'white', borderRadius: '6px',
                            borderLeft: `5px solid ${s.color}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            opacity: visibleRoutes.has(s.id) ? 1 : 0.5
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <b style={{ fontSize: '13px' }}>🚛 {s.vehicle}</b>
                                <input type="checkbox" checked={visibleRoutes.has(s.id)} onChange={() => toggleRouteVisibility(s.id)} />
                            </div>

                            {/* Barra de Saturação */}
                            <div style={{ height: '6px', background: '#eee', borderRadius: '3px', marginBottom: '8px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${Math.min(s.utilizacao, 100)}%`, height: '100%',
                                    background: s.utilizacao > 95 ? '#ef4444' : s.utilizacao > 60 ? '#f59e0b' : '#22c55e'
                                }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px', fontSize: '11px', color: '#475569' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ opacity: 0.7 }}>📌</span> <b>{s.points}</b> pts
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ opacity: 0.7 }}>⚖️</span> <b>{s.weight.toFixed(0)}</b> kg
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ opacity: 0.7 }}>🛣️</span> <b>{s.distance > 0 ? s.distance.toFixed(1) : (s.points > 0 ? (s.points * 1.5).toFixed(1) : '0.0')}</b> km
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94a3b8' }}>
                                    <span style={{ opacity: 0.7 }}>📅</span> {s.date.split('-').reverse().join('/')}
                                </div>
                            </div>

                            <select
                                style={{ width: '100%', marginTop: '10px', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #eee' }}
                                value={s.driverId || ''}
                                onChange={(e) => handleAssignDriver(s.id, e.target.value)}
                            >
                                <option value="">Motorista...</option>
                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    ))}
                </div>

                {/* Rodapé de Totais Totais */}
                <div style={{ padding: '15px', background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontSize: '11px', color: '#334155' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                            <span>Frotas:</span> <b style={{ color: '#0f172a' }}>{sortedStats.length}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                            <span>Pontos:</span> <b style={{ color: '#0f172a' }}>{sortedStats.reduce((acc, s) => acc + s.points, 0)}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Peso:</span> <b style={{ color: '#0f172a' }}>{sortedStats.reduce((acc, s) => acc + s.weight, 0).toLocaleString()} kg</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Km Total:</span> <b style={{ color: '#22c55e' }}>{sortedStats.reduce((acc, s) => acc + (s.distance > 0 ? s.distance : (s.points * 1.5)), 0).toFixed(1)} km</b>
                        </div>
                    </div>
                </div>
            </div>

            {!showSummary && (
                <button
                    onClick={() => setShowSummary(true)}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        right: 0,
                        transform: 'translateY(-50%)',
                        zIndex: 100000,
                        background: '#22c55e',
                        color: 'white',
                        border: 'none',
                        padding: '12px 10px',
                        borderRadius: '12px 0 0 12px',
                        fontWeight: '800',
                        boxShadow: '-4px 0 12px rgba(34, 197, 94, 0.4)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        transition: 'all 0.2s'
                    }}
                    className="hover:-translate-x-1"
                >
                    <span style={{ letterSpacing: '0.5px' }}>RESUMO</span>
                    <span style={{ fontSize: '20px' }}>📊</span>
                </button>
            )}

            {/* Mapa preenchendo o fundo */}
            <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#f0f0f0' }} />
        </div>
    );
}

export default function RouteMap(props: RouteMapProps) {
    return (
        <ErrorBoundary>
            <RouteMapContent {...props} />
        </ErrorBoundary>
    );
}
