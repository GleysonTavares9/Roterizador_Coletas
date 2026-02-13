
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    const method = req.method?.toUpperCase();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_KEY || '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    if (method === 'GET') {
        const { cpf } = req.query;
        if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });

        const cleanCpf = cpf.replace(/\D/g, '');
        const { data, error } = await supabaseAdmin
            .from('drivers')
            .select('*')
            .eq('cpf', cleanCpf)
            .limit(1);

        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Motorista não encontrado' });

        return res.status(200).json(data[0]);
    }

    return res.status(405).json({ error: 'Método não permitido' });
}
