import { createClient } from '@supabase/supabase-js';

export default async function handler(_req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const supabaseUrl = process.env['SUPABASE_URL'] || 'https://dbhhsyeqsreyekevffsl.supabase.co';
    const supabaseKey = process.env['SUPABASE_KEY'] || ''; // Needs Service Role Key for reliability
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Fetch the most recent run
        // In a real async job queue, we would look up by job_id.
        // Here we assume the most recent run is the one requested.
        const { data, error } = await supabase
            .from('optimization_runs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        const run = data?.[0];

        return res.status(200).json({
            status: 'completed',
            run_id: run?.id || null,
            statistics: {
                total_points: run?.total_points || 0,
                total_routes: run?.total_routes || 0
            }
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}
