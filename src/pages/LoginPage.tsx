import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogIn, Truck } from 'lucide-react';
import { supabase } from '@/services/supabase';

export default function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isForgotPassword, setIsForgotPassword] = useState(false);

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!email) {
            setError('Por favor, informe seu e-mail.');
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/update-password',
            });
            if (error) throw error;
            alert('✅ Se o e-mail estiver cadastrado, você receberá um link de recuperação.');
            setIsForgotPassword(false);
        } catch (err: any) {
            setError(err.message || 'Erro ao enviar e-mail de recuperação');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data.user) {
                // Verificar se o usuário está bloqueado
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('is_blocked')
                    .eq('id', data.user.id)
                    .single();

                if (profile?.is_blocked) {
                    await supabase.auth.signOut();
                    throw new Error('🚫 Seu acesso foi bloqueado pelo administrador.');
                }

                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login');
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="shadow-2xl">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-2 shadow-xl border border-slate-100 p-0 overflow-hidden">
                            <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                        </div>
                        <CardTitle className="text-3xl font-bold text-blue-950">
                            {isForgotPassword ? 'Recuperar Senha' : 'Sistema de Roteirização'}
                        </CardTitle>
                        <CardDescription>
                            {isForgotPassword
                                ? 'Informe seu e-mail para receber o link de recuperação'
                                : 'Faça login para acessar o sistema'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={isForgotPassword ? handleForgotPassword : handleLogin} className="space-y-3">

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">E-mail</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-950 focus:border-transparent transition-all"
                                    placeholder="seu@email.com"
                                    required
                                />
                            </div>

                            {!isForgotPassword && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Senha</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-950 focus:border-transparent transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            )}


                            {error && (
                                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 text-base font-medium bg-blue-950 hover:bg-blue-900 text-white transition-colors"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Processando...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        {isForgotPassword ? null : <LogIn className="w-4 h-4" />}
                                        {isForgotPassword ? 'Enviar Link de Recuperação' : 'Entrar'}
                                    </span>
                                )}
                            </Button>
                        </form>

                        <div className="mt-6 space-y-4">
                            {!isForgotPassword && (
                                <>
                                    <div className="text-center py-2">
                                        <p className="text-sm text-slate-500 italic">
                                            Acesso restrito. Entre em contato com o administrador para obter uma conta.
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="text-center pt-2">
                                {isForgotPassword ? (
                                    <button
                                        onClick={() => {
                                            setIsForgotPassword(false);
                                            setError('');
                                        }}
                                        className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
                                    >
                                        Voltar para o Login
                                    </button>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2 border-dashed hover:border-slate-400 hover:bg-slate-50 text-slate-700"
                                            onClick={() => navigate('/driver/login')}
                                        >
                                            <Truck className="w-4 h-4" />
                                            Acesso Motorista
                                        </Button>

                                        <div className="text-center mt-4">
                                            <button
                                                onClick={() => {
                                                    setIsForgotPassword(true);
                                                    setError('');
                                                }}
                                                className="text-sm text-muted-foreground hover:text-slate-900 hover:underline"
                                            >
                                                Esqueceu sua senha?
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <p className="mt-8 text-center text-xs text-muted-foreground">
                    © 2025 Sistema de Roteirização. Todos os direitos reservados.
                </p>
            </motion.div>
        </div >
    );
}
