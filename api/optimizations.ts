
import { createClient } from '@supabase/supabase-js';

export default async function handler(_req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const supabaseUrl = process.env.SUPABASE_URL || 'https://dbhhsyeqsreyekevffsl.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { data, error } = await supabase
            .from('optimization_runs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return res.status(200).json({ optimizations: data });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}
