# Juris Connect — estado do projeto

Atualizado em 13/11/2026.

## Estado resumido

A continuação da Fase 3 implementou autenticação por sessão, organizações e escopo multiempresa em rotas HTTP, canais, Socket.IO e documentos. As migrations `0007` a `0017` foram aplicadas somente no banco `juris_connect_test` pelos runners seguros. RLS foi validado com role temporária não proprietária e testes da API/navegador no ambiente isolado.

O produto ainda **não está pronto para dados jurídicos reais, lançamento ou exposição pública**. O envio de e-mail de cadastro/verificação e recuperação ainda não possui adaptador configurado; a autorização por papel é inicial; storage documental segue local, com arquivos legados em claro e sem serviço durável/backup; faltam etapas de hardening, qualidade e infraestrutura de produção. A aplicação ainda precisa ser configurada com a role restrita documentada, separada da role que aplica migrations.

Todas as alterações pré-existentes não commitadas foram preservadas. Não usar `reset`, `checkout`, `clean` ou comandos que descartem o estado do working tree.

## Arquitetura confirmada

- Monorepo pnpm com `apps/api`, `apps/web` e `packages/shared`.
- API Fastify 5, TypeScript, Drizzle ORM, PostgreSQL 17 e Socket.IO 4.
- Frontend React 19, Vite 8 e TypeScript; comunicação usa `socket.io-client` e os testes E2E usam Playwright.
- Contratos compartilhados incluem schemas Zod e tipos de domínio.
- Arquivos ficam fora do diretório público; caminho configurável por `DOCUMENT_STORAGE_PATH`.
- Banco de teste local isolado `juris_connect_test` e diretório separado `.data/test-documents`.

## Implementações de segurança presentes no checkout

- Contas com hash de senha via scrypt do Node.js (`N=32768`, sal aleatório e comparação em tempo constante); tokens de sessão/verificação/recuperação opacos, persistidos por hash.
- O endpoint autenticado `GET /auth/sessions` lista somente sessões ativas do próprio usuário e entrega metadados sem token/hash; `POST /auth/sessions/:id/revoke` encerra outra sessão da mesma conta e invalida sockets locais. A sessão corrente continua sendo encerrada pelo logout.
- Cadastro cria usuário, organização inicial e associação owner; exige confirmação de e-mail antes do login. Login, logout, consulta de perfil, seleção entre organizações, recuperação de senha de uso único e expiração/invalidação de sessão estão implementados.
- Sessão em cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção e validade de 14 dias. Requests de alteração exigem `Origin`; CORS usa lista exata `CORS_ORIGINS`; produção falha ao iniciar sem allowlist e `AUTH_RATE_LIMIT_SECRET` (mínimo 32 caracteres).
- Limites persistidos no PostgreSQL para senha incorreta por e-mail/IP e para solicitações públicas de autenticação por rota/IP. Chaves são HMAC, sem armazenar e-mail ou IP em claro nessa tabela.
- Roles `owner`, `admin`, `member`: todos podem ler e escrever operações de domínio; `owner`/`admin` podem excluir. Gestão de membros existente em `/auth/members` é restrita a owner/admin; adiciona somente contas já verificadas, bloqueia auto-remoção e remoção/rebaixamento do último owner, e revoga as sessões da organização quando uma associação é removida. Somente owner pode atribuir/remover papel owner. Ainda não há gestão de nome/configuração da organização.
- As rotas de negócio exigem sessão e filtram consultas e mutações pelo `organizationId` da sessão; vínculos entre entidades são validados no escopo da organização.
- RLS está habilitado em todas as 19 tabelas com `organization_id`: memberships e sessões têm políticas próprias de usuário/tenant; as outras 17 tabelas têm política `FOR ALL` com `USING` e `WITH CHECK` para `app.organization_id`. GUCs são aplicadas com `set_config(..., true)` dentro de transação; consultas avulsas do pool também recebem transação local e clients só são instrumentados uma vez.
- Em produção o startup falha se a role tiver `SUPERUSER`/`BYPASSRLS`, possuir tabela protegida, faltar policy/RLS ou não puder executar o resolvedor seguro de sessão. O resolvedor `SECURITY DEFINER` usa search_path fixo e recebe somente o hash do token. O script `apps/api/scripts/create-runtime-role.sql` prepara a role sem privilégios de schema; executar com a role dona do schema, em banco correspondente, e usar credencial separada no runtime.
- A reconciliação automática do diretório de documentos é ignorada quando a role não pode enumerar todos os documentos (role restrita), evitando marcar arquivos de outros tenants como órfãos.
- Socket.IO ignora `userId` do cliente, valida cookie e Origin no handshake e revalida a sessão periodicamente e nas operações; autor/organização vêm do servidor e canais privados exigem associação de membro. Logout, recuperação de senha, revogação e troca de organização publicam eventos PostgreSQL `LISTEN/NOTIFY` para invalidar sockets de outras instâncias; a checagem periódica continua como fallback.
- A revalidação Socket.IO compara a organização da sessão com a organização do socket. Eventos PostgreSQL distribuem revogações entre instâncias; se o listener estiver indisponível, a rechecagem de sessão é o fallback e pode levar até 60 segundos. O broadcast de mensagens/rooms do Socket.IO ainda requer um adapter compartilhado antes de escalar comunicação em tempo real.
- Metadados, preview, download, vínculo e exclusão de documentos exigem sessão e escopo da organização. Caminho de arquivo não é exposto ao navegador.
- Arquivos de documentos criados após esta alteração são criptografados em repouso com AES-256-GCM; UUID do registro é autenticado como AAD. A chave vem de `DOCUMENT_ENCRYPTION_KEY`, Base64 canônico de 32 bytes, e a API não inicia sem ela. Arquivos legados em claro continuam legíveis e não são reescritos automaticamente.
- CORS, preflight e cabeçalhos HTTP básicos (nosniff, frame, referrer, permissions e HSTS em produção) configurados.
- Frontend valida `/auth/me`, protege a aplicação visualmente, usa a identidade real e remove a antiga identidade demonstrativa Socket.IO. Dados legados sem associação não são atribuídos automaticamente e não aparecem em APIs escopadas.

## Migrations e legado

- Novas estruturas de organizações, associação de usuários, sessões, tokens, limites de login, memberships de canais e colunas `organization_id` estão nas migrations `0007`–`0010`. A migration `0013` adiciona índice temporal para expurgo dos limites antigos.
- FKs compostas por organização foram adicionadas às associações centrais entre clientes, empreendimentos, processos, tarefas, obrigações, ocorrências, evidências, documentos, canais e mensagens (`0011`). A migration `0012` remove a FK de autor de mensagem para membership porque a associação de um membro pode terminar enquanto as mensagens históricas devem permanecer; o autor ainda referencia `users` e a API grava o autor a partir da sessão.
- As colunas de tenant dos recursos existentes permitem `NULL` intencionalmente. Não houve backfill: registros legados ficam sem atribuição até mapeamento explícito, conforme decisão do usuário; a policy RLS não permite ler nem gravar linhas sem tenant.
- Migrations `0016_tenant_rls.sql` e `0017_auth_rls.sql` habilitam RLS e criam políticas nas 19 tabelas tenant-aware. `0017` também cria `resolve_juris_session(text)` com `SECURITY DEFINER`, revoga execução pública e limita a resolução a sessão válida/verificada. As migrations aplicadas em `juris_connect_test` correspondem aos hashes dos arquivos do journal.
- O banco principal não recebeu migrations ou escritas nesta continuação. O banco de teste contém o schema atualizado e cenário sintético repetível.
- O RLS complementa, mas não substitui, as verificações da API e FKs compostas. A role de aplicação precisa permanecer sem propriedade de tabela, `BYPASSRLS` ou superuser. A configuração via GUC é um limite de defesa para consultas da aplicação; não protege contra código SQL arbitrário executado deliberadamente pela própria role.

## Limitações e decisões externas

- O `AuthEmailSender` é injetável em testes, mas `server.ts` não configura provedor real. Cadastro, reenvio e recuperação retornam indisponível (503) sem adaptador; testes usam caixa de saída em memória e não enviam mensagens.
- scrypt é uma escolha sem dependência adicional, não Argon2id; avaliar custo operacional e política de senha antes do lançamento.
- Não há fluxo de convite por e-mail nem onboarding de novas contas porque o backend segue sem provedor configurado. Owner/admin podem associar contas verificadas já existentes, alterar papéis e remover membros. A seleção de organização funciona somente para associações existentes.
- Os campos de responsável/atribuição em tarefas, obrigações e documentos ainda não são referências consistentes a memberships; alguns valores são texto/IDs operacionais demonstrativos. Não devem ser tratados como autorização, nem garantem atribuição a uma conta existente.
- Tabelas globais sem `organization_id` (`users`, `organizations`, `auth_tokens`, `auth_login_limits`) não usam as políticas tenant das 19 tabelas; os fluxos de identidade têm controles próprios. Organização ainda é listada por associação da conta, e o resolvedor de sessão usa função restrita.
- Documentos antigos no diretório local permanecem em claro até uma migração operacional explícita. Não há rotação versionada da chave, KMS, objeto privado durável, política de retenção ou estratégia de backup/restauração; o diretório local segue inadequado a produção multi-instância/volátil.
- Falta rate limit distribuído com política contra abuso mais ampla, proteção contra credential stuffing refinada e armazenamento de auditoria WORM. Triggers bloqueiam DML comum nos eventos, mas owner/superuser pode desativá-los; não há storage WORM nem privilégios separados para a auditoria.
- Sem relatório de varredura de dependências, teste de carga, staging, HTTPS/proxy documentado ou procedimento completo de rollback.
- Requisitos LGPD, retenção, exportação, exclusão, contratos, operadores e bases legais exigem decisões operacionais, contratuais e jurídicas. Não se declara conformidade legal.
- Frontend usa carregamento sob demanda por módulo; na validação de 2026-11-13 o chunk inicial ficou em 251,61 kB (78,09 kB gzip), sem aviso do limite de 500 kB.

## Verificações atuais

| Verificação | Resultado |
| --- | --- |
| `pnpm --filter @juris-connect/api typecheck` | Aprovado |
| `pnpm --filter @juris-connect/web typecheck` | Aprovado |
| `pnpm --filter @juris-connect/web build` | Aprovado; chunk inicial 251,61 kB e módulos separados |
| `pnpm --filter @juris-connect/api test:safe` | Aprovado: 14/14, incluindo role sem owner/BYPASSRLS e API production-mode; usa `juris_connect_test` e storage isolado |
| `pnpm --filter @juris-connect/api test:browser:safe` | Aprovado: 3/3; login/logout, CRUD de cliente, relacionamentos entre módulos, condicionante/ocorrência, documentos, comunicação em tempo real e capturas responsivas |
| `pnpm --filter @juris-connect/api exec drizzle-kit check` | Aprovado; journal e snapshots consistentes |
| `git diff --check` | Aprovado; avisos Git de normalização LF/CRLF no Windows são informativos |

Migrations e testes com escrita foram executados apenas em `juris_connect_test`. Nenhuma escrita foi feita no banco principal ou em serviços externos. `apps/api/.data/documents` foi preservado.

## Finalização do frontend — 2026-11-13

- Mantida a identidade do redesign existente; módulos carregam sob demanda com `React.lazy`/`Suspense`. Chunk inicial passou de aproximadamente 618 kB para 251,61 kB (78,09 kB gzip); os módulos são bundles separados.
- Atalho exibido na busca agora funciona (`Ctrl/⌘ K` leva ao Dashboard e foca a pesquisa). Documentos deixou de exibir um aviso obsoleto sobre falta de autenticação; a tela informa proteção por sessão/organização e a limitação de armazenamento local sem backup gerenciado.
- Revisados visualmente os nove módulos em dados sintéticos: Dashboard, Clientes, Empreendimentos, Processos, Tarefas, Condicionantes, Documentos, Comunicação e Configurações. Capturas Playwright estão em `C:\Users\leand\.codex\visualizations\2026\11\12\01a1d196-ca9e-7980-9a83-9af07598fb2e`, no padrão `module-<modulo>-<desktop|laptop|tablet|mobile>.png` (1440, 1280, 768 e 390 px; 36 arquivos).
- E2E cobriu login/logout, navegação e nomes acessíveis de botões, erros JavaScript, pesquisa do Dashboard, CRUD do cliente, vínculo Cliente→Empreendimento→Processo→Tarefa/Condicionante, geração de ocorrência, listagem/administração de membros, auditoria, sessão, upload/download de documento, comunicação realtime em dois navegadores e rolagem interna de tabelas sem scroll horizontal da página.
- Resultados finais: API e web typecheck aprovados; build aprovado; API segura 14/14; Playwright seguro 3/3; `drizzle-kit check` e `git diff --check` aprovados. Migrations e fixtures ficaram restritas ao banco e storage de teste; banco principal e documentos existentes foram preservados.
- Pronto para demonstração guiada e controlada com dados sintéticos no ambiente isolado. Não declarar como serviço comercial/de produção: role de runtime ainda requer validação em staging; e-mail transacional, backup/armazenamento durável e demais pendências operacionais descritas acima seguem antes de dados de clientes.

## Próximas etapas

1. Revisar e aplicar a configuração de role separada no ambiente de staging (schema owner para migrations; role `NOSUPERUSER NOBYPASSRLS` para runtime), validar a variável `DATABASE_URL` e o guard de startup antes de migrar ambiente não local.
2. Definir contrato operacional do provedor de e-mail e implementar adaptador configurável; testar somente com transport/mailbox de teste até aprovação de envio real.
3. Cobrir com testes de regressão as rotas e vínculos restantes, expiração, CSRF, abuso/rate limit, isolamento de arquivos e sockets, e preparar migrações reversíveis.
4. Revisar auditoria/logs, segredos, uploads, dependências e privacidade; definir retenção/exportação/exclusão com responsáveis do produto/jurídico.
5. Planejar storage durável/privado, backup/restore, health/monitoramento, Docker de produção, proxy HTTPS, staging e rollback sem deploy automático.
6. Rever acessibilidade, experiência e desempenho (divisão de bundle), mantendo o design existente.

## Prontidão

Testes em ambiente isolado confirmam autenticação, RLS e políticas sob uma role restrita, mas ainda há lacunas operacionais e de produto. Adequado apenas para testes/demonstração controlada com dados sintéticos. **Não adequado para clientes, documentos jurídicos reais, deploy público ou uso comercial** até concluir a configuração do runtime em staging e os demais itens críticos.

## Verificação complementar — 2026-11-13

- `TRUST_PROXY` aceita somente IPs/CIDRs explícitos e rejeita configurações amplas como `true` e `0.0.0.0/0`; sem configuração, a API não confia em proxies.
- `WEB_APP_URL` usado em links de verificação/recuperação precisa ter origem listada em `CORS_ORIGINS`; credenciais, query e fragmento não são aceitos, e produção exige HTTPS. Cadastro, reenvio e recuperação falham sem criar tokens/contas quando a URL está inválida.
- API testou que origem inválida não persiste usuário nem envia e-mail; o teste de e-mail usa somente outbox em memória.
- Revalidados: API typecheck, 13/13 testes da API, frontend typecheck, build, `drizzle-kit check`, Playwright 3/3 e `git diff --check`.
- Foi corrigida e testada uma falha de sessão Socket.IO potencial em múltiplas instâncias: sessões cuja organização ativa mudou agora são desconectadas pela revalidação, mesmo quando a invalidação local não alcança aquele processo.
- Logout, recuperação de senha, troca de organização e revogação de sessão agora publicam invalidações via PostgreSQL `LISTEN/NOTIFY`; listener tem reconexão com backoff e falhas deixam a revalidação periódica como fallback. Teste com dois servidores Socket.IO simulados confirmou logout cross-instance.
- Configurações agora lista sessões ativas da própria conta e permite revogar sessões em outros dispositivos; API e Playwright cobrem leitura, ausência de tokens na resposta, revogação e rejeição posterior do cookie.
- Build mais recente do frontend: aprovado, chunk principal 610,64 kB (aviso do Vite acima de 500 kB).
- Storage validado: teste confirma ciphertext físico sem assinatura `%PDF`, round-trip de bytes, rejeição de corrupção de tag e leitura intacta de arquivo legado em claro. Runners usam uma chave conhecida somente para dados sintéticos; configure uma chave aleatória por ambiente fora do repositório.
- Limites HMAC de autenticação com `updated_at` anterior a 30 dias são expurgados, no máximo uma vez por hora por processo; migration `0013` indexa a coluna. Teste prova remoção do registro expirado e preservação do recente.
- Após `0013`, API segura passou 13/13, Playwright passou 3/3, API typecheck, `drizzle-kit check` e frontend build passaram. Migration aplicada somente em `juris_connect_test`.
- A gestão de membros foi adicionada à API e a Configurações: inclusão de conta confirmada, alteração de papel, remoção com revogação das sessões, proteção do último owner e escopo da organização ativa. Testes API cobrem permissões owner/admin/member, conta não verificada, isolamento e sessão revogada; E2E cobre adicionar, alterar e remover um membro sintético.
- Migration `0014` adiciona auditoria persistente das alterações de membro; eventos são criados atomicamente e podem ser consultados por owner/admin no tenant ativo. `test:safe` validou permissões, atomicidade funcional, conteúdo sem e-mail e escopo por organização; migration aplicada somente ao banco de teste.
- Migration `0015_append_only_audit.sql` adiciona triggers PostgreSQL que rejeitam `UPDATE`, `DELETE` e `TRUNCATE` em `organization_audit_events`; testes seguros exercitam as três operações. Isso reduz alterações acidentais por DML comum, mas owner/superuser ainda pode desativar triggers; não equivale a WORM nem a trilha inviolável. Aplicada somente em `juris_connect_test`.
- Configurações exibe os últimos 50 eventos com nomes de ator/alvo e metadados operacionais; Playwright validou o evento de remoção após a operação. API segura 13/13, Playwright 3/3, API/web typechecks e build web passaram; chunk principal 617,98 kB (aviso Vite permanece).
- Validação posterior: API e web typecheck, build web, `drizzle-kit check`, API segura 13/13 e Playwright seguro 3/3 aprovados. O build reporta bundle principal de 615,74 kB. Nenhuma migration foi necessária; operações de teste ficaram em `juris_connect_test`.
- Cobertura tenant-aware complementada para processos, tarefas e condicionantes: testes cruzados incluem update/delete, transferência de tarefa, ciclos/evidências de condicionantes e rejeição de vínculos a processos/empreendimentos de outra organização. API segura voltou a passar 13/13; API typecheck aprovado.
- O build ainda apresenta aviso de chunk principal de 607,88 kB. Os testes não conectam a um provedor real de e-mail e não substituem validação operacional de produção.
- A aplicação de migrations e as escritas dos testes passaram pelo runner seguro, limitado a `juris_connect_test` e storage temporário sob `.data/test-documents`. O banco principal e `apps/api/.data/documents` permanecem preservados.

## 2026-11-13 — instalação local e fluxo Git

- Criados `docs/INSTALACAO_E_DESENVOLVIMENTO.md` e `docs/FLUXO_DE_TRABALHO_GIT.md` com comandos reais do monorepo, variáveis de ambiente sem valores de segredos, inicialização local, banco de teste, validações e colaboração via branch/PR.
- `apps/api/.env.example` agora declara `DATABASE_URL` e `PORT` para que a cópia local tenha os parâmetros requeridos pelo servidor. A credencial mostrada é exclusivamente a senha local de desenvolvimento definida no Docker Compose; não é credencial de produção.
- `.gitignore` passou a ignorar `.pnpm-store/`. O runner seguro de navegador escolhe por padrão `.data/playwright-captures` no repositório, mantendo as capturas fora do controle de versão; o caminho pode ser sobrescrito por `JURIS_UI_CAPTURE_DIR`.
- `docker compose config --quiet`, typechecks de API/web, build web, `drizzle-kit check`, `test:safe` (14/14), `test:browser:safe` (3/3) e `git diff --check` foram aprovados nesta sessão. Testes com escrita foram isolados em `juris_connect_test` e no storage de teste.
- As capturas do registro anterior foram reportadas em diretório privado de visualizações, mas a pasta padrão `.data/playwright-captures` não está presente neste checkout neste momento. Não afirmamos que os PNGs estão entregues em um caminho reproduzível até a próxima execução do runner.
- `pnpm install --frozen-lockfile` no sandbox falhou com `EPERM` ao criar link do store global fora da área de escrita. Os pacotes existentes permitiram executar todas as validações listadas; a instalação limpa de dependências não foi confirmada nesta sessão.
- O working tree já continha alterações substanciais não publicadas, além destas mudanças. Nenhum commit ou push foi realizado; colaboradores não devem assumir que o remote contém o estado local atual. Antes de publicar, o mantenedor deve revisar e separar conscientemente o conjunto de arquivos.
- Pré-requisitos não fixados pelo projeto: Node observado `v26.13.1` (Vite declara `^20.19.0 || >=22.12.0`) e pnpm observado `10.34.9`; manifests não fixam `engines`/`packageManager`. Runners seguros dependem de PowerShell e foram validados somente no Windows.
- Pendências: confirmar instalação limpa num ambiente com acesso ao store, gerar novamente as capturas no diretório ignorado e revisar/publicar as alterações com o mantenedor. Não houve alteração no banco principal nem no storage principal de documentos.
- Correção do registro de capturas: repetido `test:browser:safe` com `JURIS_UI_CAPTURE_DIR` explicitamente apontando para `.data/playwright-captures`; 3/3 testes passaram e foram materializados 39 PNGs (Dashboard e oito módulos, incluindo desktop, laptop, tablet e mobile, além das capturas extras do Dashboard). A pasta é ignorada pelo Git. O runner padrão também passou, mas a variável explícita garantiu o caminho observado.
