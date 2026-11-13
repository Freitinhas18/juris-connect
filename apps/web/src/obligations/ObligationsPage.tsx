import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getProcesses } from "../processes/processRepository";
import type { ProcessRecord } from "../processes/processTypes";
import { getEnterprises } from "../enterprises/enterpriseRepository";
import type { EnterpriseRecord } from "../enterprises/enterpriseTypes";
import { getClients } from "../clients/clientRepository";
import type { ClientRecord } from "../clients/clientTypes";
import { demoTeam } from "../tasks/teamDemoData";
import type { TeamMember } from "../tasks/taskTypes";
import { addOccurrenceEvidence, calculateNextDueDate, createObligation, generateNextOccurrence, getObligations, updateObligation, updateOccurrence } from "./obligationRepository";
import { occurrenceStatuses, periodicities } from "./obligationTypes";
import type { ObligationEvidence, ObligationInput, ObligationOccurrence, ObligationRecord, OccurrenceInput, OccurrenceStatus, Periodicity } from "./obligationTypes";
import "./obligations.css";

type View = "list" | "calendar";
type Dialog = { mode: "create" } | { mode: "edit"; obligation: ObligationRecord } | null;
type Filter = "all" | string;
const emptyInput: ObligationInput = { title: "", description: "", processId: "", reference: "", authority: "", responsibleId: "", periodicity: "Pontual", firstDueDate: "", requirements: "", expectedEvidence: "", status: "active" };

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>; }

function localToday() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function dateLabel(date: string) {
  if (!date) return "Não informado";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}
function occurrenceStatus(obligation: ObligationRecord, occurrence: ObligationOccurrence): OccurrenceStatus {
  if (obligation.status === "active" && occurrence.status !== "Cumprida" && occurrence.status !== "Dispensada" && occurrence.dueDate < localToday()) return "Atrasada";
  return occurrence.status;
}
function isPending(status: OccurrenceStatus) { return status !== "Cumprida" && status !== "Dispensada"; }
function nextScheduledDate(obligation: ObligationRecord): string | null {
  const pending = obligation.occurrences.filter((occurrence) => isPending(occurrence.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (pending) return pending.dueDate;
  if (obligation.status !== "active" || obligation.periodicity === "Pontual") return null;
  const latest = [...obligation.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  return calculateNextDueDate(latest?.dueDate ?? obligation.firstDueDate, obligation.periodicity);
}

export default function ObligationsPage({ onOpenProcesses }: { onOpenProcesses: () => void }) {
  const [processes] = useState<ProcessRecord[]>(getProcesses);
  const [enterprises] = useState<EnterpriseRecord[]>(getEnterprises);
  const [clients] = useState<ClientRecord[]>(getClients);
  const [records, setRecords] = useState<ObligationRecord[]>(getObligations);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<Filter>("all");
  const [enterpriseFilter, setEnterpriseFilter] = useState<Filter>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<Filter>("all");
  const [periodicityFilter, setPeriodicityFilter] = useState<Filter>("all");
  const [situationFilter, setSituationFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<ObligationRecord | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<{ obligation: ObligationRecord; occurrence: ObligationOccurrence } | null>(null);
  const [notice, setNotice] = useState("");

  const processById = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const enterpriseById = useMemo(() => new Map(enterprises.map((enterprise) => [enterprise.id, enterprise])), [enterprises]);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const memberById = useMemo(() => new Map(demoTeam.map((member) => [member.id, member])), []);
  const contextFor = (obligation: ObligationRecord) => {
    const process = processById.get(obligation.processId);
    const enterprise = process ? enterpriseById.get(process.enterpriseId) : undefined;
    const client = enterprise ? clientById.get(enterprise.clientId) : undefined;
    return { process, enterprise, client };
  };
  const availableProcesses = processes.filter((process) => {
    const enterprise = enterpriseById.get(process.enterpriseId);
    return Boolean(enterprise && clientById.has(enterprise.clientId));
  });
  const activeCount = records.filter((record) => record.status === "active").length;
  const allOccurrences = records.flatMap((obligation) => obligation.occurrences.map((occurrence) => ({ obligation, occurrence, status: occurrenceStatus(obligation, occurrence) })));
  const pendingCount = allOccurrences.filter(({ obligation, status }) => obligation.status === "active" && isPending(status)).length;
  const completedCount = allOccurrences.filter(({ status }) => status === "Cumprida").length;
  const overdueCount = allOccurrences.filter(({ status }) => status === "Atrasada").length;
  const actualUpcomingCount = allOccurrences.filter(({ obligation, occurrence, status }) => obligation.status === "active" && isPending(status) && occurrence.dueDate >= localToday() && occurrence.dueDate <= addDays(localToday(), 30)).length;
  const projectedUpcomingCount = records.filter((obligation) => obligation.status === "active" && obligation.periodicity !== "Pontual" && !obligation.occurrences.some((occurrence) => isPending(occurrence.status))).filter((obligation) => {
    const dueDate = nextScheduledDate(obligation);
    return Boolean(dueDate && dueDate >= localToday() && dueDate <= addDays(localToday(), 30));
  }).length;
  const upcomingCount = actualUpcomingCount + projectedUpcomingCount;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return records.filter((obligation) => {
      const { process, enterprise, client } = contextFor(obligation);
      const matchesTerm = !term || obligation.title.toLocaleLowerCase("pt-BR").includes(term) || (process?.name.toLocaleLowerCase("pt-BR").includes(term) ?? false);
      const currentStatus = obligation.occurrences.map((occurrence) => occurrenceStatus(obligation, occurrence));
      const matchesSituation = situationFilter === "all" ||
        (situationFilter === "active" && obligation.status === "active") ||
        (situationFilter === "inactive" && obligation.status === "inactive") ||
        currentStatus.includes(situationFilter as OccurrenceStatus);
      return matchesTerm && (clientFilter === "all" || client?.id === clientFilter) &&
        (enterpriseFilter === "all" || enterprise?.id === enterpriseFilter) &&
        (responsibleFilter === "all" || obligation.responsibleId === responsibleFilter) &&
        (periodicityFilter === "all" || obligation.periodicity === periodicityFilter) && matchesSituation;
    }).sort((a, b) => (nextScheduledDate(a) ?? "9999-99-99").localeCompare(nextScheduledDate(b) ?? "9999-99-99"));
  }, [records, search, clientFilter, enterpriseFilter, responsibleFilter, periodicityFilter, situationFilter, processById, enterpriseById, clientById]);

  function saveNew(input: ObligationInput) { setRecords((current) => createObligation(input, current)); setDialog(null); setNotice("Condicionante e primeira ocorrência cadastradas."); }
  function saveEdit(input: ObligationInput) {
    if (dialog?.mode !== "edit") return;
    const id = dialog.obligation.id;
    setRecords((current) => updateObligation(id, input, current));
    setDialog(null);
  }
  function patchRecords(id: string, transform: (current: ObligationRecord[]) => ObligationRecord[]) {
    const next = transform(records);
    setRecords(next);
    setSelected((current) => current?.id === id ? next.find((item) => item.id === id) ?? current : current);
  }
  function onGenerate(id: string) {
    const before = records.find((record) => record.id === id);
    const priorCount = before?.occurrences.length ?? 0;
    const next = generateNextOccurrence(id, records);
    setRecords(next);
    const after = next.find((record) => record.id === id);
    if ((after?.occurrences.length ?? 0) > priorCount) {
      setNotice("Nova ocorrência programada para " + dateLabel(after?.occurrences.at(-1)?.dueDate ?? "") + ".");
      setSelected(after ?? null);
    } else setNotice("Não foi criada uma nova ocorrência: a condicionante não é recorrente, está inativa ou o ciclo já existe.");
  }
  function clearFilters() { setSearch(""); setClientFilter("all"); setEnterpriseFilter("all"); setResponsibleFilter("all"); setPeriodicityFilter("all"); setSituationFilter("all"); }

  if (!availableProcesses.length) return <div className="page-content obligations-page"><PageTitle/><div className="demo-notice"><span className="demo-dot"/> Ambiente demonstrativo <span>·</span> Não há processos com vínculos válidos disponíveis.</div><EmptyDependencies onOpenProcesses={onOpenProcesses}/></div>;

  return <div className="page-content obligations-page">
    <PageTitle onCreate={() => setDialog({ mode: "create" })}/>
    <div className="demo-notice"><span className="demo-dot"/> Ambiente demonstrativo <span>·</span> Obrigações, ocorrências e evidências são registros locais fictícios.</div>
    {notice && <div className="obligation-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><CloseIcon/></button></div>}
    <section className="obligation-stat-grid" aria-label="Indicadores demonstrativos de condicionantes">
      <StatCard label="Condicionantes ativas" value={activeCount} tone="violet"/>
      <StatCard label="Ocorrências pendentes" value={pendingCount} tone="blue"/>
      <StatCard label="Cumpridas" value={completedCount} tone="green"/>
      <StatCard label="Próximos vencimentos" value={upcomingCount} tone="amber"/>
      <StatCard label="Atrasadas" value={overdueCount} tone="red"/>
    </section>
    <section className="panel obligation-panel">
      <div className="obligation-panel-heading"><div><h2>Condicionantes e obrigações</h2><p>Acompanhe cada obrigação e suas ocorrências por período.</p></div><div className="obligation-view-switch" role="group" aria-label="Visualização"><button className={view === "list" ? "selected" : ""} onClick={() => setView("list")} aria-label="Visualização em lista">Lista</button><button className={view === "calendar" ? "selected" : ""} onClick={() => setView("calendar")} aria-label="Calendário de vencimentos"><CalendarIcon/> Calendário</button></div></div>
      <div className="obligation-toolbar">
        <label className="obligation-search"><SearchIcon/><input aria-label="Pesquisar condicionante ou processo" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar obrigação ou processo..."/>{search && <button aria-label="Limpar busca" onClick={() => setSearch("")}><CloseIcon/></button>}</label>
        <FilterSelect label="Cliente" value={clientFilter} onChange={setClientFilter}><option value="all">Todos</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</FilterSelect>
        <FilterSelect label="Empreendimento" value={enterpriseFilter} onChange={setEnterpriseFilter}><option value="all">Todos</option>{enterprises.map((enterprise) => <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>)}</FilterSelect>
        <FilterSelect label="Responsável" value={responsibleFilter} onChange={setResponsibleFilter}><option value="all">Todos</option>{demoTeam.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</FilterSelect>
        <FilterSelect label="Periodicidade" value={periodicityFilter} onChange={setPeriodicityFilter}><option value="all">Todas</option>{periodicities.map((period) => <option key={period}>{period}</option>)}</FilterSelect>
        <FilterSelect label="Situação" value={situationFilter} onChange={setSituationFilter}><option value="all">Todas</option><option value="active">Ativa</option><option value="inactive">Inativa</option>{occurrenceStatuses.map((status) => <option key={status}>{status}</option>)}</FilterSelect>
      </div>
      {view === "list" ? <ObligationTable records={filtered} contextFor={contextFor} memberById={memberById} onOpen={setSelected} onEdit={(record) => setDialog({ mode: "edit", obligation: record })} onClear={clearFilters}/> : <ObligationCalendar month={calendarMonth} setMonth={setCalendarMonth} items={calendarItems(filtered)} onOpen={(obligation) => setSelected(obligation)}/>}
      <div className="obligation-panel-footer"><span>Exibindo <strong>{filtered.length}</strong> de <strong>{records.length}</strong> condicionantes demonstrativas</span><span>Sem interpretação automática de exigibilidade ou prazos legais</span></div>
    </section>
    {dialog && <ObligationForm mode={dialog.mode} processes={availableProcesses} memberById={memberById} initial={dialog.mode === "edit" ? dialog.obligation : null} onClose={() => setDialog(null)} onSubmit={dialog.mode === "create" ? saveNew : saveEdit}/>}
    {selected && <ObligationDetails obligation={records.find((item) => item.id === selected.id) ?? selected} context={contextFor(records.find((item) => item.id === selected.id) ?? selected)} memberById={memberById} onClose={() => setSelected(null)} onEdit={() => { const item = records.find((record) => record.id === selected.id) ?? selected; setSelected(null); setDialog({ mode: "edit", obligation: item }); }} onGenerate={() => onGenerate(selected.id)} onOccurrenceChange={(occurrenceId, input) => patchRecords(selected.id, (current) => updateOccurrence(selected.id, occurrenceId, input, current))} onEvidence={(occurrence, evidence) => patchRecords(selected.id, (current) => addOccurrenceEvidence(selected.id, occurrence.id, evidence, current))}/>}
  </div>;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(year, month - 1, day + days);
  return [result.getFullYear(), String(result.getMonth() + 1).padStart(2, "0"), String(result.getDate()).padStart(2, "0")].join("-");
}
function PageTitle({ onCreate }: { onCreate?: () => void }) {
  return <div className="page-heading obligations-heading"><div><div className="eyebrow"><span className="live-dot"/> CONFORMIDADE E ACOMPANHAMENTO</div><h1>Condicionantes</h1><p>Organize obrigações, ocorrências e evidências por período.</p></div>{onCreate && <button className="primary-button" onClick={onCreate}><PlusIcon/> Nova condicionante</button>}</div>;
}
function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className="obligation-stat-card"><span className={"obligation-stat-icon " + tone}><i/></span><div><small>{label}</small><strong>{value}</strong><span>dados demonstrativos</span></div></article>;
}
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="obligation-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}
function Member({ member }: { member?: TeamMember }) {
  if (!member) return <span className="obligation-member-missing">Integrante não encontrado</span>;
  return <span className="obligation-member"><span className={"team-avatar " + member.color}>{member.initials}</span><span>{member.name}</span></span>;
}
function effectiveClass(status: OccurrenceStatus) {
  if (status === "Cumprida") return "ob-status-done";
  if (status === "Atrasada") return "ob-status-late";
  if (status === "Dispensada") return "ob-status-exempt";
  if (status === "Aguardando validação") return "ob-status-review";
  if (status === "Em preparação") return "ob-status-preparing";
  return "ob-status-scheduled";
}
function StatusLabel({ status }: { status: OccurrenceStatus }) { return <span className={"obligation-status " + effectiveClass(status)}><i/>{status}</span>; }
function nearestOccurrence(obligation: ObligationRecord) {
  const candidates = obligation.occurrences.filter((occurrence) => isPending(occurrence.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return candidates[0];
}
type Context = { process?: ProcessRecord; enterprise?: EnterpriseRecord; client?: ClientRecord };

function ObligationTable({ records, contextFor, memberById, onOpen, onEdit, onClear }: { records: ObligationRecord[]; contextFor: (record: ObligationRecord) => Context; memberById: Map<string, TeamMember>; onOpen: (record: ObligationRecord) => void; onEdit: (record: ObligationRecord) => void; onClear: () => void }) {
  return <div className="obligation-table-scroll"><table className="obligation-table"><thead><tr><th>CONDICIONANTE</th><th>PROCESSO</th><th>CLIENTE</th><th>EMPREENDIMENTO</th><th>RESPONSÁVEL</th><th>PERIODICIDADE</th><th>PRÓXIMO VENCIMENTO</th><th>SITUAÇÃO</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{records.map((record) => {
    const context = contextFor(record);
    const next = nearestOccurrence(record);
    const date = next?.dueDate ?? (record.status === "active" && record.periodicity !== "Pontual" ? calculateNextDueDate([...record.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0]?.dueDate ?? record.firstDueDate, record.periodicity) : "");
    const projectedStatus = "Programada";
    const status = next ? occurrenceStatus(record, next) : record.status === "inactive" ? "Dispensada" : record.periodicity !== "Pontual" && date ? projectedStatus : record.occurrences.at(-1)?.status ?? "Programada";
    return <tr key={record.id}><td><button className="obligation-title-cell" onClick={() => onOpen(record)}><strong>{record.title}</strong><small>{record.reference || "Sem referência informada"}</small></button></td><td>{context.process?.name ?? "Processo não encontrado"}</td><td>{context.client?.name ?? "Cliente não encontrado"}</td><td>{context.enterprise?.name ?? "Empreendimento não encontrado"}</td><td><Member member={memberById.get(record.responsibleId)}/></td><td><span className="obligation-period-pill">{record.periodicity}</span></td><td><span className={"obligation-due-date" + (status === "Atrasada" ? " late" : "")}>{date ? dateLabel(date) : "—"}{status === "Atrasada" && <small>Atrasada</small>}</span></td><td>{record.status === "inactive" ? <span className="obligation-inactive-pill">Inativa</span> : <StatusLabel status={status as OccurrenceStatus}/>}</td><td><div className="obligation-row-actions"><button onClick={() => onOpen(record)} aria-label={"Abrir " + record.title}>Detalhes</button><button onClick={() => onEdit(record)} aria-label={"Editar " + record.title}>Editar</button></div></td></tr>;
  })}</tbody></table>{records.length === 0 && <div className="obligation-empty"><SearchIcon/><strong>Nenhuma condicionante encontrada</strong><p>Ajuste a busca ou os filtros para consultar outros registros.</p><button onClick={onClear}>Limpar filtros</button></div>}</div>;
}

type CalendarItem = { obligation: ObligationRecord; occurrence?: ObligationOccurrence; date: string; status: OccurrenceStatus; projected: boolean };
function calendarItems(records: ObligationRecord[]): CalendarItem[] {
  return records.filter((record) => record.status === "active").flatMap((obligation) => {
    const actual: CalendarItem[] = obligation.occurrences.filter((occurrence) => occurrence.status !== "Dispensada").map((occurrence) => ({ obligation, occurrence, date: occurrence.dueDate, status: occurrenceStatus(obligation, occurrence), projected: false }));
    if (obligation.periodicity === "Pontual") return actual;
    const latest = [...obligation.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    const date = calculateNextDueDate(latest?.dueDate ?? obligation.firstDueDate, obligation.periodicity);
    if (!date || obligation.occurrences.some((occurrence) => occurrence.dueDate === date)) return actual;
    return [...actual, { obligation, date, status: "Programada", projected: true }];
  });
}
function ObligationCalendar({ month, setMonth, items, onOpen }: { month: Date; setMonth: (date: Date) => void; items: CalendarItem[]; onOpen: (obligation: ObligationRecord) => void }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const monthEvents = items.filter((item) => item.date.startsWith(year + "-" + String(monthIndex + 1).padStart(2, "0"))).sort((a, b) => a.date.localeCompare(b.date));
  function move(delta: number) { setMonth(new Date(year, monthIndex + delta, 1)); }
  return <div className="obligation-calendar"><div className="calendar-header"><div><h3>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3><p>Vencimentos registrados e próximos ciclos previstos.</p></div><div><button aria-label="Mês anterior" onClick={() => move(-1)}>‹</button><button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoje</button><button aria-label="Próximo mês" onClick={() => move(1)}>›</button></div></div><div className="calendar-grid">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{cells.map((day, index) => {
    if (!day) return <div className="calendar-cell calendar-blank" key={"blank-" + index}/>;
    const date = [year, String(monthIndex + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
    const dayItems = monthEvents.filter((item) => item.date === date);
    return <div className={"calendar-cell" + (date === localToday() ? " calendar-today" : "")} key={date}><span>{day}</span>{dayItems.slice(0, 3).map((item) => <button key={item.obligation.id + item.date} className={"calendar-event " + effectiveClass(item.status) + (item.projected ? " event-projected" : "")} title={item.obligation.title + " · " + item.status} onClick={() => onOpen(item.obligation)}>{item.projected && <i/>}{item.obligation.title}</button>)}{dayItems.length > 3 && <small className="calendar-more">+{dayItems.length - 3} mais</small>}</div>;
  })}</div><div className="calendar-legend"><span><i className="legend-upcoming"/>Programada</span><span><i className="legend-done"/>Cumprida</span><span><i className="legend-late"/>Atrasada</span><span><i className="legend-projected"/>Próximo ciclo previsto</span></div>{monthEvents.length === 0 && <div className="calendar-no-events">Nenhum vencimento neste mês.</div>}</div>;
}

function EmptyDependencies({ onOpenProcesses }: { onOpenProcesses: () => void }) {
  return <section className="obligation-no-processes"><span><CalendarIcon/></span><h2>Cadastre um processo primeiro</h2><p>Para acompanhar obrigações, selecione um processo vinculado a um empreendimento e cliente.</p><button className="primary-button" onClick={onOpenProcesses}>Ir para Processos <span aria-hidden="true">→</span></button></section>;
}

function ObligationForm({ mode, processes, memberById, initial, onClose, onSubmit }: { mode: "create" | "edit"; processes: ProcessRecord[]; memberById: Map<string, TeamMember>; initial: ObligationRecord | null; onClose: () => void; onSubmit: (input: ObligationInput) => void }) {
  const [form, setForm] = useState<ObligationInput>(initial ? { title: initial.title, description: initial.description, processId: initial.processId, reference: initial.reference, authority: initial.authority, responsibleId: initial.responsibleId, periodicity: initial.periodicity, firstDueDate: initial.firstDueDate, requirements: initial.requirements, expectedEvidence: initial.expectedEvidence, status: initial.status } : { ...emptyInput, processId: processes[0]?.id ?? "", responsibleId: demoTeam[0]?.id ?? "" });
  const [error, setError] = useState("");
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  function change<K extends keyof ObligationInput>(key: K, value: ObligationInput[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !processes.some((process) => process.id === form.processId) || !memberById.has(form.responsibleId) || !form.firstDueDate) { setError("Preencha o título, processo, responsável e primeiro vencimento."); return; }
    onSubmit({ ...form, title: form.title.trim(), description: form.description.trim(), reference: form.reference.trim(), authority: form.authority.trim(), requirements: form.requirements.trim(), expectedEvidence: form.expectedEvidence.trim() });
  }
  return <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="client-dialog obligation-dialog" role="dialog" aria-modal="true" aria-labelledby="obligation-form-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">OBRIGAÇÃO DEMONSTRATIVA</span><h2 id="obligation-form-title">{mode === "create" ? "Nova condicionante" : "Editar condicionante"}</h2><p>Vencimentos são definidos manualmente e não representam prazo legal.</p></div><button type="button" className="client-close" onClick={onClose} aria-label="Fechar formulário"><CloseIcon/></button></header><form onSubmit={submit} noValidate><div className="client-form-body"><div className="obligation-form-grid">
    <label className="field-wide">Título da obrigação <b>*</b><input autoFocus maxLength={140} value={form.title} onChange={(event) => change("title", event.target.value)} placeholder="Ex.: Apresentar relatório de acompanhamento"/></label>
    <label className="field-wide">Processo vinculado <b>*</b><select value={form.processId} onChange={(event) => change("processId", event.target.value)}><option value="">Selecione um processo</option>{processes.map((process) => <option value={process.id} key={process.id}>{process.name}</option>)}</select><small className="obligation-form-note">Cliente e empreendimento serão derivados do processo.</small></label>
    <label>Referência da obrigação <span>(opcional)</span><input maxLength={140} value={form.reference} onChange={(event) => change("reference", event.target.value)} placeholder="Item, referência ou identificação"/></label>
    <label>Órgão responsável <span>(opcional)</span><input maxLength={140} value={form.authority} onChange={(event) => change("authority", event.target.value)} placeholder="Órgão ou entidade"/></label>
    <label>Responsável interno <b>*</b><select value={form.responsibleId} onChange={(event) => change("responsibleId", event.target.value)}>{demoTeam.map((member) => <option key={member.id} value={member.id}>{member.name} — {member.role}</option>)}</select><small className="obligation-form-note">Equipe demonstrativa já utilizada no módulo Tarefas.</small></label>
    <label>Periodicidade <b>*</b><select value={form.periodicity} onChange={(event) => change("periodicity", event.target.value as Periodicity)}>{periodicities.map((periodicity) => <option key={periodicity}>{periodicity}</option>)}</select></label>
    <label className="field-wide">Data do primeiro vencimento <b>*</b><input type="date" value={form.firstDueDate} onChange={(event) => change("firstDueDate", event.target.value)}/><small className="obligation-form-note">Informada manualmente; a recorrência usa este vencimento como referência.</small></label>
    <label className="field-wide">Requisitos de cumprimento <textarea rows={3} maxLength={1200} value={form.requirements} onChange={(event) => change("requirements", event.target.value)} placeholder="Descreva os itens necessários para o cumprimento"/></label>
    <label className="field-wide">Evidências esperadas <textarea rows={2} maxLength={800} value={form.expectedEvidence} onChange={(event) => change("expectedEvidence", event.target.value)} placeholder="Ex.: relatório, comprovante, registro"/></label>
    <label className="field-wide">Descrição <textarea rows={2} maxLength={1000} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="Contexto operacional da obrigação"/></label>
    {mode === "edit" && <label className="obligation-active-field"><input type="checkbox" checked={form.status === "active"} onChange={(event) => change("status", event.target.checked ? "active" : "inactive")}/> Condicionante ativa</label>}
  </div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="client-form-hint"><b>*</b> Campos obrigatórios · Categorias e registros demonstrativos</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">{mode === "create" ? "Cadastrar condicionante" : "Salvar alterações"}</button></footer></form></section></div>;
}

function OccurrenceEditor({ occurrence, obligation, memberById, onChange, onEvidence }: { occurrence: ObligationOccurrence; obligation: ObligationRecord; memberById: Map<string, TeamMember>; onChange: (input: OccurrenceInput) => void; onEvidence: () => void }) {
  const [observations, setObservations] = useState(occurrence.observations);
  const [dirty, setDirty] = useState(false);
  const status = occurrenceStatus(obligation, occurrence);
  function update(patch: Partial<OccurrenceInput>) { onChange({ status: patch.status ?? occurrence.status, responsibleId: patch.responsibleId ?? occurrence.responsibleId, observations: patch.observations ?? occurrence.observations }); }
  function saveObservations() { update({ observations }); setDirty(false); }
  return <article className="occurrence-card"><header><div><strong>{occurrence.referencePeriod}</strong><span>Vencimento {dateLabel(occurrence.dueDate)}</span></div><StatusLabel status={status}/></header><div className="occurrence-controls"><label>Situação <select value={occurrence.status} onChange={(event) => update({ status: event.target.value as OccurrenceStatus })}>{occurrenceStatuses.filter((item) => item !== "Atrasada").map((item) => <option key={item}>{item}</option>)}</select></label><label>Responsável <select value={occurrence.responsibleId} onChange={(event) => update({ responsibleId: event.target.value })}>{demoTeam.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>{occurrence.completedAt && <p className="occurrence-completed-at">Cumprida em {new Date(occurrence.completedAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>}<label className="occurrence-observations">Observações<textarea rows={2} value={observations} onChange={(event) => { setObservations(event.target.value); setDirty(true); }} placeholder="Observações desta ocorrência"/></label>{dirty && <button className="occurrence-save-notes" onClick={saveObservations}>Salvar observações</button>}<div className="occurrence-evidence-heading"><strong>Evidências ({occurrence.evidence.length})</strong><button onClick={onEvidence}>Registrar evidência</button></div>{occurrence.evidence.length > 0 && <ul className="evidence-list">{occurrence.evidence.map((evidence) => <li key={evidence.id}><b>{evidence.name}</b><span>Entregue em {dateLabel(evidence.deliveredAt)}</span>{evidence.description && <p>{evidence.description}</p>}{evidence.notes && <small>{evidence.notes}</small>}</li>)}</ul>}<details className="occurrence-history-details"><summary>Histórico da ocorrência ({occurrence.history.length})</summary><ol>{[...occurrence.history].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => <li key={entry.id}><p>{entry.message}</p><span>{memberById.get(entry.actorId)?.name ?? "Equipe demonstrativa"} · {new Date(entry.date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span></li>)}</ol></details></article>;
}

function ObligationDetails({ obligation, context, memberById, onClose, onEdit, onGenerate, onOccurrenceChange, onEvidence }: { obligation: ObligationRecord; context: Context; memberById: Map<string, TeamMember>; onClose: () => void; onEdit: () => void; onGenerate: () => void; onOccurrenceChange: (id: string, input: OccurrenceInput) => void; onEvidence: (occurrence: ObligationOccurrence, evidence: Omit<ObligationEvidence, "id">) => void }) {
  const [evidenceOccurrence, setEvidenceOccurrence] = useState<ObligationOccurrence | null>(null);
  const nextDate = nextScheduledDate(obligation);
  const latest = [...obligation.occurrences].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const projectedDate = obligation.periodicity === "Pontual" ? null : calculateNextDueDate(latest?.dueDate ?? obligation.firstDueDate, obligation.periodicity);
  const alreadyGenerated = Boolean(projectedDate && obligation.occurrences.some((occurrence) => occurrence.dueDate === projectedDate));
  const orderedOccurrences = [...obligation.occurrences].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const member = memberById.get(obligation.responsibleId);
  return <div className="client-overlay client-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="client-drawer obligation-drawer" role="dialog" aria-modal="true" aria-labelledby="obligation-detail-title"><header className="client-drawer-header"><button className="client-close" onClick={onClose} aria-label="Fechar detalhes"><CloseIcon/></button><span className="dialog-eyebrow">DETALHES DA CONDICIONANTE</span><div className="obligation-detail-heading"><h2 id="obligation-detail-title">{obligation.title}</h2><span className={"obligation-active-badge " + (obligation.status === "active" ? "is-active" : "is-inactive")}>{obligation.status === "active" ? "Ativa" : "Inativa"}</span></div><p className="obligation-reference-label">{obligation.reference || "Sem referência informada"}</p><div className="client-drawer-actions"><span className="obligation-period-pill">{obligation.periodicity}</span><button className="client-cancel" onClick={onEdit}>Editar obrigação</button></div></header>
    <div className="client-drawer-content"><section className="client-detail-section"><h3>Vínculo e responsabilidade</h3><DetailRow label="Processo" value={context.process?.name ?? "Processo não encontrado"}/><DetailRow label="Cliente" value={context.client?.name ?? "Cliente não encontrado"}/><DetailRow label="Empreendimento" value={context.enterprise?.name ?? "Empreendimento não encontrado"}/><div className="obligation-responsible-detail"><span>Responsável interno</span><Member member={member}/></div><DetailRow label="Órgão responsável" value={obligation.authority || "Não informado"}/><DetailRow label="Primeiro vencimento" value={dateLabel(obligation.firstDueDate)}/></section>
      <section className="client-detail-section"><h3>Descrição e requisitos</h3><p className="client-detail-text">{obligation.description || "Nenhuma descrição informada."}</p><div className="obligation-text-block"><b>Requisitos</b><p>{obligation.requirements || "Não informados."}</p></div><div className="obligation-text-block"><b>Evidências esperadas</b><p>{obligation.expectedEvidence || "Não informadas."}</p></div></section>
      <section className="client-detail-section"><div className="obligation-detail-section-heading"><div><h3>Ocorrências por período</h3><p>Cada ciclo mantém sua situação, evidências e histórico.</p></div><span>{obligation.occurrences.length}</span></div>{obligation.status === "inactive" && <p className="obligation-inactive-note">Condicionante inativa: não gera alertas nem novas ocorrências.</p>}{orderedOccurrences.map((occurrence) => <OccurrenceEditor key={occurrence.id} occurrence={occurrence} obligation={obligation} memberById={memberById} onChange={(input) => onOccurrenceChange(occurrence.id, input)} onEvidence={() => setEvidenceOccurrence(occurrence)}/>)}</section>
      <section className="client-detail-section obligation-next-due"><h3>Próximos vencimentos</h3>{nextDate ? <div className="obligation-next-date"><CalendarIcon/><div><b>{dateLabel(nextDate)}</b><span>{nearestOccurrence(obligation) ? "Ocorrência já programada" : "Próximo ciclo calculado a partir da periodicidade"}</span></div></div> : <p className="client-detail-text">Sem novos vencimentos previstos.</p>}{obligation.status === "active" && obligation.periodicity !== "Pontual" && <button className="primary-button" onClick={onGenerate} disabled={alreadyGenerated}>Gerar próxima ocorrência</button>}{alreadyGenerated && <small className="obligation-duplicate-note">O ciclo seguinte já possui ocorrência; não será duplicado.</small>}<small className="obligation-schedule-note">Datas calculadas a partir do vencimento informado. Não constituem interpretação de prazo legal.</small></section>
      <section className="client-detail-section"><h3>Histórico da condicionante</h3><ol className="obligation-history">{[...obligation.history].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => <li key={entry.id}><i/><div><p>{entry.message}</p><span>{memberById.get(entry.actorId)?.name ?? "Equipe demonstrativa"} · {new Date(entry.date).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span></div></li>)}</ol></section>
      <div className="client-detail-demo-note"><span className="demo-dot"/> Condicionante e ocorrências demonstrativas salvas neste navegador.</div>
    </div></aside>{evidenceOccurrence && <EvidenceDialog occurrence={evidenceOccurrence} onClose={() => setEvidenceOccurrence(null)} onSubmit={(evidence) => { onEvidence(evidenceOccurrence, evidence); setEvidenceOccurrence(null); }}/>}</div>;
}

function EvidenceDialog({ occurrence, onClose, onSubmit }: { occurrence: ObligationOccurrence; onClose: () => void; onSubmit: (evidence: Omit<ObligationEvidence, "id">) => void }) {
  const [form, setForm] = useState({ name: "", description: "", deliveredAt: "", notes: "" });
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.name.trim() || !form.deliveredAt) { setError("Informe o nome da evidência e a data de entrega."); return; } onSubmit(form); }
  return <div className="client-overlay evidence-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="client-dialog evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">REGISTRO DEMONSTRATIVO</span><h2 id="evidence-title">Registrar evidência</h2><p>Ocorrência {occurrence.referencePeriod} · nenhum arquivo será enviado.</p></div><button type="button" className="client-close" onClick={onClose} aria-label="Fechar"><CloseIcon/></button></header><form onSubmit={submit} noValidate><div className="client-form-body"><div className="obligation-form-grid"><label className="field-wide">Nome da evidência <b>*</b><input autoFocus maxLength={140} value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setError(""); }} placeholder="Ex.: Relatório mensal"/></label><label>Data de entrega <b>*</b><input type="date" value={form.deliveredAt} onChange={(event) => { setForm({ ...form, deliveredAt: event.target.value }); setError(""); }}/></label><label>Descrição <input maxLength={180} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição breve"/></label><label className="field-wide">Observação <textarea rows={2} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observações adicionais"/></label></div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="obligation-form-note">Este registro é demonstrativo; não representa upload ou armazenamento de arquivo.</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Salvar evidência</button></footer></form></section></div>;
}
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="client-detail-row"><span>{label}</span><strong>{value}</strong></div>; }
