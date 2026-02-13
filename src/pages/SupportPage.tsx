import { Card, CardContent } from '@/components/ui/card';
import { Mail, Phone, MessageSquare, HelpCircle, Clock } from 'lucide-react';

export default function SupportPage() {
    return (
        <div className="space-y-6 max-w-5xl">
            <div className="space-y-2">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Central de Suporte</h1>
                <p className="text-base text-slate-600">Estamos aqui para ajudar você</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 pb-6 text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mail className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Email</h3>
                        <p className="text-sm text-slate-600 mb-3">Envie sua dúvida por email</p>
                        <a href="mailto:suporte@roterizacao.com.br" className="text-blue-600 hover:text-blue-800 font-medium">
                            suporte@roterizacao.com.br
                        </a>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 pb-6 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Phone className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Telefone</h3>
                        <p className="text-sm text-slate-600 mb-3">Ligue para nossa central</p>
                        <a href="tel:+553199999999" className="text-green-600 hover:text-green-800 font-medium">
                            (31) 9999-9999
                        </a>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 pb-6 text-center">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="w-8 h-8 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Chat</h3>
                        <p className="text-sm text-slate-600 mb-3">Fale conosco pelo app</p>
                        <button className="text-purple-600 hover:text-purple-800 font-medium">
                            Abrir Chat
                        </button>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm">
                <CardContent className="pt-8 pb-8 px-8">
                    <div className="space-y-6">
                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <Clock className="w-6 h-6 text-blue-600" />
                                <h2 className="text-2xl font-bold text-slate-900">Horário de Atendimento</h2>
                            </div>
                            <div className="space-y-2 text-slate-700">
                                <p><strong>Segunda a Sexta:</strong> 08:00 às 18:00</p>
                                <p><strong>Sábado:</strong> 08:00 às 12:00</p>
                                <p><strong>Domingo e Feriados:</strong> Fechado</p>
                            </div>
                        </section>

                        <hr className="border-slate-200" />

                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <HelpCircle className="w-6 h-6 text-blue-600" />
                                <h2 className="text-2xl font-bold text-slate-900">Perguntas Frequentes</h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">Como faço para acessar minhas rotas?</h3>
                                    <p className="text-slate-600 leading-7">
                                        Após fazer login no app, você verá automaticamente suas rotas do dia na tela inicial. Clique em uma rota para ver os detalhes e iniciar a navegação.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">Como registro uma coleta?</h3>
                                    <p className="text-slate-600 leading-7">
                                        Durante a execução da rota, ao chegar em um ponto de coleta, clique no botão "Registrar Coleta". Você pode adicionar fotos e observações.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">O que fazer se tiver um problema na rota?</h3>
                                    <p className="text-slate-600 leading-7">
                                        Use o botão "Reportar Ocorrência" no app para informar problemas como endereço incorreto, cliente ausente ou outros imprevistos. A central será notificada imediatamente.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">Como atualizo meus dados cadastrais?</h3>
                                    <p className="text-slate-600 leading-7">
                                        Acesse o menu "Perfil" no app e clique em "Editar Dados". Você pode atualizar seu telefone, email e foto de perfil. Para alterações de CPF ou nome, entre em contato com o RH.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">O app funciona offline?</h3>
                                    <p className="text-slate-600 leading-7">
                                        O app precisa de conexão com internet para funcionar corretamente. Recomendamos manter dados móveis ou Wi-Fi ativados durante o uso.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <hr className="border-slate-200" />

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4">Problemas Técnicos</h2>
                            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                                <p className="text-slate-700 leading-7">
                                    <strong className="text-slate-900">Está com problemas técnicos?</strong><br />
                                    Antes de entrar em contato, tente:
                                </p>
                                <ul className="list-disc pl-6 mt-2 space-y-1 text-slate-700">
                                    <li>Fechar e abrir o app novamente</li>
                                    <li>Verificar sua conexão com internet</li>
                                    <li>Atualizar o app para a versão mais recente</li>
                                    <li>Reiniciar seu dispositivo</li>
                                </ul>
                                <p className="text-slate-700 mt-3">
                                    Se o problema persistir, entre em contato com nossa equipe de suporte informando o erro e o que você estava fazendo quando ele ocorreu.
                                </p>
                            </div>
                        </section>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
