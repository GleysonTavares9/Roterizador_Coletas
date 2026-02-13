
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { ArrowLeft, CheckCircle, MapPin, Navigation, Truck, XCircle, Package, Scale, Clock, Home, RefreshCw, Phone, PhoneCall, Mic, MicOff, MessageSquare, Send } from 'lucide-react';
import { supabase } from '../../services/supabase';

export default function DriverRouteExecution() {
    const { routeId } = useParams();
    const navigate = useNavigate();
    const [route, setRoute] = useState<any>(null);
    const [points, setPoints] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modals state
    const [kmModalOpen, setKmModalOpen] = useState(false); // Start or End
    const [kmValue, setKmValue] = useState('');
    const [isFinishing, setIsFinishing] = useState(false);

    const [collectModalOpen, setCollectModalOpen] = useState(false);
    const [failModalOpen, setFailModalOpen] = useState(false);
    const [selectedPoint, setSelectedPoint] = useState<any>(null);
    const [collectWeight, setCollectWeight] = useState('');
    const [failReason, setFailReason] = useState('');
    const [chatOpen, setChatOpen] = useState(false);

    // Voice Status
    const [voiceReady, setVoiceReady] = useState(false);

    // --- VOICE CALL LOGIC ---
    const [callStatus, setCallStatus] = useState<'idle' | 'dialing' | 'incoming' | 'connected'>('idle');
    const [callMuted, setCallMuted] = useState(false);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const toneInterval = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);

    const [callDuration, setCallDuration] = useState(0);

    // Call Timer
    useEffect(() => {
        let interval: any;
        if (callStatus === 'connected') {
            interval = setInterval(() => setCallDuration(d => d + 1), 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [callStatus]);




    // Low latency config with multiple STUN servers for better NAT traversal
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };
    const mediaConstraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1, // Mono economiza banda e é padrão para voz
        }
    };

    // WebRTC Signaling - Database Based
    useEffect(() => {
        if (!routeId) return;

        const channel = supabase.channel(`room_${routeId}`)
            // Listen for Calls (Signaling)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `route_id=eq.${routeId}` }, async (payload) => {
//                 console.log('Call Signal:', payload);
                const call = payload.new as any;

                // Incoming Call (Offer) - from base
                if (payload.eventType === 'INSERT' && call.status === 'calling' && call.from_user === 'base') {
//                     console.log('📞 Recebendo chamada da base!');
                    setCallStatus('incoming');
                    (window as any).incomingCallId = call.id;
                    (window as any).pendingOffer = call.offer;
                }

                // Call Accepted (Answer) - If I am the caller (driver initiated)
                if (payload.eventType === 'UPDATE' && call.status === 'answered' && pcRef.current && call.answer) {
                    if (call.from_user !== 'base') { // I (driver) initiated
//                         console.log('Setting Remote Description (Answer from base)');
                        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
                        setCallStatus('connected');
                    }
                }

                // End Call
                if ((payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') && (call.status === 'ended' || call.status === 'rejected')) {
                    endCall(false); // Don't notify as it's already ended
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
//                     console.log("Voice Channel Subscribed");
                    setVoiceReady(true);
                }
            });

        return () => { supabase.removeChannel(channel); endCall(false); }
    }, [routeId]);

    // Auto Call with Voice Ready Check
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get('start_call') === 'true' && callStatus === 'idle' && voiceReady) {
            startCall();
        }
    }, [voiceReady, callStatus]);

    // Call Sounds & Timeouts
    // Call Sounds Management
    useEffect(() => {
        if (callStatus === 'dialing') {
            startRinging();
            const timeout = setTimeout(() => {
                endCall();
                alert("Não foi possível conectar. Tente novamente.");
            }, 60000);
            return () => { clearTimeout(timeout); stopRinging(); }
        } else if (callStatus === 'incoming') {
            startRinging();
            const timeout = setTimeout(() => endCall(), 60000);
            return () => { clearTimeout(timeout); stopRinging(); }
        } else {
            stopRinging();
        }
    }, [callStatus]);

    const startRinging = () => {
        // Se já existe intervalo, não recria para evitar som duplo
        if (toneInterval.current) return;

        const loop = () => {
            try {
                const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
                const ctx = audioCtxRef.current;
                if (!ctx) return;
                if (ctx.state === 'suspended') ctx.resume();
                const gain = ctx.createGain();
                gain.connect(ctx.destination);
                const now = ctx.currentTime;

                // Envelope de volume para evitar cliques e cortes
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.25, now + 0.05); // Fade in rápido
                gain.gain.setValueAtTime(0.25, now + 1.9); // Mantém volume constante
                gain.gain.linearRampToValueAtTime(0, now + 2.0); // Fade out rápido

                // SOM ÚNICO (Tuuu... 440+480Hz) - 2 segundos COMPLETOS
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
            } catch (e) { console.error("Audio error:", e); }
        };

        loop(); // Toca 1ª vez
        toneInterval.current = setInterval(loop, 3000); // Repete a cada 3s
    };

    const stopRinging = () => {
        if (toneInterval.current) {
            clearInterval(toneInterval.current);
            toneInterval.current = null;
        }
    };

    const setupPC = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            localStreamRef.current = stream;
            const pc = new RTCPeerConnection(rtcConfig);
            pcRef.current = pc;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            // Monitor Connection Health
            pc.oniceconnectionstatechange = () => {
//                 console.log("ICE State:", pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    // Optional: Attempt restartIce() here if supported
                    console.warn("ICE Connection unstable or failed.");
                    if (pc.iceConnectionState === 'failed') {
                        setCallStatus('idle'); // Force close visual
                        alert("Conexão de voz falhou. Verifique sua internet.");
                    }
                }
            };

            pc.ontrack = (e) => {
                if (remoteAudioRef.current && e.streams[0]) {
//                     console.log("Remote track received");
                    remoteAudioRef.current.srcObject = e.streams[0];
                }
            };

            return pc;
        } catch (e: any) {
            console.error("Microphone Error:", e);
            alert("Erro ao acessar microfone: " + (e.message || e.name));
            throw e;
        }
    }

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

    const startCall = async () => {
//         console.log("startCall() invoked");
        if (!routeId) {
            console.error("No routeId found");
            alert("Erro: Rota não identificada");
            return;
        }
        try {
            setCallStatus('dialing');
//             console.log("Status set to dialing");
            const pc = await setupPC();
//             console.log("PeerConnection setup complete");

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for ICE candidates to be gathered
            await gatherCandidates(pc);

//             console.log("Sending offer via database...");

            // Get driver ID from route or localStorage
            const driverId = route?.driver_id || localStorage.getItem('driver_id') || 'driver';

            // Create Call Record
            const { data, error } = await supabase.from('calls').insert({
                route_id: routeId,
                from_user: driverId,
                to_user: 'base',
                offer: pc.localDescription, // Includes candidates
                status: 'calling'
            }).select().single();

            if (error) {
                console.error("ERRO AO CRIAR CHAMADA (Provável RLS):", error);
                alert("Erro de permissão no banco! Rode o Script SQL de liberação.");
                setCallStatus('idle');
                return;
            }

            if (data) {
                (window as any).currentCallId = data.id;
//                 console.log("Offer sent successfully ID:", data.id);
            }
        } catch (e) {
            console.error("startCall error:", e);
        }
    }

    const acceptCall = async () => {
        try {
            setCallStatus('connected');
            const pc = await setupPC();
            const offer = (window as any).pendingOffer;
            const callId = (window as any).incomingCallId;

            if (!offer) {
                console.error("No pending offer found to accept.");
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Wait for ICE candidates
            await gatherCandidates(pc);

            // Update Call Record with Answer
            if (callId) {
                await supabase.from('calls').update({
                    answer: pc.localDescription,
                    status: 'answered'
                }).eq('id', callId);
                (window as any).currentCallId = callId;
            }

            setCallStatus('connected');
        } catch (err) {
            console.error(err);
            endCall();
        }
    };

    const endCall = async (notify = true) => {
        setCallStatus('idle');
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }

        // Update DB to end call
        const callId = (window as any).currentCallId || (window as any).incomingCallId;

        if (callId && notify) {
//             console.log('Ending call in DB:', callId);
            await supabase.from('calls').update({ status: 'ended' }).eq('id', callId);
        }

        // Cleanup Globals
        (window as any).currentCallId = null;
        (window as any).incomingCallId = null;
        (window as any).pendingOffer = null;
    };

    const toggleDriverMute = () => {
        if (localStreamRef.current) {
            const newState = !callMuted;
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newState);
            setCallMuted(newState);
        }
    };

    // Format MM:SS for call timer
    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (routeId) fetchRouteData();
    }, [routeId]);

    const fetchRouteData = async () => {
        setLoading(true);
        try {
            // Fetch route and points via secure API
            const response = await fetch(`/api/driver-routes?routeId=${routeId}`);
            if (!response.ok) throw new Error('Falha ao buscar dados da rota');

            const data = await response.json();
            setRoute(data.route);
            setPoints(data.points || []);

        } catch (err) {
            console.error(err);
            alert('Erro ao carregar dados da rota.');
        } finally {
            setLoading(false);
        }
    };

    const handleStartRoute = () => {
        setIsFinishing(false);
        setKmValue('');
        setKmModalOpen(true);
    };

    const handleFinishRoute = () => {
        setIsFinishing(true);
        setKmValue('');
        setKmModalOpen(true);
    };

    const submitKm = async () => {
        if (!kmValue) return;
        setActionLoading(true);
        try {
            const update = isFinishing
                ? { status: 'completed', final_km: parseFloat(kmValue), finished_at: new Date().toISOString() }
                : { status: 'in_progress', initial_km: parseFloat(kmValue), started_at: new Date().toISOString() };

            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-route-status',
                    routeId,
                    data: update
                })
            });

            if (!response.ok) throw new Error('Falha ao atualizar rota');

            setKmModalOpen(false);
            fetchRouteData(); // Refresh
        } catch (err) {
            alert('Erro ao atualizar rota.');
        } finally {
            setActionLoading(false);
        }
    };

    // Point Actions
    const handleStartTripToPoint = async (point: any) => {
        setActionLoading(true);
        try {
            // Update point to en_route via bridge API
            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-point-status',
                    pointId: point.id,
                    data: { status: 'en_route' }
                })
            });

            if (!response.ok) throw new Error('Falha ao iniciar viagem');
            fetchRouteData();
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleArrivedAtPoint = async (point: any) => {
        setActionLoading(true);
        try {
            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-point-status',
                    pointId: point.id,
                    data: { status: 'arrived', visited_at: new Date().toISOString() }
                })
            });

            if (!response.ok) throw new Error('Falha ao registrar chegada');
            fetchRouteData();
        } catch (e) { console.error(e) } finally { setActionLoading(false) }
    };

    const openCollectModal = (point: any) => {
        setSelectedPoint(point);
        setCollectWeight(point.weight?.toString() || '');
        setCollectModalOpen(true);
    };

    const submitCollection = async () => {
        if (!collectWeight) return;
        setActionLoading(true);
        try {
            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-point-status',
                    pointId: selectedPoint.id,
                    data: {
                        status: 'collected',
                        actual_weight: parseFloat(collectWeight)
                    }
                })
            });

            if (!response.ok) throw new Error('Falha ao registrar coleta');
            setCollectModalOpen(false);
            fetchRouteData();
        } catch (e) {
            alert('Erro ao salvar coleta');
        } finally {
            setActionLoading(false);
        }
    };

    const openFailModal = (point: any) => {
        setSelectedPoint(point);
        setFailReason('');
        setFailModalOpen(true);
    };

    const submitFailure = async () => {
        if (!failReason) return;
        setActionLoading(true);
        try {
            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-point-status',
                    pointId: selectedPoint.id,
                    data: {
                        status: 'failed',
                        observation: failReason
                    }
                })
            });

            if (!response.ok) throw new Error('Falha ao registrar falha');
            setFailModalOpen(false);
            fetchRouteData();
        } catch (e) {
            alert('Erro ao registrar falha');
        } finally {
            setActionLoading(false);
        }
    };


    if (loading) return <div className="p-8 text-center">Carregando rota...</div>;

    const isRouteStarted = route?.status === 'in_progress' || route?.status === 'completed';
    const isRouteCompleted = route?.status === 'completed';

    // Find current active point (first pending or in progress)
    const activePointIndex = points.findIndex(p => ['pending', 'en_route', 'arrived'].includes(p.status));
    const activePoint = activePointIndex >= 0 ? points[activePointIndex] : null;

    // Calculate progress
    const completedPoints = points.filter(p => ['collected', 'failed'].includes(p.status)).length;
    const progressPercentage = points.length > 0 ? Math.round((completedPoints / points.length) * 100) : 0;

    // Calculate totals
    const totalWeight = points.reduce((sum, p) => sum + (p.weight || 0), 0);


    // Robust data fetching from route object (matching Monitoring page logic)
    const displayDistance = route?.total_distance ?? route?.total_distance_km ?? 0;

    // Time handling: try total_time, then estimated_duration_min. Assume minutes.
    const rawDuration = route?.total_time ?? route?.estimated_duration_min ?? 0;
    const hours = Math.floor(rawDuration / 60);
    const minutes = rawDuration % 60;

    return (
        <div className="min-h-screen bg-slate-400 flex flex-col items-center justify-center md:py-8 font-sans selection:bg-blue-100">
            {/* SMARTPHONE FRAME CONTAINER */}
            <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[95vh] w-full max-w-[440px] shadow-2xl overflow-hidden">
                {/* Smartphone Speaker/Camera Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-32 bg-gray-800 rounded-b-2xl z-[100] flex items-center justify-center">
                    <div className="w-10 h-1 bg-gray-700 rounded-full"></div>
                </div>

                <div className="flex-1 bg-white flex flex-col h-full w-full relative overflow-x-hidden rounded-[1.5rem]">
                    {/* PREMIUM BLUE HEADER (MATCHING DASHBOARD STYLE) */}
                    <div className="bg-[#0c3773] p-4 md:p-6 text-white sticky top-0 z-50 shadow-lg relative overflow-hidden">
                        <div className="max-w-2xl mx-auto w-full relative">
                            {/* Efeito de fundo sutil */}
                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none hidden md:block">
                                <Truck className="w-48 h-48 -mr-10 -mt-10" />
                            </div>

                            <div className="flex justify-between items-start mb-4 md:mb-6 relative z-10">
                                <div className="flex items-start gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => navigate('/driver/app')} className="text-blue-100 hover:bg-white/10 -ml-2 h-8 w-8 mt-1">
                                        <ArrowLeft className="w-6 h-6" />
                                    </Button>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <Truck className="w-5 h-5 text-blue-200" />
                                            <h1 className="text-2xl font-extrabold tracking-tight leading-none">{route?.vehicle_plate}</h1>
                                        </div>
                                        <div className="text-blue-100 text-[11px] font-medium pl-6">
                                            Motorista: <span className="uppercase font-bold text-white tracking-wide">{route?.driver_name || 'Você'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/20 text-[10px] font-bold uppercase tracking-wider ${voiceReady ? 'text-green-300' : 'text-red-300'}`}>
                                        <div className={`w-2 h-2 rounded-full ${voiceReady ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
                                        {voiceReady ? 'Voz Ativa' : 'Reconectando...'}
                                    </div>
                                    <Badge className={`
                            px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border-0
                            ${isRouteStarted ? 'bg-blue-400 text-white animate-pulse' : 'bg-emerald-500 text-white'}
                        `}>
                                        {isRouteStarted ? 'EM ANDAMENTO' : 'AGUARDANDO'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Container de Estatísticas (Estilo Vidro / Glassmorphism) */}
                            <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/10 p-3 relative z-10">
                                <div className="grid grid-cols-4 gap-0 divide-x divide-white/20 text-center">
                                    {/* Pontos */}
                                    <div className="flex flex-col items-center justify-center px-1">
                                        <div className="flex items-center gap-1 text-[9px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-80">
                                            <MapPin className="w-2.5 h-2.5" /> Pts
                                        </div>
                                        <span className="font-bold text-lg leading-none">
                                            {points.filter(p => p.status === 'collected').length}
                                            <span className="text-xs font-normal text-blue-100/60">/{points.length}</span>
                                        </span>
                                    </div>

                                    {/* Distância */}
                                    <div className="flex flex-col items-center justify-center px-1">
                                        <div className="flex items-center gap-1 text-[9px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-80">
                                            <Navigation className="w-2.5 h-2.5" /> Dist
                                        </div>
                                        <div className="font-bold text-lg leading-none">
                                            {displayDistance.toFixed(1)}<span className="text-[10px] ml-0.5 font-medium text-blue-100/80 uppercase">km</span>
                                        </div>
                                    </div>

                                    {/* Tempo */}
                                    <div className="flex flex-col items-center justify-center px-1">
                                        <div className="flex items-center gap-1 text-[9px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-80">
                                            <Clock className="w-2.5 h-2.5" /> Tempo
                                        </div>
                                        <div className="font-bold text-lg leading-none">
                                            {hours}h{minutes > 0 ? <span className="text-sm">{minutes}</span> : ''}
                                        </div>
                                    </div>

                                    {/* Carga */}
                                    <div className="flex flex-col items-center justify-center px-1">
                                        <div className="flex items-center gap-1 text-[9px] uppercase text-blue-100 font-bold mb-1 tracking-wider opacity-80">
                                            <Scale className="w-2.5 h-2.5" /> Carga
                                        </div>
                                        <div className="font-bold text-lg leading-none">
                                            {totalWeight > 1000 ? (totalWeight / 1000).toFixed(1) : totalWeight.toFixed(0)}
                                            <span className="text-[10px] ml-0.5 font-medium text-blue-100/80 uppercase">{totalWeight > 1000 ? 't' : 'kg'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar Visual (Bottom Edge) */}
                    {isRouteStarted && (
                        <div className="relative h-1.5 bg-slate-200 w-full shrink-0">
                            <div className="w-full h-full relative">
                                <div
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                    style={{ width: `${progressPercentage}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex-1 p-4 w-full space-y-6 pb-40 mt-4 overflow-y-auto">
                        {/* Route Actions */}
                        {!isRouteStarted && (
                            <Card className="border-blue-200 bg-blue-50 shadow-sm">
                                <CardContent className="pt-6 text-center">
                                    <Truck className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                                    <h3 className="font-bold text-lg mb-1 text-blue-900">Pronto para iniciar?</h3>
                                    <p className="text-sm text-blue-600/80 mb-4">Confira os dados acima e inicie a rota.</p>
                                    <Button className="w-full h-12 text-lg bg-[#0c3773] hover:bg-[#162562] shadow-blue-200 shadow-xl" onClick={handleStartRoute}>INICIAR ROTA</Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Points List - Vertical Timeline */}
                        <div className="relative space-y-0 pl-2 mt-6"> {/* increased pl to accommodate larger balls */}
                            {isRouteStarted && points.map((point, index) => {
                                const isActive = activePoint?.id === point.id;
                                const isDone = ['collected', 'failed'].includes(point.status);
                                const isCollected = point.status === 'collected';
                                const isFailed = point.status === 'failed';

                                // Line logic
                                const isLast = index === points.length - 1;
                                const isFirst = index === 0;

                                // Color logic for the line
                                let lineColor = 'bg-slate-200';
                                if (isCollected) lineColor = 'bg-green-500';
                                else if (isFailed) lineColor = 'bg-red-500';

                                return (
                                    <div key={point.id} className="relative flex pb-8 last:pb-0">
                                        {/* Vertical Connecting Line - Centered for w-10 (40px) box */}
                                        {/* Center = 20px. Line width 6px (w-1.5). Left = 20 - 3 = 17px */}
                                        <div className={`absolute left-[17px] top-0 bottom-0 w-1.5 ${lineColor} z-0`} />

                                        {/* Fix for First and Last lines */}
                                        {isFirst && <div className="absolute left-[17px] top-0 h-1/2 w-1.5 bg-slate-100 z-10" />}
                                        {isLast && <div className="absolute left-[17px] bottom-0 h-1/2 w-1.5 bg-slate-100 z-10" />}


                                        <div className="flex items-center gap-5 w-full relative z-10">
                                            {/* Active Point Radar Effect */}
                                            {isActive && (
                                                <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-12 h-12 bg-blue-500/30 rounded-full animate-ping z-0 pointer-events-none"></div>
                                            )}

                                            {/* Sequence Indicator (Left Side) */}
                                            <div className={`
                                        w-10 h-10 rounded-full flex items-center justify-center border-[3px] shrink-0 transition-all relative z-10
                                        ${isCollected ? 'bg-green-500 border-green-600 text-white' : ''}
                                        ${isFailed ? 'bg-red-500 border-red-600 text-white' : ''}
                                        ${isActive ? 'bg-[#0c3773] border-[#162562] text-white shadow-lg scale-110 ring-4 ring-blue-100' : ''}
                                        ${!isDone && !isActive ? 'bg-slate-50 border-slate-300 text-slate-500' : ''}
                                    `}>
                                                <span className="text-base font-extrabold">{index + 1}</span>
                                            </div>

                                            {/* Card */}
                                            <Card className={`
                                        flex-1 overflow-hidden shadow-md border-l-4 transition-all
                                        ${isCollected ? 'border-l-green-500 bg-green-50/30' : ''}
                                        ${isFailed ? 'border-l-red-500 bg-red-50/30' : ''}
                                        ${isActive ? 'border-l-blue-500 ring-1 ring-blue-200' : ''}
                                        ${!isDone && !isActive ? 'border-l-slate-300' : ''}
                                    `}>
                                                <CardHeader className="p-3 bg-gradient-to-r from-white to-slate-50/50 border-b border-slate-100">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <Badge variant={isDone ? "secondary" : "outline"} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                                                            SEQ {point.sequence}
                                                        </Badge>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${point.status === 'collected' ? 'bg-green-100 text-green-700' : point.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {point.status === 'collected' ? 'COLETADO' : point.status === 'failed' ? 'FALHA' : point.status.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="mb-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {/* Operation Type Badge */}
                                                            {point.is_recurring ? (
                                                                <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 h-6">
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                    RECORRENTE
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 h-6">
                                                                    <Package className="w-3 h-3" />
                                                                    ENTREGA
                                                                </div>
                                                            )}

                                                            {/* Client Code (SL...) */}
                                                            <h3 className="text-xl font-extrabold text-slate-900 leading-none truncate">
                                                                {point.client_name || 'Código não inf.'}
                                                            </h3>
                                                        </div>

                                                        {/* Cost Vector Name (Real Client Name) - Below Code */}
                                                        {point.cost_vector_name && (
                                                            <p className="text-sm text-slate-600 font-semibold leading-tight uppercase pl-1">
                                                                {point.cost_vector_name}
                                                            </p>
                                                        )}
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-3 bg-white space-y-2">
                                                    {/* Endereço */}
                                                    <div className="flex items-start gap-2 text-slate-600">
                                                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                                                        <span className="text-xs font-medium leading-relaxed flex-1">{point.address}</span>
                                                    </div>

                                                    {/* Peso */}
                                                    {/* Pesos Grid */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col items-center justify-center">
                                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Peso Programado</div>
                                                            <div className="text-sm font-bold text-slate-900 mt-0.5">{point.weight || 0} <span className="text-[10px] font-normal text-slate-500">kg</span></div>
                                                        </div>

                                                        {(point.status === 'collected' || point.actual_weight) ? (
                                                            <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex flex-col items-center justify-center">
                                                                <div className="text-[9px] font-bold text-green-600 uppercase tracking-wide">Peso Coletado</div>
                                                                <div className="text-sm font-bold text-green-800 mt-0.5">{point.actual_weight || 0} <span className="text-[10px] font-normal text-green-600">kg</span></div>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-slate-50/50 border border-slate-100/50 rounded-lg p-2 flex flex-col items-center justify-center opacity-50">
                                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">A Coletar</div>
                                                                <div className="text-sm font-bold text-slate-300 mt-0.5">--</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>

                                                {/* Actions ONLY for Active Point */}
                                                {isActive && !isRouteCompleted && (
                                                    <CardFooter className="p-4 bg-slate-50 border-t flex flex-col gap-3">
                                                        {point.status === 'pending' && (
                                                            <Button
                                                                className="w-full bg-[#0c3773] hover:bg-[#162562] h-14 text-lg shadow-md transition-transform active:scale-95"
                                                                onClick={() => handleStartTripToPoint(point)}
                                                                disabled={actionLoading}
                                                            >
                                                                <Navigation className="w-5 h-5 mr-2" />
                                                                INICIAR DESLOCAMENTO
                                                            </Button>
                                                        )}

                                                        {point.status === 'en_route' && (
                                                            <div className="w-full space-y-3">
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        className="h-12 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold shadow-sm"
                                                                        onClick={() => {
                                                                            const query = encodeURIComponent(point.address || '');
                                                                            if (query) window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
                                                                        }}
                                                                    >
                                                                        <img
                                                                            src="/assets/google-maps-icon.png"
                                                                            alt="Google Maps"
                                                                            className="w-6 h-6 mr-1.5 object-contain"
                                                                        />
                                                                        <span className="text-xs">Maps</span>
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        className="h-12 border border-cyan-200 bg-cyan-50/50 hover:bg-cyan-100 text-slate-800 font-bold shadow-sm"
                                                                        onClick={() => {
                                                                            const query = encodeURIComponent(point.address || '');
                                                                            if (query) window.open(`https://waze.com/ul?q=${query}&navigate=yes`, '_blank');
                                                                        }}
                                                                    >
                                                                        <img
                                                                            src="/assets/waze-icon.png"
                                                                            alt="Waze"
                                                                            className="w-6 h-6 mr-1.5 object-contain"
                                                                        />
                                                                        <span className="text-xs">Waze</span>
                                                                    </Button>
                                                                </div>

                                                                <Button
                                                                    className="w-full bg-amber-500 hover:bg-amber-600 h-14 text-lg font-black shadow-lg shadow-amber-200 transition-transform active:scale-95 animate-pulse border-b-4 border-amber-700"
                                                                    onClick={() => handleArrivedAtPoint(point)}
                                                                    disabled={actionLoading}
                                                                >
                                                                    <MapPin className="w-6 h-6 mr-2" />
                                                                    CONFIRMAR CHEGADA
                                                                </Button>
                                                            </div>
                                                        )}


                                                        {point.status === 'arrived' && (
                                                            <div className="flex flex-col gap-3 w-full">
                                                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 mb-2">
                                                                    <p className="font-bold">Instruções:</p>
                                                                    <ul className="list-disc ml-4">
                                                                        <li>Verifique a nota fiscal.</li>
                                                                        <li>Confira a carga.</li>
                                                                        <li>Colete a assinatura.</li>
                                                                    </ul>
                                                                </div>
                                                                <div className="grid grid-cols-5 gap-3">
                                                                    <Button className="col-span-4 bg-green-600 hover:bg-green-700 h-14 text-lg shadow-md" onClick={() => openCollectModal(point)}>
                                                                        <CheckCircle className="w-5 h-5 mr-2" />
                                                                        DAR BAIXA
                                                                    </Button>
                                                                    <Button variant="destructive" className="col-span-1 h-14" onClick={() => openFailModal(point)}>
                                                                        <XCircle className="w-6 h-6" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </CardFooter>
                                                )}
                                            </Card>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {isRouteStarted && !activePoint && !isRouteCompleted && (
                            <div className="text-center py-6">
                                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <h3 className="font-bold text-lg">Todos os pontos finalizados!</h3>
                                <Button className="mt-4 w-full h-12" onClick={handleFinishRoute}>
                                    ENCERRAR ROTA & VOLTAR
                                </Button>
                            </div>
                        )}

                        {isRouteCompleted && (
                            <div className="bg-green-100 p-4 rounded-lg text-green-800 text-center border border-green-200">
                                <h3 className="font-bold">Rota Concluída!</h3>
                                <p className="text-sm">KM Final: {route.final_km}</p>
                            </div>
                        )}
                    </div>


                    {/* Modals */}
                    <Dialog open={kmModalOpen} onOpenChange={setKmModalOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{isFinishing ? 'Encerrar Rota' : 'Iniciar Rota'}</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <label className="text-sm font-medium mb-2 block">Informe o Odômetro (KM)</label>
                                <Input type="number" value={kmValue} onChange={e => setKmValue(e.target.value)} placeholder="Ex: 15400" className="text-lg" autoFocus />
                            </div>
                            <DialogFooter>
                                <Button onClick={submitKm} disabled={actionLoading || !kmValue}>Confirmar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={collectModalOpen} onOpenChange={setCollectModalOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Confirmar Coleta</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <label className="text-sm font-medium mb-2 block">Peso Coletado (KG)</label>
                                <Input type="number" value={collectWeight} onChange={e => setCollectWeight(e.target.value)} className="text-lg" />
                            </div>
                            <DialogFooter>
                                <Button onClick={submitCollection} disabled={actionLoading}>Confirmar Coleta</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={failModalOpen} onOpenChange={setFailModalOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Reportar Problema</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <label className="text-sm font-medium mb-2 block">Motivo da não coleta</label>
                                <Textarea value={failReason} onChange={e => setFailReason(e.target.value)} placeholder="Ex: Estabelecimento fechado, Cliente recusou..." rows={3} />
                            </div>
                            <DialogFooter>
                                <Button variant="destructive" onClick={submitFailure} disabled={actionLoading || !failReason}>Registrar Falha</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    {/* Mobile Footer Navigation */}
                    <div className="absolute bottom-0 left-0 right-0 bg-[#0c3773] border-t border-white/10 px-2 py-3 z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.3)]">
                        <div className="w-full flex justify-around items-center pb-2">
                            <Button variant="ghost" className="flex flex-col items-center h-auto py-1 px-0 flex-1 hover:bg-white/10 text-white" onClick={() => navigate(-1)}>
                                <Home className="w-6 h-6 mb-1 opacity-90" />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Voltar</span>
                            </Button>

                            <div className="w-px h-6 bg-white/20"></div>

                            <Button variant="ghost" className="flex flex-col items-center h-auto py-1 px-0 flex-1 hover:bg-white/10 text-white" onClick={() => setChatOpen(true)}>
                                <MessageSquare className="w-6 h-6 mb-1 opacity-90" />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Chat</span>
                            </Button>

                            <div className="w-px h-6 bg-white/20"></div>

                            <Button variant="ghost" className="flex flex-col items-center h-auto py-1 px-0 flex-1 hover:bg-white/10 text-white" onClick={startCall}>
                                <Phone className="w-6 h-6 mb-1 opacity-90" />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Ligar</span>
                            </Button>

                            <div className="w-px h-6 bg-white/20"></div>

                            <Button variant="ghost" className="flex flex-col items-center h-auto py-1 px-0 flex-1 hover:bg-white/10 text-white" onClick={() => window.location.reload()}>
                                <RefreshCw className="w-6 h-6 mb-1 opacity-90" />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Atualizar</span>
                            </Button>
                        </div>
                    </div>
                    {/* --- Voice Call Overlay --- */}
                    <audio ref={remoteAudioRef} autoPlay className="hidden" />

                    {
                        callStatus !== 'idle' && (
                            <div className="absolute inset-0 z-[60] bg-slate-900/95 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                                <div className="w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center mb-6 relative">
                                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-30"></div>
                                    <Phone className="w-12 h-12 text-blue-400" />
                                </div>

                                <h2 className="text-2xl font-bold text-white mb-2">
                                    {callStatus === 'incoming' ? 'Chamada da Base' : callStatus === 'dialing' ? 'Chamando Base...' : 'Em Chamada'}
                                </h2>

                                <p className="text-blue-200 mb-12">
                                    {callStatus === 'incoming' ? 'Recebendo chamada de voz...' : callStatus === 'dialing' ? 'Aguardando atendimento...' :
                                        <span className="text-3xl font-mono font-bold text-white tracking-widest">{formatTime(callDuration)}</span>}
                                </p>

                                <div className="flex gap-8">
                                    {callStatus === 'incoming' ? (
                                        <>
                                            <Button onClick={() => endCall(true)} className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-xl flex items-center justify-center">
                                                <XCircle className="w-8 h-8 text-white" />
                                            </Button>
                                            <Button onClick={acceptCall} className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 shadow-xl flex items-center justify-center animate-bounce">
                                                <PhoneCall className="w-8 h-8 text-white" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button onClick={toggleDriverMute} className={`w-16 h-16 rounded-full ${callMuted ? 'bg-white text-slate-800' : 'bg-slate-700 text-white'} shadow-lg flex items-center justify-center`}>
                                                {callMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                            </Button>
                                            <Button onClick={() => endCall(true)} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg flex items-center justify-center">
                                                <PhoneCall className="w-8 h-8 text-white rotate-[135deg]" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    {/* Driver Chat Component */}
                    {routeId && <DriverChat routeId={routeId} open={chatOpen} onClose={() => setChatOpen(false)} />}
                </div>
            </div>
        </div>
    );
}

function DriverChat({ routeId, open, onClose }: { routeId: string, open: boolean, onClose: () => void }) {
    const [messages, setMessages] = useState<any[]>([]);
    const [text, setText] = useState('');
    const endRef = useRef<any>(null);

    useEffect(() => {
        if (!open) return;

        // Initial fetch via secure API
        fetch(`/api/driver-routes?routeId=${routeId}`)
            .then(res => res.json())
            .then(data => {
                if (data.messages) setMessages(data.messages);
            });

        const ch = supabase.channel('driver_chat_' + routeId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'route_messages', filter: `route_id=eq.${routeId}` }, (p) => {
                setMessages(prev => {
                    if (prev.find(m => m.id === p.new.id)) return prev;
                    return [...prev, p.new];
                });
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); }
    }, [routeId, open]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

    const send = async () => {
        if (!text.trim()) return;
        const msg = text; setText('');

        try {
            const response = await fetch('/api/driver-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send-message',
                    routeId,
                    data: { message: msg }
                })
            });

            if (!response.ok) throw new Error('Erro ao enviar mensagem');
        } catch (error: any) {
            console.error("Erro ao enviar mensagem:", error);
            alert("Erro ao enviar: " + error.message);
        }
    }

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-[70] bg-black/40 flex justify-center items-end md:items-center p-0 md:p-0">
            <div className="bg-white w-full h-full flex flex-col animate-in slide-in-from-bottom duration-300 relative">
                <div className="bg-[#0c3773] p-4 flex items-center gap-3 text-white shadow-lg shrink-0 pt-8 pb-4">
                    <Button variant="ghost" className="text-white -ml-2 p-0 h-auto" onClick={onClose}><ArrowLeft className="w-6 h-6" /></Button>
                    <h2 className="font-bold text-lg">Central de Mensagens</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100 pb-20">
                    {messages.length === 0 && (
                        <div className="text-center text-slate-400 mt-10 p-4">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>Nenhuma mensagem ainda.</p>
                            <p className="text-xs">Fale com a base aqui.</p>
                        </div>
                    )}
                    {messages.map(m => (
                        <div key={m.id} className={`flex ${m.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 px-4 shadow-sm text-sm leading-relaxed max-w-[85%] ${m.sender_type === 'driver' ? 'bg-[#0c3773] text-white rounded-2xl rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-none'}`}>
                                {m.message}
                                <div className={`text-[9px] mt-1 text-right ${m.sender_type === 'driver' ? 'text-blue-200' : 'text-slate-400'}`}>
                                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>
                <div className="p-3 bg-white border-t flex gap-2 shrink-0 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)]">
                    <Input value={text} onChange={e => setText(e.target.value)} placeholder="Digite sua mensagem..." className="flex-1 bg-slate-50 border-slate-200" onKeyDown={e => e.key === 'Enter' && send()} />
                    <Button onClick={send} className="bg-[#0c3773] w-12 shrink-0"><Send className="w-5 h-5" /></Button>
                </div>
            </div>
        </div>
    );
}
