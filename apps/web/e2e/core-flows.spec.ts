import { expect, test } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:5174";
function apiHeaders() {
  const token = process.env.DEMO_SESSION_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Playwright exige a sessão sintética gerada no banco juris_connect_test.");
  return { cookie: `juris_connect_session=${token}`, origin: apiOrigin };
}

test.beforeEach(async ({ context }) => {
  const token = process.env.DEMO_SESSION_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Playwright exige a sessão sintética gerada no banco juris_connect_test.");
  await context.addCookies([{ name: "juris_connect_session", value: token, url: apiOrigin, httpOnly: true, sameSite: "Strict" }]);
});

test("login e logout usam a sessão real do backend", async ({ context, page }) => {
  const password = process.env.DEMO_TEST_PASSWORD;
  if (!password) throw new Error("Credencial sintética de login ausente no runner isolado.");
  await context.clearCookies();
  await page.goto("/");
  await page.getByLabel("E-mail").fill("mvp-demo-user@juris-connect.test");
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("button", { name: /Sair da conta Usuário Sintético de Demonstração/ })).toBeVisible();
  await page.getByRole("button", { name: /Sair da conta/ }).click();
  await expect(page.getByRole("heading", { name: "Acesse seu espaço" })).toBeVisible();
});

test("módulos navegáveis, clientes persistidos e layout móvel", async ({ page, request }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const suffix = crypto.randomUUID();
  const clientName = `Fixture E2E ${suffix}`;
  let clientId = "";
  let enterpriseId = "";
  let processId = "";
  let taskId = "";
  let obligationId = "";

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText(/Indicadores derivados das listas da API/)).toBeVisible();
    await expect(page.getByText(/MVP Demonstração ·/).first()).toBeVisible();
    await page.keyboard.press("Control+k");
    const dashboardSearch = page.getByRole("textbox", { name: "Filtrar processos no painel" });
    await expect(dashboardSearch).toBeFocused();
    await dashboardSearch.fill("nenhum processo com este termo");
    await expect(page.getByText("Nenhum processo corresponde à pesquisa.")).toBeVisible();
    await dashboardSearch.fill("");
    if (process.env.JURIS_UI_CAPTURE_DIR) await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/dashboard-desktop.png`, fullPage: true });
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" });
    await page.setViewportSize({ width: 768, height: 1024 });
    if (process.env.JURIS_UI_CAPTURE_DIR) await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/dashboard-tablet.png`, fullPage: true });
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Clientes/ })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const label of ["Clientes", "Empreendimentos", "Processos", "Tarefas", "Condicionantes", "Documentos", "Comunicação", "Configurações", "Dashboard"]) {
      await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: new RegExp(label) }).click();
      await expect(page.locator("h1").first()).toBeVisible();
      if (process.env.JURIS_UI_CAPTURE_DIR) {
        const filename = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
        for (const viewport of [{ width: 1440, height: 1000, name: "desktop" }, { width: 1280, height: 900, name: "laptop" }, { width: 768, height: 1024, name: "tablet" }, { width: 390, height: 844, name: "mobile" }]) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/module-${filename}-${viewport.name}.png` });
          const overflow = await page.evaluate(() => {
            const viewport = window.innerWidth;
            const body = document.body.scrollWidth;
            const app = document.querySelector<HTMLElement>(".app-shell")?.scrollWidth ?? body;
            window.scrollTo({ left: 500, top: window.scrollY });
            const horizontalScroll = window.scrollX;
            window.scrollTo({ left: 0, top: window.scrollY });
            const wideTablesWithoutInternalScroll = Array.from(document.querySelectorAll("table")).filter((table) => table.getBoundingClientRect().width > viewport).filter((table) => {
              let parent = table.parentElement;
              while (parent) { const overflow = getComputedStyle(parent).overflowX; if (overflow === "auto" || overflow === "scroll") return false; parent = parent.parentElement; }
              return true;
            }).length;
            return { body, app, viewport, horizontalScroll, wideTablesWithoutInternalScroll };
          });
          expect(overflow.body <= overflow.viewport && overflow.app <= overflow.viewport && overflow.horizontalScroll === 0 && overflow.wideTablesWithoutInternalScroll === 0, `${label} ${viewport.name} page overflow: ${JSON.stringify(overflow)}`).toBeTruthy();
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      const unnamedButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title") && !button.getAttribute("aria-labelledby")).map((button) => button.outerHTML.slice(0, 180)));
      expect(unnamedButtons, `${label} contains buttons without an accessible name`).toEqual([]);
      expect(pageErrors, `${label} raised uncaught browser errors`).toEqual([]);
      if (label === "Comunicação") {
        await expect(page.getByText("Conectado", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: "mvp-demo-geral" })).toBeVisible();
        await page.getByRole("button", { name: "mvp-demo-geral" }).click();
        await expect(page.getByText(/Cenário de demonstração isolado/)).toBeVisible();
        const secondBrowser = await page.context().newPage();
        await secondBrowser.goto("/");
        await secondBrowser.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Comunicação/ }).click();
        await expect(secondBrowser.getByText("Conectado", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await secondBrowser.getByRole("button", { name: "mvp-demo-geral" }).click();
        await expect(secondBrowser.getByPlaceholder("Mensagem em #mvp-demo-geral")).toBeEnabled();
        const realtimeMessage = `Mensagem de teste ${crypto.randomUUID().slice(0, 8)}`;
        await page.getByPlaceholder("Mensagem em #mvp-demo-geral").fill(realtimeMessage);
        await page.getByRole("button", { name: "Enviar mensagem" }).click();
        await expect(secondBrowser.getByText(realtimeMessage)).toBeVisible({ timeout: 10_000 });
        await secondBrowser.close();
        if (process.env.JURIS_UI_CAPTURE_DIR) {
          for (const viewport of [{ width: 1440, height: 1000, name: "desktop" }, { width: 1280, height: 900, name: "laptop" }, { width: 768, height: 1024, name: "tablet" }, { width: 390, height: 844, name: "mobile" }]) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/module-comunicacao-${viewport.name}.png` });
            expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBeTruthy();
          }
          await page.setViewportSize({ width: 1440, height: 900 });
        }
      }
      if (label === "Configurações") {
        await expect(page.getByText("API respondeu e confirmou acesso ao banco de dados.")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Sessões da conta" })).toBeVisible();
        await expect(page.getByText("Este dispositivo", { exact: true })).toBeVisible();
        await expect(page.getByText("Sessão atual", { exact: true })).toBeVisible();
        const password = process.env.DEMO_TEST_PASSWORD;
        if (!password) throw new Error("Credencial sintética ausente para validar revogação de sessão.");
        const secondLogin = await request.post("http://127.0.0.1:3334/auth/login", { headers: apiHeaders(), data: { email: "mvp-demo-user@juris-connect.test", password } });
        expect(secondLogin.status()).toBe(200);
        const secondToken = secondLogin.headers()["set-cookie"]?.match(/juris_connect_session=([A-Za-z0-9_-]{43})/)?.[1];
        expect(secondToken).toBeTruthy();
        const secondSessionsResponse = await request.get("http://127.0.0.1:3334/auth/sessions", { headers: { cookie: `juris_connect_session=${secondToken}`, origin: apiOrigin } });
        expect(secondSessionsResponse.status()).toBe(200);
        const secondSessions = await secondSessionsResponse.json() as Array<{ id: string; isCurrent: boolean }>;
        const secondSession = secondSessions.find((session) => session.isCurrent);
        expect(secondSession).toBeTruthy();
        await page.locator(".settings-section").nth(1).getByRole("button", { name: "Atualizar lista" }).click();
        const revokeButton = page.getByRole("button", { name: "Encerrar sessão" });
        await expect(revokeButton).toHaveCount(1);
        const revokeResponse = page.waitForResponse((response) => response.url().endsWith(`/auth/sessions/${secondSession!.id}/revoke`) && response.request().method() === "POST");
        await revokeButton.click();
        expect((await revokeResponse).status()).toBe(204);
        await expect(page.getByRole("button", { name: "Encerrar sessão" })).toHaveCount(0);
        const revokedProfile = await request.get("http://127.0.0.1:3334/auth/me", { headers: { cookie: `juris_connect_session=${secondToken}`, origin: apiOrigin } });
        expect(revokedProfile.status()).toBe(401);
        const teammateEmail = "mvp-demo-teammate@juris-connect.test";
        await page.getByLabel("E-mail de conta verificada").fill(teammateEmail);
        const addMember = page.waitForResponse((response) => response.url().endsWith("/auth/members") && response.request().method() === "POST");
        await page.getByRole("button", { name: "Adicionar conta" }).click();
        expect((await addMember).status()).toBe(201);
        const teammateRow = page.locator(".settings-member-row").filter({ hasText: teammateEmail });
        await expect(teammateRow).toBeVisible();
        const teammateRole = page.getByLabel("Papel de Pessoa Sintética da Equipe");
        const updateRole = page.waitForResponse((response) => /\/auth\/members\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === "PATCH");
        await teammateRole.selectOption("admin");
        expect((await updateRole).status()).toBe(200);
        const removeMember = page.waitForResponse((response) => /\/auth\/members\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === "DELETE");
        page.once("dialog", (dialog) => void dialog.accept());
        await teammateRow.getByRole("button", { name: "Remover" }).click();
        expect((await removeMember).status()).toBe(204);
        await expect(page.locator(".settings-member-row").filter({ hasText: teammateEmail })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Auditoria de acesso" })).toBeVisible();
        await expect(page.getByText("Membro removido", { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/não possuem suporte funcional/)).toBeVisible();
        if (process.env.JURIS_UI_CAPTURE_DIR) {
          for (const viewport of [{ width: 1440, height: 1000, name: "desktop" }, { width: 1280, height: 900, name: "laptop" }, { width: 768, height: 1024, name: "tablet" }, { width: 390, height: 844, name: "mobile" }]) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/module-configuracoes-${viewport.name}.png` });
            expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBeTruthy();
          }
          await page.setViewportSize({ width: 1440, height: 900 });
        }
      }
    }

    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Clientes/ }).click();
    await expect(page.getByText(/clientes recebidos da API/)).toBeVisible();
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByLabel(/Nome ou razão social/).fill(clientName);
    await page.getByLabel(/Contato principal/).fill("Fixture automatizada");
    await page.getByLabel(/E-mail/).fill(`e2e-${suffix}@example.test`);
    await page.getByLabel(/Telefone/).fill("(11) 3000-4000");
    await page.getByRole("dialog").getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(page.getByText(clientName)).toBeVisible();

    const created = await request.get("http://127.0.0.1:3334/clients", { headers: apiHeaders() });
    expect(created.ok()).toBeTruthy();
    const records = await created.json() as Array<{ id: string; name: string }>;
    clientId = records.find((record) => record.name === clientName)?.id ?? "";
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.getByText(clientName).click();
    await expect(page.getByRole("dialog", { name: clientName })).toBeVisible();
    await page.getByRole("button", { name: "Editar cadastro" }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar cliente" });
    await editDialog.getByLabel(/Nome ou razão social/).fill(`${clientName} editado`);
    const updateResponse = page.waitForResponse((response) => response.url().includes(`/clients/${clientId}`) && response.request().method() === "PUT");
    await editDialog.getByRole("button", { name: "Salvar alterações" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.getByText(`${clientName} editado`)).toBeVisible();

    await page.getByPlaceholder("Buscar por nome ou empresa...").fill("sem correspondência");
    await expect(page.getByText(/Nenhum cliente encontrado/)).toBeVisible();

    const enterpriseName = `Fixture E2E Empreendimento ${suffix}`;
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Empreendimentos/ }).click();
    await page.getByRole("button", { name: "Novo empreendimento" }).click();
    const enterpriseDialog = page.getByRole("dialog", { name: "Novo empreendimento" });
    await enterpriseDialog.getByLabel(/Nome do empreendimento/).fill(enterpriseName);
    await enterpriseDialog.getByLabel(/Cliente vinculado/).selectOption(clientId);
    await enterpriseDialog.getByLabel(/Tipo de empreendimento/).fill("Condomínio de demonstração");
    await enterpriseDialog.getByLabel(/Atividade principal/).fill("Operação sintética para teste");
    await enterpriseDialog.getByLabel(/Responsável principal/).fill("Equipe de demonstração");
    await enterpriseDialog.getByLabel(/Endereço/).fill("Rua Sintética, 100");
    await enterpriseDialog.getByLabel(/Município/).fill("São Paulo");
    const createEnterprise = page.waitForResponse((response) => response.url().endsWith("/enterprises") && response.request().method() === "POST");
    await enterpriseDialog.getByRole("button", { name: "Cadastrar empreendimento" }).click();
    const enterpriseResponse = await createEnterprise;
    expect(enterpriseResponse.status()).toBe(201);
    enterpriseId = (await enterpriseResponse.json() as { id: string }).id;
    await expect(page.getByText(enterpriseName)).toBeVisible();

    const processName = `Fixture E2E Processo ${suffix}`;
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Processos/ }).click();
    await page.getByRole("button", { name: "Novo processo" }).click();
    const processDialog = page.getByRole("dialog", { name: "Novo processo" });
    await processDialog.getByLabel(/Nome do processo/).fill(processName);
    await processDialog.getByLabel(/Empreendimento vinculado/).selectOption(enterpriseId);
    await processDialog.getByLabel(/Responsável interno/).fill("Equipe de demonstração");
    const startDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await processDialog.getByLabel(/Data de início/).fill(startDate);
    await processDialog.getByLabel(/Prazo previsto/).fill(dueDate);
    const createProcess = page.waitForResponse((response) => response.url().endsWith("/processes") && response.request().method() === "POST");
    await processDialog.getByRole("button", { name: "Cadastrar processo" }).click();
    const processResponse = await createProcess;
    expect(processResponse.status()).toBe(201);
    processId = (await processResponse.json() as { id: string }).id;
    await expect(page.getByText(processName)).toBeVisible();
    await page.getByText(processName).click();
    const processDetails = page.getByRole("dialog", { name: processName });
    await expect(processDetails.getByText(enterpriseName)).toBeVisible();
    await expect(processDetails.getByText(`${clientName} editado`)).toBeVisible();
    await processDetails.getByRole("button", { name: "Fechar detalhes" }).click();

    const taskTitle = `Fixture E2E Tarefa ${suffix}`;
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Tarefas/ }).click();
    await page.getByRole("button", { name: "Nova tarefa" }).click();
    const taskDialog = page.getByRole("dialog", { name: "Nova tarefa" });
    await taskDialog.getByLabel(/Título da tarefa/).fill(taskTitle);
    await taskDialog.getByLabel(/Processo vinculado/).selectOption(processId);
    const createTask = page.waitForResponse((response) => response.url().endsWith("/tasks") && response.request().method() === "POST");
    await taskDialog.getByRole("button", { name: "Criar tarefa" }).click();
    const taskResponse = await createTask;
    expect(taskResponse.status()).toBe(201);
    taskId = (await taskResponse.json() as { id: string }).id;
    await expect(page.getByText(taskTitle)).toBeVisible();

    const obligationTitle = `Fixture E2E Condicionante ${suffix}`;
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Condicionantes/ }).click();
    await page.getByRole("button", { name: "Nova condicionante" }).click();
    const obligationDialog = page.getByRole("dialog", { name: "Nova condicionante" });
    await obligationDialog.getByLabel(/Título da obrigação/).fill(obligationTitle);
    await obligationDialog.getByLabel(/Processo vinculado/).selectOption(processId);
    await obligationDialog.getByLabel(/Periodicidade/).selectOption({ label: "Mensal" });
    await obligationDialog.getByLabel(/Data do primeiro vencimento/).fill(dueDate);
    const createObligation = page.waitForResponse((response) => response.url().endsWith("/obligations") && response.request().method() === "POST");
    await obligationDialog.getByRole("button", { name: "Cadastrar condicionante" }).click();
    const obligationResponse = await createObligation;
    expect(obligationResponse.status()).toBe(201);
    obligationId = (await obligationResponse.json() as { id: string }).id;
    await expect(page.getByText(obligationTitle)).toBeVisible();
    await page.getByText(obligationTitle).click();
    const obligationDetails = page.getByRole("dialog", { name: obligationTitle });
    await expect(obligationDetails.getByText(processName)).toBeVisible();
    await expect(obligationDetails.getByText("Ocorrências por período")).toBeVisible();
    const generateOccurrence = page.waitForResponse((response) => response.url().endsWith(`/obligations/${obligationId}/occurrences`) && response.request().method() === "POST");
    await obligationDetails.getByRole("button", { name: "Gerar próxima ocorrência" }).click();
    expect((await generateOccurrence).status()).toBe(200);
    await expect(obligationDetails.getByText("Ocorrência já programada")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    if (process.env.JURIS_UI_CAPTURE_DIR) await page.screenshot({ path: `${process.env.JURIS_UI_CAPTURE_DIR}/dashboard-mobile.png`, fullPage: true });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Documentos/ })).toBeVisible();
  } finally {
    if (taskId) await request.delete(`http://127.0.0.1:3334/tasks/${taskId}`, { headers: apiHeaders() });
    if (obligationId) await request.delete(`http://127.0.0.1:3334/obligations/${obligationId}`, { headers: apiHeaders() });
    if (processId) await request.delete(`http://127.0.0.1:3334/processes/${processId}`, { headers: apiHeaders() });
    if (enterpriseId) await request.delete(`http://127.0.0.1:3334/enterprises/${enterpriseId}`, { headers: apiHeaders() });
    if (clientId) await request.delete(`http://127.0.0.1:3334/clients/${clientId}`, { headers: apiHeaders() });
  }
});

test("importação de documento legado, vínculo, preservação e download", async ({ page, request }) => {
  const suffix = crypto.randomUUID();
  const name = `Documento legado E2E ${suffix}`;
  const legacyId = `legacy-e2e-${suffix}`;
  const clientName = "Residencial Aurora";
  let clientId = "";
  let documentId = "";
  try {
    const prior = await request.get("http://127.0.0.1:3334/documents", { headers: apiHeaders() });
    const priorRecords = await prior.json() as Array<{ id: string; name: string }>;
    for (const record of priorRecords.filter((item) => item.name.startsWith("Documento legado E2E "))) await request.delete(`http://127.0.0.1:3334/documents/${record.id}`, { headers: apiHeaders() });
    const clientResponse = await request.post("http://127.0.0.1:3334/clients", { headers: apiHeaders(), data: { name: clientName, kind: "Condomínio", document: "", contactName: "Fixture E2E", email: `legacy-${suffix}@example.test`, phone: "(11) 3000-4000", address: "", notes: "", status: "active" } });
    expect(clientResponse.status()).toBe(201);
    clientId = (await clientResponse.json() as { id: string }).id;
    const legacyRecord = { id: legacyId, name, originalName: "legacy.pdf", extension: "PDF", mimeType: "application/pdf", size: 32, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), description: "Import fixture", category: "Outros", responsible: "Fixture E2E", status: "Em análise", history: [], links: { clientIds: ["demo-client-aurora"], enterpriseIds: [], processIds: [], taskIds: [], occurrences: [] } };
    await page.goto("/");
    await page.evaluate(async ({ record, bytes }) => {
      localStorage.setItem("juris-connect:demo-documents:v1", JSON.stringify([record]));
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("juris-connect-demo-documents", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("files");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("files", "readwrite");
          transaction.objectStore("files").put(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }), record.id);
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    }, { record: legacyRecord, bytes: Array.from(Buffer.from("%PDF-1.4\nSynthetic legacy E2E file\n")) });
    await page.goto("/");
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /Documentos/ }).click();
    await page.getByRole("button", { name: "Importar arquivo e metadados" }).click();
    await expect(page.getByRole("dialog", { name: "Adicionar documento" })).toBeVisible();
    await expect.poll(() => page.locator("select[multiple]").first().evaluate((element) => Array.from((element as HTMLSelectElement).selectedOptions, (option) => option.value))).toEqual([clientId]);
    await expect(page.getByRole("region", { name: "Vínculos legados sem correspondência" })).toBeHidden();
    const uploaded = page.waitForResponse((response) => response.url().endsWith("/api/documents") && response.request().method() === "POST");
    await page.getByRole("dialog", { name: "Adicionar documento" }).getByRole("button", { name: "Importar arquivo e metadados" }).click();
    expect((await uploaded).status()).toBe(201);
    const response = await request.get("http://127.0.0.1:3334/documents", { headers: apiHeaders() });
    const records = await response.json() as Array<{ id: string; name: string; originalName: string }>;
    const saved = records.find((record) => record.name === name);
    documentId = saved?.id ?? "";
    expect(documentId).toBeTruthy();
    expect(saved?.originalName).toBe("legacy.pdf");
    const fileResponse = await request.get(`http://127.0.0.1:3334/documents/${documentId}/file`, { headers: apiHeaders() });
    expect(fileResponse.headers()["content-disposition"]).toContain("legacy.pdf");
    const imported = await request.get(`http://127.0.0.1:3334/documents/${documentId}`, { headers: apiHeaders() });
    expect((await imported.json() as { links: { clientIds: string[] } }).links.clientIds).toEqual([clientId]);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar arquivo" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    expect(await page.evaluate(() => localStorage.getItem("juris-connect:demo-documents:v1"))).not.toBeNull();
    expect(await page.evaluate(async (id) => await new Promise<boolean>((resolve, reject) => {
      const open = indexedDB.open("juris-connect-demo-documents", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result; const request = db.transaction("files", "readonly").objectStore("files").get(id); request.onsuccess = () => { db.close(); resolve(request.result instanceof Blob); }; request.onerror = () => { db.close(); reject(request.error); }; };
    }), legacyId)).toBe(true);
  } finally {
    if (!documentId) {
      const response = await request.get("http://127.0.0.1:3334/documents", { headers: apiHeaders() }).catch(() => null);
      if (response?.ok()) {
        const records = await response.json() as Array<{ id: string; name: string }>;
        documentId = records.find((record) => record.name === name)?.id ?? "";
      }
    }
    if (documentId) await request.delete(`http://127.0.0.1:3334/documents/${documentId}`, { headers: apiHeaders() });
    if (clientId) await request.delete(`http://127.0.0.1:3334/clients/${clientId}`, { headers: apiHeaders() });
  }
});
