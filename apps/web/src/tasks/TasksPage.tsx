import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { listProcesses } from "../processes/processApi";
import type { ProcessRecord } from "../processes/processTypes";
import { listEnterprises } from "../enterprises/enterpriseApi";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import { listClients } from "../clients/clientApi";
import type { ClientRecord } from "../clients/clientTypes";
import { createTask as createTaskRequest, deleteTask, listTasks, transferTask as transferTaskRequest, updateTask as updateTaskRequest, type TaskCreateInput } from "./taskApi";
import { getLegacyTaskBackup, inspectLegacyTasks, markLegacyTaskImported, type LegacyTaskInspection } from "./taskRepository";
import { demoTeam } from "./teamDemoData";
import { taskPriorities, taskStatuses } from "./taskTypes";
import type { TaskInput, TaskPriority, TaskRecord, TaskStatus, TeamMember } from "./taskTypes";
import "./tasks.css";

type ViewMode = "list" | "kanban";
type FormState = { mode: "create" } | { mode: "edit"; task: TaskRecord } | null;
type Filter = "all" | string;
const blankForm: TaskInput = { title: "", description: "", processId: "", assigneeId: "", status: "A fazer", priority: "Média", startDate: "", dueDate: "", subtasks: [] };
const waitingStatuses: TaskStatus[] = ["Aguardando cliente", "Aguardando órgão ou terceiro"];

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function ListIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>; }
function BoardIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="5" height="13" rx="1"/></svg>; }

function localToday() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function overdue(task: TaskRecord) {
  return Boolean(task.dueDate && task.dueDate < localToday() && task.status !== "Concluída" && task.status !== "Cancelada");
}
function dateLabel(date: string) {
  if (!date) return "Sem prazo";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}
function statusClass(status: TaskStatus) {
  if (status === "Concluída") return "task-status-done";
  if (status === "Cancelada") return "task-status-cancelled";
  if (status === "Em andamento") return "task-status-running";
  if (status === "Em revisão") return "task-status-review";
  if (waitingStatuses.includes(status)) return "task-status-waiting";
  return "task-status-todo";
}
function priorityClass(priority: TaskPriority) { return "task-priority-" + priority.toLocaleLowerCase("pt-BR"); }
function timeWaiting(task: TaskRecord) {
  const totalMs = task.waitPeriods.reduce((total, period) => total + Math.max(0, new Date(period.endedAt ?? new Date().toISOString()).getTime() - new Date(period.startedAt).getTime()), 0);
  const totalMinutes = Math.floor(totalMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return days + " d " + hours + " h";
  if (hours) return hours + " h " + minutes + " min";
  return minutes + " min";
}

export default function TasksPage({ onOpenProcesses }: { onOpenProcesses: () => void }) {
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [enterprises, setEnterprises] = useState<EnterpriseRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<Filter>("all");
  const [enterpriseFilter, setEnterpriseFilter] = useState<Filter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [priorityFilter, setPriorityFilter] = useState<Filter>("all");
  const [formState, setFormState] = useState<FormState>(null);
  const [selected, setSelected] = useState<TaskRecord | null>(null);
  const [transferTarget, setTransferTarget] = useState<TaskRecord | null>(null);
  const [legacy, setLegacy] = useState<LegacyTaskInspection>(() => inspectLegacyTasks([]));
  const [legacyMappings, setLegacyMappings] = useState<Record<string, string>>({});
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyMessage, setLegacyMessage] = useState("");
  const [legacyError, setLegacyError] = useState("");
  async function load() {
    setLoading(true); setLoadError("");
    const localInspection = inspectLegacyTasks([]);
    setLegacy(localInspection);
    setLegacyMappings(Object.fromEntries(localInspection.candidates.map((candidate) => [candidate.sourceId, candidate.processId])));
    const results = await Promise.allSettled([listClients(), listEnterprises(), listProcesses(), listTasks()]);
    const [clientsResult, enterprisesResult, processesResult, tasksResult] = results;
    const loadedClients = clientsResult.status === "fulfilled" ? clientsResult.value : [];
    const loadedEnterprises = enterprisesResult.status === "fulfilled" ? enterprisesResult.value : [];
    const loadedProcesses = processesResult.status === "fulfilled" ? processesResult.value : [];
    const loadedTasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
    setClients(loadedClients); setEnterprises(loadedEnterprises); setProcesses(loadedProcesses); setTasks(loadedTasks);
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Falha ao consultar a API"] : []);
    if (errors.length) setLoadError(errors.join(" "));
    const inspection = inspectLegacyTasks(loadedProcesses);
    setLegacy(inspection);
    setLegacyMappings(Object.fromEntries(inspection.candidates.map((candidate) => [candidate.sourceId, candidate.processId])));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const processById = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const enterpriseById = useMemo(() => new Map(enterprises.map((enterprise) => [enterprise.id, enterprise])), [enterprises]);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const memberById = useMemo(() => new Map(demoTeam.map((member) => [member.id, member])), []);
  const taskContext = (task: TaskRecord) => {
    const process = processById.get(task.processId);
    const enterprise = process ? enterpriseById.get(process.enterpriseId) : undefined;
    const client = enterprise ? clientById.get(enterprise.clientId) : undefined;
    return { process, enterprise, client };
  };
  const linkedProcesses = processes.filter((process) => {
    const enterprise = enterpriseById.get(process.enterpriseId);
    return Boolean(enterprise && clientById.has(enterprise.clientId));
  });
  const inProgressCount = tasks.filter((task) => task.status === "Em andamento").length;
  const waitingCount = tasks.filter((task) => waitingStatuses.includes(task.status)).length;
  const completedCount = tasks.filter((task) => task.status === "Concluída").length;
  const overdueCount = tasks.filter(overdue).length;
  const todoCount = tasks.filter((task) => task.status === "A fazer").length;
  const filteredTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return tasks.filter((task) => {
      const { process, enterprise, client } = taskContext(task);
      const matchesSearch = !term || task.title.toLocaleLowerCase("pt-BR").includes(term) || (process?.name.toLocaleLowerCase("pt-BR").includes(term) ?? false);
      return matchesSearch && (clientFilter === "all" || client?.id === clientFilter) &&
        (enterpriseFilter === "all" || enterprise?.id === enterpriseFilter) &&
        (assigneeFilter === "all" || task.assigneeId === assigneeFilter) &&
        (statusFilter === "all" || task.status === statusFilter) &&
        (priorityFilter === "all" || task.priority === priorityFilter);
    }).sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || a.title.localeCompare(b.title, "pt-BR"));
  }, [tasks, search, clientFilter, enterpriseFilter, assigneeFilter, statusFilter, priorityFilter, processById, enterpriseById, clientById]);

  async function saveNew(input: TaskInput) {
    setBusy(true); setOperationError("");
    try { const task = await createTaskRequest(input); setTasks((current) => [task, ...current]); setFormState(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível criar a tarefa."); throw error; }
    finally { setBusy(false); }
  }
  async function saveEdit(input: TaskInput) {
    if (formState?.mode !== "edit") return;
    const id = formState.task.id;
    setBusy(true); setOperationError("");
    try { const task = await updateTaskRequest(id, input); replaceTask(task); setFormState(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."); throw error; }
    finally { setBusy(false); }
  }
  function taskInput(task: TaskRecord, changes: Partial<TaskInput> = {}): TaskInput {
    return { title: task.title, description: task.description, processId: task.processId, assigneeId: task.assigneeId, status: task.status, priority: task.priority, startDate: task.startDate, dueDate: task.dueDate, subtasks: task.subtasks.map((item) => ({ ...item })), ...changes };
  }
  function replaceTask(task: TaskRecord) {
    setTasks((current) => current.map((item) => item.id === task.id ? task : item));
    setSelected((current) => current?.id === task.id ? task : current);
    setTransferTarget((current) => current?.id === task.id ? task : current);
  }
  async function saveTaskUpdate(task: TaskRecord, input: TaskInput) {
    setBusy(true); setOperationError("");
    try { replaceTask(await updateTaskRequest(task.id, input)); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."); }
    finally { setBusy(false); }
  }
  function setStatus(task: TaskRecord, status: TaskStatus) {
    void saveTaskUpdate(task, taskInput(task, { status }));
  }
  function toggleSubtask(task: TaskRecord, subtaskId: string) {
    const subtasks = task.subtasks.map((item) => item.id === subtaskId ? { ...item, completed: !item.completed } : item);
    void saveTaskUpdate(task, taskInput(task, { subtasks }));
  }
  function addSubtask(task: TaskRecord, title: string) {
    const normalized = title.trim();
    if (!normalized) return;
    const subtasks = [...task.subtasks, { id: crypto.randomUUID(), title: normalized, completed: false }];
    void saveTaskUpdate(task, taskInput(task, { subtasks }));
  }
  async function transfer(task: TaskRecord, assigneeId: string, reason: string) {
    setBusy(true); setOperationError("");
    try { replaceTask(await transferTaskRequest(task.id, { toAssigneeId: assigneeId, justification: reason })); setTransferTarget(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível transferir a tarefa."); }
    finally { setBusy(false); }
  }
  async function remove(task: TaskRecord) {
    if (!window.confirm(`Excluir definitivamente a tarefa “${task.title}”?`)) return;
    setBusy(true); setOperationError("");
    try { await deleteTask(task.id); setTasks((current) => current.filter((item) => item.id !== task.id)); setSelected(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível excluir a tarefa."); }
    finally { setBusy(false); }
  }
  async function importLegacy() {
    if (!legacy.candidates.length || legacyBusy) return;
    setLegacyBusy(true); setLegacyError(""); setLegacyMessage("");
    const imported: TaskRecord[] = [];
    const failures: string[] = [];
    for (const candidate of legacy.candidates) {
      const processId = legacyMappings[candidate.sourceId] ?? candidate.processId;
      if (!processes.some((process) => process.id === processId)) { failures.push(`${candidate.task.title}: selecione um processo cadastrado.`); continue; }
      const { id: _oldId, ...oldTask } = candidate.task;
      const input: TaskCreateInput = { ...oldTask, processId };
      try { const created = await createTaskRequest(input); markLegacyTaskImported(candidate.sourceId, created.id); imported.push(created); }
      catch (error) { failures.push(`${candidate.task.title}: ${error instanceof Error ? error.message : "falha na importação"}`); }
    }
    if (imported.length) setTasks((current) => [...imported, ...current]);
    const refreshed = inspectLegacyTasks(processes);
    setLegacy(refreshed);
    setLegacyMappings(Object.fromEntries(refreshed.candidates.map((candidate) => [candidate.sourceId, legacyMappings[candidate.sourceId] ?? candidate.processId])));
    setLegacyMessage(imported.length ? `${imported.length} tarefa(s) copiada(s) para o PostgreSQL. O backup local foi mantido.` : "Nenhum registro foi importado.");
    if (failures.length) setLegacyError(failures.join(" "));
    setLegacyBusy(false);
  }
  function downloadLegacyBackup() {
    const raw = getLegacyTaskBackup();
    if (raw === null) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "juris-connect-tasks-local-backup.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const legacyPanel = legacy.exists && <section className="task-migration-panel" aria-label="Migração de dados locais">
    <div className="task-migration-heading"><div><strong>Dados locais preservados</strong><p>Encontramos uma cópia local de tarefas. Nada será removido do navegador.</p></div><button type="button" className="enterprise-backup-button" onClick={downloadLegacyBackup}>Baixar backup JSON</button></div>
    {legacy.parseError && <p className="task-migration-warning" role="alert">O conteúdo local não pôde ser interpretado. Ele permanece intacto; baixe o backup para revisão manual.</p>}
    {legacy.invalidCount > 0 && <p className="task-migration-warning">{legacy.invalidCount} registro(s) local(is) com formato não reconhecido não serão importados e continuam no backup.</p>}
    {legacy.candidates.length > 0 ? <><p className="task-migration-summary">{legacy.candidates.length} registro(s) personalizado(s) aguardam associação a um processo do PostgreSQL. Demonstrações inalteradas: {legacy.unchangedDemoCount} (não importadas).</p><div className="task-migration-list">{legacy.candidates.map((candidate) => <label key={candidate.sourceId}><span><strong>{candidate.task.title}</strong><small>Processo anterior: {candidate.previousProcessName || "não localizado nos dados locais"}</small></span><select aria-label={`Associar ${candidate.task.title} a um processo`} value={legacyMappings[candidate.sourceId] ?? ""} onChange={(event) => setLegacyMappings((current) => ({ ...current, [candidate.sourceId]: event.target.value }))}><option value="">Selecione um processo atual</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}</select></label>)}</div><div className="task-migration-actions"><span>A importação preserva campos, subtarefas, histórico e cópia local.</span><button className="primary-button" disabled={legacyBusy || legacy.candidates.some((candidate) => !processes.some((process) => process.id === (legacyMappings[candidate.sourceId] ?? "")))} onClick={() => void importLegacy()}>{legacyBusy ? "Importando…" : "Importar registros selecionados"}</button></div></> : !legacy.parseError && <p className="task-migration-summary">{legacy.unchangedDemoCount ? `A cópia contém ${legacy.unchangedDemoCount} tarefa(s) de demonstração sem alterações; não há dados personalizados pendentes.` : "Não há registros personalizados pendentes de importação."}</p>}
    {legacyMessage && <p className="task-migration-success" role="status">{legacyMessage}</p>}{legacyError && <p className="task-migration-warning" role="alert">{legacyError}</p>}
  </section>;
  function clearFilters() { setSearch(""); setClientFilter("all"); setEnterpriseFilter("all"); setAssigneeFilter("all"); setStatusFilter("all"); setPriorityFilter("all"); }

  return <div className="page-content tasks-page">
    <PageTitle onCreate={linkedProcesses.length && !busy && !loading && !loadError ? () => { setOperationError(""); setFormState({ mode: "create" }); } : undefined}/>
    <div className="task-api-notice"><span className="live-dot"/> Tarefas carregadas pela API e persistidas no PostgreSQL. A lista de responsáveis continua demonstrativa.</div>
    {loadError && <div className="task-api-error" role="alert">{loadError}<button onClick={() => void load()}>Tentar novamente</button></div>}
    {operationError && <div className="task-api-error" role="alert">{operationError}<button onClick={() => setOperationError("")} aria-label="Fechar erro">×</button></div>}
    {legacyPanel}
    {!loading && !loadError && !linkedProcesses.length && <section className="tasks-no-processes"><h2>Cadastre um processo primeiro</h2><p>As tarefas precisam estar relacionadas a um processo do PostgreSQL, que por sua vez se vincula a um empreendimento e cliente.</p><button className="primary-button" onClick={onOpenProcesses}>Ir para Processos <span aria-hidden="true">→</span></button></section>}
    <section className="task-stat-grid" aria-label="Indicadores de tarefas">
      <StatCard label="Total de tarefas" value={tasks.length} tone="violet"/>
      <StatCard label="A fazer" value={todoCount} tone="muted"/>
      <StatCard label="Em andamento" value={inProgressCount} tone="blue"/>
      <StatCard label="Aguardando terceiros" value={waitingCount} tone="amber"/>
      <StatCard label="Concluídas" value={completedCount} tone="green"/>
      <StatCard label="Atrasadas" value={overdueCount} tone="red"/>
    </section>
    <section className="panel task-list-panel">
      <div className="task-list-heading"><div><h2>Execução operacional</h2><p>Tarefas vinculadas a processos e organizadas por responsável.</p></div><div className="task-view-switch" role="group" aria-label="Visualização de tarefas"><button className={view === "list" ? "selected" : ""} onClick={() => setView("list")} aria-label="Visualização em lista"><ListIcon/> Lista</button><button className={view === "kanban" ? "selected" : ""} onClick={() => setView("kanban")} aria-label="Visualização Kanban"><BoardIcon/> Quadro</button></div></div>
      <div className="task-toolbar">
        <label className="task-search"><SearchIcon/><input aria-label="Buscar tarefa ou processo" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa ou processo..."/>{search && <button aria-label="Limpar busca" onClick={() => setSearch("")}><CloseIcon/></button>}</label>
        <FilterSelect label="Cliente" value={clientFilter} onChange={setClientFilter}><option value="all">Todos</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</FilterSelect>
        <FilterSelect label="Empreendimento" value={enterpriseFilter} onChange={setEnterpriseFilter}><option value="all">Todos</option>{enterprises.map((enterprise) => <option value={enterprise.id} key={enterprise.id}>{enterprise.name}</option>)}</FilterSelect>
        <FilterSelect label="Responsável" value={assigneeFilter} onChange={setAssigneeFilter}><option value="all">Todos</option>{demoTeam.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</FilterSelect>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}><option value="all">Todos</option>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</FilterSelect>
        <FilterSelect label="Prioridade" value={priorityFilter} onChange={setPriorityFilter}><option value="all">Todas</option>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</FilterSelect>
      </div>
      {loading ? <div className="task-empty"><strong>Carregando tarefas…</strong></div> : loadError ? <div className="task-empty"><strong>Lista indisponível</strong><p>Não foi possível confirmar os registros da API.</p></div> : view === "list" ? <TaskTable tasks={filteredTasks} noRecords={tasks.length === 0} taskContext={taskContext} memberById={memberById} onOpen={setSelected} onEdit={(task) => { setOperationError(""); setFormState({ mode: "edit", task }); }} onDelete={(task) => void remove(task)} onClear={clearFilters}/> : <KanbanBoard tasks={filteredTasks} taskContext={taskContext} memberById={memberById} onOpen={setSelected} onStatus={setStatus}/>}
      <div className="task-list-footer"><span>Exibindo <strong>{filteredTasks.length}</strong> de <strong>{tasks.length}</strong> tarefas no PostgreSQL</span><span>Ordenadas por prazo previsto</span></div>
    </section>
    {formState && <TaskForm mode={formState.mode} processes={linkedProcesses} memberById={memberById} initial={formState.mode === "edit" ? formState.task : null} saving={busy} onClose={() => setFormState(null)} onSubmit={formState.mode === "create" ? saveNew : saveEdit}/>}
    {selected && <TaskDetails task={tasks.find((task) => task.id === selected.id) ?? selected} context={taskContext(tasks.find((task) => task.id === selected.id) ?? selected)} memberById={memberById} busy={busy} error={operationError} onClose={() => setSelected(null)} onDelete={() => void remove(tasks.find((task) => task.id === selected.id) ?? selected)} onEdit={() => { const task = tasks.find((item) => item.id === selected.id) ?? selected; setSelected(null); setFormState({ mode: "edit", task }); }} onStatus={(status) => setStatus(tasks.find((task) => task.id === selected.id) ?? selected, status)} onToggleSubtask={(subtaskId) => toggleSubtask(tasks.find((task) => task.id === selected.id) ?? selected, subtaskId)} onAddSubtask={(title) => addSubtask(tasks.find((task) => task.id === selected.id) ?? selected, title)} onOpenTransfer={() => setTransferTarget(tasks.find((task) => task.id === selected.id) ?? selected)}/>}
    {transferTarget && <TransferDialog task={tasks.find((task) => task.id === transferTarget.id) ?? transferTarget} saving={busy} onClose={() => setTransferTarget(null)} onSubmit={(assigneeId, reason) => void transfer(tasks.find((task) => task.id === transferTarget.id) ?? transferTarget, assigneeId, reason)}/>}
  </div>;
}

function PageTitle({ onCreate }: { onCreate?: () => void }) {
  return <div className="page-heading tasks-heading"><div><div className="eyebrow"><span className="live-dot"/> DISTRIBUIÇÃO E ACOMPANHAMENTO</div><h1>Tarefas</h1><p>Acompanhe responsabilidades, entregas e tempos de espera.</p></div>{onCreate && <button className="primary-button" onClick={onCreate}><PlusIcon/> Nova tarefa</button>}</div>;
}
function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className="task-stat-card"><span className={"task-stat-icon " + tone}><i/></span><div><small>{label}</small><strong>{value}</strong><span>registros persistidos</span></div></article>;
}
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="task-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}
function StatusPill({ status }: { status: TaskStatus }) { return <span className={"task-status-pill " + statusClass(status)}><i/>{status}</span>; }
function PriorityPill({ priority }: { priority: TaskPriority }) { return <span className={"task-priority-pill " + priorityClass(priority)}><i/>{priority}</span>; }
function Assignee({ member, compact = false }: { member?: TeamMember; compact?: boolean }) {
  if (!member) return <span className="task-assignee-missing">Não atribuído</span>;
  return <span className={"task-assignee" + (compact ? " compact" : "")}><span className={"team-avatar " + member.color}>{member.initials}</span>{!compact && <span><b>{member.name}</b><small>{member.role}</small></span>}</span>;
}
type TaskContext = { process?: ProcessRecord; enterprise?: EnterpriseRecord; client?: ClientRecord };
function TaskTable({ tasks, noRecords, taskContext, memberById, onOpen, onEdit, onDelete, onClear }: { tasks: TaskRecord[]; noRecords: boolean; taskContext: (task: TaskRecord) => TaskContext; memberById: Map<string, TeamMember>; onOpen: (task: TaskRecord) => void; onEdit: (task: TaskRecord) => void; onDelete: (task: TaskRecord) => void; onClear: () => void }) {
  return <div className="task-table-scroll"><table className="task-table"><thead><tr><th>TAREFA</th><th>PROCESSO</th><th>CLIENTE</th><th>EMPREENDIMENTO</th><th>RESPONSÁVEL</th><th>STATUS</th><th>PRIORIDADE</th><th>PRAZO</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{tasks.map((task) => {
    const context = taskContext(task);
    const doneCount = task.subtasks.filter((item) => item.completed).length;
    return <tr key={task.id}><td><button className="task-title-cell" onClick={() => onOpen(task)}><strong>{task.title}</strong><small>{task.subtasks.length ? doneCount + " de " + task.subtasks.length + " subtarefas" : "Sem subtarefas"}</small></button></td><td>{context.process?.name ?? "Processo não encontrado"}</td><td>{context.client?.name ?? "Cliente não encontrado"}</td><td>{context.enterprise?.name ?? "Empreendimento não encontrado"}</td><td><Assignee member={memberById.get(task.assigneeId)} compact/></td><td><StatusPill status={task.status}/></td><td><PriorityPill priority={task.priority}/></td><td><span className={"task-deadline" + (overdue(task) ? " overdue" : "")}>{dateLabel(task.dueDate)}{overdue(task) && <small>Atrasada</small>}</span></td><td><div className="task-row-actions"><button onClick={() => onOpen(task)} aria-label={"Abrir " + task.title}>Detalhes</button><button onClick={() => onEdit(task)} aria-label={"Editar " + task.title}>Editar</button><button onClick={() => onDelete(task)} aria-label={"Excluir " + task.title}>Excluir</button></div></td></tr>;
  })}</tbody></table>{tasks.length === 0 && <EmptyTasks noRecords={noRecords} onClear={onClear}/>}</div>;
}
function EmptyTasks({ noRecords, onClear }: { noRecords: boolean; onClear: () => void }) { return <div className="task-empty"><SearchIcon/><strong>{noRecords ? "Nenhuma tarefa cadastrada" : "Nenhuma tarefa encontrada"}</strong><p>{noRecords ? "Cadastre uma tarefa vinculada a um processo do PostgreSQL." : "Altere os filtros ou a busca para consultar outras tarefas."}</p>{!noRecords && <button onClick={onClear}>Limpar filtros</button>}</div>; }
function KanbanBoard({ tasks, taskContext, memberById, onOpen, onStatus }: { tasks: TaskRecord[]; taskContext: (task: TaskRecord) => TaskContext; memberById: Map<string, TeamMember>; onOpen: (task: TaskRecord) => void; onStatus: (task: TaskRecord, status: TaskStatus) => void }) {
  return <div className="kanban-scroll"><div className="kanban-board">{taskStatuses.map((status) => {
    const columnTasks = tasks.filter((task) => task.status === status);
    return <section className="kanban-column" key={status}><header><span className={"kanban-status-dot " + statusClass(status)}/><h3>{status}</h3><small>{columnTasks.length}</small></header>{columnTasks.length === 0 && <div className="kanban-empty">Nenhuma tarefa</div>}{columnTasks.map((task) => {
      const context = taskContext(task);
      const complete = task.subtasks.filter((item) => item.completed).length;
      return <article className="kanban-card" key={task.id}><button className="kanban-card-title" onClick={() => onOpen(task)}>{task.title}</button><p>{context.process?.name ?? "Processo não encontrado"}</p><div className="kanban-card-links"><span>{context.client?.name ?? "Cliente não encontrado"}</span><span>{context.enterprise?.name ?? "Empreendimento não encontrado"}</span></div><div className="kanban-card-meta"><Assignee member={memberById.get(task.assigneeId)} compact/><PriorityPill priority={task.priority}/></div><div className={"kanban-card-deadline" + (overdue(task) ? " overdue" : "")}>{dateLabel(task.dueDate)}{overdue(task) && <b> · Atrasada</b>}</div>{task.subtasks.length > 0 && <div className="kanban-progress"><span><i style={{ width: ((complete / task.subtasks.length) * 100) + "%" }}/></span><small>{complete}/{task.subtasks.length}</small></div>}<label className="kanban-move">Mover para <select value={task.status} onChange={(event) => onStatus(task, event.target.value as TaskStatus)} aria-label={"Alterar status de " + task.title}>{taskStatuses.map((item) => <option key={item}>{item}</option>)}</select></label></article>;
    })}</section>;
  })}</div></div>;
}

function TaskForm({ mode, processes, memberById, initial, saving, onClose, onSubmit }: { mode: "create" | "edit"; processes: ProcessRecord[]; memberById: Map<string, TeamMember>; initial: TaskRecord | null; saving: boolean; onClose: () => void; onSubmit: (input: TaskInput) => Promise<void> }) {
  const [form, setForm] = useState<TaskInput>(initial ? { title: initial.title, description: initial.description, processId: initial.processId, assigneeId: initial.assigneeId, status: initial.status, priority: initial.priority, startDate: initial.startDate, dueDate: initial.dueDate, subtasks: initial.subtasks } : { ...blankForm, processId: processes[0]?.id ?? "", assigneeId: demoTeam[0]?.id ?? "", startDate: localToday() });
  const [error, setError] = useState("");
  const process = processes.find((item) => item.id === form.processId);
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape" && !saving) onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose, saving]);
  function change<K extends keyof TaskInput>(key: K, value: TaskInput[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !processes.some((item) => item.id === form.processId) || !memberById.has(form.assigneeId)) { setError("Informe um título, um processo disponível e um responsável."); return; }
    if (form.dueDate && form.startDate && form.dueDate < form.startDate) { setError("O prazo previsto deve ser igual ou posterior à data de início."); return; }
    try { await onSubmit({ ...form, title: form.title.trim(), description: form.description.trim(), subtasks: form.subtasks.map((item) => ({ ...item })) }); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar a tarefa."); }
  }
  return <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="client-dialog task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-form-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">CADASTRO DE TAREFAS</span><h2 id="task-form-title">{mode === "create" ? "Nova tarefa" : "Editar tarefa"}</h2><p>Tarefa vinculada a um processo operacional persistido.</p></div><button type="button" className="client-close" onClick={onClose} disabled={saving} aria-label="Fechar formulário"><CloseIcon/></button></header><form onSubmit={(event) => void submit(event)} noValidate><div className="client-form-body"><div className="task-form-grid">
    <label className="field-wide">Título da tarefa <b>*</b><input autoFocus maxLength={140} value={form.title} onChange={(event) => change("title", event.target.value)} placeholder="Ex.: Revisar documentação técnica"/></label>
    <label className="field-wide">Processo vinculado <b>*</b><select value={form.processId} onChange={(event) => change("processId", event.target.value)}><option value="">Selecione um processo</option>{processes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <div className="task-process-preview field-wide"><span>Cliente e empreendimento</span><strong>{process ? process.name : "Selecione um processo"}</strong><small>Relacionamentos derivados do processo selecionado.</small></div>
    {mode === "create" ? <label className="field-wide">Responsável atual <b>*</b><select value={form.assigneeId} onChange={(event) => change("assigneeId", event.target.value)}>{demoTeam.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.role}</option>)}</select><small className="task-field-note">Equipe demonstrativa, não vinculada a usuários autenticados.</small></label> : <div className="task-form-assignee field-wide"><span>Responsável atual</span><Assignee member={memberById.get(form.assigneeId)}/><small className="task-field-note">Use “Transferir responsável” nos detalhes para registrar a justificativa.</small></div>}
    <label>Status <b>*</b><select value={form.status} onChange={(event) => change("status", event.target.value as TaskStatus)}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label>Prioridade <b>*</b><select value={form.priority} onChange={(event) => change("priority", event.target.value as TaskPriority)}>{taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
    <label>Data de início <input type="date" value={form.startDate} onChange={(event) => change("startDate", event.target.value)}/></label>
    <label>Prazo previsto <input type="date" value={form.dueDate} onChange={(event) => change("dueDate", event.target.value)}/></label>
    <label className="field-wide">Descrição <textarea rows={3} maxLength={1000} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="Contexto e resultado esperado da tarefa"/></label>
  </div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="client-form-hint"><b>*</b> Campos obrigatórios · Datas definidas manualmente</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : mode === "create" ? "Criar tarefa" : "Salvar alterações"}</button></footer></form></section></div>;
}

function TaskDetails({ task, context, memberById, busy, error, onClose, onEdit, onDelete, onStatus, onToggleSubtask, onAddSubtask, onOpenTransfer }: { task: TaskRecord; context: TaskContext; memberById: Map<string, TeamMember>; busy: boolean; error: string; onClose: () => void; onEdit: () => void; onDelete: () => void; onStatus: (status: TaskStatus) => void; onToggleSubtask: (id: string) => void; onAddSubtask: (title: string) => void; onOpenTransfer: () => void }) {
  const [newSubtask, setNewSubtask] = useState("");
  const [clock, setClock] = useState(0);
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape" && !busy) onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose, busy]);
  useEffect(() => { const timer = window.setInterval(() => setClock((value) => value + 1), 60000); return () => window.clearInterval(timer); }, []);
  const done = task.subtasks.filter((item) => item.completed).length;
  const history = [...task.history].sort((a, b) => a.date.localeCompare(b.date));
  const currentMember = memberById.get(task.assigneeId);
  function add() { if (!newSubtask.trim()) return; onAddSubtask(newSubtask); setNewSubtask(""); }
  return <div className="client-overlay client-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><aside className="client-drawer task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-details-title"><header className="client-drawer-header"><button className="client-close" onClick={onClose} disabled={busy} aria-label="Fechar detalhes"><CloseIcon/></button><span className="dialog-eyebrow">DETALHES DA TAREFA</span><div className="task-detail-title"><h2 id="task-details-title">{task.title}</h2><PriorityPill priority={task.priority}/></div><p className="task-detail-meta">{context.process?.name ?? "Processo não encontrado"} · {context.client?.name ?? "Cliente não encontrado"}</p><div className="task-drawer-actions"><label>Status <select value={task.status} disabled={busy} onChange={(event) => onStatus(event.target.value as TaskStatus)}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><button className="client-cancel" disabled={busy} onClick={onOpenTransfer}>Transferir responsável</button><button className="primary-button" disabled={busy} onClick={onEdit}>Editar</button><button className="task-delete-button" disabled={busy} onClick={onDelete}>Excluir</button></div></header>
    <div className="client-drawer-content">{error && <p className="client-form-error" role="alert">{error}</p>}
      <section className="client-detail-section"><h3>Responsabilidade e prazo</h3><div className="task-assignee-detail"><Assignee member={currentMember}/></div><DetailRow label="Empreendimento" value={context.enterprise?.name ?? "Empreendimento não encontrado"}/><DetailRow label="Início" value={dateLabel(task.startDate)}/><DetailRow label="Prazo previsto" value={dateLabel(task.dueDate) + (overdue(task) ? " · Atrasada" : "")}/><DetailRow label="Criada em" value={new Date(task.createdAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}/>{task.completedAt && <DetailRow label="Concluída em" value={new Date(task.completedAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}/>}</section>
      <section className="client-detail-section"><h3>Descrição</h3><p className="client-detail-text">{task.description || "Nenhuma descrição cadastrada."}</p></section>
      <section className="client-detail-section"><div className="task-section-title"><h3>Subtarefas</h3><span>{done} de {task.subtasks.length} concluídas</span></div><div className="task-progress"><i style={{ width: task.subtasks.length ? ((done / task.subtasks.length) * 100) + "%" : "0%" }}/></div>{task.subtasks.length > 0 && <ul className="task-subtasks">{task.subtasks.map((subtask) => <li key={subtask.id}><label><input type="checkbox" checked={subtask.completed} disabled={busy} onChange={() => onToggleSubtask(subtask.id)}/><span className={subtask.completed ? "subtask-done" : ""}>{subtask.title}</span></label></li>)}</ul>}<div className="task-add-subtask"><input value={newSubtask} disabled={busy} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Adicionar subtarefa"/><button onClick={add} disabled={busy || !newSubtask.trim()}>Adicionar</button></div></section>
      <section className="client-detail-section"><div className="task-section-title"><h3>Períodos de espera</h3><span aria-label={"Tempo acumulado de espera. Atualização " + clock}>Acumulado: {timeWaiting(task)}</span></div>{task.waitPeriods.length ? <ul className="task-wait-list">{task.waitPeriods.map((period) => <li key={period.id}><b>{period.status}</b><span>Início: {new Date(period.startedAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span><span>{period.endedAt ? "Fim: " + new Date(period.endedAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "Aguardando — período em curso"}</span></li>)}</ul> : <p className="client-detail-text">Esta tarefa ainda não teve períodos de espera.</p>}<small className="task-wait-note">Tempo de espera não representa tempo efetivo de execução.</small></section>
      <section className="client-detail-section"><h3>Transferências de responsabilidade</h3>{task.transfers.length ? <ul className="task-transfer-list">{[...task.transfers].reverse().map((transfer) => <li key={transfer.id}><span className="transfer-arrow">{memberById.get(transfer.fromAssigneeId)?.initials ?? "?"} → {memberById.get(transfer.toAssigneeId)?.initials ?? "?"}</span><div><b>{memberById.get(transfer.fromAssigneeId)?.name ?? "Integrante removido"} para {memberById.get(transfer.toAssigneeId)?.name ?? "Integrante removido"}</b><p>{transfer.justification}</p><time>{new Date(transfer.date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}</ul> : <p className="client-detail-text">Nenhuma transferência registrada.</p>}</section>
      <section className="client-detail-section"><h3>Histórico cronológico</h3>{history.length ? <ol className="task-history">{history.map((entry) => <li key={entry.id}><span className={"task-history-dot history-" + entry.type}/><div><p>{entry.message}</p><small>{memberById.get(entry.actorId)?.name ?? "Equipe demonstrativa"}</small><time>{new Date(entry.date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}</ol> : <p className="client-detail-text">Sem alterações registradas.</p>}</section>
      <div className="client-detail-demo-note"><span className="live-dot"/> Tarefa e alterações persistidas no PostgreSQL. Os responsáveis ainda são integrantes demonstrativos.</div>
    </div></aside></div>;
}

function TransferDialog({ task, saving, onClose, onSubmit }: { task: TaskRecord; saving: boolean; onClose: () => void; onSubmit: (assigneeId: string, reason: string) => void }) {
  const [assigneeId, setAssigneeId] = useState(demoTeam.find((member) => member.id !== task.assigneeId)?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape" && !saving) onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose, saving]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!assigneeId || assigneeId === task.assigneeId) { setError("Escolha um integrante diferente do responsável atual."); return; } if (!reason.trim()) { setError("A justificativa da transferência é obrigatória."); return; } onSubmit(assigneeId, reason.trim()); }
  return <div className="client-overlay task-transfer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="client-dialog task-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">RESPONSABILIDADE</span><h2 id="transfer-title">Transferir tarefa</h2><p>A transferência e a justificativa serão persistidas no PostgreSQL.</p></div><button className="client-close" onClick={onClose} disabled={saving} aria-label="Fechar"><CloseIcon/></button></header><form onSubmit={submit}><div className="client-form-body"><div className="task-form-grid"><div className="field-wide task-current-owner"><span>Responsável atual</span><Assignee member={demoTeam.find((member) => member.id === task.assigneeId)}/></div><label className="field-wide">Novo responsável <b>*</b><select disabled={saving} value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); setError(""); }}><option value="">Selecione um integrante</option>{demoTeam.filter((member) => member.id !== task.assigneeId).map((member) => <option value={member.id} key={member.id}>{member.name} — {member.role}</option>)}</select></label><label className="field-wide">Justificativa <b>*</b><textarea rows={4} maxLength={500} disabled={saving} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} placeholder="Explique o motivo da transferência"/></label></div>{error && <p className="client-form-error" role="alert">{error}</p>}</div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Confirmar transferência"}</button></footer></form></section></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) { return <div className="client-detail-row"><span>{label}</span><strong>{value}</strong></div>; }
