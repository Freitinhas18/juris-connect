# Instalação e desenvolvimento local — Juris Connect

Guia conferido em 2026-11-13 contra os manifests, scripts, Docker Compose, configurações Vite/Fastify/Drizzle e runners deste repositório.

> **Estado da entrega ao segundo desenvolvedor:** no momento da auditoria, o checkout local está na branch `feat/frontend`, tem alterações locais não commitadas e a branch remota ainda não contém todo esse estado. Este documento e o código só ficam disponíveis após o responsável revisar e publicar as alterações. Nenhum commit ou push foi feito nesta etapa.

## 1. Pré-requisitos verificados

| Ferramenta | Versão/estado verificado | Observação |
| --- | --- | --- |
| Node.js | `v26.13.1` nesta máquina | O projeto não fixa versão em `.nvmrc`, `.node-version` ou `engines`. O Vite instalado declara `^20.19.0 || >=22.12.0`; Node 22.12+ atende ao requisito declarado. |
| pnpm | `10.34.9` nesta máquina | O `pnpm-lock.yaml` usa lockfile v9, mas `packageManager` não está fixado no `package.json`. Use a versão observada para reduzir diferenças. |
| PostgreSQL | Major 17 | `docker-compose.yml` usa a imagem `postgres:17`; o patch da imagem será atualizado pelo registry. |
| Docker Engine | `29.9.3` nesta máquina | Docker precisa estar iniciado. |
| Docker Compose | `v5.7.0` nesta máquina | O repositório usa `docker compose` v2 integrado; não usa o comando legado `docker-compose`. |
| Git | Necessário para clonar e colaborar | O remote atual é `origin` e aponta para o repositório GitHub configurado neste checkout. |
| Editor | VS Code ou editor com TypeScript | Recomendado; não é dependência obrigatória de runtime. |

No Windows 11, instale Docker Desktop com backend WSL 2 e virtualização habilitada. No Linux, use Docker Engine e o plugin Compose; no macOS, Docker Desktop. O Compose publica PostgreSQL em `localhost:5432`.

O desenvolvimento local (API/web) e os comandos pnpm são portáveis em princípio. **Os runners seguros de API e Playwright deste repositório são scripts PowerShell (`powershell`), e só foram verificados no Windows.** Não há ainda um runner POSIX equivalente validado para Linux/macOS.

## 2. Clonar e instalar

Após o responsável publicar a branch que contém a entrega atual, clone-a explicitamente. Até isso acontecer, clonar o remote não inclui as alterações locais descritas acima.

```powershell
git clone --branch feat/frontend --single-branch https://github.com/Freitinhas18/juris-connect.git
Set-Location juris-connect
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Se trabalhar em outra branch acordada com a equipe, ajuste `--branch`. No PowerShell, se a política local impedir a execução de `pnpm.ps1`, use `pnpm.cmd` nos comandos. Os scripts seguros já chamam PowerShell com `-ExecutionPolicy Bypass`; não é necessário enfraquecer a política global da máquina.

## 3. Criar os arquivos de ambiente

Crie cópias locais dos templates (não os edite para inserir valores locais; os arquivos `.env` são ignorados pelo Git):

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

`apps/api/.env.example` contém a URL local do PostgreSQL do Compose. Essa URL usa a senha de desenvolvimento definida no próprio `docker-compose.yml`; ela serve somente para a máquina local, não é segredo de produção. Gere valores aleatórios locais para as duas chaves vazias:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie a primeira saída para `DOCUMENT_ENCRYPTION_KEY` e a segunda para `AUTH_RATE_LIMIT_SECRET` em `apps/api/.env`. A chave de documentos deve ser Base64 canônico de 32 bytes. O segredo de rate limit deve ter ao menos 32 caracteres. Mantenha os valores somente no `.env` local; não os cole em issues, chats, capturas ou commits.

### Variáveis do backend (`apps/api/.env`)

| Variável | Finalidade | Exemplo local | Consumidor |
| --- | --- | --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL | `postgresql://juris:juris_dev@localhost:5432/juris_connect` | API, Drizzle Kit e migrations; confira o nome do banco antes de migrar. |
| `PORT` | Porta HTTP da API; opcional, padrão `3333` | `3333` | Fastify. |
| `DOCUMENT_STORAGE_PATH` | Diretório privado de arquivos | `./.data/documents` | API de documentos; relativo ao diretório `apps/api` quando os scripts pnpm executam o pacote. |
| `DOCUMENT_ENCRYPTION_KEY` | Chave AES-256-GCM para novos arquivos | Gere localmente; não reutilize a chave de outra máquina | API de documentos. Arquivos antigos podem continuar em claro. |
| `CORS_ORIGINS` | Lista de origens web autorizadas, separadas por vírgula; também usada no handshake Socket.IO | `http://localhost:5173` | Fastify, autenticação e Socket.IO. |
| `WEB_APP_URL` | Origem para links de verificação/recuperação de conta | `http://localhost:5173` | Rotas de autenticação. Deve constar também em `CORS_ORIGINS`. O envio de e-mail ainda não tem adaptador configurado. |
| `AUTH_RATE_LIMIT_SECRET` | Segredo HMAC dos limites de autenticação | Gere 32 bytes aleatórios em hex | API de autenticação; produção exige pelo menos 32 caracteres. |
| `TRUST_PROXY` | IPs/CIDRs de proxies explicitamente confiáveis | vazio no desenvolvimento local | Fastify; deixe vazio quando acessa diretamente em localhost. |

### Variáveis do frontend (`apps/web/.env.local`)

| Variável | Finalidade | Exemplo local | Consumidor |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Prefixo de API usado pelos módulos | `/api` | Aplicação Vite/React; o proxy remove `/api`. |
| `VITE_SOCKET_URL` | Endereço do servidor Socket.IO | `http://localhost:3333` | Cliente Socket.IO do navegador. |
| `VITE_API_PROXY_TARGET` | Destino do proxy HTTP de desenvolvimento; opcional, padrão `http://localhost:3333` | `http://localhost:3333` | `vite.config.ts`; se definir em `.env.local`, confirme que a versão do Vite/execução disponibiliza a variável ao processo de configuração; a forma verificável é exportá-la no shell antes de iniciar o Vite. |

O Vite escuta em `5173`; o proxy HTTP é configurado em `apps/web/vite.config.ts`. Socket.IO conecta diretamente à porta da API, não pelo proxy `/api`.

## 4. PostgreSQL e migrations

Na raiz do repositório:

```powershell
pnpm db:up
docker compose ps
docker compose exec -T db pg_isready -U juris -d juris_connect
```

O serviço cria o banco `juris_connect` e persiste os dados no volume nomeado `pgdata`. `pnpm db:down` para os containers e mantém o volume. **Não use `docker compose down -v`, `reset`, `truncate` ou limpeza do volume** para resolver erro de migration.

Depois de confirmar que `DATABASE_URL` aponta para `localhost:5432/juris_connect`, aplique migrations no banco local de desenvolvimento:

```powershell
pnpm --filter @juris-connect/api db:migrate
```

As migrations são aplicadas ao banco presente em `DATABASE_URL`; o comando não cria o banco. Sempre confira a URL antes de executá-lo. O `juris_connect` do Compose é o banco de desenvolvimento; `juris_connect_test` é reservado aos runners e seeds isolados.

Crie o banco de teste uma vez no PostgreSQL local, caso ainda não exista:

```powershell
docker compose exec -T db psql -U juris -d postgres -c "CREATE DATABASE juris_connect_test;"
```

Se o banco já existir, não repita o `CREATE DATABASE`; confira-o com:

```powershell
docker compose exec -T db psql -U juris -d postgres -c "SELECT datname FROM pg_database WHERE datname IN ('juris_connect', 'juris_connect_test');"
```

Os runners seguros leem `apps/api/.env`, recusam uma URL que não seja localhost/`juris_connect`, e derivam `juris_connect_test` e um diretório de documentos separado antes de migrar/testar. Não aponte esses runners para qualquer banco compartilhado.

## 5. Dados de demonstração

Para criar o cenário sintético reprodutível, use somente:

```powershell
pnpm --filter @juris-connect/api demo:seed:test
```

O script executa migrations e seed apenas em `localhost/juris_connect_test`, e grava arquivos em `apps/api/.data/test-documents/demo`. Ele falha se a URL ou diretório não passar nas verificações. O seed imprime um token de sessão temporário; não o compartilhe nem o registre em logs públicos. O usuário e a organização criados são sintéticos e exclusivos de teste.

Não use `pnpm --filter @juris-connect/api db:seed` para preparar a demonstração atual: esse seed legado cria um usuário sem fluxo moderno de autenticação e não configura a conta sintética do cenário MVP.

O envio de e-mail de verificação/recuperação não está configurado no servidor local. Assim, cadastro de conta pela UI pode responder indisponível; para login de demonstração, utilize a conta sintética criada pelo seed de teste e as instruções/fixtures de teste. Nunca use essa conta em ambiente compartilhado ou produção.

## 6. Iniciar a aplicação

Mantenha três terminais na raiz do repositório. Após aplicar migrations, inicie a API e o web:

```powershell
# Terminal 1 — PostgreSQL
pnpm db:up

# Terminal 2 — API (carrega apps/api/.env)
pnpm dev:api

# Terminal 3 — frontend (carrega apps/web/.env.local)
pnpm dev:web
```

URLs verificadas pela configuração:

- Frontend: <http://localhost:5173>
- API: <http://localhost:3333>
- Saúde da API: <http://localhost:3333/health>
- Saúde da conexão PostgreSQL: <http://localhost:3333/health/db>
- Socket.IO: servidor da API em `localhost:3333`.

Confira as respostas de saúde:

```powershell
Invoke-RestMethod http://localhost:3333/health
Invoke-RestMethod http://localhost:3333/health/db
```

## 7. Testes e validação

Comandos presentes nos scripts dos workspaces:

```powershell
pnpm --filter @juris-connect/api typecheck
pnpm --filter @juris-connect/web typecheck
pnpm --filter @juris-connect/web build
pnpm --filter @juris-connect/api exec drizzle-kit check
pnpm --filter @juris-connect/api test:safe
```

Para navegador, instale Chromium do Playwright uma vez e rode o runner isolado:

```powershell
pnpm --filter @juris-connect/web exec playwright install chromium
pnpm --filter @juris-connect/api test:browser:safe
```

Os runners `test:safe` e `test:browser:safe` requerem PowerShell no Windows, `apps/api/.env` configurado com a URL-base local de `juris_connect`, PostgreSQL acessível e banco `juris_connect_test` existente. O runner de navegador inicia API em `3334` e Vite em `5174`, executa seed sintético e armazena capturas em `.data/playwright-captures` por padrão (ou no diretório definido por `JURIS_UI_CAPTURE_DIR`). Os arquivos gerados ficam ignorados pelo Git.

Embora os comandos de typecheck/build e a execução manual da API/web não invoquem os scripts PowerShell, a suíte segura automatizada ainda não foi validada em Linux/macOS. Nesses sistemas, use Docker Compose e instale PowerShell 7 apenas se o comando `powershell` esperado pelos scripts estiver disponível; caso contrário, será necessário portar os runners. Não os substitua por testes apontados ao banco principal.

## 8. Armazenamento de documentos

O padrão local é `apps/api/.data/documents`, excluído do Git. Não coloque documentos de cliente nesse diretório de desenvolvimento. O seed/teste usa `apps/api/.data/test-documents`; as capturas Playwright ficam sob `.data/playwright-captures`. Os templates e `.gitignore` excluem `.data`, `.env`, `node_modules`, build e resultados dos testes.

Antes de compartilhar arquivo de log, backup ou captura, confira se não contém nomes, conteúdo documental, cookies, tokens ou caminhos privados. O storage local não é um serviço durável nem possui backup gerenciado nesta configuração.

## 9. Solução de problemas

### Docker não inicia

- Confirme Docker Desktop aberto e backend WSL 2/virtualização habilitados no Windows.
- Rode `docker info` e `docker compose version`.
- Valide o YAML sem iniciar serviços com `docker compose config --quiet`.

### PostgreSQL indisponível ou erro de conexão

```powershell
docker compose ps
docker compose logs --tail 100 db
docker compose exec -T db pg_isready -U juris -d juris_connect
Test-NetConnection localhost -Port 5432
```

Confirme host/porta/nome/usuário em `apps/api/.env` e aguarde o health do container. Não resolva removendo o volume. Se outra instalação já usa `5432`, ajuste a publicação no Compose somente após combinar a alteração com a equipe e atualize `DATABASE_URL` para a mesma porta.

### ExecutionPolicy do PowerShell

Os scripts de teste chamam `powershell -ExecutionPolicy Bypass` de forma pontual. Se o próprio `pnpm.ps1` for bloqueado, tente `pnpm.cmd`. Não altere política da máquina inteira para contornar o problema.

### Porta ocupada

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3333,3334,5173,5174,5432
```

API aceita `PORT`; Vite está configurado em `5173` e pode ser iniciado com `pnpm --filter @juris-connect/web exec vite --port 5174`. Ao mudar portas, alinhe `VITE_API_PROXY_TARGET`, `VITE_SOCKET_URL`, `CORS_ORIGINS` e `WEB_APP_URL`. Não encerre processos desconhecidos sem identificá-los.

Linux/macOS: `ss -ltnp` (Linux) ou `lsof -nP -iTCP -sTCP:LISTEN` (macOS).

### Dependências incompatíveis

Confira `node --version`, `pnpm --version` e rode `pnpm install --frozen-lockfile` na raiz. Use Node compatível com o requisito Vite (`^20.19.0 || >=22.12.0`) e pnpm 10.34.9, versão observada nesta máquina. Não edite o lockfile para resolver instalação local sem revisar o impacto no monorepo.

### Erro de migration

- Confirme `docker compose ps` e `pg_isready`.
- Confira o `DATABASE_URL` e o banco-alvo antes de qualquer migration.
- Rode `pnpm --filter @juris-connect/api exec drizzle-kit check` para validar journal/snapshots.
- Não use reset/truncate/drop nem modifique o banco principal. Se houver falha, guarde a mensagem de erro e peça revisão antes de reparo manual.

### Socket.IO não conecta

- Confira que a API está em `3333` e `VITE_SOCKET_URL` aponta para a mesma origem.
- A origem do frontend deve estar em `CORS_ORIGINS` (`http://localhost:5173` por padrão).
- Reinicie Vite depois de alterar `.env.local`; o browser deve usar sessão/cookie válida. O proxy `/api` não encaminha o Socket.IO.

## 10. Compatibilidade Linux/macOS (desenvolvimento manual)

Os comandos gerais de shell e Docker podem ser usados em bash/zsh, por exemplo:

```bash
git clone --branch feat/frontend --single-branch https://github.com/Freitinhas18/juris-connect.git
cd juris-connect
npm install --global pnpm@10.34.9
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm --filter @juris-connect/api db:migrate
pnpm dev:api
# em outros terminais:
pnpm dev:web
```

Gere e mantenha as chaves no `.env` local como descrito acima. Os runners seguros automatizados continuam Windows/PowerShell até serem portados e validados.
