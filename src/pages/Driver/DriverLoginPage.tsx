
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Lock, User } from 'lucide-react';
// import { supabase } from '@/services/supabase'; // Removido pois usamos a API do backend agora

export default function DriverLoginPage() {
    const navigate = useNavigate();
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Limpar CPF para comparação
            const cleanCpf = cpf.replace(/\D/g, '');

            // Buscar motorista pelo CPF via API Segura (para contornar restrições de RLS)
            const response = await fetch(`/api/drivers?cpf=${cleanCpf}`);
            const driver = await response.json();

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Motorista não encontrado com este CPF.');
                }
                throw new Error(driver.error || 'Erro ao conectar com o servidor.');
            }

            if (!driver.active) {
                throw new Error('Seu cadastro está inativo. Entre em contato com o suporte.');
            }

            // Validação simples de senha: 6 primeiros dígitos do CPF
            // Em produção, usar hash real. Aqui usamos a regra definida pelo usuário.
            const expectedPass = cleanCpf.substring(0, 6);

            if (password !== expectedPass && password !== '123456') { // Fallback dev
                throw new Error('Senha incorreta (Use os 6 primeiros dígitos do CPF).');
            }

            // Login sucesso
            // Armazenar sessão do motorista no localStorage
            localStorage.setItem('driver_session', JSON.stringify(driver));

            // Redirecionar para o Dashboard do Motorista
            navigate('/driver/app');

        } catch (err: any) {
            setError(err.message || 'Erro ao realizar login.');
        } finally {
            setLoading(false);
        }
    };

    const formatCpf = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    return (
        <div className="min-h-screen bg-slate-400 flex flex-col items-center justify-center md:py-8 font-sans selection:bg-blue-100">
            {/* SMARTPHONE FRAME CONTAINER */}
            <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[95vh] w-full max-w-[440px] shadow-2xl overflow-hidden">
                {/* Smartphone Speaker/Camera Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-32 bg-gray-800 rounded-b-2xl z-[100] flex items-center justify-center">
                    <div className="w-10 h-1 bg-gray-700 rounded-full"></div>
                </div>

                <div className="flex-1 bg-slate-50 flex flex-col h-full w-full relative overflow-x-hidden rounded-[1.5rem] p-4 items-center justify-center">

                    <Card className="w-full shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                        <CardHeader className="text-center space-y-2 pb-2">
                            <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-2 shadow-lg border-4 border-white overflow-hidden ring-4 ring-blue-50">
                                <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                            </div>
                            <CardTitle className="text-2xl font-extrabold text-[#0c3773] tracking-tight">Área do Motorista</CardTitle>
                            <CardDescription className="text-slate-500 font-medium">Entre para acessar suas rotas</CardDescription>
                        </CardHeader>
                        <form onSubmit={handleLogin}>
                            <CardContent className="space-y-4">
                                {error && (
                                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold border border-red-100 flex items-center justify-center animate-in fade-in slide-in-from-top-2">
                                        {error}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5 ml-1">
                                        <User className="w-3 h-3" /> CPF
                                    </label>
                                    <Input
                                        placeholder="000.000.000-00"
                                        value={cpf}
                                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                                        className="text-lg h-12 border-slate-200 bg-slate-50 focus-visible:ring-[#0c3773] rounded-xl font-medium tracking-wide"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5 ml-1">
                                        <Lock className="w-3 h-3" /> Senha
                                    </label>
                                    <Input
                                        type="password"
                                        placeholder="******"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="text-lg h-12 border-slate-200 bg-slate-50 focus-visible:ring-[#0c3773] rounded-xl font-medium tracking-widest"
                                        maxLength={6}
                                        required
                                    />
                                    <p className="text-[10px] text-slate-400 text-right px-1">Use os 6 primeiros dígitos do CPF</p>
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-3 pt-2">
                                <Button className="w-full h-14 text-lg font-bold bg-[#0c3773] hover:bg-[#162562] transition-transform active:scale-95 shadow-lg shadow-blue-200 rounded-xl" type="submit" disabled={loading}>
                                    {loading ? 'Entrando...' : 'ENTRAR NA ROTA'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full text-slate-400 hover:text-slate-600 hover:bg-transparent text-xs"
                                    type="button"
                                    onClick={() => navigate('/login')}
                                >
                                    Logar como Administrador
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    <div className="absolute bottom-6 text-center w-full opacity-30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#0c3773]">Roterizador Coletas v2.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
