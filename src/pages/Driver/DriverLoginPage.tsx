
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Lock, User } from 'lucide-react';
import { supabase } from '@/services/supabase';

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

            // Buscar motorista pelo CPF
            const { data: driver, error: dbError } = await supabase
                .from('drivers')
                .select('*')
                .eq('cpf', cleanCpf)
                .single();

            if (dbError || !driver) {
                throw new Error('Motorista não encontrado.');
            }

            if (!driver.active) {
                throw new Error('Cadastro de motorista inativo.');
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
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-xl border border-slate-100 p-0 overflow-hidden">
                        <img src="/assets/app-logo.png" alt="Routify" className="w-full h-full object-cover" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-blue-950">Área do Motorista</CardTitle>
                    <CardDescription>Entre com seus dados para acessar suas rotas.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium animate-in fade-in slide-in-from-top-1">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                CPF
                            </label>
                            <Input
                                placeholder="000.000.000-00"
                                value={cpf}
                                onChange={(e) => setCpf(formatCpf(e.target.value))}
                                className="text-lg h-12 focus-visible:ring-blue-950 focus-visible:ring-offset-0"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Lock className="w-4 h-4 text-muted-foreground" />
                                Senha (6 primeiros dígitos)
                            </label>
                            <Input
                                type="password"
                                placeholder="******"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="text-lg h-12 focus-visible:ring-blue-950 focus-visible:ring-offset-0"
                                maxLength={6}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full h-12 text-lg bg-blue-950 hover:bg-blue-900 transition-colors" type="submit" disabled={loading}>
                            {loading ? 'Entrando...' : 'Entrar na Rota'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
