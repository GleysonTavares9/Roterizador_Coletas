
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method Not Allowed' });

    const { unit_name } = req.query;
    const supabaseUrl = process.env.SUPABASE_URL || 'https://dbhhsyeqsreyekevffsl.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        let query = supabase.from('route_assignments').delete().neq('id', 0);
        if (unit_name && unit_name.toLowerCase() !== 'todas') {
            query = query.eq('unit_name', unit_name);
        }

        const { error } = await query;
        if (error) throw error;

        return res.status(200).json({ message: `Memória de rotas (${unit_name || 'Global'}) limpa com sucesso.` });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}
