
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Mail, Shield, Phone, Loader2, Trash2, Search, AlertTriangle, Edit2, X, Save, Ban, CheckCircle } from 'lucide-react';
import { API_URL } from '@/config';
import { supabase } from '@/services/supabase';
import { useNavigate } from 'react-router-dom';

export default function UserManagementPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [editingUser, setEditingUser] = useState<any>(null);
    const navigate = useNavigate();

    const [newUser, setNewUser] = useState({
        email: '',
        password: '',
        full_name: '',
        role: 'operator',
        phone: ''
    });

    useEffect(() => {
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/login');
                return;
            }

            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile?.role === 'admin') {
                setIsAdmin(true);
                fetchUsers();
            } else {
                setIsAdmin(false);
            }
        } catch (error) {
            console.error('Erro ao verificar permissões:', error);
            setIsAdmin(false);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/users`);
            const data = await response.json();
            if (response.ok) {
                setUsers(data);
            } else {
                throw new Error(data.error || 'Erro ao carregar usuários');
            }
        } catch (error: any) {
            console.error('Erro:', error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });
            const data = await response.json();

            if (response.ok) {
                alert('✅ Usuário criado com sucesso!');
                setShowRegisterForm(false);
                setNewUser({ email: '', password: '', full_name: '', role: 'operator', phone: '' });
                fetchUsers();
            } else {
                throw new Error(data.error || 'Erro ao criar usuário');
            }
        } catch (error: any) {
            alert('❌ ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingUser)
            });
            const data = await response.json();

            if (response.ok) {
                alert('✅ Usuário atualizado com sucesso!');
                setEditingUser(null);
                fetchUsers();
            } else {
                throw new Error(data.error || 'Erro ao atualizar usuário');
            }
        } catch (error: any) {
            alert('❌ ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja remover o acesso de ${name}? Esta ação é irreversível.`)) return;

        try {
            const response = await fetch(`${API_URL}/api/users?id=${id}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (response.ok) {
                alert('✅ Acesso removido com sucesso!');
                fetchUsers();
            } else {
                throw new Error(data.error || 'Erro ao remover usuário');
            }
        } catch (error: any) {
            alert('❌ ' + error.message);
        }
    };

    const filteredUsers = users.filter(u =>
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {isAdmin === null ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin mb-4" />
                    Verificando permissões...
                </div>
            ) : isAdmin === false ? (
                <Card className="border-red-100 bg-red-50">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <AlertTriangle className="w-12 h-12 text-red-600 mb-4" />
                        <h3 className="text-xl font-bold text-red-950 mb-2">Acesso Negado</h3>
                        <p className="text-red-700 max-w-md">
                            Você não tem permissão para acessar esta página. Apenas administradores podem gerenciar usuários.
                        </p>
                        <Button
                            onClick={() => navigate('/dashboard')}
                            className="mt-6 bg-red-600 hover:bg-red-700"
                        >
                            Voltar para o Início
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-blue-950 flex items-center gap-2">
                                <Users className="w-6 h-6" />
                                Gestão de Acessos
                            </h2>
                            <p className="text-muted-foreground">Administre os usuários do sistema e suas funções.</p>
                        </div>
                        <Button
                            onClick={() => {
                                setShowRegisterForm(!showRegisterForm);
                                setEditingUser(null);
                            }}
                            className="gap-2 bg-blue-950 hover:bg-blue-900"
                        >
                            <UserPlus className="w-4 h-4" />
                            Novo Usuário
                        </Button>
                    </div>

                    {showRegisterForm && (
                        <Card className="border-blue-100 shadow-lg">
                            <CardHeader className="bg-slate-50/50">
                                <CardTitle className="text-lg">Cadastrar Novo Acesso</CardTitle>
                                <CardDescription>Crie uma conta para um novo colaborador.</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Nome Completo</label>
                                        <input
                                            required
                                            type="text"
                                            value={newUser.full_name}
                                            onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            placeholder="Ex: João Silva"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Mail className="w-4 h-4" />
                                            E-mail
                                        </label>
                                        <input
                                            required
                                            type="email"
                                            value={newUser.email}
                                            onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            placeholder="colaborador@empresa.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Senha Inicial</label>
                                        <input
                                            required
                                            type="password"
                                            value={newUser.password}
                                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Shield className="w-4 h-4" />
                                            Função
                                        </label>
                                        <select
                                            value={newUser.role}
                                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="operator">Operador</option>
                                            <option value="manager">Gerente</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Phone className="w-4 h-4" />
                                            Telefone (Opcional)
                                        </label>
                                        <input
                                            type="tel"
                                            value={newUser.phone}
                                            onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                                        <Button variant="ghost" onClick={() => setShowRegisterForm(false)} type="button">Cancelar</Button>
                                        <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Concluir Cadastro
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    )}

                    {editingUser && (
                        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
                            <Card className="w-full max-w-2xl shadow-2xl">
                                <CardHeader className="bg-blue-950 text-white rounded-t-lg">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <CardTitle className="text-xl">Editar Acesso</CardTitle>
                                            <CardDescription className="text-blue-100">Alterando dados de {editingUser.full_name}</CardDescription>
                                        </div>
                                        <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-white/10 rounded">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <form onSubmit={handleUpdateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Nome Completo</label>
                                            <input
                                                required
                                                type="text"
                                                value={editingUser.full_name}
                                                onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">E-mail (Não editável)</label>
                                            <input
                                                disabled
                                                type="email"
                                                value={editingUser.email}
                                                className="flex h-10 w-full rounded-md border border-input bg-slate-50 px-3 py-2 text-sm text-slate-500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Nova Senha (Deixe vazio para manter)</label>
                                            <input
                                                type="password"
                                                onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Função</label>
                                            <select
                                                value={editingUser.role}
                                                onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            >
                                                <option value="operator">Operador</option>
                                                <option value="manager">Gerente</option>
                                                <option value="admin">Administrador</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Telefone</label>
                                            <input
                                                type="tel"
                                                value={editingUser.phone}
                                                onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t">
                                            <Button variant="ghost" onClick={() => setEditingUser(null)} type="button">Cancelar</Button>
                                            <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 gap-2">
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Salvar Alterações
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <CardTitle>Usuários Cadastrados</CardTitle>
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Buscar usuários..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                    Carregando usuários...
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-muted-foreground font-medium">
                                                <th className="text-left py-3 px-4">Nome</th>
                                                <th className="text-left py-3 px-4">E-mail</th>
                                                <th className="text-left py-3 px-4">Função</th>
                                                <th className="text-left py-3 px-4">Telefone</th>
                                                <th className="text-right py-3 px-4">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-muted-foreground italic">
                                                        Nenhum usuário encontrado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredUsers.map((u) => (
                                                    <tr key={u.id} className={`border-b hover:bg-slate-50/50 transition-colors ${u.is_blocked ? 'bg-orange-50/30 text-slate-400' : ''}`}>
                                                        <td className="py-3 px-4 font-medium">
                                                            <div className="flex items-center gap-2">
                                                                {u.full_name}
                                                                {u.is_blocked && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 rounded uppercase font-bold">Bloqueado</span>}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4">{u.email}</td>
                                                        <td className="py-3 px-4">
                                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                                u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-slate-100 text-slate-700'
                                                                }`}>
                                                                {u.role === 'admin' ? 'Adm' : u.role === 'manager' ? 'Gerente' : 'Operador'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4">{u.phone || '-'}</td>
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className={u.is_blocked ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"}
                                                                    onClick={async () => {
                                                                        if (!confirm(`Tem certeza que deseja ${u.is_blocked ? 'desbloquear' : 'bloquear'} o acesso de ${u.full_name}?`)) return;
                                                                        try {
                                                                            const response = await fetch(`${API_URL}/api/users`, {
                                                                                method: 'PUT',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({ id: u.id, is_blocked: !u.is_blocked })
                                                                            });
                                                                            if (response.ok) {
                                                                                alert(`✅ Usuário ${u.is_blocked ? 'desbloqueado' : 'bloqueado'}!`);
                                                                                fetchUsers();
                                                                            } else {
                                                                                throw new Error('Erro ao processar');
                                                                            }
                                                                        } catch (err: any) {
                                                                            alert('❌ Erro: ' + err.message);
                                                                        }
                                                                    }}
                                                                    title={u.is_blocked ? "Desbloquear" : "Bloquear"}
                                                                >
                                                                    {u.is_blocked ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                    onClick={() => setEditingUser(u)}
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                    onClick={() => handleDeleteUser(u.id, u.full_name)}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </motion.div>
    );
}
