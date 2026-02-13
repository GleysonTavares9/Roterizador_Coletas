import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { supabase } from '../../services/supabase';
import { Truck, AlertCircle, MapPin, Clock, CheckCircle, XCircle, Loader2, Package, Gauge, Calendar as CalendarIcon, Map as MapIcon, Send, MessageSquare, Headset, ChevronDown, ChevronUp, Trash2, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

function RecenterMap({ position }: { position: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(position);
    }, [position, map]);
    return null;
}

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to force animation on Polyline via DOM manipulation
function AnimatedRouteOverlay({ positions }: { positions: [number, number][] }) {
    const polylineRef = useRef<any>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (polylineRef.current) {
                // Access the underlying SVG Path element created by Leaflet
                const path = polylineRef.current._path;
                if (path) {
                    path.style.strokeDasharray = "20, 40";
                    path.style.animation = "dash-flow-injected 1s linear infinite";
                    path.style.opacity = "0.5";
                    path.style.stroke = "#ffffff";
                    // Important: Ensure animation name matches the injected style
                }
            }
        }, 100); // Small delay to ensure render
        return () => clearTimeout(timer);
    }, [positions]);

    return (
        <Polyline
            ref={polylineRef}
            positions={positions}
            pathOptions={{
                color: '#ffffff',
                weight: 6,
                opacity: 0.5,
                className: 'force-anim' // harmless class
            }}
        />
    );
}

export default function LiveMonitoringPage() {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
    const [routes, setRoutes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPoint, setSelectedPoint] = useState<any>(null);
    const [vehiclesMap, setVehiclesMap] = useState<Record<string, string>>({});

    // Telemetry Map State
    const [isMapOpen, setIsMapOpen] = useState(false);

    // Ref to store last valid position for noise filtering without re-triggering effects
    const lastValidPosition = useRef<[number, number] | null>(null);

    const [activeRouteForMap, setActiveRouteForMap] = useState<any>(null);
    const [driverTrace, setDriverTrace] = useState<[number, number][]>([]);
    const [latestTelemetry, setLatestTelemetry] = useState<any>(null);
    const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
    const [returnGeometry, setReturnGeometry] = useState<[number, number][]>([]);
    const [depotLocation, setDepotLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [followDriver, setFollowDriver] = useState(true); // Controle de seguimento automático (Default: True)

    // Dynamic routing to next point
    const [routeToNextPoint, setRouteToNextPoint] = useState<[number, number][]>([]);
    const [etaToNextPoint, setEtaToNextPoint] = useState<{ distance: string, duration: string } | null>(null);

    // Chat State
    const [isChatVisible, setIsChatVisible] = useState(false);
    const isChatVisibleRef = useRef(isChatVisible); // Ref for subscription closure
    useEffect(() => { isChatVisibleRef.current = isChatVisible; }, [isChatVisible]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const [adminAvatar, setAdminAvatar] = useState<string | null>(null);

    const [unreadCount, setUnreadCount] = useState(0); // For Active Chat
    const [unreadMap, setUnreadMap] = useState<Record<string, number>>({}); // For List View
    const [confirmation, setConfirmation] = useState<{
        open: boolean;
        title: string;
        description: string;
        action: () => Promise<void> | void;
    }>({ open: false, title: '', description: '', action: () => { } });

    // Suggest nearby dates if no routes found
    const [nearbyDates, setNearbyDates] = useState<string[]>([]);

    const checkNearbyRoutes = async (currentDate: string) => {
        try {
            // Safe date parsing from YYYY-MM-DD
            const [y, m, d] = currentDate.split('-').map(Number);
            const date = new Date(y, m - 1, d);

            // Search range: +/- 5 days
            const start = new Date(date); start.setDate(date.getDate() - 5);
            const end = new Date(date); end.setDate(date.getDate() + 5);

            const startStr = start.toISOString().split('T')[0];
            const endStr = end.toISOString().split('T')[0];

            const { data } = await supabase
                .from('routes')
                .select('route_date')
                .gte('route_date', startStr)
                .lte('route_date', endStr)
                .neq('route_date', currentDate)
                .limit(50);

            if (data && data.length > 0) {
                // Filter distinct dates
                const unique = Array.from(new Set(data.map((d: any) => d.route_date))).sort();
                setNearbyDates(unique);
            } else {
                setNearbyDates([]);
            }
        } catch (e) {
            console.error("Error checking nearby routes:", e);
        }
    };

    // Global Message Monitor (List View)
    useEffect(() => {
        const channel = supabase.channel('global_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'route_messages',
                filter: 'sender_type=eq.driver'
            }, (payload) => {
                const rtId = payload.new.route_id;
                // Play sound for ANY new driver message
                playNotificationSound();

                // If we are NOT in the map for this route, update the list counter
                if (!isMapOpen || activeRouteForMap?.id !== rtId) {
                    setUnreadMap(prev => ({ ...prev, [rtId]: (prev[rtId] || 0) + 1 }));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [isMapOpen, activeRouteForMap]);

    const playNotificationSound = () => {
        try {
            // Simple beep/ping base64
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3'); // Bell Sound
            audio.play().catch(() => { });
        } catch (e) { console.error(e); }
    };

    // Clear unread on open
    useEffect(() => {
        if (isChatVisible) setUnreadCount(0);
    }, [isChatVisible]);

    useEffect(() => {
        const loadAdminProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('user_profiles').select('avatar_url').eq('id', user.id).single();
                if (data?.avatar_url) setAdminAvatar(data.avatar_url);
            }
        };
        loadAdminProfile();
    }, []);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isMapOpen]);

    // Sempre resetar o chat para fechado ao abrir o mapa
    useEffect(() => {
        if (isMapOpen) {
            setIsChatVisible(false);
            setIsStatusExpanded(false);
        }
    }, [isMapOpen]);



    useEffect(() => {
        let subscription: any;
        let chatSubscription: any;
        let pointsSubscription: any;

        if (isMapOpen && activeRouteForMap?.driver?.id) {
            const driverId = activeRouteForMap.driver.id;
            const routeId = activeRouteForMap.id;

            setDriverTrace([]);
            setMessages([]);

            const fetchHistory = async () => {
                const oneHourAgo = new Date();
                oneHourAgo.setHours(oneHourAgo.getHours() - 1);
                const { data } = await supabase
                    .from('driver_telemetry')
                    .select('latitude, longitude, timestamp, speed, battery_level, is_charging, network_type, network_operator, device_id, averageSpeed')
                    .eq('driver_id', driverId)
                    .gte('timestamp', oneHourAgo.toISOString())
                    .order('timestamp', { ascending: true })
                    .limit(2500);

                let rawTrace: [number, number][] = [];

                if (data && data.length > 0) {
                    const filteredData = data.filter((p: any, i: number) => {
                        if (i === 0) return true;
                        const prev = data[i - 1];
                        const dist = Math.sqrt(Math.pow(p.latitude - prev.latitude, 2) + Math.pow(p.longitude - prev.longitude, 2));
                        return dist > 0.00015;
                    });
                    rawTrace = filteredData.map((d: any) => [d.latitude, d.longitude] as [number, number]);
                    setDriverTrace(rawTrace);
                    setLatestTelemetry(data[data.length - 1]);
                    lastValidPosition.current = [data[data.length - 1].latitude, data[data.length - 1].longitude];
                    calculateRouteToNextPoint(data[data.length - 1].latitude, data[data.length - 1].longitude, activeRouteForMap);
                } else {
                    const firstPoint = activeRouteForMap.points?.find((p: any) => p.latitude && p.longitude);
                    if (firstPoint && !lastValidPosition.current) {
                        lastValidPosition.current = [firstPoint.latitude, firstPoint.longitude];
                    }
                }

                if (rawTrace.length > 2) {
                    try {
                        const matchedTrace: [number, number][] = [];
                        const CHUNK_SIZE = 80;
                        for (let i = 0; i < rawTrace.length; i += CHUNK_SIZE) {
                            const chunkStart = i > 0 ? i - 1 : i;
                            const chunk = rawTrace.slice(chunkStart, i + CHUNK_SIZE);
                            if (chunk.length < 2) continue;
                            const coordString = chunk.map(p => `${p[1]},${p[0]}`).join(';');
                            try {
                                const response = await fetch(`https://router.project-osrm.org/match/v1/driving/${coordString}?overview=full&geometries=geojson&radiuses=${chunk.map(() => '60').join(';')}`);
                                const resJson = await response.json();
                                if (resJson.code === 'Ok' && resJson.matchings) {
                                    resJson.matchings.forEach((m: any) => {
                                        const coords = m.geometry.coordinates.map((c: any) => [c[1], c[0]]);
                                        matchedTrace.push(...coords);
                                    });
                                } else { matchedTrace.push(...chunk); }
                            } catch (e) { matchedTrace.push(...chunk); }
                            await new Promise(r => setTimeout(r, 100));
                        }
                        if (matchedTrace.length > 0) setDriverTrace(matchedTrace);
                    } catch (err) { console.error("Map matching failure:", err); }
                }
            };
            fetchHistory();

            const fetchChat = async () => {
                const { data } = await supabase.from('route_messages').select('*').eq('route_id', routeId).order('created_at', { ascending: true });
                if (data) setMessages(data);
            };
            fetchChat();

            subscription = supabase.channel(`tracking_${driverId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_telemetry' }, (payload) => {
                if (payload.new.driver_id !== driverId) return;
                const newLat = payload.new.latitude;
                const newLon = payload.new.longitude;
                if (lastValidPosition.current) {
                    const [lastLat, lastLon] = lastValidPosition.current;
                    const dist = Math.sqrt(Math.pow(newLat - lastLat, 2) + Math.pow(newLon - lastLon, 2));
                    if (dist < 0.0001) return;
                }
                lastValidPosition.current = [newLat, newLon];
                setDriverTrace(prev => [...prev, [newLat, newLon]]);
                setLatestTelemetry((prev: any) => ({ ...prev, ...payload.new }));
                const currentRoute = routes.find(r => r.id === activeRouteForMap?.id);
                if (currentRoute) calculateRouteToNextPoint(newLat, newLon, currentRoute);
            }).subscribe();

            chatSubscription = supabase.channel(`chat_${routeId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'route_messages', filter: `route_id=eq.${routeId}` }, (payload) => {
                setMessages(prev => [...prev, payload.new]);
                if (payload.new.sender_type === 'driver') {
                    playNotificationSound();
                    if (!isChatVisibleRef.current) setUnreadCount(prev => prev + 1);
                }
            }).subscribe();

            pointsSubscription = supabase.channel(`points_${routeId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'route_points', filter: `route_id=eq.${routeId}` }, (payload) => {
                setRoutes(prevRoutes => prevRoutes.map(r => {
                    if (r.id === routeId) {
                        const updatedPoints = r.points.map((p: any) => p.id === payload.new.id ? { ...p, ...payload.new } : p);
                        if (lastValidPosition.current) {
                            const [lat, lon] = lastValidPosition.current;
                            calculateRouteToNextPoint(lat, lon, { ...r, points: updatedPoints });
                        }
                        return { ...r, points: updatedPoints };
                    }
                    return r;
                }));
            }).subscribe();
        }

        return () => {
            if (subscription) supabase.removeChannel(subscription);
            if (chatSubscription) supabase.removeChannel(chatSubscription);
            if (pointsSubscription) supabase.removeChannel(pointsSubscription);
        };
    }, [isMapOpen, activeRouteForMap]); // Depend only on Map/Route changes

    const sendMessage = async () => {
        if (!newMessage.trim() || !activeRouteForMap) return;

        const msg = newMessage.trim();
        setNewMessage(''); // Optimistic clear

        const { error } = await supabase.from('route_messages').insert({
            route_id: activeRouteForMap.id,
            sender_type: 'base',
            message: msg
        });

        if (error) {
            console.error('Error sending message:', error);
            // Optionally restore text
        }
    };

    // ... (Keep existing fetchVehicles, fetchMonitoringData, etc) ...

    useEffect(() => {
        const channel = supabase
            .channel('global_routes_changes')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'routes', filter: `route_date=eq.${selectedDate}` },
                async (payload) => {
                    //                     console.log('Global route update:', payload);
                    // Instead of full fetch, we can manually update if we have the driver data
                    // But to be safe and get nested driver data, let's trigger a light refetch or update state
                    setRoutes(prev => prev.map(r => {
                        if (r.id === payload.new.id) {
                            // Merge basic fields, but we might lose the 'driver' object join if we just use payload.new
                            // So we check if driver_id changed
                            if (r.driver_id !== payload.new.driver_id) {
                                fetchMonitoringData(); // Refetch to get joins
                                return r;
                            }
                            return { ...r, ...payload.new };
                        }
                        return r;
                    }));
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedDate]);

    useEffect(() => {
        fetchVehicles();
        fetchMonitoringData();
        const interval = setInterval(fetchMonitoringData, 10000); // Increased interval to 10s since we have realtime
        return () => clearInterval(interval);
    }, [selectedDate]);

    const deleteMessage = (msgId: string) => {
        setConfirmation({
            open: true,
            title: 'Excluir Mensagem',
            description: 'Deseja realmente apagar esta mensagem?',
            action: async () => {
                const { error } = await supabase.from('route_messages').delete().eq('id', msgId);
                if (!error) setMessages(prev => prev.filter(m => m.id !== msgId));
            }
        });
    };

    const clearHistory = () => {
        setConfirmation({
            open: true,
            title: 'Limpar Histórico',
            description: 'Esta ação apagará todas as mensagens desta rota e não pode ser desfeita. Confirmar?',
            action: async () => {
                if (!activeRouteForMap) return;
                const { error } = await supabase.from('route_messages').delete().eq('route_id', activeRouteForMap.id);
                if (!error) setMessages([]);
            }
        });
    };

    const fetchVehicles = async () => {
        const { data } = await supabase.from('vehicles').select('plate, unit_name');
        if (data) {
            const map: Record<string, string> = {};
            data.forEach((v: any) => {
                if (v.plate) map[v.plate] = v.unit_name;
            });
            setVehiclesMap(map);
        }
    }

    const fetchRouteGeometry = async (route: any) => {
        if (!route || !route.points || route.points.length === 0) return;

        const startPoint = depotLocation ? depotLocation : { lat: route.points[0].latitude, lng: route.points[0].longitude };
        const sortedPoints = [...route.points].filter((p: any) => p.latitude && p.longitude).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));

        // 1. Outbound (Depot -> Points)
        const outboundCoords = [
            [startPoint.lng, startPoint.lat],
            ...sortedPoints.map((p: any) => [p.longitude, p.latitude])
        ];

        // OSRM handles limited number of coords.
        const coordString = outboundCoords.map(c => c.join(',')).join(';');

        try {
            // Using alternate OSRM server to avoid rate limits
            const response = await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordString}?overview=full&geometries=geojson`);
            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                const coordinates = data.routes[0].geometry.coordinates;
                const latLngs = coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
                setRouteGeometry(latLngs);
            }
        } catch (error) {
            console.error("Error fetching OSRM outbound:", error);
            // Fallback to straight lines if OSRM fails
            const straightLines = sortedPoints.map((p: any) => [p.latitude, p.longitude] as [number, number]);
            if (depotLocation) straightLines.unshift([depotLocation.lat, depotLocation.lng]);
            setRouteGeometry(straightLines);
        }

        // 2. Return (Last Point -> Depot)
        if (sortedPoints.length > 0 && depotLocation) {
            const lastPoint = sortedPoints[sortedPoints.length - 1];
            const returnCoords = [
                [lastPoint.longitude, lastPoint.latitude],
                [depotLocation.lng, depotLocation.lat]
            ];

            try {
                const returnString = returnCoords.map(c => c.join(',')).join(';');
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${returnString}?overview=full&geometries=geojson`);
                const data = await response.json();
                if (data.code === 'Ok' && data.routes && data.routes[0]) {
                    const coordinates = data.routes[0].geometry.coordinates;
                    setReturnGeometry(coordinates.map((c: any) => [c[1], c[0]] as [number, number]));
                }
            } catch (error) {
                console.error("Error fetching OSRM return:", error);
                setReturnGeometry([
                    [lastPoint.latitude, lastPoint.longitude],
                    [depotLocation.lat, depotLocation.lng]
                ]);
            }
        } else {
            setReturnGeometry([]);
        }
    };

    // NEW: Calculate dynamic route from driver to next point
    const calculateRouteToNextPoint = async (driverLat: number, driverLng: number, route: any) => {
        if (!route || !route.points) return;

        // Find next unfinished point
        const nextPoint = route.points
            .filter((p: any) => p.latitude && p.longitude)
            .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
            .find((p: any) => p.status !== 'collected' && p.status !== 'failed');

        if (!nextPoint) {
            setRouteToNextPoint([]);
            setEtaToNextPoint(null);
            return;
        }

        try {
            const coords = `${driverLng},${driverLat};${nextPoint.longitude},${nextPoint.latitude}`;
            const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
            );
            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                const route = data.routes[0];
                const coordinates = route.geometry.coordinates;
                const latLngs = coordinates.map((c: any) => [c[1], c[0]] as [number, number]);

                setRouteToNextPoint(latLngs);
                setEtaToNextPoint({
                    distance: `${(route.distance / 1000).toFixed(1)} km`,
                    duration: `${Math.round(route.duration / 60)} min`
                });
            }
        } catch (error) {
            console.error('Error calculating route to next point:', error);
            // Fallback to straight line
            setRouteToNextPoint([[driverLat, driverLng], [nextPoint.latitude, nextPoint.longitude]]);
        }
    };


    useEffect(() => {
        if (activeRouteForMap) {
            fetchRouteGeometry(activeRouteForMap);
        } else {
            setRouteGeometry([]);
        }
    }, [activeRouteForMap, depotLocation]);

    const fetchMonitoringData = async () => {
        try {



            // Fetch Depot (assuming single depot for now)
            const { data: depotData } = await supabase.from('depots').select('latitude, longitude').limit(1).single();
            if (depotData) {
                setDepotLocation({ lat: depotData.latitude, lng: depotData.longitude });
            }

            // Calculate next day manually to avoid UTC shifts
            const [yyyy, mm, dd] = selectedDate.split('-').map(Number);
            const dateObj = new Date(yyyy, mm - 1, dd);
            dateObj.setDate(dateObj.getDate() + 1);

            const ny = dateObj.getFullYear();
            const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const nd = String(dateObj.getDate()).padStart(2, '0');
            const nextDateStr = `${ny}-${nm}-${nd}`;

            // Fetch routes with standard driver info
            const { data: routesData, error: routesError } = await supabase
                .from('routes')
                .select(`
                    *,
                    driver:drivers(*),
                    points:route_points(*)
                `)
                // Use range to cover both DATE and TIMESTAMP column types
                .gte('route_date', selectedDate)
                .lt('route_date', nextDateStr)
                .order('vehicle_plate');

            if (routesError) throw routesError;

            // Sort points ensure correct order and calculate progress
            const processedRoutes = (routesData || []).map((route: any) => {
                const sortedPoints = route.points ? [...route.points].sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0)) : [];
                return {
                    ...route,
                    points: sortedPoints,
                    // Calculate progress
                    progress: sortedPoints.length > 0 ? Math.round((sortedPoints.filter((p: any) => p.status === 'collected').length / sortedPoints.length) * 100) : 0
                };
            });

            setRoutes(processedRoutes);

            // Check for nearby dates if empty
            if (processedRoutes.length === 0) {
                checkNearbyRoutes(selectedDate);
            } else {
                setNearbyDates([]);
            }

            if (activeRouteForMap && processedRoutes.find((r: any) => r.id === activeRouteForMap.id)) {
                fetchRouteGeometry(processedRoutes.find((r: any) => r.id === activeRouteForMap.id));
            }

        } catch (error) {
            console.error('Erro ao buscar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    const getPointStatusColor = (status: string, isNext: boolean) => {
        if (isNext) return 'bg-primary border-2 border-primary-foreground shadow-[0_0_15px_rgba(23,37,84,0.5)] scale-125 animate-pulse';

        switch (status) {
            case 'pending': return 'bg-slate-300 border-2 border-white ring-2 ring-slate-200 text-slate-600';
            case 'en_route': return 'bg-blue-500 border-2 border-white ring-2 ring-blue-300 animate-pulse text-white';
            case 'arrived': return 'bg-amber-400 border-2 border-white ring-2 ring-amber-200 text-white';
            case 'collected': return 'bg-emerald-500 border-2 border-white ring-2 ring-emerald-200 shadow-sm text-white';
            case 'failed': return 'bg-red-500 border-2 border-white ring-2 ring-red-200 text-white';
            default: return 'bg-slate-200 border-2 border-white ring-2 ring-slate-100 text-slate-500';
        }
    };

    const getRouteStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm border-0">Finalizado</Badge>;
            case 'in_progress': return <Badge className="bg-white hover:bg-blue-50 text-blue-700 border-0 animate-pulse shadow-sm font-bold">Em Rota</Badge>;
            default: return <Badge variant="outline" className="bg-white/20 hover:bg-white/30 text-white border-white/20 backdrop-blur-md">Aguardando</Badge>;
        }
    };

    const getProgressBarColor = (percentage: number, status: string) => {
        // "No fim a barra ficar toda verde mesmo se tiver ocorrencia"
        if (status === 'completed' || percentage === 100) return 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-[0_0_10px_theme(colors.green.400)]';

        // "abaixo de 50% vermelho, acima de 50% e abaixo de 100% amarelo"
        if (percentage < 50) return 'bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_10px_theme(colors.red.400)]';

        return 'bg-gradient-to-r from-yellow-400 to-amber-500 shadow-[0_0_10px_theme(colors.yellow.400)]';
    };

    // Helper formats
    const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

    const formatDuration = (minutes: number) => {
        if (!minutes) return '--';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h}h ${m}min`;
    };

    const [filterText, setFilterText] = useState('');

    // Filter Routes Logic
    const filteredRoutes = routes.filter(route => {
        if (!filterText) return true;
        const q = filterText.toLowerCase();
        const driverName = (route.driver?.name || "Motorista").toLowerCase();
        const plate = (route.vehicle_plate || "").toLowerCase();
        const unit = (vehiclesMap[route.vehicle_plate] || "").toLowerCase();
        return driverName.includes(q) || plate.includes(q) || unit.includes(q);
    });

    return (
        <div className="space-y-8 p-1">
            <style>{`
                @keyframes dash-flow-injected {
                    0% { stroke-dashoffset: 100; }
                    100% { stroke-dashoffset: 0; }
                }
                .routing-flow-animation-injected {
                    stroke-dasharray: 20, 40 !important;
                    animation: dash-flow-injected 1s linear infinite !important;
                    opacity: 0.5 !important;
                }
            `}</style>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-6">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-800">Monitoramento</h2>
                    <p className="text-slate-500 mt-1">Acompanhamento da operação em tempo real.</p>
                </div>
                <div className="flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
                    {/* Search Input */}
                    <div className="relative w-full md:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-slate-400"><Send className="w-4 h-4 rotate-[-45deg]" /></span>
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl leading-5 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm shadow-sm transition-all"
                            placeholder="Buscar motorista ou placa..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Notifications Badge */}
                        {Object.values(unreadMap).reduce((a, b) => a + b, 0) > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                    className="bg-red-600 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-red-500/30 font-bold flex items-center gap-2 animate-pulse hover:bg-red-700 transition"
                                >
                                    <MessageSquare className="w-5 h-5" />
                                    <span className="hidden md:inline">{Object.values(unreadMap).reduce((a, b) => a + b, 0)} Nova(s)</span>
                                </button>

                                {isNotificationsOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-3 bg-slate-50 border-b border-slate-100 font-bold text-slate-600 text-xs uppercase flex justify-between items-center">
                                            <span>Mensagens não lidas</span>
                                            <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px]">{Object.values(unreadMap).reduce((a, b) => a + b, 0)}</span>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {routes.filter(r => (unreadMap[r.id] || 0) > 0).map(r => (
                                                <div
                                                    key={r.id}
                                                    className="p-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors group"
                                                    onClick={() => {
                                                        setIsNotificationsOpen(false);
                                                        const el = document.getElementById(`route-card-${r.id}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            el.classList.add('ring-4', 'ring-red-400'); // Highlight
                                                            setTimeout(() => el.classList.remove('ring-4', 'ring-red-400'), 2000);
                                                        }
                                                    }}
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                                                        {r.driver?.photo_url ? <img src={r.driver.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-200"><Truck className="w-5 h-5 text-slate-400" /></div>}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-700">{r.driver?.name || 'Motorista'}</p>
                                                        <p className="text-xs text-slate-500 truncate flex items-center gap-1"><Truck className="w-3 h-3" /> {r.vehicle_plate}</p>
                                                    </div>
                                                    <div className="bg-red-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-sm">
                                                        {unreadMap[r.id]}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl shadow-sm border border-slate-200">
                            <CalendarIcon className="w-5 h-5 text-indigo-600" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data da Rota</span>
                                <input
                                    type="date"
                                    className="border-none bg-transparent p-0 text-sm font-semibold text-slate-700 focus:ring-0 outline-none cursor-pointer leading-none"
                                    value={selectedDate}
                                    onChange={(e) => {
                                        setLoading(true);
                                        setSelectedDate(e.target.value);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {loading && routes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-300">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-75"></div>
                        <Loader2 className="relative w-12 h-12 text-primary animate-spin" />
                    </div>
                    <p className="text-slate-500 text-sm font-medium mt-4">Sincronizando operação...</p>
                </div>
            ) : routes.length === 0 ? (
                <Card className="bg-slate-50/50 border-dashed border-2 m-4">
                    <CardContent className="py-16 text-center text-slate-400">
                        <Truck className="w-16 h-16 mx-auto mb-4 opacity-10" />
                        <h3 className="text-lg font-medium text-slate-600">Sem rotas para a data</h3>
                        <p className="text-sm mt-1">Nenhuma rota programada para {selectedDate.split('-').reverse().join('/')}.</p>

                        {nearbyDates.length > 0 && (
                            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100 max-w-md mx-auto animate-in slide-in-from-bottom-2">
                                <p className="text-blue-800 font-medium text-sm mb-3">🔎 Encontramos rotas nestas datas:</p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {nearbyDates.map(date => (
                                        <button
                                            key={date}
                                            onClick={() => {
                                                setLoading(true);
                                                setSelectedDate(date);
                                            }}
                                            className="px-4 py-2 bg-white text-blue-600 text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 hover:text-white transition-all border border-blue-200 hover:shadow-md"
                                        >
                                            {date.split('-').reverse().join('/')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-8">
                    {filteredRoutes.map(route => {
                        const progress = route.points.filter((p: any) => p.status === 'collected').length;
                        const total = route.points.length;
                        const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
                        const unitName = vehiclesMap[route.vehicle_plate] || 'Matriz';

                        // Data fallbacks (try new columns, fallback to legacy)
                        const distance = route.total_distance ?? route.total_distance_km ?? 0;
                        const time = route.total_time ?? 0;
                        const weight = route.total_weight ?? 0;

                        // Logic to find the NEXT point to blink
                        let nextPointId: string | null = null;
                        const pendingPoints = route.points.filter((p: any) =>
                            ['pending', 'en_route', 'arrived'].includes(p.status)
                        );
                        if (pendingPoints.length > 0) nextPointId = pendingPoints[0].id;

                        // Start/End time logic
                        const startTime = route.started_at ? fmtTime(route.started_at) : (route.created_at ? fmtTime(route.created_at) : '07:00');
                        const endTime = route.finished_at ? fmtTime(route.finished_at) : '--:--';

                        return (
                            <Card id={`route-card-${route.id}`} key={route.id} className={`overflow-hidden transition-all duration-300 ${route.status === 'in_progress' ? 'border-2 border-emerald-500 shadow-md transform scale-[1.01]' : 'border border-slate-200 shadow-sm hover:shadow-md'}`}>
                                {/* Premium Blue Header */}
                                <div className="bg-primary p-6 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10">
                                        <Truck className="w-32 h-32 -mr-10 -mt-10" />
                                    </div>

                                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full border-2 border-white shadow-lg flex items-center justify-center overflow-hidden shrink-0">
                                                {route.driver?.photo_url ? (
                                                    <img src={route.driver.photo_url} alt={route.driver?.name || "Motorista"} className="w-full h-full object-cover" />
                                                ) : (
                                                    <Truck className="w-8 h-8 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-2xl font-bold tracking-tight text-white">{route.vehicle_plate}</span>
                                                    {getRouteStatusBadge(route.status)}
                                                </div>
                                                <div className="flex items-center text-blue-100 text-sm gap-2">
                                                    {route.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_theme(colors.green.400)]"></div>}
                                                    Motorista: <span className="text-white font-semibold">{route.driver?.name || 'Não atribuído'}</span>
                                                    {unreadMap[route.id] > 0 && (
                                                        <div className="flex items-center gap-1 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse ml-2 font-bold shadow-lg shadow-red-500/50 border border-red-400">
                                                            <MessageSquare className="w-3 h-3" /> NOVA MENSAGEM
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Main Stats Grid - Blue Theme */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm w-full md:w-auto">
                                            {/* Pontos */}
                                            <div className="flex flex-col items-center px-3 md:border-r border-white/10 last:border-0 hover:bg-white/5 rounded transition-colors">
                                                <span className="text-[10px] uppercase text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> Pontos
                                                </span>
                                                <span className="text-lg font-bold text-white">{total}</span>
                                            </div>
                                            {/* Distância */}
                                            <div className="flex flex-col items-center px-3 md:border-r border-white/10 last:border-0 hover:bg-white/5 rounded transition-colors">
                                                <span className="text-[10px] uppercase text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                                                    <Gauge className="w-3 h-3" /> Distância
                                                </span>
                                                <span className="text-lg font-bold text-white">{Number(distance).toFixed(1)} <span className="text-xs font-normal text-blue-200">km</span></span>
                                            </div>
                                            {/* Tempo */}
                                            <div className="flex flex-col items-center px-3 md:border-r border-white/10 last:border-0 hover:bg-white/5 rounded transition-colors">
                                                <span className="text-[10px] uppercase text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Tempo
                                                </span>
                                                <span className="text-lg font-bold text-white">{formatDuration(time)}</span>
                                            </div>
                                            {/* Carga */}
                                            <div className="flex flex-col items-center px-3 hover:bg-white/5 rounded transition-colors">
                                                <span className="text-[10px] uppercase text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                                                    <Package className="w-3 h-3" /> Carga
                                                </span>
                                                <span className="text-lg font-bold text-white">{Number(weight).toLocaleString('pt-BR')} <span className="text-xs font-normal text-blue-200">kg</span></span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar (Header) */}
                                    <div className="mt-6 flex flex-col gap-2">
                                        <div className="flex justify-between text-xs font-bold text-blue-100 uppercase tracking-wide">
                                            <span>Progresso da Rota</span>
                                            <span>{percentage}% Completo</span>
                                        </div>
                                        <div className="h-3 bg-white/30 rounded-full overflow-hidden border border-white/20 backdrop-blur-sm">
                                            <div
                                                className={`h-full transition-all duration-1000 ease-out relative ${getProgressBarColor(percentage, route.status)}`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Map Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsMapOpen(true);
                                            setActiveRouteForMap(route);
                                            // Clear unread for this route
                                            setUnreadMap(prev => ({ ...prev, [route.id]: 0 }));
                                        }}
                                        className="mt-4 w-full bg-white/20 hover:bg-white/30 text-white text-sm font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 backdrop-blur-sm border border-white/20"
                                    >
                                        <MapIcon className="w-4 h-4" /> LOCALIZAÇÃO EM TEMPO REAL
                                    </button>
                                </div>

                                <CardContent className="pt-10 pb-10 px-0 bg-white border-t border-slate-100 overflow-x-auto">
                                    <div className="flex items-center justify-between min-w-[600px] px-6">

                                        {/* Start Point */}
                                        <div className="flex flex-col items-center gap-1 group relative z-20 flex-shrink-0" title="Início">
                                            <div className="w-8 h-8 rounded-full border-2 border-white ring-2 ring-blue-200 shadow-sm z-10 bg-primary" />
                                            <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] text-center font-medium text-slate-600 bg-white/90 px-2 py-0.5 rounded border border-slate-100 shadow-sm mt-1 whitespace-nowrap">
                                                <div className="text-primary font-bold">{unitName}</div>
                                                <div>{startTime}</div>
                                            </div>
                                        </div>

                                        {/* Points and Connectors */}
                                        {route.points.map((point: any) => {
                                            const shouldBlink = route.status === 'in_progress' && point.id === nextPointId && point.status !== 'en_route' && point.status !== 'arrived';

                                            // Connector Logic
                                            let connectorColor = 'bg-slate-300';
                                            if (point.status === 'collected') connectorColor = 'bg-emerald-500';
                                            else if (point.status === 'failed') connectorColor = 'bg-red-500';
                                            else if (point.status === 'arrived') connectorColor = 'bg-amber-500';
                                            else if (point.status === 'en_route') connectorColor = 'bg-blue-500'; // Or Primary

                                            return (
                                                <div key={point.id} className="contents">
                                                    {/* Connector Line */}
                                                    <div className={`flex-1 h-2 ${connectorColor} border border-slate-300/50 transition-colors duration-500`} />

                                                    {/* Point Dot */}
                                                    <div className="flex flex-col items-center gap-2 group relative z-10 flex-shrink-0">
                                                        <button
                                                            className={`w-8 h-8 rounded-full transition-all shadow-sm ${getPointStatusColor(point.status, shouldBlink)} cursor-pointer hover:scale-125 z-10 flex items-center justify-center text-xs font-bold`}
                                                            title={`${point.sequence}. ${point.client_name}`}
                                                            onClick={() => setSelectedPoint(point)}
                                                        >
                                                            {point.sequence}
                                                        </button>
                                                        {/* Tooltip */}
                                                        <div className="absolute top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/90 text-white text-[10px] p-2 rounded-md whitespace-nowrap z-30 pointer-events-none shadow-xl backdrop-blur-sm -translate-x-1/2 left-1/2 border border-slate-700">
                                                            <div><span className="font-bold mr-1">{point.sequence}.</span> {point.client_name}</div>
                                                            {point.cost_vector_name && <div className="text-blue-300 text-[9px] mt-0.5">{point.cost_vector_name}</div>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Connector to End */}
                                        <div className={`flex-1 h-2 ${route.status === 'completed' ? 'bg-primary' : 'bg-slate-300'} border border-slate-300/50 transition-colors duration-500`} />

                                        {/* End Point */}
                                        <div className="flex flex-col items-center gap-1 relative z-20 flex-shrink-0">
                                            <div className="w-8 h-8 rounded-full border-2 border-white ring-2 ring-blue-200 shadow-sm bg-primary" />
                                            <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] text-center font-medium text-slate-600 bg-white/90 px-2 py-0.5 rounded border border-slate-100 shadow-sm mt-1 whitespace-nowrap">
                                                <div className="text-primary font-bold">{unitName}</div>
                                                <div>{endTime}</div>
                                            </div>
                                        </div>

                                    </div>
                                    {route.points.some((p: any) => p.status === 'failed') && (
                                        <div className="mt-6 bg-red-50 border border-red-100 p-4 rounded-lg flex items-start gap-3 text-sm text-red-800 animate-in fade-in slide-in-from-top-2">
                                            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-600" />
                                            <div>
                                                <span className="font-bold text-red-900 block mb-1">Ocorrências Registradas:</span>
                                                <ul className="grid gap-1">
                                                    {route.points.filter((p: any) => p.status === 'failed').map((p: any) => (
                                                        <li key={p.id} className="flex gap-2">
                                                            <span className="font-mono bg-red-100 px-1 rounded text-red-700 text-xs py-0.5">SEQ {p.sequence}</span>
                                                            <span>{p.observation || 'Sem observação'} — <span className="font-semibold opacity-75">{p.client_name}</span></span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Point Details Modal */}
            <Dialog open={!!selectedPoint} onOpenChange={(open) => !open && setSelectedPoint(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">SEQ {selectedPoint?.sequence}</Badge>
                                {selectedPoint?.client_name}
                            </div>
                            {selectedPoint?.cost_vector_name && (
                                <div className="text-sm text-blue-600 font-semibold">{selectedPoint?.cost_vector_name}</div>
                            )}
                        </DialogTitle>
                        <DialogDescription>Detalhes do ponto de entrega/coleta</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
                            <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div className="text-sm">{selectedPoint?.address}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 border rounded-md">
                                <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Status</div>
                                <div className="font-semibold flex items-center gap-2">
                                    {selectedPoint?.status === 'collected' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                                        selectedPoint?.status === 'failed' ? <XCircle className="w-4 h-4 text-red-600" /> :
                                            selectedPoint?.status === 'en_route' ? <Truck className="w-4 h-4 text-blue-600" /> :
                                                <Clock className="w-4 h-4 text-slate-400" />}
                                    {selectedPoint?.status === 'collected' ? 'Realizado' : selectedPoint?.status.toUpperCase().replace('_', ' ')}
                                </div>
                            </div>
                            <div className="p-3 border rounded-md">
                                <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Peso</div>
                                <div>Est: {selectedPoint?.weight}kg / Real: {selectedPoint?.actual_weight || '-'}kg</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-semibold">Linha do Tempo</div>
                            <div className="text-sm border-l-2 ml-2 pl-4 space-y-3">
                                {selectedPoint?.visited_at && (
                                    <div className="relative">
                                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-yellow-400 border border-white" />
                                        <p className="font-medium text-foreground">Chegada no Local</p>
                                        <p className="text-xs text-muted-foreground">{fmtTime(selectedPoint.visited_at)}</p>
                                    </div>
                                )}
                                {selectedPoint?.completed_at && (
                                    <div className="relative">
                                        <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ${selectedPoint.status === 'failed' ? 'bg-red-500' : 'bg-green-500'}`} />
                                        <p className="font-medium text-foreground">{selectedPoint.status === 'failed' ? 'Falha Registrada' : 'Finalizado'}</p>
                                        <p className="text-xs text-muted-foreground">{fmtTime(selectedPoint.completed_at)}</p>
                                    </div>
                                )}
                                {!selectedPoint?.visited_at && !selectedPoint?.completed_at && (
                                    <p className="text-sm text-muted-foreground italic">Nenhum evento registrado ainda.</p>
                                )}
                            </div>
                        </div>

                        {selectedPoint?.status === 'failed' && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <div className="text-xs text-red-800 font-bold uppercase mb-1">Motivo da Falha</div>
                                <p className="text-sm text-red-700">{selectedPoint?.observation}</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Map Modal */}
            <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
                <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 gap-0 [&>button]:text-white [&>button]:z-[100] [&>button]:top-4 [&>button]:right-4 [&>button]:bg-transparent [&>button]:hover:bg-white/20 [&>button]:w-8 [&>button]:h-8 [&>button]:rounded-full [&>button]:flex [&>button]:items-center [&>button]:justify-center">
                    <DialogHeader className="p-6 border-b bg-primary">
                        <DialogTitle className="flex items-center justify-between gap-3 text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border-2 border-white/30">
                                    {(() => {
                                        const current = routes.find(r => r.id === activeRouteForMap?.id) || activeRouteForMap;
                                        if (current?.driver?.photo_url) {
                                            return <img src={current.driver.photo_url} alt="Motorista" className="w-full h-full object-cover" />;
                                        }
                                        return <Truck className="w-6 h-6 text-white" />;
                                    })()}
                                </div>
                                <div>
                                    <div className="text-xl font-bold">Rastreamento: {activeRouteForMap?.vehicle_plate}</div>
                                    <div className="text-sm text-blue-100 font-normal">
                                        Motorista: {activeRouteForMap?.driver?.name}
                                    </div>
                                </div>
                            </div>

                            {/* Botão de Controle de Seguimento no Cabeçalho */}
                            <button
                                onClick={() => setFollowDriver(!followDriver)}
                                className={`mr-12 px-4 py-2 rounded-lg shadow-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${followDriver
                                    ? 'bg-white text-primary hover:bg-blue-50'
                                    : 'bg-primary/80 text-white hover:bg-primary border-2 border-white/30'
                                    }`}
                                title={followDriver ? 'Clique para navegar livremente' : 'Clique para seguir o motorista'}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    {followDriver ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    )}
                                </svg>
                                {followDriver ? 'Seguindo' : 'Navegação Livre'}
                            </button>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 w-full flex overflow-hidden h-full relative">
                        <div className="flex-1 bg-slate-100 relative h-full">
                            {isMapOpen && activeRouteForMap && (
                                (() => {
                                    // Find the most up-to-date version of the route from the 'routes' state
                                    const currentRoute = routes.find(r => r.id === activeRouteForMap.id) || activeRouteForMap;

                                    return (
                                        <MapContainer
                                            center={driverTrace.length > 0 ? driverTrace[driverTrace.length - 1] : [-15.7975, -47.8919]}
                                            zoom={13}
                                            style={{ height: '100%', width: '100%' }}
                                            zoomControl={false}
                                        >
                                            {/* Seguimento automático (controlado por botão) */}
                                            {followDriver && driverTrace.length > 0 && <RecenterMap position={driverTrace[driverTrace.length - 1]} />}
                                            <TileLayer
                                                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                            />

                                            {/* Driver Trace - Trajeto REAL percorrido (GPS do celular) */}
                                            {driverTrace.length > 0 && (
                                                <>
                                                    {/* Purple Trace - Only when COMPLETED */}
                                                    {currentRoute.status === 'completed' && (
                                                        <Polyline
                                                            positions={driverTrace}
                                                            pathOptions={{
                                                                color: '#9333ea', // Roxo - Trajeto REAL baseado no GPS do celular, só no final
                                                                weight: 5,
                                                                opacity: 0.8,
                                                                lineJoin: 'round',
                                                                lineCap: 'round'
                                                            }}
                                                        />
                                                    )}
                                                    <Marker
                                                        key={`driver-${currentRoute.id}-${latestTelemetry?.timestamp}`}
                                                        position={driverTrace[driverTrace.length - 1]}
                                                        icon={L.divIcon({
                                                            className: 'driver-marker-custom',
                                                            html: `
                                                            <div style="position: relative;">
                                                                <div style="
                                                                    width: 48px; 
                                                                    height: 48px; 
                                                                    border-radius: 50%; 
                                                                    border: 3px solid #2563EB; 
                                                                    background-color: white; 
                                                                    background-image: url('${currentRoute.driver?.photo_url || ''}'); 
                                                                    background-size: cover; 
                                                                    background-position: center;
                                                                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                                                                    display: flex;
                                                                    align-items: center;
                                                                    justify-content: center;
                                                                    overflow: hidden;
                                                                ">
                                                                    ${!currentRoute.driver?.photo_url ? `<span style="font-weight: bold; color: #2563EB; font-size: 18px;">${currentRoute.driver?.name?.charAt(0) || 'M'}</span>` : ''}
                                                                </div>
                                                                <div style="
                                                                    position: absolute; 
                                                                    bottom: -5px; 
                                                                    right: -5px; 
                                                                    background: #2563EB; 
                                                                    color: white; 
                                                                    font-size: 10px; 
                                                                    padding: 2px 4px; 
                                                                    border-radius: 4px; 
                                                                    font-weight: bold;
                                                                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                                                ">
                                                                    ${Math.round(latestTelemetry?.speed || 0)} km/h
                                                                </div>
                                                            </div>
                                                        `,
                                                            iconSize: [48, 48],
                                                            iconAnchor: [24, 24]
                                                        })}
                                                    >
                                                        <Popup className="thought-bubble-popup" closeButton={false} autoPan={false} offset={[0, -45]}>
                                                            <div className="p-4 min-w-[240px]">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <h3 className="font-extrabold text-slate-800 text-base">{currentRoute.vehicle_plate}</h3>
                                                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border shadow-sm ${latestTelemetry?.battery_level <= 20 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                                                        {latestTelemetry?.is_charging && <span className="text-yellow-600 animate-pulse">⚡</span>}
                                                                        <Gauge className="w-3.5 h-3.5" />
                                                                        <span className="text-xs font-bold">{latestTelemetry?.battery_level || 0}%</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm text-slate-600 font-semibold mb-3 flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                                                    {currentRoute.driver?.name}
                                                                </div>

                                                                {/* Grid de Informações - Agora com 3 linhas para incluir Telefone */}
                                                                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-slate-600 mb-3 border-t border-slate-100 pt-3">
                                                                    <div className="col-span-2">
                                                                        <span className="font-bold block text-slate-500 text-[10px] uppercase mb-0.5">Telefone</span>
                                                                        <span className="font-mono text-[13px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 block w-full">
                                                                            {currentRoute.driver?.phone || 'Não informado'}
                                                                        </span>
                                                                    </div>

                                                                    <div>
                                                                        <span className="font-bold block text-slate-500 text-[10px] uppercase">Rede</span>
                                                                        <div className="flex items-center gap-1 font-medium text-blue-700">
                                                                            {latestTelemetry?.network_type === 'WiFi' ? '📶 WiFi' : latestTelemetry?.network_type ? '📡 Dados' : '-'}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-bold block text-slate-500 text-[10px] uppercase">Operadora</span>
                                                                        <span className="font-medium truncate block max-w-[90px]" title={latestTelemetry?.network_operator}>
                                                                            {latestTelemetry?.network_operator || '-'}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-bold block text-slate-500 text-[10px] uppercase">ID Aparelho</span>
                                                                        <span className="truncate block max-w-[90px] font-mono text-[10px] bg-slate-50 px-1 rounded" title={latestTelemetry?.device_id}>
                                                                            {latestTelemetry?.device_id ? latestTelemetry.device_id.substring(0, 8) + '...' : 'N/A'}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-bold block text-slate-500 text-[10px] uppercase">Vel. Média</span>
                                                                        {Math.round(latestTelemetry?.averageSpeed || 0)} km/h
                                                                    </div>
                                                                </div>

                                                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" /> Atualizado
                                                                    </span>
                                                                    <span className="bg-slate-50 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200">{new Date().toLocaleTimeString('pt-BR')}</span>
                                                                </div>
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                </>
                                            )}

                                            {/* Depot Marker - Unidade */}
                                            {depotLocation && (
                                                <Marker
                                                    position={[depotLocation.lat, depotLocation.lng]}
                                                    icon={L.divIcon({
                                                        className: 'custom-depot-icon',
                                                        html: `<div style="background-color: #0f172a; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
                                                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/></svg>
                                                          </div>`,
                                                        iconSize: [40, 40],
                                                        iconAnchor: [20, 20]
                                                    })}
                                                >
                                                    <Popup offset={[0, -20]}>
                                                        <div className="font-bold text-sm">Unidade / Depósito</div>
                                                        <div className="text-xs text-slate-500">Ponto de Partida</div>
                                                    </Popup>
                                                </Marker>
                                            )}

                                            {/* OSRM Route Geometry (Outbound) - Solid Base + Animated Overlay */}
                                            {routeGeometry.length > 0 && (
                                                <>
                                                    {/* Base Solid Blue Line */}
                                                    <Polyline
                                                        positions={routeGeometry}
                                                        key={`osrm-out-base-${routeGeometry.length}`}
                                                        pathOptions={{
                                                            color: '#2563eb', // Vibrant Blue
                                                            weight: 6,
                                                            opacity: 1,
                                                        }}
                                                    />
                                                    {/* Animated Overlay for "Flow" Effect on Solid Line using Custom Component */}
                                                    <AnimatedRouteOverlay positions={routeGeometry} />
                                                </>
                                            )}
                                            {/* OSRM Return Geometry - Dark Green Solid with Flow */}
                                            {returnGeometry.length > 0 && (
                                                <>
                                                    {/* Base Solid Green Line */}
                                                    <Polyline
                                                        positions={returnGeometry}
                                                        key={`osrm-ret-base-${returnGeometry.length}`}
                                                        pathOptions={{
                                                            color: '#166534', // Dark Green
                                                            weight: 6,
                                                            opacity: 1,
                                                        }}
                                                    />
                                                    {/* Animated Overlay for "Flow" Effect */}
                                                    <AnimatedRouteOverlay positions={returnGeometry} />
                                                </>
                                            )}

                                            {/* NEW: Dynamic Route to Next Point - Bright Orange/Red */}
                                            {routeToNextPoint.length > 0 && (
                                                <>
                                                    {/* Base Solid Orange Line */}
                                                    <Polyline
                                                        positions={routeToNextPoint}
                                                        key={`route-to-next-${routeToNextPoint.length}`}
                                                        pathOptions={{
                                                            color: '#ea580c', // Vibrant Orange
                                                            weight: 5,
                                                            opacity: 0.9,
                                                            dashArray: '10, 10', // Dashed for distinction
                                                        }}
                                                    />
                                                    {/* Animated Overlay */}
                                                    <AnimatedRouteOverlay positions={routeToNextPoint} />
                                                </>
                                            )}


                                            {/* Route Points - With Next Point Pulsing Logic */}
                                            {(() => {
                                                const points = currentRoute.points || [];

                                                // Find next pending point (nearest sequence not done)
                                                const nextPending = points
                                                    .filter((p: any) => p.status !== 'collected' && p.status !== 'failed')
                                                    .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))[0];

                                                return points.map((point: any) => {
                                                    if (!point.latitude || !point.longitude) return null;

                                                    const isNext = nextPending && point.id === nextPending.id;

                                                    const getMarkerColor = () => {
                                                        if (point.status === 'collected') return '#10B981';
                                                        if (point.status === 'failed') return '#EF4444';
                                                        if (point.status === 'arrived') return '#F59E0B';
                                                        if (point.status === 'en_route') return '#3B82F6';
                                                        // Next point gets highlighted color if pending
                                                        if (isNext) return '#F97316'; // Orange-500
                                                        return '#94A3B8';
                                                    };

                                                    const bgColor = getMarkerColor();

                                                    // Custom HTML for pulsing effect
                                                    // We use inline styles for animation to ensure it works without external CSS dependencies if possible
                                                    // But using tailwind classes usually works
                                                    const markerHtml = `
                                                        <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                                                            ${isNext ? `
                                                                <div style="
                                                                    position: absolute;
                                                                    width: 100%; height: 100%;
                                                                    border-radius: 50%;
                                                                    background-color: rgba(249, 115, 22, 0.6);
                                                                    animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
                                                                    z-index: 0;
                                                                "></div>
                                                                <style>
                                                                    @keyframes ping {
                                                                        75%, 100% { transform: scale(2); opacity: 0; }
                                                                    }
                                                                </style>
                                                            ` : ''}
                                                            <div style="
                                                                background-color: ${bgColor}; 
                                                                width: 30px; height: 30px; 
                                                                border-radius: 50%; 
                                                                border: 3px solid white; 
                                                                display: flex; align-items: center; justify-content: center; 
                                                                color: white; font-weight: bold; font-size: 12px; 
                                                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                                                                position: relative;
                                                                z-index: 10;
                                                            ">
                                                                ${point.sequence}
                                                            </div>
                                                        </div>
                                                    `;

                                                    const markerIcon = L.divIcon({
                                                        className: 'custom-marker',
                                                        html: markerHtml,
                                                        iconSize: [30, 30],
                                                        iconAnchor: [15, 15]
                                                    });

                                                    return (
                                                        <Marker
                                                            key={point.id}
                                                            position={[point.latitude, point.longitude]}
                                                            icon={markerIcon}
                                                            zIndexOffset={isNext ? 1000 : 0}
                                                        >
                                                            <Popup>
                                                                <div className="p-3 min-w-[200px]">
                                                                    <div className="font-bold text-base mb-2">
                                                                        {isNext && <span className="text-orange-500 mr-1">📍 Próximo:</span>}
                                                                        Ponto #{point.sequence}
                                                                    </div>
                                                                    <div className="text-sm space-y-1">
                                                                        <div><strong>Cliente:</strong> {point.client_name || point.cost_vector_name || 'N/A'}</div>
                                                                        <div className="text-xs text-gray-600">{point.address}</div>
                                                                        <div className="mt-2">
                                                                            <strong>Peso:</strong> {point.weight || 0} kg
                                                                        </div>
                                                                        <div className="mt-2">
                                                                            <Badge className={
                                                                                point.status === 'collected' ? 'bg-green-500' :
                                                                                    point.status === 'failed' ? 'bg-red-500' :
                                                                                        point.status === 'arrived' ? 'bg-yellow-500' :
                                                                                            point.status === 'en_route' ? 'bg-blue-500' :
                                                                                                isNext ? 'bg-orange-500' : 'bg-gray-400'
                                                                            }>
                                                                                {point.status === 'collected' ? 'Coletado' :
                                                                                    point.status === 'failed' ? 'Falha' :
                                                                                        point.status === 'arrived' ? 'No Local' :
                                                                                            point.status === 'en_route' ? 'Em Rota' :
                                                                                                isNext ? 'Próximo' : 'Pendente'}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Popup>
                                                        </Marker>
                                                    );
                                                });
                                            })()}
                                        </MapContainer>
                                    )
                                })()
                            )}



                            {/* Floating Summary Card */}
                            {activeRouteForMap && (
                                (() => {
                                    const currentRoute = routes.find(r => r.id === activeRouteForMap.id) || activeRouteForMap;
                                    const telem = latestTelemetry || { speed: 0, battery_level: 0, stoppedTime: 0, timestamp: new Date().toISOString() };
                                    return (
                                        <div className="absolute top-2 right-0 left-0 mx-auto w-[92%] sm:top-4 sm:left-auto sm:mx-0 sm:right-4 sm:w-[450px] bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-0 z-[1000] border border-blue-100 overflow-hidden font-sans transition-all duration-300">
                                            {/* Header - Driver Info */}
                                            <div className="bg-primary p-3 sm:p-4 text-white relative">
                                                <button
                                                    onClick={() => setIsStatusExpanded(!isStatusExpanded)}
                                                    className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1 hover:bg-white/10 rounded-full transition-colors z-10"
                                                    title={isStatusExpanded ? "Recolher Detalhes" : "Expandir Detalhes"}
                                                >
                                                    {isStatusExpanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                                                </button>

                                                <div className="flex items-center gap-3 sm:gap-4">
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-white/50 shadow-lg overflow-hidden flex-shrink-0 bg-white">
                                                        {currentRoute.driver?.photo_url ? (
                                                            <img src={currentRoute.driver.photo_url} alt="Motorista" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-blue-600 font-bold text-lg sm:text-xl">
                                                                {currentRoute.driver?.name?.charAt(0) || 'M'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0 pr-6 sm:pr-8">
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-bold text-sm sm:text-lg truncate pr-2">{currentRoute.driver?.name || 'Motorista'}</h3>
                                                            <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0">
                                                                {currentRoute.vehicle_plate}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-blue-100 text-[9px] sm:text-xs mt-0.5 flex items-center gap-1.5 sm:gap-2">
                                                            <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {activeRouteForMap.points?.length || 0} Pts</span>
                                                            <span>•</span>
                                                            <span className="truncate">Atu: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* NEW: ETA to Next Point */}
                                                {etaToNextPoint && (
                                                    <div className="mt-2 sm:mt-3 bg-white/10 backdrop-blur-sm rounded-lg p-1.5 sm:p-2 border border-white/20">
                                                        <div className="flex items-center justify-between text-[10px] sm:text-xs">
                                                            <span className="text-blue-100 font-medium flex items-center gap-1">
                                                                <Navigation className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Próximo Ponto
                                                            </span>
                                                            <div className="flex items-center gap-2 sm:gap-3">
                                                                <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold">
                                                                    {etaToNextPoint.distance}
                                                                </span>
                                                                <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold">
                                                                    {etaToNextPoint.duration}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Main Progress Bar - Collapsible */}
                                            <div className={`transition-all duration-300 overflow-hidden ${isStatusExpanded ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                                                <div className="flex justify-between text-xs text-blue-100 mb-1">
                                                    <span>Progresso Geral</span>
                                                    <span className="font-bold text-white">{(() => {
                                                        const total = currentRoute.points?.length || 0;
                                                        const done = currentRoute.points?.filter((p: any) => ['collected', 'failed'].includes(p.status)).length || 0;
                                                        return total > 0 ? Math.round((done / total) * 100) : 0;
                                                    })()}%</span>
                                                </div>
                                                <div className="w-full h-2 bg-blue-900/30 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)] transition-all duration-500"
                                                        style={{
                                                            width: `${(() => {
                                                                const total = currentRoute.points?.length || 0;
                                                                const done = currentRoute.points?.filter((p: any) => ['collected', 'failed'].includes(p.status)).length || 0;
                                                                return total > 0 ? (done / total) * 100 : 0;
                                                            })()}%`
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Detailed Stats Grid - Collapsible */}
                                            <div className={`bg-slate-50 transition-all duration-300 overflow-hidden ${isStatusExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                                <div className="p-4 grid grid-cols-2 gap-4">
                                                    {/* Left Column: Points Status */}
                                                    <div className="space-y-3">
                                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Status das Coletas</div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm text-center">
                                                                <div className="text-xs text-slate-500">Coletados</div>
                                                                <div className="text-lg font-bold text-green-600">
                                                                    {currentRoute.points?.filter((p: any) => p.status === 'collected').length || 0}
                                                                </div>
                                                            </div>
                                                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm text-center">
                                                                <div className="text-xs text-slate-500">Pendentes</div>
                                                                <div className="text-lg font-bold text-slate-600">
                                                                    {(currentRoute.points?.length || 0) - (currentRoute.points?.filter((p: any) => ['collected', 'failed'].includes(p.status)).length || 0)}
                                                                </div>
                                                            </div>
                                                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm text-center">
                                                                <div className="text-xs text-slate-500">Falhas</div>
                                                                <div className="text-lg font-bold text-red-600">
                                                                    {currentRoute.points?.filter((p: any) => p.status === 'failed').length || 0}
                                                                </div>
                                                            </div>
                                                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm text-center">
                                                                <div className="text-xs text-slate-500">Total</div>
                                                                <div className="text-lg font-bold text-primary">
                                                                    {currentRoute.points?.length || 0}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right Column: Weight & Performance */}
                                                    <div className="space-y-3">
                                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Carga & Performance</div>

                                                        <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                                                            <div className="flex justify-between items-end mb-1">
                                                                <span className="text-xs text-slate-500">Peso Coletado</span>
                                                                <span className="text-sm font-bold text-slate-700">
                                                                    {currentRoute.points?.filter((p: any) => p.status === 'collected').reduce((acc: number, p: any) => acc + (Number(p.weight) || 0), 0).toFixed(1)} kg
                                                                </span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                                                                <div className="h-full bg-primary" style={{
                                                                    width: `${(() => {
                                                                        const total = currentRoute.points?.reduce((acc: number, p: any) => acc + (Number(p.weight) || 0), 0) || 1;
                                                                        const current = currentRoute.points?.filter((p: any) => p.status === 'collected').reduce((acc: number, p: any) => acc + (Number(p.weight) || 0), 0) || 0;
                                                                        return Math.min((current / total) * 100, 100);
                                                                    })()}%`
                                                                }} />
                                                            </div>
                                                            <div className="flex justify-between text-[10px] text-slate-400">
                                                                <span>0 kg</span>
                                                                <span>Total: {currentRoute.points?.reduce((acc: number, p: any) => acc + (Number(p.weight) || 0), 0).toFixed(1)} kg</span>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="bg-primary/5 p-2 rounded border border-primary/20 text-center">
                                                                <div className="text-[10px] text-primary uppercase">Velocidade</div>
                                                                <div className="text-base font-bold text-primary">{Math.round(telem.speed || 0)} <span className="text-xs font-normal">km/h</span></div>
                                                            </div>
                                                            <div className={`p-2 rounded border text-center ${telem.stoppedTime > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                                                <div className={`text-[10px] uppercase ${telem.stoppedTime > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Status</div>
                                                                <div className={`text-sm font-bold truncate ${telem.stoppedTime > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
                                                                    {telem.stoppedTime > 0 ? `Parado ${telem.stoppedTime}m` : 'Em Movimento'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                    );
                                })()
                            )}

                            {
                                driverTrace.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-[1000] pointer-events-none">
                                        <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-slate-600 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Aguardando sinal GPS...
                                        </div>
                                    </div>
                                )
                            }

                            {/* Toggle Chat Button */}
                            {/* Toggle Chat Button - Only show when chat is closed */}
                            {!isChatVisible && (
                                <button
                                    onClick={() => setIsChatVisible(true)}
                                    className={`absolute bottom-6 right-6 z-[1000] p-3 rounded-full shadow-xl transition-all border-2 
                                        ${unreadCount > 0
                                            ? 'bg-red-600 border-red-400 text-white animate-pulse shadow-red-500/50 hover:bg-red-700 hover:scale-110'
                                            : 'bg-white border-slate-100 text-primary hover:bg-slate-50 hover:scale-105 active:scale-95'
                                        }`}
                                    title="Abrir Chat"
                                >
                                    <MessageSquare className={`w-6 h-6 ${unreadCount > 0 ? 'text-white' : 'text-primary'}`} />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-100 shadow-sm">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div >

                        {/* Chat Sidebar (Overlay) */}
                        {isChatVisible && (
                            <div className="absolute top-0 right-0 h-full w-full sm:w-[360px] bg-slate-50 border-l border-slate-200 flex flex-col shadow-2xl z-[2000]">
                                <div className="p-4 border-b bg-primary flex items-center justify-between shadow-sm min-w-[360px]">
                                    <div className="flex items-center gap-3">
                                        <MessageSquare className="w-5 h-5 text-white" />
                                        <div>
                                            <h3 className="font-bold text-white">Comunicação</h3>
                                            <p className="text-xs text-blue-100">Canal direto com motorista</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={clearHistory}
                                            className="p-1.5 rounded-full hover:bg-white/10 text-white hover:text-white/80 transition-colors"
                                            title="Limpar Histórico"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setIsChatVisible(false)}
                                            className="p-1.5 rounded-full hover:bg-white/10 text-white hover:text-white/80 transition-colors"
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Messages Area */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50">
                                    {messages.length === 0 ? (
                                        <div className="text-center text-slate-400 text-sm mt-10">
                                            <p>Nenhuma mensagem.</p>
                                            <p className="text-xs mt-1">Inicie a conversa com o motorista.</p>
                                        </div>
                                    ) : (
                                        messages.map((msg) => {
                                            const isMe = msg.sender_type === 'base';
                                            return (
                                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
                                                    {!isMe && (
                                                        <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 flex-shrink-0 bg-white shadow-sm self-end mb-1">
                                                            {activeRouteForMap?.driver?.photo_url ? (
                                                                <img src={activeRouteForMap.driver.photo_url} alt="Dr" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                                    {activeRouteForMap?.driver?.name?.substring(0, 1) || 'D'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                                        <div
                                                            className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm relative group ${isMe
                                                                ? 'bg-primary text-white rounded-br-none'
                                                                : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
                                                                }`}
                                                        >
                                                            {msg.message}
                                                            <div className={`text-[9px] mt-1 opacity-70 ${isMe ? 'text-blue-100 text-right' : 'text-slate-400'}`}>
                                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                            {/* Delete Button */}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                                                                className={`absolute -top-2 ${isMe ? '-left-2' : '-right-2'} bg-red-100 text-red-600 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-200 border border-red-200 cursor-pointer`}
                                                                title="Excluir Mensagem"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                                                            {isMe ? 'Você (Base)' : (activeRouteForMap?.driver?.name?.split(' ')[0] || 'Motorista')}
                                                        </span>
                                                    </div>

                                                    {isMe && (
                                                        <div className="w-8 h-8 rounded-full bg-blue-900 border border-blue-700 flex items-center justify-center shadow-sm flex-shrink-0 text-white self-end mb-1 overflow-hidden">
                                                            {adminAvatar ? (
                                                                <img src={adminAvatar} alt="Admin" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Headset className="w-4 h-4" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Input Area */}
                                <div className="p-3 bg-white border-t border-slate-200">
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                                        className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-full border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all"
                                    >
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent border-none px-4 py-2 text-sm focus:ring-0 outline-none text-slate-700 placeholder:text-slate-400"
                                            placeholder="Digite sua mensagem..."
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newMessage.trim()}
                                            className="p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent >
            </Dialog >
            {/* Confirmation Dialog */}
            <AlertDialog open={confirmation.open} onOpenChange={(open) => setConfirmation(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { confirmation.action(); }}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}


