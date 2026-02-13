
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const supabaseUrl = process.env.SUPABASE_URL || 'https://dbhhsyeqsreyekevffsl.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('optimization_settings')
                .select('*')
                .order('id', { ascending: false })
                .limit(1);

            if (error) throw error;
            return res.status(200).json(data?.[0] || {});
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const settings = req.body;
            const { data, error } = await supabase
                .from('optimization_settings')
                .insert([{
                    max_hours: settings.maxHours,
                    start_time: settings.startTime,
                    lunch_start: settings.lunchStart,
                    lunch_duration: settings.lunchDuration,
                    service_time: settings.serviceTime,
                    avg_speed: settings.avgSpeed,
                    max_points_per_vehicle: settings.maxPointsPerVehicle,
                    min_points_per_vehicle: settings.minPointsPerVehicle,
                    max_dist_redistribution: settings.maxDistRedistribution,
                    max_dist_sobras: settings.maxDistSobras,
                    clustering_bias: settings.clusteringBias,
                    force_fulfill: settings.forceFulfill
                }]).select();

            if (error) throw error;
            return res.status(200).json({ message: 'Saved', data: data?.[0] });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }
}
