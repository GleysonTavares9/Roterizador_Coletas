import { Card, CardContent } from '@/components/ui/card';

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Política de Privacidade</h1>
        <p className="text-base text-slate-600">Roterizacao Driver • Última atualização: 29 de dezembro de 2024</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">1. Introdução</h2>
              <p className="text-base leading-7">
                O aplicativo <strong className="text-slate-900">Roterizacao Driver</strong> ("nós", "nosso" ou "app") respeita sua privacidade e está comprometido em proteger seus dados pessoais. Esta política de privacidade explica como coletamos, usamos e protegemos suas informações.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">2. Informações que Coletamos</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">2.1 Dados de Localização</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>GPS em tempo real:</strong> Coletamos sua localização precisa enquanto você está em rota para:
                      <ul className="list-circle pl-6 mt-2 space-y-1">
                        <li>Rastreamento de entregas</li>
                        <li>Otimização de rotas</li>
                        <li>Segurança do motorista</li>
                        <li>Relatórios de desempenho</li>
                      </ul>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">2.2 Informações Pessoais</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                    <li>Nome completo</li>
                    <li>Email</li>
                    <li>Telefone</li>
                    <li>CPF (para identificação)</li>
                    <li>Foto de perfil (opcional)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">2.3 Dados do Dispositivo</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                    <li>Modelo do dispositivo</li>
                    <li>Sistema operacional</li>
                    <li><strong>Android ID</strong> (identificador único por app + dispositivo)</li>
                    <li>Nível de bateria</li>
                    <li className="text-red-600 font-semibold">❌ Não coletamos IMEI, número de telefone ou outros identificadores permanentes</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">2.4 Dados de Uso</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                    <li>Rotas realizadas</li>
                    <li>Coletas registradas</li>
                    <li>Fotos de comprovação</li>
                    <li>Mensagens trocadas com a central</li>
                    <li>Histórico de atividades</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">3. Como Usamos Seus Dados</h2>
              <p className="text-base leading-7 mb-3">Utilizamos suas informações para:</p>
              <ul className="list-none pl-0 space-y-2">
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Fornecer e melhorar nossos serviços</li>
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Rastrear entregas em tempo real</li>
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Gerar relatórios de desempenho</li>
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Comunicação entre motorista e central</li>
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Garantir segurança e conformidade</li>
                <li className="flex items-start"><span className="text-green-600 mr-2">✓</span> Suporte técnico</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">4. Compartilhamento de Dados</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">4.1 Com Quem Compartilhamos</h3>
                  <ul className="list-disc pl-6 space-y-1.5">
                    <li><strong>Sua empresa empregadora:</strong> Todos os dados de rotas e desempenho</li>
                    <li><strong>Provedores de serviço:</strong> Google Maps, Supabase (apenas para funcionalidade do app)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">4.2 Não Compartilhamos</h3>
                  <ul className="list-none pl-0 space-y-2">
                    <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Não vendemos seus dados</li>
                    <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Não compartilhamos com terceiros para marketing</li>
                    <li className="flex items-start"><span className="text-red-600 mr-2">✗</span> Não usamos para publicidade</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">5. Segurança dos Dados</h2>
              <p className="text-base leading-7 mb-3">Implementamos medidas de segurança:</p>
              <ul className="list-none pl-0 space-y-2">
                <li className="flex items-start"><span className="mr-2">🔒</span> Criptografia de dados em trânsito (HTTPS/TLS)</li>
                <li className="flex items-start"><span className="mr-2">🔒</span> Criptografia de dados em repouso</li>
                <li className="flex items-start"><span className="mr-2">🔒</span> Acesso restrito por autenticação</li>
                <li className="flex items-start"><span className="mr-2">🔒</span> Servidores seguros (Supabase)</li>
                <li className="flex items-start"><span className="mr-2">🔒</span> Backup regular de dados</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">6. Seus Direitos (LGPD)</h2>
              <p className="text-base leading-7 mb-3">Você tem direito a:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li><strong>Acessar</strong> seus dados pessoais</li>
                <li><strong>Corrigir</strong> informações incorretas</li>
                <li><strong>Excluir</strong> seus dados (direito ao esquecimento)</li>
                <li><strong>Portabilidade</strong> dos dados</li>
                <li><strong>Revogar</strong> consentimento</li>
              </ul>
              <p className="text-base leading-7 mt-3">
                Para exercer seus direitos, entre em contato: <a href="mailto:suporte@roterizacao.com.br" className="text-blue-600 hover:text-blue-800 underline font-medium">suporte@roterizacao.com.br</a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">7. Retenção de Dados</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li><strong>Dados de localização:</strong> Mantidos por 90 dias</li>
                <li><strong>Histórico de entregas:</strong> Mantidos por 5 anos (requisito legal)</li>
                <li><strong>Dados pessoais:</strong> Mantidos enquanto você for funcionário ativo</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">8. Cookies e Tecnologias Similares</h2>
              <p className="text-base leading-7 mb-3">O app não usa cookies, mas utiliza:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Tokens de autenticação (para manter login)</li>
                <li>Armazenamento local (para cache de dados)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">9. Alterações nesta Política</h2>
              <p className="text-base leading-7">
                Podemos atualizar esta política periodicamente. Notificaremos você sobre mudanças significativas através do app.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">10. Contato</h2>
              <p className="text-base leading-7 mb-3">Para dúvidas sobre privacidade:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li><strong>Email:</strong> suporte@roterizacao.com.br</li>
                <li><strong>Telefone:</strong> (31) 9999-9999</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-slate-200">11. Conformidade Legal</h2>
              <p className="text-base leading-7 mb-3">Este app está em conformidade com:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)</li>
                <li>Marco Civil da Internet (Lei 12.965/2014)</li>
              </ul>
            </section>

            <hr className="my-8 border-slate-200" />

            <div className="text-center text-sm text-slate-600 space-y-1">
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
