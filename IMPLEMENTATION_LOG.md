# Juris Connect — registro de implementação

## 2026-11-13 — retomada e auditoria do estado

### Preservação e inspeção

- Lido o prompt mestre da evolução do projeto.
- Conferido `git status --short`, `git diff --stat` e `git diff --check` antes de novas alterações.
- O working tree já continha alterações extensas dos módulos, redesign, testes e migrations anteriores; nenhum conteúdo foi descartado.
- Não foram encontradas instruções `AGENTS.md` no checkout.
- Inspecionados manifests pnpm, `tsconfig.base.json`, schema Drizzle, migrations, seed, rotas, configuração do servidor e integração Socket.IO.
- Os arquivos `.env.example` foram consultados apenas para configuração; valores secretos de `.env` não foram exibidos.

### Confirmações importantes

- Stack atual: Fastify, Drizzle/PostgreSQL, Socket.IO, React/Vite e contratos compartilhados Zod.
- O schema não tem organizações, memberships, papéis, senhas, sessões ou tokens de verificação/recuperação.
- As rotas ainda não aplicam autenticação nem escopo de organização.
- Socket.IO recebe `userId` de `handshake.auth`; não é identidade autenticada. Canais não têm autorização de membro/privacidade.
- Documentos usam diretório privado configurável e validações de upload, mas metadados e arquivos não têm controle de acesso por organização.
- Atribuição de dados legados a tenants exige uma política explícita; não se fez backfill no banco principal.

### Verificações executadas

- `pnpm --filter @juris-connect/api typecheck` — passou.
- `pnpm --filter @juris-connect/web typecheck` — passou.
- `pnpm --filter @juris-connect/web build` — passou; Vite reportou bundle principal de aproximadamente 600,79 kB (> 500 kB).
- `pnpm --filter @juris-connect/api test:safe` — passou, 8/8; runner restringe conexão a `localhost/juris_connect_test` e usa armazenamento documental isolado.
- `pnpm --filter @juris-connect/api test:browser:safe` — passou, 2/2 cenários; cobre navegação, CRUD de demonstração, responsividade, dashboard, documentos e comunicação com Socket.IO incluindo reconexão/mensagem entre clientes de teste.
- `git diff --check` — passou.

### Banco e arquivos

- Nenhuma operação de escrita foi feita no banco principal nesta retomada.
- Testes e seed Playwright usam exclusivamente `juris_connect_test` e `.data/test-documents`.
- `apps/api/.data/documents` não foi alterado.

### Decisão e bloqueios

- Não ativar rotas de negócio sem identidade e tenant resolvidos: implementação parcial poderia dar falsa sensação de segurança.
- A migração de dados existentes requer definir organização proprietária, usuário proprietário e plano de reversão antes de qualquer aplicação ao banco principal. Isso é um bloqueio para migrar registros reais, não para preparar/testar o desenho em banco isolado.
- Envio real de verificação e recuperação por e-mail depende de provedor e credenciais externas. Nenhuma conta/serviço foi criada nem mensagem enviada.

### Alterações desta retomada

- Criado `PROJECT_STATUS.md` como estado factual e lista de pendências.
- Criado este `IMPLEMENTATION_LOG.md`.
- Implementada allowlist CORS por `CORS_ORIGINS`, tratamento de preflight, cabeçalhos HTTP básicos e exigência de allowlist explícita sob `NODE_ENV=production` em `apps/api/src/app.ts`.
- Documentada `CORS_ORIGINS` em `apps/api/.env.example`; os wrappers de testes configuram as origens de localhost usadas por eles.
- Incluído teste de cabeçalhos, CORS permitido/rejeitado e preflight em `apps/api/test/api.test.ts`.
- Nenhuma migration foi criada ou alterada nesta retomada.

### Verificação após o hardening

- `pnpm --filter @juris-connect/api typecheck` — passou.
- `pnpm --filter @juris-connect/web typecheck` — passou.
- `pnpm --filter @juris-connect/api test:safe` — passou, 9/9, incluindo a nova verificação HTTP.
- `pnpm --filter @juris-connect/api test:browser:safe` — passou, 2/2; a primeira tentativa sem elevação foi bloqueada pelo sandbox ao conectar em localhost, e foi repetida com a autorização ao runner seguro. O runner confirmou `juris_connect_test` e storage de teste.
- `pnpm --filter @juris-connect/web build` — passou; permanece aviso de chunk JavaScript ~600,79 kB.
- `git diff --check` — passou antes desta atualização documental; será repetido ao final.

### Limites desta mudança

- CORS e cabeçalhos são hardening básico, não autenticam usuários nem impedem clientes HTTP não navegador. Nenhuma rota de negócio foi protegida nesta etapa.
- O Socket.IO ainda usa a identidade demonstrativa, não ACL de canais.
- Não foram executados scans de vulnerabilidade externos, testes de carga ou testes com provedor real de e-mail.

### Próximo passo exato

Confirmar a política de ownership/backfill legado. Em seguida, implementar autenticação e multi-tenancy como um único corte seguro (schema, sessão, middleware, autorização tenant-aware para todas as rotas e arquivos, Socket.IO e testes negativos), protegendo todas as rotas antes de habilitar qualquer uso externo. Qualquer migration de validação deve ser aplicada apenas por runner apontado e validado para `juris_connect_test`.

## 2026-11-13 — retomada do prompt mestre: autenticação e isolamento (continuação)

### Auditoria antes de avançar

- Relido o prompt mestre e consultados `git status --short`, `git diff --stat` e `git diff --check`; as alterações preexistentes foram mantidas.
- Revisados schema/migrations, app Fastify, auth, rotas, Socket.IO, seed do banco de teste, wrappers seguros, testes API e Playwright.
- Confirmado o direcionamento de legado: preservar registros sem `organization_id` até mapeamento explícito. Não houve atribuição automática.

### Correções realizadas

- Corrigido o seed sintético: IDs de tarefas e ocorrências vinculados a documento agora são localizados dentro da organização demonstrativa; ocorrências reutilizadas recebem a organização de teste. A preparação do PDF falhava porque procurava tarefa sem tenant.
- Corrigidos os testes E2E para usar a sessão sintética tanto no navegador quanto nas chamadas API diretas. Cada chamada Playwright envia o cookie HTTP-only de teste e a origem autorizada.
- Ajustada a verificação de legado: ela cria e verifica uma linha sintética sem organização em vez de supor que todas as linhas pré-existentes do banco de teste são legado. O banco de teste pode conter o seed sintético já associado a uma organização.
- Encerrado o pool PostgreSQL ao final do arquivo de teste, evitando processo Node ficar aberto após passar.
- Implementada política central inicial de papéis: leitura e escrita para os três papéis; exclusão só para owner/admin. Testado que member não exclui. Não há ainda API de gerenciamento de memberships.
- A troca de organização ativa invalida sockets existentes para evitar receber conteúdo da organização anterior após o contexto mudar.
- Removidos avisos obsoletos do chat que diziam que identidade e canais privados não tinham autorização; a interface agora descreve os controles implementados.
- Implementado rate limit persistido, por HMAC de IP/rota, para operações públicas de cadastro, verificação, login e recuperação, adicional ao limite de senha por e-mail/IP. Adicionada exigência de `AUTH_RATE_LIMIT_SECRET` de 32+ caracteres no boot de produção e documentada a variável junto a `WEB_APP_URL` em `.env.example`.
- Estendidos testes de tentativa cruzada para leitura/edição/exclusão de clientes, empreendimentos e documentos, teste de membership em canal privado dentro da mesma organização e teste de rate limit de verificação.

### Testes repetidos

- `pnpm --filter @juris-connect/api typecheck` — aprovado.
- `pnpm --filter @juris-connect/web typecheck` — aprovado.
- `pnpm --filter @juris-connect/web build` — aprovado; chunk principal agora 607,72 kB (Vite mantém alerta acima de 500 kB).
- `pnpm --filter @juris-connect/api test:safe` — aprovado, 13/13; migration aplicada somente a `juris_connect_test`.
- `pnpm --filter @juris-connect/api test:browser:safe` — aprovado, 2/2; comunicação do seed/upload verificada após a correção.
- `git diff --check` — aprovado anteriormente; repetição final ainda pendente.

### Ocorrências durante validação

- Primeira execução E2E falhou ao criar documento (HTTP 400: vínculo de tarefa não encontrado); corrigida a busca por tenant e repetido com sucesso.
- Execução E2E posterior falhou antes dos cenários porque `APIRequestContext` não tem `setExtraHTTPHeaders`; o cookie foi movido para cabeçalhos explícitos em cada solicitação de API. Repetição: 2/2.
- A suíte API inicialmente assumia que todo o banco de teste estava sem tenants; essa hipótese não era compatível com o seed sintético preexistente. O teste agora verifica apenas o fixture legado recém-inserido. As tentativas anteriores falharam; a repetição final passou 13/13.

### Limites atuais

- A integração real de e-mail permanece pendente porque exige escolha/configuração de provedor; nenhuma mensagem real foi enviada. A API não habilita cadastro/recovery em produção sem sender.
- Isolamento é aplicado na camada da aplicação. RLS e FKs compostas tenant-aware ainda não foram implementados; precisa de revisão antes de uso com dados reais.
- O banco principal permanece intacto e não recebeu migration. `apps/api/.data/documents` foi preservado. Todas as migrations 0007–0010 foram aplicadas apenas no banco de teste pelos wrappers seguros.
- Nenhum serviço externo, domínio ou publicação foi acionado.

### Próximo passo exato

Fazer revisão de integridade referencial multiempresa e implementar as garantias possíveis no PostgreSQL sem backfill de dados legados; na sequência, rever fluxo de e-mail, gestão de membros/roles, testes de CSRF/expiração e auditoria. Nenhuma migration de tenant deve ser aplicada ao banco principal sem inventário, backup, reversão e autorização.

## 2026-11-13 — FKs tenant-aware, credenciais de teste e validação de login web

### Mudanças

- Criadas migrations `0011_lame_christian_walker.sql` e `0012_flimsy_nico_minoru.sql`.
- `0011` adiciona índices únicos compostos e FKs por `organization_id` nos relacionamentos centrais de clientes/empreendimentos/processos/tarefas/obrigações/ocorrências/evidências/documentos/canais/mensagens. A migration foi revisada para criar índices únicos antes das FKs. Colunas de tenant continuam nullable para preservar legado não atribuído.
- `0012` remove a FK composta de autoria de mensagens para membership: retirar um membro não deve exigir apagar mensagens históricas. `author_id` mantém sua FK de usuário; as mensagens novas derivam autoria da sessão. A decisão e a limitação estão documentadas.
- Teste direto no PostgreSQL confirma que uma FK composta rejeita associação de empreendimento da organização A a cliente da organização B. Também foram testados sessão expirada e rejeição de mutação sem Origin.
- Socket.IO agora valida o Origin da conexão contra a allowlist e revalida sessão a cada minuto; logout e redefinição de senha invalidam sockets locais, e mudança de organização encerra a sessão Socket.IO anterior.
- Limites de solicitação pública foram tornados atômicos com incremento/upsert retornando a contagem; teste concorrente confirma que chamadas paralelas não excedem o limite por rota/IP.
- Adicionados testes de logout que esperam desconexão imediata do Socket.IO e de rejeição de handshake de origem não autorizada.
- Links de verificação e recuperação passaram a carregar tokens na fragmentação `#token=...`; o frontend remove o fragmento da barra assim que o fluxo de conta inicia e mantém o token só em memória. Testes confirmam ausência de token na query string.
- Seed E2E usa senha sintética ASCII, evitando divergência de encoding PowerShell/UTF-8. O browser agora valida login e logout reais além dos fluxos existentes.

### Validação

- `pnpm --filter @juris-connect/api exec drizzle-kit check` — aprovado.
- `pnpm --filter @juris-connect/api typecheck` — aprovado.
- `pnpm --filter @juris-connect/web typecheck` — aprovado.
- `pnpm --filter @juris-connect/web build` — aprovado; bundle principal 607,88 kB, permanece aviso Vite >500 kB.
- `pnpm --filter @juris-connect/api test:safe` — aprovado 13/13; migrations 0011 e 0012 aplicadas e testes executados apenas em `juris_connect_test`.
- `pnpm --filter @juris-connect/api test:browser:safe` — aprovado 3/3, incluindo login/logout, navegação/persistência, documentos e comunicação; usuário/organização/arquivo sintéticos isolados.
- `git diff --check` — aprovado; restaram apenas avisos informativos de conversão LF/CRLF do Git no Windows.

### Falhas encontradas e resolvidas

- A primeira tentativa após `0011` encontrou que a FK composta de autoria bloqueava remover membership em limpeza de teste. Como histórico de mensagem deve sobreviver à saída de membro, removida essa constraint na migration `0012`; suíte passou depois.
- O primeiro login E2E falhou porque a senha sintética com acento foi corrompida pela codificação do PowerShell; substituída por senha ASCII exclusiva de fixture. Na repetição, login passou e o teste precisou de viewport desktop para que o botão de sair no rodapé da sidebar estivesse visível; repetição final 3/3.

### Segurança e próximos passos

- Migrations `0007`–`0012` foram aplicadas somente no banco local `juris_connect_test`; não houve conexão de escrita ao banco principal. `apps/api/.data/documents` segue preservado.
- RLS não foi ativado: os handlers atuais usam operações Drizzle por chamadas diretas a um pool compartilhado; uma implementação RLS correta exige contexto transacional de tenant consistente em todas as operações e testes de conexões reutilizadas. FKs compostas oferecem defesa parcial, mas não substituem RLS.
- Próximo passo: revisar vínculo de autoria/auditoria e demais relações, definir transações por tenant ou estratégia de RLS; depois fechar gestão de memberships, adaptador de e-mail (serviço externo ainda sem aprovação/configuração) e hardening de sessão/rate-limit/logs. Nenhum serviço externo foi contatado.

## 2026-11-13 — validação de origem de links de conta e proxy confiável

### Mudanças e verificações

- `TRUST_PROXY` agora só habilita proxies listados por IP/CIDR explícito; valores inválidos ou CIDRs irrestritos falham ao iniciar. Sem lista, o Fastify não confia nos cabeçalhos encaminhados.
- `WEB_APP_URL` é validada contra a origem exata da allowlist `CORS_ORIGINS`, rejeita credenciais/query/fragmento e exige HTTPS em produção. Cadastro, reenvio de confirmação e recuperação validam isso antes de persistir conta/token. Adicionado teste confirmando resposta 503, sem usuário criado e sem mensagem emitida para uma origem não permitida.
- `pnpm --filter @juris-connect/api typecheck` — aprovado.
- `pnpm --filter @juris-connect/api test:safe` — aprovado, 13/13; o primeiro intento sem permissão de loopback falhou com `EACCES`, repetido pelo runner aprovado e limitado ao banco `juris_connect_test` e storage isolado.
- `pnpm --filter @juris-connect/api test:browser:safe` — aprovado, 3/3.
- `pnpm --filter @juris-connect/web typecheck` — aprovado.
- `pnpm --filter @juris-connect/web build` — aprovado; chunk principal 607,88 kB e aviso Vite acima de 500 kB.
- `pnpm --filter @juris-connect/api exec drizzle-kit check` — aprovado.
- Nenhum provedor de e-mail real foi contatado. O banco principal e `apps/api/.data/documents` foram preservados.

## 2026-11-13 — revalidação de organização em sockets

- Auditoria identificou que a invalidação imediata de Socket.IO é local ao processo, e a verificação periódica anterior confirmava apenas a validade da sessão. Em implantação com mais de uma instância, uma sessão movida para outra organização poderia manter participação em salas antigas até a próxima revalidação.
- A revalidação agora exige que `activeOrganizationId` do socket corresponda à organização atual da sessão; mismatch desconecta o socket. A mesma validação é usada no timer e antes de processar entrada/envio de mensagens.
- Incluído teste de regressão com sessão atualizada diretamente no banco de teste, simulando mudança feita por outra instância; o socket autenticado no contexto anterior é desconectado.
- `pnpm --filter @juris-connect/api typecheck` — aprovado; `pnpm --filter @juris-connect/api test:safe` — aprovado, 13/13; `pnpm --filter @juris-connect/api test:browser:safe` — aprovado, 3/3.
- A janela de detecção passiva em outra instância continua limitada ao intervalo de 60 segundos. Antes de escalar horizontalmente, trocar por sinalização distribuída de revogação/pub-sub; sockets não são escalados entre processos neste momento.
- Todas as escritas ficaram em `juris_connect_test` e storage isolado; banco principal, documentos de produção e serviços externos não foram tocados.

## 2026-11-13 — consulta e revogação de sessões da própria conta

- Adicionado `GET /auth/sessions`, que retorna somente sessões válidas do usuário atual, com datas e indicador da sessão corrente; token e hash não são expostos.
- Adicionado `POST /auth/sessions/:id/revoke`, que só revoga outra sessão pertencente ao usuário autenticado. Tentativas de atingir sessão alheia/inexistente retornam 404; sessão corrente usa o fluxo de logout. Revogação invalida sockets locais.
- Configurações ganhou uma seção funcional com lista, estados de carregamento/erro, identificação da sessão atual e ação para encerrar sessões remotas. Não há coleta de IP, navegador ou geolocalização; `lastSeenAt` não é atualizado a cada requisição e a tela informa esse limite.
- Testes API verificam isolamento por usuário, campos retornados sem token/hash, bloqueio de auto-revogação, revogação persistida e rejeição do cookie. Playwright cria uma sessão secundária sintética, revoga pela tela e confirma que a API responde 401.
- Validação: API typecheck aprovado; frontend typecheck e build aprovados; API segura 13/13; Playwright 3/3; `drizzle-kit check` aprovado. O build reportou chunk principal de 610,64 kB (>500 kB).
- Uma execução Playwright inicial falhou por usar a origem web como destino da API; corrigido para a porta de API do runner (3334), mantida a origem autorizada no header; repetição final 3/3.
- Runner restringiu migração/dados ao banco `juris_connect_test` e storage isolado. Banco principal, diretório de documentos principal e serviços externos permaneceram intocados.

## 2026-11-13 — invalidação distribuída de sockets de autenticação

- Implementado canal PostgreSQL `LISTEN/NOTIFY` sem tabela/migration. Cada instância Socket.IO escuta eventos com apenas tipo e UUID de sessão/usuário; payloads inválidos são ignorados.
- Logout, troca de organização ativa, revogação de sessão e redefinição de senha publicam eventos depois da alteração no banco. A invalidação local continua imediata; notificações distribuem o encerramento entre processos. O listener reconecta com backoff de 1 a 30 segundos; a checagem periódica de sessão (60 segundos) permanece como fallback.
- API inicia o listener junto ao Socket.IO e o encerra com o servidor HTTP. Teste seguro sobe duas instâncias Socket.IO contra o PostgreSQL de teste, força o logout numa e observa desconexão da sessão conectada à outra. `test:safe`: 13/13; `test:browser:safe`: 3/3; typecheck da API aprovado.
- Isso distribui invalidação de autenticação, não salas/mensagens do Socket.IO. Para múltiplas instâncias com comunicação real-time escalada, ainda é necessário adapter compartilhado de Socket.IO. Em falha do listener, o polling oferece fallback limitado, não garantia de revogação imediata.
- Não houve schema change ou migration nesta alteração. Toda validação foi pelo runner restrito a `juris_connect_test` e storage isolado; banco principal e serviços externos não foram usados.

## 2026-11-13 — criptografia em repouso para novos documentos

- O storage agora grava uploads novos usando AES-256-GCM, com nonce aleatório, tag de autenticação e UUID do documento como AAD. Download/preview autenticam e descriptografam antes de responder; corrupção de ciphertext retorna erro sem enviar conteúdo adulterado.
- A API exige `DOCUMENT_ENCRYPTION_KEY`, Base64 canônico de exatamente 32 bytes, para iniciar e armazenar documentos. `.env.example` explica como gerar uma chave. Os wrappers seguros usam uma chave fixa apenas para fixtures sintéticas.
- Formato com magic versionado é detectado na leitura. Arquivos anteriores em claro seguem legíveis e permanecem sem alteração; não houve recriptografia do diretório existente. Configurar uma chave aleatória por ambiente, mantê-la fora do repositório e preservar backup da chave é necessário para abrir arquivos cifrados.
- Testes seguros verificam ciphertext físico (sem assinatura PDF em claro), round-trip byte a byte, rejeição de alteração GCM e compatibilidade de leitura do legado em claro. `test:safe` aprovado 13/13; Playwright seguro aprovado 3/3; API/frontend typechecks passaram.
- Limites: ainda não existe rotação da chave, KMS/envelope encryption, migração dos arquivos legados, storage durável/compartilhado ou plano de backup/restore. Nenhuma migration foi criada; banco principal, diretório de documentos existente e serviços externos não foram tocados.

## 2026-11-13 — expurgo dos limites de autenticação expirados

- Confirmado que os hashes HMAC de rate limit persistiam sem prazo de limpeza. Agora registros sem atualização por 30 dias são apagados oportunisticamente no máximo uma vez por hora por processo, antes de registrar uma nova solicitação pública. Em erro de banco, a janela de cleanup é reaberta para retry.
- Índice `auth_login_limits_updated_at_idx` adicionado na migration `0013_stale_viper.sql` para manter o expurgo temporal indexado. SQL gerado inspecionado: somente `CREATE INDEX`; sem remoção ou alteração de linhas.
- Teste seguro insere fixtures antigas/recente; a primeira requisição auth remove a antiga e preserva a recente. `pnpm --filter @juris-connect/api typecheck` aprovado; `test:safe` 13/13; `test:browser:safe` 3/3; `drizzle-kit check` aprovado.
- Migration foi aplicada apenas pelo runner seguro em `juris_connect_test`. Banco principal, arquivos de documentos existentes e serviços externos não foram acessados para escrita.

## 2026-11-13 — cobertura de isolamento entre organizações

- Ampliados os testes de regressão para `processes`, `tasks` e `obligations`: leituras, atualizações, exclusões, transferências de tarefa, ocorrências e evidências contra registros de outra organização; também são testados vínculos de criação cruzados e registros próprios nas duas organizações.
- As fixtures usam somente organizações, processos, tarefas e condicionantes sintéticos no banco `juris_connect_test`; o runner mantém armazenamento documental isolado.
- Validação final: API typecheck aprovado; `pnpm --filter @juris-connect/api test:safe` aprovado, 13/13. A primeira tentativa dentro do sandbox foi bloqueada por `EACCES` ao conectar ao PostgreSQL local; execução repetida pelo runner aprovado passou. `git diff --check` não reporta erros de whitespace (avisos LF/CRLF do Git no Windows são informativos).
- Nenhuma rota de produção precisou de alteração nesta cobertura. Banco principal, diretório de documentos principal e serviços externos permaneceram intocados.

## 2026-11-13 — administração de membros de organização

- Criadas rotas `GET/POST /auth/members` e `PATCH/DELETE /auth/members/:id`, sempre escopadas à organização ativa. A inclusão aceita apenas conta existente com e-mail verificado; não cria conta nem envia convite.
- Owner/admin podem administrar membros; somente owner pode atribuir, rebaixar ou remover outro owner. Operações bloqueiam auto-remoção e preservam pelo menos um owner. Alterações concorrentes de papel/remoção serializam as memberships da organização com `FOR UPDATE`.
- A remoção exclui a membership e, pelas FKs existentes, revoga sessões dessa organização e memberships de canais; os IDs de sessão são publicados para invalidação de sockets locais/remotos. Outras organizações e sessões do usuário permanecem independentes.
- Configurações agora lista membros, permite adicionar conta verificada, alterar papéis e remover associações, com estado de carregamento/erro/confirmação e atualização ao trocar de organização. O seed sintético cria uma conta de teste separada; Playwright valida inclusão, alteração e remoção.
- Testes API cobrem escopo multiempresa, conta não verificada, papéis, último owner, remoção de owner por admin e invalidação de sessão. API segura 13/13, Playwright seguro 3/3, API/web typechecks, build web e `drizzle-kit check` aprovados. Nenhuma migration foi necessária; build ainda sinaliza bundle de 615,74 kB acima de 500 kB.
- Testes e seed executaram somente em `juris_connect_test` e storage de demonstração isolado. Banco principal, armazenamento documental principal e serviços externos permaneceram intocados.
- Verificação concorrente adicional: duas tentativas simultâneas de rebaixar owners deixaram exatamente um owner. A primeira operação venceu; a segunda perdeu a autorização ao revalidar o papel e respondeu 403. `pnpm --filter @juris-connect/api test:safe` passou 13/13 depois da inclusão.
- As operações de associação, alteração de papel e remoção agora emitem eventos estruturados no logger Fastify com ator, alvo, organização e papéis; remoção também registra quantas sessões foram revogadas. E-mails, tokens e conteúdo de sessão não entram nesses eventos. Isso fornece trilha operacional em logs, mas ainda não substitui auditoria persistente/imutável.

## 2026-11-13 — trilha persistente de auditoria de membros

- Migration `0014_lonely_wonder_man.sql` cria `organization_audit_events`, com organização, ator, alvo opcional, ação, metadados JSON e data; FKs restritivas e índices por organização/data e ator. SQL revisado: apenas criação da tabela, FKs e índices.
- Inclusão, alteração de papel e remoção de membership gravam eventos na mesma transação da mudança; falha ao gravar auditoria desfaz também a alteração de acesso. Remoção registra a quantidade de sessões revogadas sem armazenar identificadores de sessão, e os metadados não guardam e-mail ou token.
- `GET /auth/audit-events` lista eventos da organização ativa somente para owner/admin, ordena do mais novo e aceita paginação por `before`/`limit`. Teste confirma ações, ator, ausência de e-mail e isolamento entre organizações.
- Migration aplicada somente pelo runner seguro em `juris_connect_test`; API typecheck e `drizzle-kit check` aprovados; `test:safe` 13/13.
- A tabela é append-only na API atual, mas o usuário do banco ainda pode alterar/remover linhas; a garantia de imutabilidade depende de privilégios separados/retention/WORM, ainda não configurados. Nenhuma escrita no banco principal ou serviço externo.
- Configurações agora apresenta os últimos 50 eventos para owner/admin, com nomes de ator/alvo, ação, papel e data, e atualiza a trilha após mudanças feitas na tela. API segura 13/13 e Playwright seguro 3/3; web typecheck/build aprovados (bundle 617,98 kB, aviso Vite >500 kB). A UI declara que o log não é imutável contra operadores do banco.

## 2026-11-13 — proteção append-only no banco de auditoria

- Migration `0015_append_only_audit.sql` instala triggers para rejeitar `UPDATE`, `DELETE` e `TRUNCATE` em `organization_audit_events`. Evita mutações acidentais por operações comuns, mas não resiste ao owner/superuser que desabilite triggers; WORM e privilégios separados seguem pendentes.
- Os testes de API exercitam as três operações proibidas. O cleanup remove somente fixtures de teste e desativa/reabilita os dois triggers durante a transação de teardown.
- API typecheck, `drizzle-kit check` e `test:safe` aprovados; 13/13 testes passaram. A primeira tentativa do runner foi bloqueada por EACCES do sandbox ao PostgreSQL local; a repetição autorizada pelo runner conectado apenas a `juris_connect_test` aplicou a migration.
- Banco principal e diretório `apps/api/.data/documents` permaneceram intocados.

## 2026-11-13 — RLS e contexto tenant por transação

- Auditoria confirmou que o banco de teste já tinha as migrations `0016_tenant_rls` e `0017_auth_rls` aplicadas. Os hashes SQL no histórico `drizzle.__drizzle_migrations` correspondem aos arquivos atuais; não foi criada migration duplicada. RLS cobre as 19 tabelas com `organization_id`.
- Políticas `FOR ALL` com `USING`/`WITH CHECK` isolam 17 tabelas de domínio, comunicação, documentos e auditoria por `app.organization_id`. `organization_memberships` também permite ao usuário consultar suas próprias associações; `sessions` permitem acesso do usuário às próprias sessões e do tenant às sessões da organização ativa. Nenhuma linha legada recebeu atribuição automática.
- `tenant-context.ts` injeta `app.organization_id` e `app.user_id` usando `set_config(..., true)`. Cada query standalone do pool contextualizado roda em transação curta; transações Drizzle usam o mesmo cliente e renovam o contexto antes de cada statement. Clientes são instrumentados uma única vez, inclusive se o pool os reutilizar. O hook Fastify libera o handler dentro do contexto após resolver a sessão; Socket.IO também envolve consultas com contexto explícito.
- A resolução de sessão passou a usar `resolve_juris_session(text)`, função `SECURITY DEFINER` com `search_path` fixo e execução pública revogada. Login define contexto de usuário para consultar membership e depois contexto org/usuário ao criar sessão.
- Startup em produção verifica role sem superuser/BYPASSRLS, sem propriedade das tabelas protegidas, presença de RLS/policies e permissão da função de sessão. `apps/api/scripts/create-runtime-role.sql` documenta criação da role de runtime com grants de DML, sem privilégios de schema, e grant explícito da função; executar como role dona do schema e usar credenciais separadas.
- A reconciliação global de arquivos agora não altera storage quando a role não pode enumerar documentos de todos os tenants; teste confirma preservação de arquivo sintético sob role restrita.
- `test/tenant-rls.test.ts` cria duas organizações e uma role descartável com `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, sem ser dona das tabelas. Verifica propriedades da role, falta de contexto, SELECT/INSERT/UPDATE/DELETE, FK cruzada, consultas paralelas, transações e rollback aninhados, reuso do pool, documentos, canais/mensagens, login, sessão, `/clients`, `/documents`, `/channels`, histórico e negação sem autenticação. Também inicia a API com `NODE_ENV=production` sob a role restrita para exercitar o guard.
- Correção durante validação: o primeiro teste Fastify retornou lista vazia porque `AsyncLocalStorage.enterWith` dentro de função async não propagava o tenant ao handler seguinte; o hook agora chama `done()` dentro de `runWithOrganizationContext`. O wrapper do pool também foi tornado idempotente; isso eliminou consultas travadas causadas por wrapping repetido dos mesmos clients.
- `test:safe` aprovado: 14/14 API, incluindo teste RLS; `test:browser:safe` aprovado: 3/3. O Playwright inicialmente falhou porque havia múltiplos eventos de remoção legítimos no histórico; locator ajustado para selecionar o primeiro evento visível. API/web typechecks, build web, `drizzle-kit check` e `git diff --check` aprovados. Bundle principal 617,98 kB; aviso Vite >500 kB permanece.
- Migrations aplicadas somente em `juris_connect_test`; fixtures de RLS e role temporária foram removidas pelo teste. Banco principal, diretório `apps/api/.data/documents` e serviços externos não foram alterados.
- Limitações: a role de produção ainda precisa ser criada e configurada em staging pelo responsável operacional; RLS baseado em GUC não resiste a SQL arbitrário deliberado executado pela própria aplicação; tabelas globais de identidade sem `organization_id` mantêm seus controles específicos. Próxima tarefa: validar a criação da role de runtime e conexão em staging, com migrations aplicadas por role proprietária separada, antes de qualquer dado não sintético.

## 2026-11-13 — finalização e validação do frontend

- Antes de editar, auditados `git status`, diff, manifests, páginas, e2e existente e documentação de status/log. O checkout já continha amplo trabalho não commitado de produto e backend; todo esse conteúdo foi preservado e esta etapa só alterou arquivos em `apps/web` e os dois documentos de status.
- As oito páginas de módulos foram convertidas para `React.lazy` com estado de carregamento via `Suspense`; chunk inicial do build foi reduzido de ~618 kB para 251,61 kB (78,09 kB gzip), sem warning de chunk >500 kB. Estilos de cada módulo também ficam em chunks próprios.
- Implementado o atalho indicado pela UI para busca (`Ctrl/⌘ K`). Corrigida a mensagem de segurança documental, que estava desatualizada: agora descreve o acesso autenticado e por organização, e deixa explícita a ausência de backup gerenciado do storage local.
- E2E foi expandido: cobre foco/navegação por teclado, nomes acessíveis dos botões, erros JavaScript não tratados, viewport desktop/notebook/tablet/celular, overflow horizontal da página e scroll interno de tabelas; CRUD do cliente e cadeia real cliente→empreendimento→processo→tarefa/condicionante; geração de ocorrência; além dos fluxos preexistentes de upload/download, comunicação em tempo real entre dois navegadores, autenticação, membros e auditoria.
- Playwright gera 36 capturas em `C:\Users\leand\.codex\visualizations\2026\11\12\01a1d196-ca9e-7980-9a83-9af07598fb2e`, nomeadas `module-<modulo>-<desktop|laptop|tablet|mobile>.png`, para 1440×1000, 1280×900, 768×1024 e 390×844. Capturas móveis de todos os módulos e de vários layouts desktop/tablet foram revisadas visualmente; overflow reportado inicialmente no `documentElement` era a largura interna da tabela rolável, e o teste foi refinado para verificar rolagem horizontal realmente disponível na página e scroll interno dos dados.
- Validação final: `pnpm --filter @juris-connect/api typecheck`, `pnpm --filter @juris-connect/web typecheck`, build web, `pnpm --filter @juris-connect/api test:safe` (14/14), `pnpm --filter @juris-connect/api test:browser:safe` (3/3), `drizzle-kit check` e `git diff --check` aprovados. A expectativa de status HTTP do endpoint de geração foi corrigida de 201 para 200 após observar a resposta real, sem alteração da API.
- Migrations, seeds e escritas automatizadas foram feitas apenas pelo runner seguro em `juris_connect_test`; armazenamento documental de testes separado. Banco principal, storage `apps/api/.data/documents`, autenticação/backend e módulos fora do escopo não foram alterados nesta etapa.
- Limitações da demonstração: configurações não suportadas permanecem indisponíveis; equipe/responsáveis são demonstrativos em tarefas/condicionantes; documentos usam storage local sem backup gerenciado. A aplicação pode ser demonstrada de forma guiada com dados sintéticos isolados, mas não está pronta para publicação ou dados jurídicos de clientes. Próxima tarefa de deployment segue sendo validar a role restrita em staging e fechar os itens operacionais de `PROJECT_STATUS.md`.

## 2026-11-13 — documentação de instalação e colaboração

- Adicionadas as instruções reproduzíveis de instalação local e execução em `docs/INSTALACAO_E_DESENVOLVIMENTO.md`, incluindo Docker Compose, migrations com conferência do alvo, configuração da API/Vite, execução dos typechecks, build e runners seguros. Valores sensíveis não foram copiados para documentação; o template contém apenas o valor local de desenvolvimento já definido no Compose.
- Adicionado `docs/FLUXO_DE_TRABALHO_GIT.md` com sincronização segura, branches por tarefa, revisão por diff e publicação via PR. O guia registra o estado observado: `feat/frontend`, um commit local à frente de `origin/feat/frontend`, working tree com mudanças preexistentes e `main` local atrás do remote. Sem commit/push nesta etapa.
- Adicionados `DATABASE_URL` e `PORT` ausentes ao template da API, `.pnpm-store/` ao ignore e caminho padrão de captura do Playwright sob `.data/` ignorado. O override `JURIS_UI_CAPTURE_DIR` permanece disponível.
- Validações registradas: Compose config, API/web typecheck, web build, `drizzle-kit check`, API segura 14/14, Playwright seguro 3/3 e `git diff --check` passaram. Os testes seguros restringem escrita ao banco `juris_connect_test` e ao armazenamento de teste. A pasta padrão de capturas não foi encontrada na checagem final; portanto, esse artefato precisa ser regenerado para distribuição local.
- Instalação congelada no sandbox encontrou `EPERM` ao criar link no store global externo ao workspace. Não é evidência de incompatibilidade do código; dependências já presentes sustentaram as validações, mas instalação limpa segue pendente.
- Próxima tarefa exata: em um ambiente que permita escrita no store pnpm, repetir `pnpm install --frozen-lockfile`; executar `pnpm --filter @juris-connect/api test:browser:safe` para materializar as capturas em `.data/playwright-captures`; por fim, revisar os arquivos locais e separar/publicar somente as alterações aprovadas pelo mantenedor.
- Capturas confirmadas após execução com diretório explícito: 39 PNGs em `.data/playwright-captures`, ignorados pelo Git. O Playwright seguro passou 3/3 novamente, com migrations/seed limitados ao banco `juris_connect_test` e arquivos de teste no storage isolado.
