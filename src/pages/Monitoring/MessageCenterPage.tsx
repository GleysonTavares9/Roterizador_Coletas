import { useState, useEffect, useRef } from 'react';
import { Input } from '../../components/ui/input';
import { supabase } from '../../services/supabase';
import { MessageSquare, Search, ArrowLeft, Send, CheckCheck, Check, Clock, Battery, Activity, Wifi, Smartphone, Signal, Plus, Phone, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- Types ---
interface ChatConversation {
    route_id: string;
    driver_id: string;
    driver_name: string;
    driver_photo: string | null;
    driver_phone: string;
    vehicle_plate: string;
    route_date: string;
    last_message: string;
    last_message_time: string;
    last_message_read: boolean; // For Check/CheckCheck status
    unread_count: number;
    sender_type: string;
    status?: 'online' | 'offline';
    last_location_time?: string;
    battery_level?: number;
    is_charging?: boolean;
    speed?: number;
    network_type?: string;
    network_operator?: string;
    device_id?: string;
}

interface ChatMessage {
    id: string;
    message: string;
    created_at: string;
    sender_type: 'driver' | 'base';
    read_by_driver: boolean;
    read_by_admin: boolean;
}

// --- Main Page ---
export default function MessageCenterPage() {
    const navigate = useNavigate();
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [filteredConversations, setFilteredConversations] = useState<ChatConversation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
    const [filterType, setFilterType] = useState<'all' | 'unread'>('all');

    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [availableRoutes, setAvailableRoutes] = useState<any[]>([]); // For New Chat Modal
    const [newChatSearch, setNewChatSearch] = useState(''); // Local search for modal
    // Changing state to track ID only, so 'activeChat' is derived and reactive
    const [activeChatRouteId, setActiveChatRouteId] = useState<string | null>(null);
    const activeChatIdRef = useRef<string | null>(null); // Ref to track active chat in closures

    useEffect(() => { activeChatIdRef.current = activeChatRouteId; }, [activeChatRouteId]);

    const activeChat = conversations.find(c => c.route_id === activeChatRouteId) || null;
    const totalUnread = conversations.reduce((acc, c) => acc + c.unread_count, 0);

    const handleOpenChat = (conv: ChatConversation) => {
        setActiveChatRouteId(conv.route_id);
        // Optimistically clear unread count locally
        setConversations(prev => prev.map(c =>
            c.route_id === conv.route_id ? { ...c, unread_count: 0 } : c
        ));
    };

    const fetchConversations = async () => {
        try {
            // 1. Get Messages
            const { data: messages, error } = await supabase.from('route_messages').select('*').order('created_at', { ascending: false }).limit(1000);
            if (error) throw error;

            if (!messages || messages.length === 0) {
                setLoading(false);
                return;
            }

            const routeIds = Array.from(new Set(messages.map((m: any) => m.route_id)));

            // 2. Get Routes AND Drivers (Joined) - Robust way to get driver data
            if (routeIds.length === 0) {
                setLoading(false);
                return;
            }

            // JOIN drivers to ensure we get the data if RLS allows accessing route's driver
            const { data: routes } = await supabase.from('routes')
                .select('id, vehicle_plate, route_date, driver:drivers(*)')
                .in('id', routeIds);

            const routeMap = new Map((routes || []).map((r: any) => [r.id, r]));

            // 3. Get Drivers IDs for Telemetry
            const driverIds = (routes || [])
                .map((r: any) => r.driver?.id)
                .filter((id: any) => id !== null && id !== undefined);

            const uniqueDriverIds = Array.from(new Set(driverIds));

            // 4. Get Latest Telemetry (Fetch individually to ensure latest data per driver)
            // Parallel Fetch to bypass Global Limit issues
            const telMap = new Map();
            if (uniqueDriverIds.length > 0) {
                const promises = uniqueDriverIds.map(async (dId: any) => {
                    const { data } = await supabase
                        .from('driver_telemetry')
                        .select('*')
                        .eq('driver_id', dId)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    return data?.[0] || null;
                });

                const results = await Promise.all(promises);
                results.forEach((t: any) => {
                    if (t) telMap.set(t.driver_id, t);
                });
            }

            const convMap = new Map<string, ChatConversation>();
            const currentActiveId = activeChatIdRef.current; // Get fresh active ID
            const stoppedRoutes = new Set<string>(); // Track routes where we hit a 'base' reply

            messages.forEach((msg: any) => {
                const rId = msg.route_id;
                if (!convMap.has(rId)) {
                    const route = routeMap.get(rId);
                    // route.driver is the joined object
                    const driver = route?.driver;
                    const tel = driver ? telMap.get(driver.id) : null;

                    convMap.set(rId, {
                        route_id: rId,
                        driver_id: driver?.id || '',
                        driver_name: driver?.name || 'Motorista',
                        driver_photo: driver?.photo_url || null,
                        driver_phone: driver?.phone || '',
                        vehicle_plate: route?.vehicle_plate || '---',
                        route_date: route?.route_date || '',
                        last_message: msg.message,
                        last_message_time: msg.created_at,
                        last_message_read: msg.read_by_driver, // Tracking read status
                        sender_type: msg.sender_type,
                        unread_count: 0,
                        status: 'online',
                        // Prefer created_at as it is the server time of reception
                        last_location_time: tel ? (tel.created_at || tel.timestamp) : null,
                        battery_level: tel?.battery_level,
                        is_charging: tel?.is_charging,
                        speed: tel?.speed ?? tel?.averageSpeed,
                        network_type: tel?.network_type,
                        network_operator: tel?.network_operator,
                        device_id: tel?.device_id
                    });
                }

                // Smart Counting: Only count unread messages that appeared AFTER the last 'base' message.
                // If we encounter a 'base' message, we assume older driver messages are 'answered' or irrelevant for notification.
                if (!stoppedRoutes.has(rId)) {
                    if (msg.sender_type === 'base') {
                        stoppedRoutes.add(rId);
                    } else if (msg.sender_type === 'driver' && !msg.read_by_admin) {
                        // Only increment unread count if strictly not the active chat
                        if (rId !== currentActiveId) {
                            const conv = convMap.get(rId);
                            if (conv) conv.unread_count++;
                        }
                    }
                }
            });
            setConversations(prev => {
                const fresh = Array.from(convMap.values());
                const currentId = activeChatIdRef.current;

                // If active chat exists locally (ghost/new) but not in DB messages yet, keep it.
                if (currentId && !convMap.has(currentId)) {
                    const ghost = prev.find(c => c.route_id === currentId);
                    if (ghost) {
                        return [ghost, ...fresh];
                    }
                }
                return fresh;
            });
            setLoading(false);
        } catch (err) {
            console.error('Critical error in fetchConversations:', err);
            setLoading(false);
        }
    };

    const notificationSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3')); // Som de sino suave (glass ding)

    const playNotificationSound = () => {
        try {
            notificationSound.current.currentTime = 0;
            notificationSound.current.play().catch(() => { });
        } catch (e) {
            console.error('Error playing sound:', e);
        }
    };

    useEffect(() => {
        fetchConversations();
        const channel = supabase.channel('msg_center_hub_v17')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'route_messages' }, (payload) => {
                if (payload.new && payload.new.sender_type === 'driver') {
                    // Tocar som se a mensagem for de um motorista
                    playNotificationSound();
                }
                fetchConversations();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'route_messages' }, () => fetchConversations())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_telemetry' }, () => fetchConversations())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    // Listener para chamadas WebRTC (Base)
    useEffect(() => {
        const callsChannel = supabase.channel('calls_base_global')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'calls',
                filter: `to_user=eq.base`
            }, (payload) => {
                const call = payload.new as any;
                // Chamada recebida do motorista
                if (call.status === 'calling') {
                    //                     console.log('Recebendo chamada:', call);
                    // Salvar no window para acesso global
                    (window as any).incomingCallData = call;
                    (window as any).incomingCallId = call.id;
                    (window as any).pendingOffer = call.offer;

                    // Tocar som de notificação
                    playNotificationSound();

                    // Opcional: Mostrar alerta visual ou abrir modal
                    // Por enquanto vamos confiar que o motorista aparecerá no topo da lista
                    // e o usuário abrirá o chat
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(callsChannel); };
    }, []);

    // BACKUP: Polling para detectar chamadas se o WebSocket falhar
    useEffect(() => {
        const interval = setInterval(async () => {
            // Verifica se já não estamos em uma chamada
            if ((window as any).currentCallId) return;

            const { data } = await supabase
                .from('calls')
                .select('*')
                .eq('to_user', 'base')
                .eq('status', 'calling')
                .gt('created_at', new Date(Date.now() - 30000).toISOString()) // Últimos 30s
                .limit(1);

            if (data && data.length > 0) {
                const call = data[0];
                // Se é uma nova chamada que ainda não detectamos
                if ((window as any).incomingCallId !== call.id) {
                    console.warn('📞 Chamada detectada via POLLING (WebSocket falhou?):', call);
                    (window as any).incomingCallData = call;
                    (window as any).incomingCallId = call.id;
                    (window as any).pendingOffer = call.offer;

                    playNotificationSound();
                }
            }
        }, 2000); // 2 segundos

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let result = conversations;

        if (selectedDate) {
            result = result.filter(c => c.route_date === selectedDate);
        }

        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.driver_name.toLowerCase().includes(lowerQ) ||
                c.vehicle_plate.toLowerCase().includes(lowerQ)
            );
        }
        if (filterType === 'unread') result = result.filter(c => c.unread_count > 0);
        setFilteredConversations(result);
    }, [conversations, searchQuery, filterType, selectedDate]);

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans p-2 md:p-4 gap-4 md:gap-6">
            {/* Sidebar Cards */}
            <div className={`w-full md:w-[480px] bg-white flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'} rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden`}>
                <div className="h-24 flex items-center justify-between px-8 border-b border-slate-50 shrink-0 bg-white/80 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/monitoring')} className="text-slate-400 hover:text-blue-600 transition-colors p-2 hover:bg-slate-50 rounded-full -ml-2">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            <img src="/assets/app-logo.png" alt="Logo" className="h-10 w-10 object-cover rounded-full border border-slate-200 shadow-sm" />
                            {totalUnread > 0 && <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full align-middle animate-pulse">{totalUnread}</span>}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div onClick={() => {
                            setShowNewChatModal(true);
                            // Fetch routes for selected date (or today)
                            const dateToUse = selectedDate || new Date().toLocaleDateString('en-CA');

                            supabase.from('routes')
                                .select('*, driver:drivers(*)')
                                .eq('route_date', dateToUse)
                                .then(({ data }) => {
                                    if (data) setAvailableRoutes(data);
                                });
                        }} className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-900/20 border border-primary/20 cursor-pointer hover:bg-blue-800 transition-all hover:scale-105 active:scale-95">
                            <Plus className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4 shrink-0 bg-white">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar..."
                                className="bg-slate-50 border-slate-200 pl-11 h-12 rounded-2xl text-base focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-auto bg-slate-50 border-slate-200 h-12 rounded-2xl text-sm px-3"
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1.5 rounded-xl">
                        {['all', 'unread'].map(t => (
                            <button
                                key={t}
                                onClick={() => setFilterType(t as any)}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${filterType === t
                                    ? 'bg-primary text-primary-foreground shadow-md'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                            >
                                {t === 'all' ? 'TODAS' : 'NÃO LIDAS'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 space-y-2 custom-scrollbar pb-4">
                    {loading ? (
                        <div className="text-center p-10 text-slate-400 text-sm animate-pulse">Carregando conversas...</div>
                    ) : (
                        filteredConversations.map(conv => (
                            <div
                                key={conv.route_id}
                                onClick={() => handleOpenChat(conv)}
                                className={`group flex items-center p-4 cursor-pointer rounded-2xl transition-all border mb-1 ${activeChat?.route_id === conv.route_id
                                    ? 'bg-primary border-primary shadow-lg ring-1 ring-primary-foreground/20'
                                    : conv.unread_count > 0
                                        ? 'bg-red-100 border-red-200 shadow-md shadow-red-100 hover:bg-red-100' // Alert Style
                                        : 'bg-white border-slate-100 shadow-sm hover:bg-slate-50 hover:border-primary/20 hover:shadow-md'
                                    }`}
                            >
                                <div className="relative shrink-0 mr-4">
                                    <div className={`p-1 rounded-full ${activeChat?.route_id === conv.route_id ? 'bg-white/30 backdrop-blur-sm' :
                                        conv.unread_count > 0 ? 'bg-red-200' : 'bg-primary'
                                        }`}>
                                        {conv.driver_photo ? (
                                            <img src={conv.driver_photo} className="w-14 h-14 rounded-full object-cover border-2 border-white bg-white" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-slate-400 font-bold border-2 border-white text-xl shadow-inner">
                                                {conv.driver_name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    {(conv.last_location_time && (new Date().getTime() - new Date(conv.last_location_time).getTime() < 300000)) && (
                                        <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-sm"></div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 py-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                            <h3 className={`text-base font-bold truncate ${activeChat?.route_id === conv.route_id ? 'text-white' : (conv.unread_count > 0 ? 'text-slate-900 group-hover:text-primary' : 'text-slate-700')}`}>
                                                {conv.driver_name.toLowerCase().replace(/(?:^|\s)\w/g, c => c.toUpperCase())}
                                            </h3>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border shrink-0 ${activeChat?.route_id === conv.route_id ? 'bg-white/20 text-white border-white/20' : 'bg-slate-100/80 text-slate-600 border-slate-200'}`}>{conv.vehicle_plate}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {conv.sender_type === 'base' && (
                                                <span className="flex items-center">
                                                    {conv.last_message_read
                                                        ? <CheckCheck className={`w-4 h-4 ${activeChat?.route_id === conv.route_id ? 'text-blue-200' : 'text-sky-500'}`} />
                                                        : <Check className={`w-4 h-4 ${activeChat?.route_id === conv.route_id ? 'text-blue-300' : 'text-slate-400'}`} />
                                                    }
                                                </span>
                                            )}
                                            <span className={`text-xs font-semibold ${activeChat?.route_id === conv.route_id ? 'text-blue-100' : (conv.unread_count > 0 ? 'text-primary' : 'text-slate-500')}`}>
                                                {new Date(conv.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <p className={`text-base truncate pr-2 flex-1 font-medium ${activeChat?.route_id === conv.route_id ? 'text-blue-100' : (conv.unread_count > 0 ? 'text-primary font-bold' : 'text-primary/70')}`}>
                                            {conv.sender_type === 'base' && <span className={`mr-1.5 font-black text-xs uppercase px-1.5 py-0.5 rounded-full ring-1 ${activeChat?.route_id === conv.route_id ? 'text-white bg-white/20 ring-white/30' : 'text-primary bg-primary/10 ring-primary/20'}`}>Base</span>}{conv.last_message}
                                        </p>
                                        {conv.unread_count > 0 && (
                                            <div className="min-w-[1.5rem] h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold px-1.5 shadow-md shadow-red-200 animate-pulse">
                                                {conv.unread_count}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 bg-[#f8fafc] flex flex-col relative ${activeChat ? 'flex' : 'hidden md:flex'}`}>
                {activeChat ? (
                    <ActiveChatView key={activeChat.route_id} conversation={activeChat} onBack={() => setActiveChatRouteId(null)} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-[2rem] shadow-2xl border border-white/50 overflow-hidden m-0">
                        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg shadow-slate-100 mb-6">
                            <MessageSquare className="w-10 h-10 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-700 mb-2">Central de Mensagens</h2>
                        <p className="text-slate-500 max-w-sm text-center">Selecione uma conversa ao lado para visualizar o histórico e responder em tempo real.</p>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChatModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200 overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-primary text-white">
                            <h2 className="text-xl font-bold tracking-tight">Iniciar Conversa</h2>
                            <button onClick={() => setShowNewChatModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2 bg-slate-50/50">
                            <Input
                                placeholder="Buscar veículo ou motorista..."
                                className="mb-4 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary focus:border-primary"
                                autoFocus
                                value={newChatSearch}
                                onChange={(e) => setNewChatSearch(e.target.value)}
                            />
                            <div className="space-y-2">
                                {availableRoutes.filter(r => {
                                    if (!newChatSearch) return true;
                                    const q = newChatSearch.toLowerCase();
                                    return (r.driver_name?.toLowerCase() || '').includes(q) || (r.vehicle_plate?.toLowerCase() || '').includes(q);
                                }).length === 0 ? (
                                    <p className="text-center text-slate-400 py-4 text-sm">Nenhum veículo encontrado.</p>
                                ) : (
                                    availableRoutes.filter(r => {
                                        if (!newChatSearch) return true;
                                        const q = newChatSearch.toLowerCase();
                                        const dName = r.driver?.name || r.driver_name || '';
                                        const vPlate = r.vehicle_plate || r.driver?.vehicle_plate || '';
                                        return dName.toLowerCase().includes(q) || vPlate.toLowerCase().includes(q);
                                    }).sort((a, b) => {
                                        const aActive = a.status === 'in_progress';
                                        const bActive = b.status === 'in_progress';
                                        return (aActive === bActive) ? 0 : aActive ? -1 : 1;
                                    }).map(route => {
                                        const driverName = route.driver?.name || route.driver_name || 'Motorista sem nome';
                                        const photo = route.driver?.photo_url || route.driver?.photo || null;
                                        const plate = route.vehicle_plate || route.driver?.vehicle_plate || 'Sem Placa';

                                        // Status
                                        const isOnline = route.status === 'in_progress';
                                        const statusColor = isOnline ? 'bg-green-500' :
                                            route.status === 'completed' ? 'bg-blue-500' : 'bg-amber-400';
                                        const statusTitle = isOnline ? 'Em Rota' :
                                            route.status === 'completed' ? 'Finalizado' : 'Pendente';

                                        return (
                                            <button
                                                key={route.id}
                                                onClick={() => {
                                                    // Check if conversation exists
                                                    const exists = conversations.find(c => c.route_id === route.id);
                                                    if (!exists) {
                                                        const newConv: ChatConversation = {
                                                            route_id: route.id,
                                                            driver_id: route.driver?.id || 'unknown',
                                                            driver_name: route.driver?.name || route.driver_name || 'Motorista',
                                                            driver_photo: route.driver?.photo_url || route.driver?.photo || null,
                                                            driver_phone: route.driver?.phone || '',
                                                            vehicle_plate: route.vehicle_plate || route.driver?.vehicle_plate || '',
                                                            route_date: route.route_date || new Date().toLocaleDateString('en-CA'),
                                                            last_message: '',
                                                            last_message_time: new Date().toISOString(),
                                                            last_message_read: true,
                                                            unread_count: 0,
                                                            sender_type: 'base',
                                                            status: isOnline ? 'online' : 'offline'
                                                        };
                                                        setConversations(prev => [newConv, ...prev]);
                                                    }
                                                    setActiveChatRouteId(route.id);
                                                    setShowNewChatModal(false);
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all border text-left group relative bg-white border-slate-100 shadow-sm hover:bg-slate-50 hover:border-primary/20 hover:shadow-md"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-500 font-bold relative">
                                                    {photo ? <img src={photo} className="w-full h-full object-cover" /> : driverName[0]}
                                                </div>
                                                {/* Status Dot */}
                                                <div className={`absolute left-[3.25rem] top-3 w-2.5 h-2.5 rounded-full border border-white ${statusColor}`} title={statusTitle}></div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-800 truncate group-hover:text-primary transition-colors">{toTitleCase(driverName)}</p>
                                                    <p className="text-xs text-slate-500 truncate">{plate} • Rota {route.id.substring(0, 6)}</p>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MessageSquare className="w-4 h-4" />
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper to convert uppercase names to Title Case
function toTitleCase(str: string) {
    if (!str) return '';
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}

function ActiveChatView({ conversation, onBack }: { conversation: ChatConversation, onBack: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [text, setText] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [callStatus, setCallStatus] = useState<'idle' | 'dialing' | 'incoming' | 'connected' | 'ended'>('idle');
    const [isMuted, setIsMuted] = useState(false);

    // Audio Refs
    const toneInterval = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);

    // Timeout Ref
    const callTimeoutRef = useRef<any>(null);

    // Log Helper
    const logCallToChat = async (msg: string) => {
        if (!conversation.route_id) return;
        try {
            await supabase.from('route_messages').insert({
                route_id: conversation.route_id,
                sender_type: 'base',
                message: msg
            });
        } catch (e) { console.error(e); }
    };
    const playSound = (_type: 'ringback' | 'ringtone' = 'ringtone') => {
        try {
            const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;


            // Reutiliza o mesmo AudioContext para evitar cortes
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
            }
            const ctx = audioCtxRef.current;
            if (!ctx) return;

            // Resume se estiver suspenso
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const gain = ctx.createGain();
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            // Envelope de volume para evitar cliques e cortes
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.25, now + 0.05); // Fade in rápido
            gain.gain.setValueAtTime(0.25, now + 1.9); // Mantém volume constante
            gain.gain.linearRampToValueAtTime(0, now + 2.0); // Fade out rápido

            // SOM UNIFICADO: Tuuu... (440+480Hz) - 2 segundos COMPLETOS
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.value = 440;
            osc2.frequency.value = 480;
            osc1.connect(gain);
            osc2.connect(gain);

            // Inicia imediatamente e toca por 2 segundos completos
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 2.0);
            osc2.stop(now + 2.0);
        } catch (e) { console.error(e); }
    }

    // Manage Call Sounds based on status
    useEffect(() => {
        if (toneInterval.current) clearInterval(toneInterval.current);

        if (callStatus === 'dialing') {
            playSound('ringback');
            toneInterval.current = setInterval(() => playSound('ringback'), 3000); // 2s som + 1s pausa
        } else if (callStatus === 'incoming') {
            // playSound('ringtone'); // Disabled to avoid double ringtone with Global Handler
            // toneInterval.current = setInterval(() => playSound('ringtone'), 3000); 
        } else {
            // Connected or Idle -> Parar sons
            if (toneInterval.current) clearInterval(toneInterval.current);
        }

        return () => { if (toneInterval.current) clearInterval(toneInterval.current); };
    }, [callStatus]);

    // Watchdog & Listener de Resposta (ANSWER)
    useEffect(() => {
        let interval: any;

        // Se estamos discando (outgoing), precisamos escutar o 'answered'
        if (callStatus === 'dialing') {
            interval = setInterval(async () => {
                const id = (window as any).currentCallId;
                if (id) {
                    const { data } = await supabase.from('calls').select('*').eq('id', id).single();
                    if (data) {
                        if (data.status === 'answered' && data.answer) {
                            //                             console.log("✅ Chamada atendida pelo motorista!");
                            // Conectar SDP
                            if (pcRef.current && pcRef.current.signalingState !== 'stable') {
                                await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                                setCallStatus('connected');
                                logCallToChat("📞 Chamada Conectada");
                                // Clear timeout
                                if (callTimeoutRef.current) {
                                    clearTimeout(callTimeoutRef.current);
                                    callTimeoutRef.current = null;
                                }
                            }
                        } else if (data.status === 'rejected' || data.status === 'ended') {
                            setCallStatus('idle');
                        }
                    }
                }
            }, 1000);
        }
        // Se estamos recebendo (incoming)
        else if (callStatus === 'incoming') {
            interval = setInterval(async () => {
                const id = (window as any).incomingCallId;
                if (id) {
                    const { data, error } = await supabase.from('calls').select('status').eq('id', id).single();
                    if (data && data.status !== 'calling') {
                        //                         console.log("Watchdog: Call status changed remotely:", data.status);
                        setCallStatus('idle');
                    }
                    if (error || !data) {
                        // Call might be deleted?
                        setCallStatus('idle');
                    }
                }
            }, 1000); // Check every 1s
        }
        return () => clearInterval(interval);
    }, [callStatus]);

    // WebRTC Refs
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);



    // Configuração WebRTC
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // Helper to gather candidates (Vanilla ICE-ish)
    const gatherCandidates = (pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> => {
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
                return;
            }
            const check = () => {
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                }
            }
            pc.addEventListener('icegatheringstatechange', check);
            setTimeout(() => {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }, timeoutMs);
        });
    };

    const endCall = async (notify = true) => {
        // Clear timeout
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        setCallStatus('idle');

        // Update DB to end call
        // Use a local variable to capture the ID before we potentially lose context, although window global persists.
        const callId = (window as any).currentCallId || (window as any).incomingCallId;

        if (callId && notify) {
            //             console.log('Ending call in DB:', callId);
            await supabase.from('calls').update({ status: 'ended' }).eq('id', callId);
            if (conversation.route_id) {
                // Log simplificado
                // Idealmente calcular duracao, mas chamamos logs especificos em outros lugares
                // Aqui pode ser generico se nao vier de timeout
            }
        }

        // Cleanup Globals
        (window as any).currentCallId = null;
        (window as any).incomingCallId = null;
        (window as any).pendingOffer = null;
    };

    const startCall = async () => {
        try {
            setCallStatus('dialing');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            localStreamRef.current = stream;

            const pc = new RTCPeerConnection(rtcConfig);
            pcRef.current = pc;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                if (remoteAudioRef.current && event.streams[0]) {
                    remoteAudioRef.current.srcObject = event.streams[0];
                    remoteAudioRef.current.play().catch(console.error);
                    setCallStatus('connected');
                }
            };

            // Legacy Trickle listeners - redundant if using Vanilla, but kept for robustness
            pc.onicecandidate = (_event) => { /* Gathered internally */ };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for some candidates to be gathered for simpler DB signaling
            await gatherCandidates(pc);

            // Create Call Record
            const { data } = await supabase.from('calls').insert({
                route_id: conversation.route_id,
                from_user: 'base',
                to_user: conversation.driver_id,
                offer: pc.localDescription, // Includes candidates
                status: 'calling'
            }).select().single();

            if (data) {
                (window as any).currentCallId = data.id;


                // Timeout 45s para o motorista atender
                callTimeoutRef.current = setTimeout(() => {
                    //                     console.log("⏰ Timeout de chamada outgoing (45s)");
                    logCallToChat("📞 Motorista não atendeu (Timeout)");
                    endCall(true); // Encerra
                }, 45000);
            }

        } catch (err) {
            console.error('Error starting call:', err);
            endCall();
        }
    };

    const acceptCall = async () => {
        try {
            setCallStatus('connected');
            if (toneInterval.current) clearInterval(toneInterval.current);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            localStreamRef.current = stream;

            const pc = new RTCPeerConnection(rtcConfig);
            pcRef.current = pc;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                if (remoteAudioRef.current && event.streams[0]) {
                    remoteAudioRef.current.srcObject = event.streams[0];
                    remoteAudioRef.current.play().catch(console.error);
                }
            };

            const offer = (window as any).pendingOffer;
            const callId = (window as any).incomingCallId;

            if (!offer) {
                console.error("No pending offer found to accept.");
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await gatherCandidates(pc);

            // Update Call Record with Answer
            if (callId) {
                await supabase.from('calls').update({
                    answer: pc.localDescription,
                    status: 'answered'
                }).eq('id', callId);
                (window as any).currentCallId = callId;
            }

        } catch (err) { console.error(err); endCall(); }
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const newMutedState = !isMuted;
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !newMutedState;
            });
            setIsMuted(newMutedState);
        }
    };

    useEffect(() => {
        if (toneInterval.current) clearInterval(toneInterval.current);
        if (callStatus === 'incoming') {
            playSound();
            toneInterval.current = setInterval(() => playSound(), 2000);
            // 45s Timeout for incoming
            const t = setTimeout(() => { if (callStatus === 'incoming') endCall(); }, 45000);
            return () => { clearTimeout(t); if (toneInterval.current) clearInterval(toneInterval.current); }
        }
    }, [callStatus]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            endCall(true).catch(e => console.error(e));
        };
    }, []);

    // WebRTC Signaling - Database Based
    useEffect(() => {
        setMessages([]);
        const fetch = async () => {
            const { data } = await supabase.from('route_messages').select('*').eq('route_id', conversation.route_id).order('created_at', { ascending: true });
            if (data) {
                setMessages(prev => {
                    const temp = prev.filter(m => m.id.startsWith('temp-'));
                    return [...(data as ChatMessage[]), ...temp];
                });
                supabase.from('route_messages').update({ read_by_admin: true }).eq('route_id', conversation.route_id).eq('sender_type', 'driver').eq('read_by_admin', false);
            }
        };
        fetch();

        // Listen for Messages
        const ch = supabase.channel(`room_${conversation.route_id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'route_messages', filter: `route_id=eq.${conversation.route_id}` }, (p) => {
                setMessages(prev => {
                    const realMsg = p.new as ChatMessage;
                    const matchIndex = prev.findIndex(m => m.id.startsWith('temp-') && m.message === realMsg.message);
                    if (matchIndex !== -1) {
                        const newArr = [...prev]; newArr[matchIndex] = realMsg; return newArr;
                    }
                    if (prev.find(m => m.id === realMsg.id)) return prev;
                    return [...prev, realMsg];
                });
                if (p.new.sender_type === 'driver') supabase.from('route_messages').update({ read_by_admin: true }).eq('id', p.new.id);
            })
            // Listen for Calls (Signaling)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `route_id=eq.${conversation.route_id}` }, async (payload) => {
                //                 console.log('Call Signal:', payload);
                const call = payload.new as any;

                // Income Call (Offer)
                if (payload.eventType === 'INSERT' && call.status === 'calling' && call.from_user !== 'base') {
                    setCallStatus('incoming');
                    (window as any).incomingCallId = call.id;
                    (window as any).pendingOffer = call.offer;
                }

                // Call Accepted (Answer) - If I am the caller
                if (payload.eventType === 'UPDATE' && call.status === 'answered' && pcRef.current && call.answer) {
                    if (call.from_user === 'base') { // I initiated
                        //                         console.log('Setting Remote Description (Answer)');
                        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
                        setCallStatus('connected');
                    }
                }

                // Sync: If call is answered elsewhere (Global Handler or other tab)
                if (payload.eventType === 'UPDATE' && call.status === 'answered') {
                    if (!pcRef.current) { // If no local PC, we didn't answer it
                        setCallStatus('idle');
                    }
                }

                // ICE Candidates (Trickle via DB update or separate field?)
                // For simplicity, we assume Vanilla ICE (candidates in SDP) or we'd need a separate table/column
                // If using 'candidate' field in JSONB updates:
                if (payload.eventType === 'UPDATE' && call.candidate) {
                    if (pcRef.current && call.from_user !== 'base') { // Remote candidate
                        await pcRef.current.addIceCandidate(new RTCIceCandidate(call.candidate));
                    }
                }

                // End Call
                if ((payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') && (call.status === 'ended' || call.status === 'rejected')) {
                    endCall(false); // Don't notify as it's already ended
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [conversation.route_id]);





    // Force Audio Playback on Connect
    useEffect(() => {
        if (callStatus === 'connected' && remoteAudioRef.current) {
            //             console.log("Attempting to play remote audio...");
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1.0;
            const playPromise = remoteAudioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Audio playback interrupted/failed:", error);
                    // Show UI hint to unmute if needed?
                });
            }
        }
    }, [callStatus]);

    setTimeout(() => inputRef.current?.focus(), 100);

    useEffect(() => { setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }, [messages]);

    const sendMessage = async () => {
        if (!text.trim()) return;
        const msgContent = text.trim();
        setText('');
        const tempId = 'temp-' + Date.now();
        const optimisticMsg: ChatMessage = { id: tempId, message: msgContent, created_at: new Date().toISOString(), sender_type: 'base', read_by_driver: false, read_by_admin: true };
        setMessages(prev => [...prev, optimisticMsg]);

        const { error } = await supabase.from('route_messages').insert({ route_id: conversation.route_id, message: msgContent, sender_type: 'base' });
        if (error) { console.error('Error sending message:', error); setMessages(prev => prev.filter(m => m.id !== tempId)); }
    };

    const grouped: { date: string; msgs: ChatMessage[] }[] = [];
    messages.forEach(msg => {
        const d = new Date(msg.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
        const last = grouped[grouped.length - 1];
        if (last && last.date === d) last.msgs.push(msg); else grouped.push({ date: d, msgs: [msg] });
    });

    const isMe = (m: ChatMessage) => m.sender_type === 'base';

    // Status Logic
    const lastUpdate = conversation.last_location_time
        ? new Date(conversation.last_location_time).toLocaleTimeString('pt-BR')
        : 'Ag. Atualização';

    const isMoving = (conversation.speed || 0) > 2;
    const hasBattery = conversation.battery_level !== undefined && conversation.battery_level !== null;
    const networkIcon = conversation.network_type === 'WiFi' ? <Wifi className="w-3.5 h-3.5" /> : <Signal className="w-3.5 h-3.5" />;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            endCall(true).catch(e => console.error(e));
        };
    }, []);

    return (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-[2rem] overflow-hidden shadow-2xl border border-white/50 relative">
            {/* Hidden Audio Element for WebRTC */}
            <audio ref={remoteAudioRef} autoPlay className="hidden" />

            {/* Call Overlay */}
            {callStatus !== 'idle' && (
                <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping"></div>
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl relative z-10 bg-slate-800">
                            {conversation.driver_photo ? (
                                <img src={conversation.driver_photo} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold">{conversation.driver_name.charAt(0)}</div>
                            )}
                        </div>
                    </div>

                    <h3 className="text-2xl font-bold mb-2">{toTitleCase(conversation.driver_name)}</h3>
                    <p className="text-blue-200 mb-12 animate-pulse text-lg font-mono">
                        {callStatus === 'dialing' ? 'Chamando...' : callStatus === 'incoming' ? 'Recebendo Chamada...' : callStatus === 'connected' ? 'Em Chamada' : 'Conectando...'}
                    </p>

                    <div className="flex items-center gap-8">
                        {callStatus === 'incoming' ? (
                            <>
                                <button onClick={() => acceptCall()} className="p-6 rounded-full bg-green-500 text-white hover:bg-green-600 shadow-xl hover:scale-105 transition-all border-4 border-slate-900/50 animate-bounce">
                                    <Phone className="w-10 h-10" />
                                </button>
                                <button onClick={() => endCall()} className="p-6 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-xl hover:scale-105 transition-all border-4 border-slate-900/50">
                                    <PhoneOff className="w-10 h-10" />
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => toggleMute()} className={`p-6 rounded-full ${isMuted ? 'bg-white text-slate-900' : 'bg-white/10 text-white'} backdrop-blur-md hover:bg-white/20 transition-all border border-white/10 shadow-lg`}>
                                    {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                                </button>
                                <button onClick={() => endCall()} className="p-6 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-xl hover:scale-105 transition-all border-4 border-slate-900/50">
                                    <PhoneOff className="w-10 h-10" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Functional Header inspired by Monitoring Popover */}
            <div className="bg-primary border-b border-primary/20 flex flex-col px-4 md:px-6 py-4 pb-8 shrink-0 shadow-lg z-20 gap-3 text-white rounded-t-[2rem]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button onClick={onBack} className="md:hidden p-2 rounded-full hover:bg-white/10 -ml-2"><ArrowLeft className="w-6 h-6 text-white" /></button>

                        <div className="relative">
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full p-1 bg-white/10 backdrop-blur-sm border border-white/20 shadow-lg">
                                {conversation.driver_photo ? (
                                    <img src={conversation.driver_photo} className="w-full h-full rounded-full object-cover border-2 border-primary bg-white" />
                                ) : (
                                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center font-bold text-primary text-xl">{conversation.driver_name.charAt(0)}</div>
                                )}
                            </div>
                            <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 md:w-4 md:h-4 border-2 border-primary rounded-full flex items-center justify-center shadow-sm ${isMoving ? 'bg-green-500' : 'bg-amber-500'}`}>
                                {isMoving ? <Activity className="w-2 h-2 text-white" /> : <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50"></div>}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-white tracking-tight">{conversation.driver_name.toLowerCase().replace(/(?:^|\s)\w/g, c => c.toUpperCase())}</h2>
                                <span className="text-xs font-semibold text-blue-100 bg-white/20 px-2 py-0.5 rounded border border-white/20">{conversation.vehicle_plate}</span>
                            </div>

                            {/* Phone Info */}
                            <div className="flex items-center gap-2 text-sm text-blue-200 mt-0.5">
                                <Smartphone className="w-3.5 h-3.5" />
                                <span>{conversation.driver_phone || 'Telefone não informado'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid & Actions */}
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col md:items-end items-start gap-2 w-full md:w-auto mt-2 md:mt-0">
                            <div className="flex flex-wrap justify-start md:justify-end items-center gap-2 md:gap-3 bg-black/20 px-2 md:px-3 py-1.5 rounded-lg border border-white/10 shadow-inner w-full md:w-auto backdrop-blur-md">
                                {/* Time - High Visibility */}
                                <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded shadow-sm border border-white/10">
                                    <Clock className="w-4 h-4 text-blue-200" />
                                    <span className="font-bold text-base text-white tracking-tight">{lastUpdate}</span>
                                </div>

                                <div className="w-px h-4 bg-white/20"></div>

                                {/* Battery */}
                                <div className={`flex items-center gap-1.5 ${hasBattery && conversation.battery_level! < 20 ? 'text-red-300' : 'text-blue-100'}`}>
                                    {conversation.is_charging && <span className="text-yellow-400 animate-pulse text-[10px]">⚡</span>}
                                    {hasBattery ? <Battery className="w-4 h-4" /> : <Battery className="w-4 h-4 text-white/40" />}
                                    <span className="font-bold text-sm">{hasBattery ? `${conversation.battery_level}%` : '--%'}</span>
                                </div>
                                <div className="w-px h-3 bg-white/20"></div>
                                {/* Network */}
                                <div className="flex items-center gap-1.5 text-blue-200">
                                    {networkIcon}
                                    <span className="font-bold text-sm max-w-[80px] truncate" title={conversation.network_operator}>{conversation.network_type === 'WiFi' ? 'WiFi' : (conversation.network_type || 'Dados')}</span>
                                </div>
                                <div className="w-px h-3 bg-white/20"></div>
                                {/* Speed */}
                                <div className="flex items-center gap-1.5 text-blue-200">
                                    <Activity className="w-4 h-4" />
                                    <span className="font-bold text-sm text-white">{Math.round(conversation.speed || 0)} km/h</span>
                                </div>
                            </div>

                            {/* Tech Details Row */}
                            <div className="flex items-center gap-3 text-[10px] text-blue-300 font-medium bg-black/20 px-2 py-1 rounded border border-white/10">
                                {conversation.network_operator && (
                                    <span className="uppercase tracking-tight truncate max-w-[80px]" title={conversation.network_operator}>{conversation.network_operator}</span>
                                )}
                                {conversation.device_id && (
                                    <>
                                        <div className="w-px h-2 bg-white/20"></div>
                                        <span className="font-mono bg-white/10 px-1 rounded text-blue-200 select-text" title={conversation.device_id}>ID: {conversation.device_id}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => startCall()}
                        className="bg-green-500 text-white p-3.5 rounded-2xl hover:bg-green-400 hover:scale-105 transition-all shadow-xl shadow-green-900/20 border-t border-white/20 hidden md:flex items-center justify-center shrink-0"
                        title="Iniciar Chamada"
                    >
                        <Phone className="w-6 h-6 animate-pulse" />
                    </button>
                </div>
            </div>

            {/* Chat Stream */}
            <div className="flex-1 overflow-y-auto p-4 md:px-8 space-y-6 bg-slate-50 rounded-t-[2rem] -mt-6 relative z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                {grouped.map((g, i) => (
                    <div key={i} className="space-y-4">
                        <div className="flex justify-center sticky top-2 z-10">
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-200/90 px-4 py-1.5 rounded-full shadow-sm uppercase tracking-wider backdrop-blur border border-white/50">{g.date}</span>
                        </div>
                        {g.msgs.map(m => {
                            const me = isMe(m);
                            return (
                                <div key={m.id} className={`flex w-full gap-4 ${me ? 'justify-end' : 'justify-start'}`}>
                                    {!me && (
                                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 bg-white self-end mb-1 shadow-sm">
                                            {conversation.driver_photo ? <img src={conversation.driver_photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">{conversation.driver_name[0]}</div>}
                                        </div>
                                    )}
                                    <div className={`relative max-w-[70%] px-5 py-3 text-[16px] shadow-sm leading-relaxed ${me
                                        ? 'bg-primary text-primary-foreground rounded-3xl rounded-br-none shadow-md'
                                        : 'bg-white text-slate-800 border border-slate-200 rounded-3xl rounded-bl-none shadow-slate-200'
                                        }`}>
                                        <p>{m.message}</p>
                                        <div className={`flex justify-end mt-1 text-[11px] font-medium opacity-80 ${me ? 'text-blue-100' : 'text-slate-400'}`}>
                                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            {me && (m.read_by_driver ? <CheckCheck className="w-3.5 h-3.5 ml-1" /> : <Check className="w-3.5 h-3.5 ml-1" />)}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 md:p-5 bg-white border-t border-slate-200 shrink-0">
                <div className="flex items-center gap-3 max-w-4xl mx-auto">
                    <div className="flex-1 bg-slate-100 border border-transparent hover:border-slate-300 rounded-full flex items-center px-6 py-3.5 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all shadow-inner">
                        <Input
                            ref={inputRef}
                            value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            placeholder="Digite sua mensagem para o motorista..."
                            className="bg-transparent border-0 focus-visible:ring-0 p-0 h-auto text-base text-slate-800 placeholder:text-slate-400"
                        />
                    </div>
                    <button onClick={sendMessage} disabled={!text.trim()} className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 hover:shadow-xl shadow-primary/20 disabled:opacity-50 disabled:shadow-none transition-all transform active:scale-95 text-sm font-bold flex items-center gap-2">
                        <Send className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
}
