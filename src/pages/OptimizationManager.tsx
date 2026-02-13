import { useState, useEffect } from 'react';
import { API_URL } from '@/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, RefreshCw, Calendar, Truck, Package } from 'lucide-react';

export default function OptimizationManager() {
    const [optimizations, setOptimizations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const loadOptimizations = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/optimizations`);
            const data = await response.json();
            setOptimizations(data.optimizations || []);
        } catch (error) {
            console.error('Erro ao carregar otimizações:', error);
            alert('Erro ao carregar otimizações');
        } finally {
            setLoading(false);
        }
    };

    const deleteOptimization = async (runId: string, date: string) => {
        if (!confirm(`Tem certeza que deseja deletar a otimização do dia ${date}?`)) {
            return;
        }

        setDeleting(runId);
        try {
            const response = await fetch(`${API_URL}/api/optimization/${runId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Erro ao deletar otimização');
            }

            alert('Otimização deletada com sucesso!');
            loadOptimizations(); // Recarregar lista
        } catch (error) {
            console.error('Erro ao deletar:', error);
            alert('Erro ao deletar otimização');
        } finally {
            setDeleting(null);
        }
    };

    useEffect(() => {
        loadOptimizations();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Gerenciar Otimizações</h1>
                    <p className="text-muted-foreground">Visualize e delete otimizações anteriores</p>
                </div>
                <Button onClick={loadOptimizations} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>

            <div className="grid gap-4">
                {optimizations.length === 0 && !loading && (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            Nenhuma otimização encontrada
                        </CardContent>
                    </Card>
                )}

                {optimizations.map((opt) => (
                    <Card key={opt.id}>
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Calendar className="w-5 h-5" />
                                        {opt.date || 'Data não especificada'}
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Criado em: {new Date(opt.created_at).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteOptimization(opt.id, opt.date)}
                                    disabled={deleting === opt.id}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {deleting === opt.id ? 'Deletando...' : 'Deletar'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium">{opt.total_routes}</p>
                                        <p className="text-xs text-muted-foreground">Rotas</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium">{opt.total_points}</p>
                                        <p className="text-xs text-muted-foreground">Pontos</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">📏</span>
                                    <div>
                                        <p className="text-sm font-medium">{opt.total_distance?.toFixed(2)} km</p>
                                        <p className="text-xs text-muted-foreground">Distância</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">⚖️</span>
                                    <div>
                                        <p className="text-sm font-medium">{opt.total_weight?.toFixed(2)} kg</p>
                                        <p className="text-xs text-muted-foreground">Peso Total</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
