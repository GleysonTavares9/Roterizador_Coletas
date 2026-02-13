# Deploy no Vercel

O projeto está configurado para deploy automático no Vercel, transformando a API em Serverless Functions.

## Pré-Requisitos

1. Conta no [Vercel](https://vercel.com).
2. Projeto no GitHub/GitLab.

## Passo a Passo

1. **Importe o Repositório**: No painel do Vercel, clique em "Add New..." -> "Project" e selecione seu repositório.

2. **Configuração de Build**:
   - Framework Preset: **Vite** (Geralmente detectado automaticamente).
   - Root Directory: `./` (Raiz).

3. **Variáveis de Ambiente (Environment Variables)**:
   Adicione as seguintes variáveis nas configurações do projeto no Vercel:

   | Variável | Valor | Descrição |
   | :--- | :--- | :--- |
   | `VITE_SUPABASE_URL` | `https://seu-projeto.supabase.co` | URL pública do Supabase |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Chave pública (`anon`) |
   | `SUPABASE_URL` | `https://seu-projeto.supabase.co` | URL para o Backend |
   | `SUPABASE_KEY` | `eyJ...` | **Chave Service Role** (`service_role`) |
   | `VITE_API_URL` | *(Deixe Vazio)* | **NÃO PREENCHA**. Deixe vazio para usar rotas relativas. |

   > **Nota sobre `SUPABASE_KEY`**: Para o backend funcionar corretamente (inserir rotas, ler configurações globais), use a chave `service_role` (secreta), não a `anon`. Se usar a `anon`, pode ter erros de RLS (permissão).

4. **Deploy**: Clique em "Deploy".

## Funcionamento

O arquivo `vercel.json` na raiz do projeto configura o Vercel para:
1. Tratar arquivos em `api/*.ts` como Funções Serverless.
2. Redirecionar chamadas `/api/*` corretamente.
3. Servir o Frontend React nas outras rotas.

## Limitações (Serverless)

O plano Hobby do Vercel limita as funções a **10 segundos** de execução.
- Otimizações pequenas funcionarão normalmente.
- Otimizações muito grandes (milhares de pontos e OSRM requests) podem exceder o tempo limite e falhar.
- Se isso ocorrer, considere usar o plano Pro (60s) ou mover a otimização para "Background Jobs" (ex: QStash).
