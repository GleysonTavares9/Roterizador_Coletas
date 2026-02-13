
import { OptimizationService } from '../src/services/optimization/OptimizationService';

/**
 * Vercel Serverless Function for Route Optimization from DB
 */
export default async function handler(req: any, res: any) {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { unidade, data_especifica, month, year, settings } = req.body;

        const supabaseUrl = process.env.SUPABASE_URL || 'https://dbhhsyeqsreyekevffsl.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || ''; // Use Service Role Key for backend if possible

        if (!supabaseKey) {
            return res.status(500).json({ error: 'Missing SUPABASE_KEY environment variable.' });
        }

        const service = new OptimizationService(supabaseUrl, supabaseKey);

        // Optimization runs directly and returns the run_id when done
        // For Vercel, we must finish within the timeout limit.
        const result = await service.runOptimizationFromDb(
            unidade || 'Todas',
            data_especifica || 'tudo',
            month,
            year,
            settings || {}
        );

        // Mocking the "job" structure for compatibility with existing frontend
        // Since this is synchronous (it waits for completion), we can immediately return completed status
        return res.status(200).json({
            job_id: `vercel-${Date.now()}`,
            status: 'completed',
            message: 'Otimização concluída com sucesso',
            run_id: result.run_id,
            statistics: result.statistics
        });

    } catch (error: any) {
        console.error('Optimization API Error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
}
