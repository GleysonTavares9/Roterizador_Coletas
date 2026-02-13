
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';
import { Button } from './ui/button';
// import { Badge } from './ui/badge'; // Removed unused

interface IncomingCall {
    id: string;
    route_id: string;
    offer: any;
    from_user: string;
}

export function GlobalCallHandler() {
    // State
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connected'>('idle');
    const [callerInfo, setCallerInfo] = useState<any>(null); // Driver info
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    // Refs
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const toneInterval = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const ringTimeoutRef = useRef<any>(null); // Ref para timeout de toque

    // Helper to log call events to chat
    const logCallToChat = async (msg: string) => {
        if (!incomingCall?.route_id) return;
        try {
            await supabase.from('route_messages').insert({
                route_id: incomingCall.route_id,
                sender_type: 'base', // Mensagem da Central
                message: msg
            });
        } catch (e) { console.error("Error logging call:", e); }
    };
    useEffect(() => {
        // Only admin receives calls destined to 'base'
        const channel = supabase.channel('global_calls')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'calls',
                filter: "to_user=eq.base"
            }, async (payload) => {
                const call = payload.new as any;
                if (call.status === 'calling') {
//                     console.log("📞 Chamada Recebida:", call);

                    // Verifica se já não estamos em chamada
                    if (callStatus !== 'idle') {
                        // Busy? Reject automatically or queue? For now, ignore or reject.
                        return;
                    }

                    // Fetch Caller Info
                    // Assumindo que call tem route_id
                    if (call.route_id) {
                        const { data: route } = await supabase
                            .from('routes')
                            .select('*, driver:drivers(*), points:route_points(*)')
                            .eq('id', call.route_id)
                            .single();

                        if (route) {
                            const total = route.points?.length || 0;
                            const sorted = route.points?.sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0)) || [];
                            const nextPoint = sorted.find((p: any) => p.status !== 'collected' && p.status !== 'failed');
                            let statusText = "Aguardando Início";
                            let clientName = null;

                            if (nextPoint) {
                                const st = nextPoint.status;
                                const label = st === 'arrived' ? '📍 No Local' : st === 'en_route' ? '🚚 Deslocando' : '🕒 Pendente';
                                statusText = `P${nextPoint.sequence}/${total} ${label}`;
                                clientName = nextPoint.client_name;
                            } else if (total > 0) statusText = "🏁 Finalizado";

                            setCallerInfo({
                                name: route.driver?.name || 'Motorista Desconhecido',
                                plate: route.vehicle_plate,
                                photo_url: route.driver?.photo_url,
                                status: statusText,
                                client: clientName
                            });
                        }
                    }

                    setIncomingCall({
                        id: call.id,
                        route_id: call.route_id,
                        offer: call.offer,
                        from_user: call.from_user
                    });
                    setCallStatus('ringing');
                }
            })
            // Listen for Remote Hangup (UPDATE status=ended/cancelled/rejected)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: "to_user=eq.base"
            }, (payload) => {
                const call = payload.new as any;
                // If this update relates to our current call
                if (incomingCall && call.id === incomingCall.id) {
                    if (call.status === 'ended' || call.status === 'canceled' || call.status === 'rejected') {
//                         console.log(`Call ${call.status} remotely`);
                        cleanupCall();
                    } else if (call.status === 'answered') {
                        // If we are still ringing, someone else answered
                        if (callStatus === 'ringing') {
//                             console.log("Call answered elsewhere");
                            cleanupCall();
                        }
                    }
                }
            })
            // ALSO listen for calls FROM base (outgoing) being rejected
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: "from_user=eq.base"
            }, (payload) => {
                const call = payload.new as any;
                // If driver rejected our outgoing call
                if (call.status === 'rejected' || call.status === 'ended') {
//                     console.log(`Outgoing call ${call.status} by driver`);
                    // If we have an active call with this ID, clean it up
                    if (incomingCall && call.id === incomingCall.id) {
                        cleanupCall();
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [incomingCall, callStatus]);

    // Polling Backup (Robustness) - Check every 15s to be safe on quota
    useEffect(() => {
        const interval = setInterval(async () => {
            if (callStatus !== 'idle' || incomingCall) return;

            try {
                const { data } = await supabase
                    .from('calls')
                    .select('id, route_id, offer, from_user')
                    .eq('to_user', 'base')
                    .eq('status', 'calling')
                    .gt('created_at', new Date(Date.now() - 45000).toISOString()) // Look back 45s
                    .limit(1);

                if (data && data.length > 0) {
                    const call = data[0];
//                     console.log("📞 Polling found call:", call.id);
                    setIncomingCall({
                        id: call.id,
                        route_id: call.route_id,
                        offer: call.offer,
                        from_user: call.from_user
                    });
                    setCallStatus('ringing');

                    // Fetch extended info (Simplified)
                    if (call.route_id) {
                        supabase.from('routes').select('*, driver:drivers(*), points:route_points(*)').eq('id', call.route_id).single()
                            .then(({ data: route }) => {
                                if (route) {
                                    const nextPoint = route.points?.sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
                                        .find((p: any) => p.status !== 'collected' && p.status !== 'failed');
                                    let statusText = nextPoint ? `P${nextPoint.sequence} ${nextPoint.status === 'arrived' ? '📍 No Local' : '🚚 Deslocando'}` : "🏁 Finalizado";

                                    setCallerInfo({
                                        name: route.driver?.name || 'Motorista',
                                        plate: route.vehicle_plate,
                                        photo_url: route.driver?.photo_url,
                                        status: statusText,
                                        client: nextPoint?.client_name
                                    });
                                }
                            });
                    }
                }
            } catch (e) { console.error("Polling error", e); }
        }, 15000); // 15 seconds

        return () => clearInterval(interval);
    }, [incomingCall, callStatus]);

    // Polling Backup for OUTGOING calls being rejected
    useEffect(() => {
        const interval = setInterval(async () => {
            // Only check if we have an active outgoing call (ringing or connected)
            if (!incomingCall || callStatus === 'idle') return;

            try {
                const { data } = await supabase
                    .from('calls')
                    .select('id, status')
                    .eq('id', incomingCall.id)
                    .single();

                if (data && (data.status === 'rejected' || data.status === 'ended' || data.status === 'canceled')) {
//                     console.log(`📞 Polling detected outgoing call ${data.status}`);
                    cleanupCall();
                }
            } catch (e) {
                // Call might have been deleted, cleanup
                console.warn("Polling: call not found, cleaning up");
            }
        }, 3000); // Check every 3s for faster response

        return () => clearInterval(interval);
    }, [incomingCall, callStatus]);

    // Timer
    useEffect(() => {
        let interval: any;
        if (callStatus === 'connected') {
            interval = setInterval(() => setCallDuration(d => d + 1), 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [callStatus]);

    // Ringtone
    // Ringtone & Timeout Logic
    useEffect(() => {
        if (callStatus === 'ringing') {
            playRingtone();

            // Auto-reject if not answered in 45s
            ringTimeoutRef.current = setTimeout(() => {
//                 console.log("⏰ Ringing timeout (45s) - Auto Rejecting");
                logCallToChat("📞 Chamada Perdida na Central (Timeout)");
                rejectCall(true); // true = auto (timeout)
            }, 45000);

        } else {
            stopRingtone();
            if (ringTimeoutRef.current) {
                clearTimeout(ringTimeoutRef.current);
                ringTimeoutRef.current = null;
            }
        }
        return () => {
            if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        };
    }, [callStatus]);

    const playRingtone = () => {
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
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = 440; // Standard ringback tone frequency
                osc.connect(gain);

                const now = ctx.currentTime;
                // Pattern: Tru-Tru (two short beeps with pause between)
                gain.gain.setValueAtTime(0, now);
                osc.start(now);

                // First beep: 0.4s
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.setValueAtTime(0.15, now + 0.4);
                gain.gain.linearRampToValueAtTime(0, now + 0.45);

                // Pause: 0.2s

                // Second beep: 0.4s
                gain.gain.setValueAtTime(0.15, now + 0.65);
                gain.gain.setValueAtTime(0.15, now + 1.05);
                gain.gain.linearRampToValueAtTime(0, now + 1.1);

                osc.stop(now + 1.1);
            } catch (e) { console.error(e); }
        };
        loop();
        toneInterval.current = setInterval(loop, 3000); // Repeat every 3 seconds
    };

    const stopRingtone = () => {
        if (toneInterval.current) {
            clearInterval(toneInterval.current);
            toneInterval.current = null;
        }
    };

    // --- WebRTC Logic ---
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const mediaConstraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    };

    const answerCall = async () => {
        if (!incomingCall) return;

        try {
            // 1. Get User Media
            const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            localStreamRef.current = stream;

            // 2. Create PC
            const pc = new RTCPeerConnection(rtcConfig);
            pcRef.current = pc;

            // Add Tracks
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            // Remote Audio Handling
            pc.ontrack = (e) => {
                if (remoteAudioRef.current && e.streams[0]) {
                    remoteAudioRef.current.srcObject = e.streams[0];
                    remoteAudioRef.current.play().catch(console.error);
                }
            };

            // ICE Handling
            pc.onicecandidate = () => {
                // Vanilla ICE: We wait for gathering complete usually, or trickle.
                // For this simple implementation, we wait for gathering complete inside createAnswer logic mostly
                // But createAnswer actually handles the SDP generation.
            };

            // 3. Set Remote Description (OFFER)
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

            // 4. Create Answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Wait for ICE Gathering (Simple approach)
            await new Promise<void>(resolve => {
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    const check = () => {
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', check);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', check);
                    // Timeout fallback
                    setTimeout(resolve, 2000);
                }
            });

            // 5. Send Answer to DB
            const finalAnswer = pc.localDescription;
            if (finalAnswer) {
                await supabase.from('calls').update({
                    status: 'answered',
                    answer: { type: finalAnswer.type, sdp: finalAnswer.sdp }
                }).eq('id', incomingCall.id);

                setCallStatus('connected');
                logCallToChat("📞 Chamada Conectada");
            }

        } catch (e) {
            console.error("Error answering call:", e);
            alert("Erro ao atender chamada. Verifique microfone.");
            cleanupCall();
        }
    };

    const rejectCall = async (_isAuto = false) => {
        if (incomingCall) {
            await supabase.from('calls').update({ status: 'rejected' }).eq('id', incomingCall.id);
        }
        cleanupCall();
    };

    const hangupCall = async () => {
        if (incomingCall) {
            await supabase.from('calls').update({ status: 'ended' }).eq('id', incomingCall.id);

        }
        cleanupCall();
    };

    const cleanupCall = () => {
        stopRingtone();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        setIncomingCall(null);
        setCallStatus('idle');
        setCallerInfo(null);
        setCallDuration(0);
        setIsMuted(false);
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsMuted(!track.enabled);
            }
        }
    };

    if (callStatus === 'idle') return null;

    // --- UI RENDER ---
    return (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-10 fade-in duration-300">
            {/* Audio Element for Remote Voice */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl overflow-hidden border border-slate-700 w-80 md:w-96">

                {/* Header */}
                <div className={`p-4 ${callStatus === 'ringing' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 animate-pulse' : 'bg-slate-800'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Phone className="w-4 h-4 text-white/80" />
                        <span className="text-xs font-bold uppercase tracking-wider text-white/80">
                            {callStatus === 'ringing' ? 'Chamada Recebida' : 'Em Chamada'}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Driver Photo */}
                        <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/30 backdrop-blur-sm overflow-hidden flex-shrink-0 flex items-center justify-center shadow-lg">
                            {callerInfo?.photo_url ? (
                                <img src={callerInfo.photo_url} alt="Motorista" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-7 h-7 text-white/80" />
                            )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0">
                            <h3 className="text-sm md:text-base font-bold truncate leading-snug" title={callerInfo?.name}>{callerInfo?.name || 'Motorista'}</h3>
                            <p className="text-sm text-white/70 mt-1 flex items-center gap-1">
                                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-mono tracking-wide">{callerInfo?.plate || '---'}</span>
                                {callerInfo?.status && <span className="text-[10px] text-emerald-100 font-semibold bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded whitespace-nowrap">{callerInfo.status}</span>}
                            </p>
                            {callerInfo?.client && (
                                <div className="text-[10px] font-bold text-white/90 mt-1 truncate max-w-[190px] bg-white/10 px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1">
                                    <span className="opacity-70 font-normal">Cliente:</span> {callerInfo.client}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col items-center justify-center gap-6">

                    {/* Duration / Status */}
                    <div className="text-3xl font-mono font-light tracking-widest text-slate-200">
                        {callStatus === 'ringing' ? '...' : new Date(callDuration * 1000).toISOString().substr(14, 5)}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-6">
                        {callStatus === 'ringing' ? (
                            <>
                                <Button
                                    onClick={() => rejectCall()}
                                    size="lg"
                                    className="rounded-full w-14 h-14 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 p-0 flex items-center justify-center"
                                >
                                    <PhoneOff className="w-6 h-6 fill-current" />
                                </Button>

                                <Button
                                    onClick={answerCall}
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600 shadow-xl shadow-green-500/50 p-0 flex items-center justify-center animate-bounce"
                                >
                                    <Phone className="w-8 h-8 fill-current" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={toggleMute}
                                    variant="outline"
                                    className={`rounded-full w-12 h-12 p-0 border-slate-600 text-slate-300 hover:bg-slate-800 ${isMuted ? 'bg-slate-700 text-red-400' : ''}`}
                                >
                                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                </Button>

                                <Button
                                    onClick={hangupCall}
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 p-0 flex items-center justify-center"
                                >
                                    <PhoneOff className="w-8 h-8 fill-current" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
