
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    const method = req.method?.toUpperCase();
    console.log(`[API/USERS] Recebido pedido: ${method}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Configuração do Supabase ausente no servidor.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    if (method === 'GET') {
        try {
            const { data: profiles, error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .select('*')
                .order('full_name');

            if (profileError) throw profileError;

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

    if (method === 'POST') {
        try {
            const { email, password, full_name, role, phone } = req.body;
            const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true
            });
            if (authError) throw authError;

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
                await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
                throw profileError;
            }
            return res.status(200).json({ message: 'Usuário criado!' });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (method === 'PUT') {
        try {
            console.log('[API/USERS] Processando atualização de usuário...');
            const { id, full_name, role, phone, password, is_blocked } = req.body;
            if (!id) return res.status(400).json({ error: 'ID obrigatório' });

            const updateData: any = { updated_at: new Date().toISOString() };
            if (full_name !== undefined) updateData.full_name = full_name;
            if (role !== undefined) updateData.role = role;
            if (phone !== undefined) updateData.phone = phone;
            if (is_blocked !== undefined) updateData.is_blocked = is_blocked;

            const { error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .update(updateData)
                .eq('id', id);

            if (profileError) throw profileError;

            if (password) {
                const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
                if (authError) throw authError;
            }

            return res.status(200).json({ message: 'Atualizado!' });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (method === 'DELETE') {
        try {
            const { id } = req.query;
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (authError) throw authError;
            return res.status(200).json({ message: 'Removido!' });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: `Método ${method} não permitido.` });
}
