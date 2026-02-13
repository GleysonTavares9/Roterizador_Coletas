import { Card, CardContent } from '@/components/ui/card';

export default function TermsOfServicePage() {
    return (
        <div className="space-y-6 max-w-5xl">
            <div className="space-y-2">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Termos de Uso</h1>
                <p className="text-base text-slate-600">Roterizacao Driver • Última atualização: 29 de dezembro de 2024</p>
            </div>

            <Card className="shadow-sm">
                <CardContent className="pt-8 pb-8 px-8">
                    <div className="space-y-8 text-slate-700 leading-relaxed">

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">1. Aceitação dos Termos</h2>
                            <p className="text-base leading-7">
                                Ao acessar e usar o aplicativo <strong className="text-slate-900">Roterizacao Driver</strong>, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deverá usar este aplicativo.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">2. Descrição do Serviço</h2>
                            <p className="text-base leading-7 mb-3">
                                O Roterizacao Driver é um aplicativo de gestão de rotas e entregas destinado exclusivamente a motoristas profissionais cadastrados. O serviço oferece:
                            </p>
                            <ul className="list-disc pl-6 space-y-1.5">
                                <li>Visualização de rotas otimizadas</li>
                                <li>Navegação GPS integrada</li>
                                <li>Registro de coletas e entregas</li>
                                <li>Rastreamento em tempo real</li>
                                <li>Comunicação com a central de operações</li>
                                <li>Histórico de atividades</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">3. Cadastro e Conta</h2>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">3.1 Elegibilidade</h3>
                                    <p className="text-base leading-7">
                                        O uso deste aplicativo é restrito a motoristas profissionais devidamente cadastrados e autorizados pela empresa contratante. Você deve ter no mínimo 18 anos de idade e possuir CNH válida.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">3.2 Responsabilidade pela Conta</h3>
                                    <p className="text-base leading-7">
                                        Você é responsável por manter a confidencialidade de suas credenciais de acesso (CPF e senha) e por todas as atividades que ocorram em sua conta. Notifique imediatamente a empresa sobre qualquer uso não autorizado de sua conta.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">3.3 Informações Precisas</h3>
                                    <p className="text-base leading-7">
                                        Você concorda em fornecer informações precisas, atuais e completas durante o uso do aplicativo e em manter essas informações atualizadas.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">4. Uso Aceitável</h2>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">4.1 Você Concorda em:</h3>
                                    <ul className="list-none pl-0 space-y-2">
                                        <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Usar o aplicativo apenas para fins profissionais relacionados às suas atividades como motorista</li>
                                        <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Seguir todas as rotas e instruções fornecidas pelo sistema</li>
                                        <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Registrar coletas e entregas de forma precisa e oportuna</li>
                                        <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Manter o aplicativo atualizado com a versão mais recente</li>
                                        <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Respeitar as leis de trânsito e regulamentos locais</li>
                                    </ul>
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">4.2 Você NÃO Pode:</h3>
                                    <ul className="list-none pl-0 space-y-2">
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Compartilhar suas credenciais de acesso com terceiros</li>
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Usar o aplicativo para fins ilegais ou não autorizados</li>
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Tentar acessar áreas restritas do sistema</li>
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Interferir ou interromper o funcionamento do aplicativo</li>
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Fazer engenharia reversa ou descompilar o software</li>
                                        <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Fornecer informações falsas ou enganosas</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">5. Rastreamento e Localização</h2>
                            <p className="text-base leading-7 mb-3">
                                Ao usar este aplicativo, você concorda que:
                            </p>
                            <ul className="list-disc pl-6 space-y-1.5">
                                <li>Sua localização GPS será rastreada em tempo real durante o horário de trabalho</li>
                                <li>Os dados de localização serão compartilhados com sua empresa empregadora</li>
                                <li>O rastreamento é necessário para otimização de rotas e segurança</li>
                                <li>Você pode desativar o rastreamento fora do horário de trabalho</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">6. Propriedade Intelectual</h2>
                            <p className="text-base leading-7">
                                Todo o conteúdo do aplicativo, incluindo mas não limitado a textos, gráficos, logos, ícones, imagens, áudio, vídeo e software, é propriedade da empresa e está protegido por leis de direitos autorais e propriedade intelectual.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">7. Limitação de Responsabilidade</h2>

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">7.1 Disponibilidade do Serviço</h3>
                                    <p className="text-base leading-7">
                                        Embora nos esforcemos para manter o aplicativo disponível 24/7, não garantimos que o serviço será ininterrupto ou livre de erros. Podemos suspender ou modificar o serviço a qualquer momento para manutenção.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">7.2 Uso por Sua Conta e Risco</h3>
                                    <p className="text-base leading-7">
                                        O uso do aplicativo é por sua conta e risco. Não nos responsabilizamos por danos diretos, indiretos, incidentais ou consequenciais resultantes do uso ou incapacidade de usar o aplicativo.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800 mb-2">7.3 Navegação GPS</h3>
                                    <p className="text-base leading-7">
                                        As rotas fornecidas pelo GPS são apenas sugestões. Você é responsável por seguir as leis de trânsito e usar seu julgamento profissional ao dirigir.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">8. Rescisão</h2>
                            <p className="text-base leading-7">
                                Reservamo-nos o direito de suspender ou encerrar seu acesso ao aplicativo a qualquer momento, sem aviso prévio, por violação destes termos ou por qualquer outro motivo. Ao término do seu vínculo empregatício, seu acesso será automaticamente revogado.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">9. Modificações dos Termos</h2>
                            <p className="text-base leading-7">
                                Podemos modificar estes termos a qualquer momento. As alterações entrarão em vigor imediatamente após a publicação no aplicativo. Seu uso continuado do aplicativo após as alterações constitui aceitação dos novos termos.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">10. Lei Aplicável</h2>
                            <p className="text-base leading-7">
                                Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa relacionada a estes termos será resolvida nos tribunais competentes do Brasil.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">11. Contato</h2>
                            <p className="text-base leading-7 mb-3">
                                Para dúvidas sobre estes termos de uso:
                            </p>
                            <ul className="list-disc pl-6 space-y-1.5">
                                <li><strong>Email:</strong> suporte@roterizacao.com.br</li>
                                <li><strong>Telefone:</strong> (31) 9999-9999</li>
                            </ul>
                        </section>

                        <hr className="my-8 border-slate-200" />

                        <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                            <p className="text-slate-700 leading-7">
                                <strong className="text-slate-900">Importante:</strong> Ao usar o aplicativo Roterizacao Driver, você confirma que leu, compreendeu e concordou com estes Termos de Uso e com nossa Política de Privacidade.
                            </p>
                        </div>

                        <div className="text-center text-sm text-slate-600 space-y-1 mt-8">
                            <p className="font-semibold text-slate-800">Roterizacao Driver</p>
                            <p>Versão 1.0</p>
                            <p>© 2024 Todos os direitos reservados</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
