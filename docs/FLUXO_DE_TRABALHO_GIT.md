# Fluxo de trabalho Git — equipe Juris Connect

Orientação para duas pessoas trabalharem com branches e Pull Requests sem sobrescrever mudanças locais. `main` é a branch estável; trabalho novo deve ocorrer em branches curtas e específicas.

## 1. Antes de iniciar o trabalho

Confirme que a branch está atualizada e que o checkout está limpo:

```bash
git status --short
git fetch origin
git branch -avv
```

Se existirem alterações no working tree, identifique quem as está usando antes de trocar de branch. Não use `git reset --hard`, `git clean`, `checkout` para descartar arquivos nem apague `.data` para “limpar” conflitos. Arquivos `.env` e dados locais devem continuar fora do commit.

### Situação encontrada nesta auditoria

- Branch ativa local: `feat/frontend`.
- `origin` está configurado para `https://github.com/Freitinhas18/juris-connect.git`.
- `feat/frontend` contém um commit local à frente de `origin/feat/frontend`.
- O checkout tem alterações locais modificadas e não rastreadas, além daquele commit. A branch local `main` também está atrás do `origin/main` no momento da auditoria.
- Portanto, o estado atual **não é reproduzível por um clone do remote**. O responsável deve revisar a lista de arquivos, decidir o conjunto que será compartilhado e publicar a branch/PR. Não adicione todos os arquivos automaticamente: há migrations, aplicação, testes e documentação de etapas anteriores misturados no estado local.

Este alerta descreve o estado observado, não substitui a revisão individual do diff nem autoriza commit/push automático.

## 2. Atualizar `main`

Use `main` como base estável depois de o responsável integrar as mudanças aprovadas:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
```

`--ff-only` impede criar um merge inesperado ao atualizar a branch estável. Se falhar porque as branches divergiram, pare e alinhe com o mantenedor; não force a atualização.

## 3. Criar uma branch por tarefa

Use prefixo e nome curto em kebab-case:

```bash
git switch -c feat/client-search
git switch -c fix/task-deadline-validation
git switch -c docs/local-setup
```

Convenções recomendadas:

- `feat/`: funcionalidade.
- `fix/`: correção.
- `docs/`: documentação.
- `test/`: testes.
- `chore/`: manutenção de ferramentas/configuração.

Evite duas pessoas editarem os mesmos arquivos sem combinar ownership. Para tarefas adjacentes, definam os contratos e interfaces primeiro e façam PRs pequenos.

## 4. Implementar, validar e revisar

Antes de editar e antes de commit:

```bash
git status --short
git diff --stat
git diff --check
```

Revise cada diff e inclua somente os arquivos da tarefa. Para o escopo atual, os comandos principais são:

```bash
pnpm --filter @juris-connect/api typecheck
pnpm --filter @juris-connect/web typecheck
pnpm --filter @juris-connect/web build
pnpm --filter @juris-connect/api test:safe
pnpm --filter @juris-connect/api test:browser:safe
```

Os dois últimos usam runners PowerShell e dados isolados em `juris_connect_test`; consulte [Instalação e desenvolvimento](./INSTALACAO_E_DESENVOLVIMENTO.md). Não execute migrations/tests apontando para uma URL compartilhada ou produção.

## 5. Commits

Use Conventional Commits, descrevendo uma mudança por commit e sem credenciais:

```text
feat(web): adiciona filtro por responsável em tarefas
fix(api): valida organização no vínculo de processo
test(web): cobre cadastro de empreendimento
docs: documenta instalação local
chore: atualiza configuração do pnpm
```

Antes do commit, veja o que será incluído:

```bash
git diff
git status --short
git diff --cached
```

Adicione arquivos específicos (não use `git add .` sem revisar):

```bash
git add apps/web/src/tasks/TasksPage.tsx apps/web/e2e/core-flows.spec.ts
git diff --cached --check
git commit -m "feat(web): adiciona filtro por responsável em tarefas"
```

Nunca adicione `.env`, `.env.local`, `.data`, `node_modules`, `.pnpm-store`, documentos do usuário, dumps, screenshots não solicitados ou tokens. Os templates `.env.example` são versionáveis e devem conter somente exemplos seguros.

## 6. Abrir e integrar Pull Requests

Publique somente a branch de trabalho e abra PR para `main`:

```bash
git push -u origin feat/client-search
```

No PR, descreva objetivo, mudanças, comandos/testes realmente executados, capturas quando relevantes e limitações. Peça revisão do outro desenvolvedor. Não integre se typecheck/build/teste aplicável falhar ou se o diff incluir dados locais/segredos.

Depois da aprovação, use o método de merge definido pelo mantenedor (squash ou merge commit). Não faça push direto em `main`. Exclua a branch remota somente após confirmar que o PR foi integrado e que nenhum trabalho depende dela.

## 7. Atualizar uma branch de trabalho

Para incorporar atualizações aprovadas de `main`, salve/commite primeiro suas próprias mudanças e então faça merge:

```bash
git status --short
git fetch origin
git switch feat/client-search
git merge origin/main
```

Se houver conflito:

1. Rode `git status` e identifique cada arquivo em conflito.
2. Converse com a outra pessoa se o mesmo arquivo estiver sendo alterado em paralelo.
3. Edite o conteúdo final preservando ambos os comportamentos necessários.
4. Rode typecheck e testes relacionados.
5. Marque apenas conflitos revisados com `git add <arquivo>` e finalize o merge.

Se não conseguir resolver com segurança, pare e peça revisão. Não escolha automaticamente “ours” ou “theirs” em arquivos de código, migrations ou documentação.

## 8. Segundo desenvolvedor: primeiro clone e atualizações

O mantenedor deve primeiro publicar a branch que contém o estado aprovado. Depois, o segundo desenvolvedor pode clonar a branch de trabalho:

```bash
git clone --branch feat/frontend --single-branch https://github.com/Freitinhas18/juris-connect.git
cd juris-connect
pnpm install --frozen-lockfile
```

Configure seus próprios `apps/api/.env` e `apps/web/.env.local` a partir dos templates, suba PostgreSQL com `pnpm db:up`, aplique migrations somente ao banco local e use os passos do guia de instalação. Não copie `.env`, diretórios `.data` ou documentos da primeira máquina.

Para atualizar a cópia:

```bash
git status --short
git fetch origin
git pull --ff-only origin feat/frontend
pnpm install --frozen-lockfile
```

Se houver trabalho local, faça commit em branch própria antes de atualizar e siga a etapa de merge acima. Não compartilhe estado copiando pastas do checkout de outra pessoa.

## 9. Regras do repositório

- `main` recebe apenas trabalho revisado.
- Um branch e um PR por assunto sempre que possível.
- Commits pequenos, descritivos e sem segredos.
- Não rebase/force-push uma branch que outra pessoa já utiliza sem acordo explícito.
- Migrations são aditivas e revisadas; desenvolvimento e testes usam bancos separados.
- Nunca executar reset, `git clean`, limpeza de volumes ou limpeza de armazenamento local como rotina de integração.
- Atualizar `PROJECT_STATUS.md` e `IMPLEMENTATION_LOG.md` quando a mudança alterar o estado técnico, validações ou próximas tarefas.
