
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_KEY || ''; // Deve ser a service_role key

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Configuração do Supabase ausente no servidor.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    if (req.method === 'GET') {
        try {
            const { data: profiles, error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .select('*')
                .order('full_name');

            if (profileError) throw profileError;

            // Buscar emails do auth.users
            const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

            if (usersError) throw usersError;

            const usersWithEmail = profiles.map(profile => {
                const authUser = users.find(u => u.id === profile.id);
                return {
                    ...profile,
                    email: authUser?.email || 'N/A'
                };
            });

            return res.status(200).json(usersWithEmail);
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { email, password, full_name, role, phone } = req.body;

            if (!email || !password || !full_name || !role) {
                return res.status(400).json({ error: 'Campos obrigatórios: email, password, full_name, role.' });
            }

            // 1. Criar usuário no Auth
            const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true
            });

            if (authError) throw authError;

            // 2. Criar perfil na tabela user_profiles
            const { error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .insert({
                    id: authUser.user.id,
                    full_name,
                    role,
                    phone: phone || '',
                    updated_at: new Date().toISOString()
                });

            if (profileError) {
                // Se der erro no perfil, tentar remover o usuário do auth para não ficar órfão
                await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
                throw profileError;
            }

            return res.status(200).json({ message: 'Usuário criado com sucesso!', user: authUser.user });
        } catch (error: any) {
            console.error('Erro ao criar usuário:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido.' });
}
