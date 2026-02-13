
export default async function handler(req: any, res: any) {
    const { id: _id } = req.query; // This handles /api/status/[id] if we use filesystem routing or rewrites

    return res.status(200).json({
        status: 'completed',
        message: 'Otimização concluída!',
        progress: 100
    });
}
