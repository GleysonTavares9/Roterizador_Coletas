
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

    if (method === 'POST' || method === 'PUT') {
        const { action, routeId, pointId, data: updateData } = req.body;
        console.log(`[API] driver-routes action: ${action}, routeId: ${routeId}, pointId: ${pointId}`);

        try {
            if (action === 'update-route-status') {
                const { error } = await supabaseAdmin
                    .from('routes')
                    .update(updateData)
                    .eq('id', routeId);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            if (action === 'update-point-status') {
                const { error } = await supabaseAdmin
                    .from('route_points')
                    .update(updateData)
                    .eq('id', pointId);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            if (action === 'send-message') {
                const { error } = await supabaseAdmin
                    .from('route_messages')
                    .insert({
                        route_id: routeId,
                        message: updateData.message,
                        sender_type: 'driver'
                    });
                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            return res.status(400).json({ error: 'Ação inválida' });
        } catch (err: any) {
            console.error('Action Error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    if (method === 'GET') {
        const { driverId, date, routeId } = req.query;
        console.log(`[API] driver-routes request: driverId=${driverId}, date=${date}, routeId=${routeId}`);

        try {
            if (routeId) {
                // Fetch single route detail
                const { data: routeData, error: routeError } = await supabaseAdmin
                    .from('routes')
                    .select('*')
                    .eq('id', routeId)
                    .single();

                if (routeError) throw routeError;

                // Fetch points
                const { data: pointsData, error: pointsError } = await supabaseAdmin
                    .from('route_points')
                    .select('id, route_id, sequence, client_name, cost_vector_name, address, latitude, longitude, weight, actual_weight, status, visited_at, observation, is_recurring, created_at')
                    .eq('route_id', routeId)
                    .order('sequence');

                if (pointsError) throw pointsError;

                // Also fetch messages
                const { data: messagesData } = await supabaseAdmin
                    .from('route_messages')
                    .select('*')
                    .eq('route_id', routeId)
                    .order('created_at', { ascending: true });

                return res.status(200).json({
                    route: routeData,
                    points: pointsData || [],
                    messages: messagesData || []
                });
            }

            if (!driverId) {
                return res.status(400).json({ error: 'driverId é obrigatório' });
            }

            if (date) {
                // Fetch routes for a specific date
                const { data, error } = await supabaseAdmin
                    .from('routes')
                    .select('*, points:route_points(weight, status)')
                    .eq('driver_id', driverId)
                    .eq('route_date', date)
                    .order('vehicle_plate');

                if (error) throw error;
                return res.status(200).json(data || []);
            } else {
                // Fetch available dates (distinct)
                const { data, error } = await supabaseAdmin
                    .from('routes')
                    .select('route_date, status')
                    .eq('driver_id', driverId)
                    .order('route_date', { ascending: false });

                if (error) throw error;

                console.log(`[API] Found ${data?.length || 0} routes for driver ${driverId}`);

                // Unique dates logic - ensure we only get YYYY-MM-DD
                const uniqueDates = Array.from(new Set(
                    data?.map(r => {
                        const d = r.route_date as string;
                        return d ? (d.includes('T') ? d.split('T')[0] : d.split(' ')[0]) : null;
                    }).filter(Boolean) as string[]
                )).sort().reverse();

                console.log(`[API] Returning unique dates:`, uniqueDates);
                return res.status(200).json(uniqueDates);
            }
        } catch (err: any) {
            console.error('API Error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
}
