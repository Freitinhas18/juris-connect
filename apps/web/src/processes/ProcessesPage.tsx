import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getClients } from "../clients/clientRepository";
import type { ClientRecord } from "../clients/clientTypes";
import { getEnterprises } from "../enterprises/enterpriseRepository";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import { createProcess, getProcesses, updateProcess } from "./processRepository";
import { processPriorities, processStages, processStatuses, processTypes } from "./processTypes";
import type { ProcessHistoryEntry, ProcessInput, ProcessPriority, ProcessRecord, ProcessStage, ProcessStatus, ProcessType } from "./processTypes";
import "./processes.css";

type Filter = "all" | string;
type FormState = { mode: "create" } | { mode: "edit"; process: ProcessRecord } | null;
const blankForm: ProcessInput = { enterpriseId: "", name: "", protocol: "", processType: "Licenciamento ambiental", entity: "", description: "", manager: "", startDate: "", dueDate: "", priority: "Média", stage: "Preparação", status: "Rascunho" };

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function BriefcaseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"/></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>; }

function todayLocal() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}
function isOverdue(process: ProcessRecord) {
  return Boolean(process.dueDate && process.dueDate < todayLocal() && process.status !== "Concluído" && process.status !== "Cancelado");
}
function formatDate(date: string) {
  if (!date) return "Não informado";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

export default function ProcessesPage({ onOpenEnterprises }: { onOpenEnterprises: () => void }) {
  const [clients] = useState<ClientRecord[]>(getClients);
  const [enterprises] = useState<EnterpriseRecord[]>(getEnterprises);
  const [processes, setProcesses] = useState<ProcessRecord[]>(getProcesses);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<Filter>("all");
  const [enterpriseFilter, setEnterpriseFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [priorityFilter, setPriorityFilter] = useState<Filter>("all");
  const [formState, setFormState] = useState<FormState>(null);
  const [selected, setSelected] = useState<ProcessRecord | null>(null);
  const enterprisesById = useMemo(() => new Map(enterprises.map((item) => [item.id, item])), [enterprises]);
  const clientsById = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);
  const linkedClient = (process: ProcessRecord) => {
    const enterprise = enterprisesById.get(process.enterpriseId);
    return enterprise ? clientsById.get(enterprise.clientId) : undefined;
  };
  const activeEnterprises = enterprises.filter((enterprise) => clientsById.has(enterprise.clientId));
  const inProgressCount = processes.filter((item) => item.status === "Em andamento").length;
  const waitingCount = processes.filter((item) => item.status === "Aguardando cliente" || item.status === "Aguardando órgão responsável").length;
  const completedCount = processes.filter((item) => item.status === "Concluído").length;
  const overdueCount = processes.filter(isOverdue).length;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return processes.filter((item) => {
      const enterprise = enterprisesById.get(item.enterpriseId);
      const client = enterprise ? clientsById.get(enterprise.clientId) : undefined;
      const matchesTerm = !term || item.name.toLocaleLowerCase("pt-BR").includes(term) || item.protocol.toLocaleLowerCase("pt-BR").includes(term);
      return matchesTerm && (clientFilter === "all" || client?.id === clientFilter) &&
        (enterpriseFilter === "all" || item.enterpriseId === enterpriseFilter) &&
        (typeFilter === "all" || item.processType === typeFilter) &&
        (statusFilter === "all" || item.status === statusFilter) &&
        (priorityFilter === "all" || item.priority === priorityFilter);
    }).sort((a, b) => {
      if (!a.dueDate) return b.dueDate ? 1 : a.name.localeCompare(b.name, "pt-BR");
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "pt-BR");
    });
  }, [processes, enterprisesById, clientsById, search, clientFilter, enterpriseFilter, typeFilter, statusFilter, priorityFilter]);

  function saveNew(input: ProcessInput) {
    setProcesses((current) => createProcess(input, current));
    setFormState(null);
  }
  function saveEdit(input: ProcessInput) {
    if (formState?.mode !== "edit") return;
    const id = formState.process.id;
    setProcesses((current) => updateProcess(id, input, current));
    setSelected((current) => current?.id === id ? { ...current, ...input } : current);
    setFormState(null);
  }
  function openEdit(process: ProcessRecord) {
    setSelected(null);
    setFormState({ mode: "edit", process });
  }

  if (!activeEnterprises.length) return <div className="page-content processes-page"><PageTitle/><div className="demo-notice"><span className="demo-dot"/> Ambiente demonstrativo <span>·</span> Nenhum empreendimento vinculado a um cliente foi encontrado.</div><section className="processes-empty"><span><BriefcaseIcon/></span><h2>Cadastre um empreendimento primeiro</h2><p>Todo processo precisa estar relacionado a um empreendimento e, por ele, a um cliente cadastrado.</p><button className="primary-button" onClick={onOpenEnterprises}>Ir para Empreendimentos <span aria-hidden="true">→</span></button></section></div>;

  return <div className="page-content processes-page">
    <PageTitle onCreate={() => setFormState({ mode: "create" })}/>
    <div className="demo-notice"><span className="demo-dot"/> Ambiente demonstrativo <span>·</span> Processos e histórico são fictícios, mantidos apenas neste navegador.</div>
    <section className="process-stat-grid" aria-label="Indicadores demonstrativos de processos">
      <StatCard label="Total de processos" value={processes.length} tone="violet" icon={<BriefcaseIcon/>}/>
      <StatCard label="Em andamento" value={inProgressCount} tone="blue"/>
      <StatCard label="Aguardando retorno" value={waitingCount} tone="amber"/>
      <StatCard label="Concluídos" value={completedCount} tone="green"/>
      <StatCard label="Com prazo vencido" value={overdueCount} tone="red" icon={<CalendarIcon/>}/>
    </section>
    <section className="panel process-list-panel">
      <div className="process-list-heading"><div><h2>Acompanhamento de processos</h2><p>Organize etapas, responsáveis e prazos informados.</p></div><span className="process-count-pill">{filtered.length} {filtered.length === 1 ? "processo" : "processos"}</span></div>
      <div className="process-toolbar">
        <label className="process-search"><SearchIcon/><input aria-label="Buscar por nome ou protocolo" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou protocolo..."/>{search && <button aria-label="Limpar busca" onClick={() => setSearch("")}><CloseIcon/></button>}</label>
        <FilterSelect label="Cliente" value={clientFilter} onChange={setClientFilter}><option value="all">Todos</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</FilterSelect>
        <FilterSelect label="Empreendimento" value={enterpriseFilter} onChange={setEnterpriseFilter}><option value="all">Todos</option>{activeEnterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
        <FilterSelect label="Tipo" value={typeFilter} onChange={setTypeFilter}><option value="all">Todos</option>{processTypes.map((type) => <option key={type}>{type}</option>)}</FilterSelect>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}><option value="all">Todos</option>{processStatuses.map((status) => <option key={status}>{status}</option>)}</FilterSelect>
        <FilterSelect label="Prioridade" value={priorityFilter} onChange={setPriorityFilter}><option value="all">Todas</option>{processPriorities.map((priority) => <option key={priority}>{priority}</option>)}</FilterSelect>
      </div>
      <div className="process-table-scroll"><table className="process-table"><thead><tr><th>PROCESSO</th><th>PROTOCOLO</th><th>TIPO</th><th>CLIENTE / EMPREENDIMENTO</th><th>ETAPA ATUAL</th><th>RESPONSÁVEL</th><th>PRIORIDADE</th><th>PRAZO PREVISTO</th><th>STATUS</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map((item) => {
        const enterprise = enterprisesById.get(item.enterpriseId);
        const client = linkedClient(item);
        return <tr key={item.id}><td><button className="process-name-button" onClick={() => setSelected(item)}><strong>{item.name}</strong></button></td><td>{item.protocol || "—"}</td><td><span className="process-type-pill">{item.processType}</span></td><td><span className="process-linked-names"><b>{client?.name ?? "Cliente não encontrado"}</b><small>{enterprise?.name ?? "Empreendimento não encontrado"}</small></span></td><td><span className="process-stage-cell"><i/>{item.stage}</span></td><td>{item.manager}</td><td><PriorityBadge priority={item.priority}/></td><td><span className={"process-deadline" + (isOverdue(item) ? " overdue" : "")}>{item.dueDate ? formatDate(item.dueDate) : "—"}{isOverdue(item) && <small>Vencido</small>}</span></td><td><StatusBadge status={item.status}/></td><td><div className="process-row-actions"><button onClick={() => setSelected(item)} aria-label={"Ver detalhes de " + item.name}>Detalhes</button><button onClick={() => setFormState({ mode: "edit", process: item })} aria-label={"Editar " + item.name}>Editar</button></div></td></tr>;
      })}</tbody></table>{filtered.length === 0 && <div className="process-empty"><span><SearchIcon/></span><strong>Nenhum processo encontrado</strong><p>Altere a busca ou os filtros para consultar outros processos.</p><button onClick={() => { setSearch(""); setClientFilter("all"); setEnterpriseFilter("all"); setTypeFilter("all"); setStatusFilter("all"); setPriorityFilter("all"); }}>Limpar filtros</button></div>}</div>
      <div className="process-list-footer"><span>Exibindo <strong>{filtered.length}</strong> de <strong>{processes.length}</strong> processos demonstrativos</span><span>Prazos são informados manualmente pelo usuário</span></div>
    </section>
    {formState && <ProcessForm mode={formState.mode} enterprises={activeEnterprises} clientsById={clientsById} initial={formState.mode === "edit" ? formState.process : null} onClose={() => setFormState(null)} onSubmit={formState.mode === "create" ? saveNew : saveEdit}/>}
    {selected && <ProcessDetails process={processes.find((item) => item.id === selected.id) ?? selected} enterprise={enterprisesById.get(selected.enterpriseId)} client={linkedClient(selected)} onClose={() => setSelected(null)} onEdit={() => openEdit(processes.find((item) => item.id === selected.id) ?? selected)}/>}
  </div>;
}

function PageTitle({ onCreate }: { onCreate?: () => void }) {
  return <div className="page-heading processes-heading"><div><div className="eyebrow"><span className="live-dot"/> OPERAÇÃO E ACOMPANHAMENTO</div><h1>Processos</h1><p>Acompanhe protocolos, etapas e prazos da operação.</p></div>{onCreate && <button className="primary-button" onClick={onCreate}><PlusIcon/> Novo processo</button>}</div>;
}
function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon?: ReactNode }) {
  return <article className="process-stat-card"><span className={"process-stat-icon " + tone}>{icon ?? <i/>}</span><div><small>{label}</small><strong>{value}</strong><span>dados demonstrativos</span></div></article>;
}
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="process-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}
function PriorityBadge({ priority }: { priority: ProcessPriority }) {
  return <span className={"process-priority priority-" + priority.toLocaleLowerCase("pt-BR")}><i/>{priority}</span>;
}
function StatusBadge({ status }: { status: ProcessStatus }) {
  return <span className={"process-status " + statusClass(status)}><i/>{status}</span>;
}
function statusClass(status: ProcessStatus) {
  if (status === "Concluído") return "status-completed";
  if (status === "Cancelado") return "status-cancelled";
  if (status === "Suspenso") return "status-paused";
  if (status.startsWith("Aguardando")) return "status-waiting";
  if (status === "Em andamento") return "status-running";
  return "status-draft";
}

function ProcessForm({ mode, enterprises, clientsById, initial, onClose, onSubmit }: { mode: "create" | "edit"; enterprises: EnterpriseRecord[]; clientsById: Map<string, ClientRecord>; initial: ProcessRecord | null; onClose: () => void; onSubmit: (input: ProcessInput) => void }) {
  const [form, setForm] = useState<ProcessInput>(initial ? { enterpriseId: initial.enterpriseId, name: initial.name, protocol: initial.protocol, processType: initial.processType, entity: initial.entity, description: initial.description, manager: initial.manager, startDate: initial.startDate, dueDate: initial.dueDate, priority: initial.priority, stage: initial.stage, status: initial.status } : { ...blankForm, enterpriseId: enterprises[0]?.id ?? "" });
  const [error, setError] = useState("");
  const chosenEnterprise = enterprises.find((enterprise) => enterprise.id === form.enterpriseId);
  const chosenClient = chosenEnterprise ? clientsById.get(chosenEnterprise.clientId) : undefined;
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  function change<K extends keyof ProcessInput>(key: K, value: ProcessInput[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enterprises.some((enterprise) => enterprise.id === form.enterpriseId)) { setError("Selecione um empreendimento vinculado a um cliente cadastrado."); return; }
    if (![form.name, form.manager, form.startDate, form.dueDate].every((value) => value.trim())) { setError("Preencha nome, responsável e as duas datas."); return; }
    if (form.dueDate < form.startDate) { setError("O prazo previsto deve ser igual ou posterior à data de início."); return; }
    onSubmit({ ...form, name: form.name.trim(), protocol: form.protocol.trim(), entity: form.entity.trim(), description: form.description.trim(), manager: form.manager.trim() });
  }
  return <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="client-dialog process-dialog" role="dialog" aria-modal="true" aria-labelledby="process-form-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">ACOMPANHAMENTO DEMONSTRATIVO</span><h2 id="process-form-title">{mode === "create" ? "Novo processo" : "Editar processo"}</h2><p>Classificações e prazos são apenas informativos e preenchidos manualmente.</p></div><button type="button" className="client-close" onClick={onClose} aria-label="Fechar formulário"><CloseIcon/></button></header><form onSubmit={submit} noValidate><div className="client-form-body"><div className="process-form-grid">
    <label className="field-wide">Nome do processo <b>*</b><input autoFocus maxLength={140} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Renovação de licença operacional"/></label>
    <label>Número de protocolo <span>(opcional)</span><input maxLength={80} value={form.protocol} onChange={(event) => change("protocol", event.target.value)} placeholder="Protocolo ou referência"/></label>
    <label>Tipo de processo <b>*</b><select value={form.processType} onChange={(event) => change("processType", event.target.value as ProcessType)}>{processTypes.map((type) => <option key={type}>{type}</option>)}</select><small className="process-field-note">Opções demonstrativas, sem classificação jurídica definitiva.</small></label>
    <label className="field-wide">Empreendimento vinculado <b>*</b><select value={form.enterpriseId} onChange={(event) => change("enterpriseId", event.target.value)}><option value="">Selecione um empreendimento</option>{enterprises.map((enterprise) => <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>)}</select></label>
    <div className="process-client-preview field-wide"><span>Cliente correspondente</span><strong>{chosenClient?.name ?? "Selecione um empreendimento para carregar o cliente"}</strong><small>Derivado automaticamente do vínculo empreendimento–cliente.</small></div>
    <label>Órgão responsável <span>(opcional)</span><input maxLength={140} value={form.entity} onChange={(event) => change("entity", event.target.value)} placeholder="Órgão ou entidade responsável"/></label>
    <label>Responsável interno <b>*</b><input maxLength={100} value={form.manager} onChange={(event) => change("manager", event.target.value)} placeholder="Nome do responsável"/></label>
    <label>Data de início <b>*</b><input type="date" value={form.startDate} onChange={(event) => change("startDate", event.target.value)}/></label>
    <label>Prazo previsto <b>*</b><input type="date" value={form.dueDate} onChange={(event) => change("dueDate", event.target.value)}/></label>
    <label>Prioridade <b>*</b><select value={form.priority} onChange={(event) => change("priority", event.target.value as ProcessPriority)}>{processPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
    <label>Etapa atual <b>*</b><select value={form.stage} onChange={(event) => change("stage", event.target.value as ProcessStage)}>{processStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
    <label>Status <b>*</b><select value={form.status} onChange={(event) => change("status", event.target.value as ProcessStatus)}>{processStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label className="field-wide">Objetivo ou descrição <textarea rows={3} maxLength={1000} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="Objetivo, contexto ou observações operacionais"/></label>
  </div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="client-form-hint"><b>*</b> Campos obrigatórios · Prazos definidos manualmente</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">{mode === "create" ? "Cadastrar processo" : "Salvar alterações"}</button></footer></form></section></div>;
}

function ProcessDetails({ process, enterprise, client, onClose, onEdit }: { process: ProcessRecord; enterprise?: EnterpriseRecord; client?: ClientRecord; onClose: () => void; onEdit: () => void }) {
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  const sortedHistory = [...process.history].sort((a, b) => a.date.localeCompare(b.date));
  const currentStageIndex = processStages.indexOf(process.stage);
  return <div className="client-overlay client-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="client-drawer process-drawer" role="dialog" aria-modal="true" aria-labelledby="process-details-title"><header className="client-drawer-header"><button className="client-close" onClick={onClose} aria-label="Fechar detalhes"><CloseIcon/></button><span className="dialog-eyebrow">DETALHES DO PROCESSO</span><div className="process-detail-title"><h2 id="process-details-title">{process.name}</h2><StatusBadge status={process.status}/></div><p className="process-protocol-label">{process.protocol ? "Protocolo " + process.protocol : "Sem número de protocolo"}</p><div className="client-drawer-actions"><PriorityBadge priority={process.priority}/><button className="primary-button" onClick={onEdit}>Editar processo</button></div></header>
    <div className="client-drawer-content"><section className="client-detail-section"><h3>Relacionamentos</h3><DetailRow label="Cliente" value={client?.name ?? "Cliente não encontrado"}/><DetailRow label="Empreendimento" value={enterprise?.name ?? "Empreendimento não encontrado"}/><DetailRow label="Tipo" value={process.processType}/><DetailRow label="Órgão" value={process.entity || "Não informado"}/><DetailRow label="Responsável" value={process.manager}/></section>
      <section className="client-detail-section"><h3>Datas</h3><DetailRow label="Início" value={formatDate(process.startDate)}/><DetailRow label="Prazo previsto" value={formatDate(process.dueDate) + (isOverdue(process) ? " · Vencido" : "")}/></section>
      <section className="client-detail-section"><h3>Etapas</h3><ol className="process-stage-timeline">{processStages.map((stage, index) => <li key={stage} className={index < currentStageIndex ? "stage-done" : index === currentStageIndex ? "stage-current" : ""}><span className="stage-marker">{index < currentStageIndex ? "✓" : index + 1}</span><span>{stage}</span>{index === currentStageIndex && <small>Atual</small>}</li>)}</ol></section>
      <section className="client-detail-section"><h3>Objetivo ou descrição</h3><p className="client-detail-text">{process.description || "Nenhuma descrição cadastrada."}</p></section>
      <section className="client-detail-section"><h3>Histórico demonstrativo</h3><ol className="process-history">{sortedHistory.map((entry) => <HistoryItem key={entry.id} entry={entry}/>)}</ol></section>
      <div className="client-detail-demo-note"><span className="demo-dot"/> Processo e histórico demonstrativos, armazenados neste navegador.</div>
    </div></aside></div>;
}
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="client-detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function HistoryItem({ entry }: { entry: ProcessHistoryEntry }) {
  return <li><span className={"history-dot history-" + entry.type}/><div><p>{entry.message}</p><time>{new Date(entry.date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>;
}
