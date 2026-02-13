import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Mail, Phone, Shield, Camera, Save, LogOut } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { useNavigate } from 'react-router-dom';

export default function ProfilePage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState({
        full_name: '',
        phone: '',
        role: 'operator',
        avatar_url: ''
    });

    useEffect(() => {
        loadUserProfile();
    }, []);

    const loadUserProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/login');
                return;
            }

            setUser(user);

            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileData) {
                setProfile(profileData);
            }
        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
        }
    };

    const handleSave = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('user_profiles')
                .upsert({
                    id: user.id,
                    ...profile,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            alert('✅ Perfil atualizado com sucesso!');
        } catch (error: any) {
            alert('❌ Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!event.target.files || event.target.files.length === 0) {
                return;
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            setLoading(true);

            // Upload image
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // Get public URL
            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            if (data) {
                setProfile({ ...profile, avatar_url: data.publicUrl });
                // Opcional: Salvar imediatamente ou deixar o usuário clicar em "Salvar"
                // Vamos salvar imediatamente para garantir que a imagem não se perca
                await supabase
                    .from('user_profiles')
                    .upsert({
                        id: user.id,
                        ...profile,
                        avatar_url: data.publicUrl,
                        updated_at: new Date().toISOString()
                    });
            }

        } catch (error: any) {
            console.error('Erro no upload:', error);
            alert('Erro ao fazer upload da imagem: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-4xl mx-auto"
        >
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Meu Perfil</h2>
                    <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
                </div>
                <Button variant="outline" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Sair
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Avatar Card */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>Foto de Perfil</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center space-y-4">
                        <div className="relative">
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt="Avatar"
                                    className="w-32 h-32 rounded-full object-cover border-4 border-background shadow-sm"
                                />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary">
                                    {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                                </div>
                            )}

                            <button
                                onClick={() => document.getElementById('avatar-upload')?.click()}
                                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer shadow-md"
                            >
                                <Camera className="w-4 h-4" />
                            </button>

                            <input
                                id="avatar-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarUpload}
                            />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                            Clique no ícone para alterar
                        </p>
                    </CardContent>
                </Card>

                {/* Info Card */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Informações Pessoais</CardTitle>
                        <CardDescription>Atualize seus dados cadastrais</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    Nome Completo
                                </label>
                                <input
                                    type="text"
                                    value={profile.full_name}
                                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="Seu nome completo"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Mail className="w-4 h-4" />
                                    E-mail
                                </label>
                                <input
                                    type="email"
                                    value={user?.email || ''}
                                    disabled
                                    className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Phone className="w-4 h-4" />
                                    Telefone
                                </label>
                                <input
                                    type="tel"
                                    value={profile.phone}
                                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="(00) 00000-0000"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    Função
                                </label>
                                <select
                                    value={profile.role}
                                    onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="operator">Operador</option>
                                    <option value="manager">Gerente</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button onClick={handleSave} disabled={loading} className="gap-2">
                                <Save className="w-4 h-4" />
                                {loading ? 'Salvando...' : 'Salvar Alterações'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Security Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Segurança</CardTitle>
                    <CardDescription>Gerencie sua senha e configurações de segurança</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline">Alterar Senha</Button>
                </CardContent>
            </Card>
        </motion.div>
    );
}
