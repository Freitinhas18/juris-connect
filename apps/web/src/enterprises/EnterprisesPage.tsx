import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { listClients } from "../clients/clientApi";
import type { ClientRecord } from "../clients/clientTypes";
import { createEnterprise, deleteEnterprise, listEnterprises, updateEnterprise } from "./enterpriseApi";
import { getLegacyEnterpriseBackup, inspectLegacyEnterprises, markLegacyEnterpriseImported, type LegacyEnterpriseInspection } from "./enterpriseRepository";
import type { EnterpriseInput, EnterpriseRecord, EnterpriseStatus } from "./enterpriseTypes";
import "./enterprises.css";

type StatusFilter = "all" | EnterpriseStatus;
type SortBy = "name-asc" | "name-desc" | "client" | "cases";
type FormState = { mode: "create" } | { mode: "edit"; enterprise: EnterpriseRecord } | null;
const blankForm: EnterpriseInput = { clientId: "", name: "", type: "", activity: "", document: "", address: "", municipality: "", state: "SP", manager: "", description: "", status: "active", relatedCases: 0 };
const states: EnterpriseInput["state"][] = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function BuildingIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5.5L13 3v18M13 9h7v12M2 21h20"/><path d="M7 8h2m-2 4h2m-2 4h2m8-1h1m-1 4h1"/></svg>; }

export default function EnterprisesPage({ onOpenClients }: { onOpenClients: () => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [items, setItems] = useState<EnterpriseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [sort, setSort] = useState<SortBy>("name-asc");
  const [formState, setFormState] = useState<FormState>(null);
  const [selected, setSelected] = useState<EnterpriseRecord | null>(null);
  const [legacy, setLegacy] = useState<LegacyEnterpriseInspection>(() => inspectLegacyEnterprises([]));
  const [legacyMappings, setLegacyMappings] = useState<Record<string, string>>({});
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyMessage, setLegacyMessage] = useState("");
  const [legacyError, setLegacyError] = useState("");

  async function load() {
    setLoading(true); setLoadError("");
    try {
      const [loadedClients, loadedEnterprises] = await Promise.all([listClients(), listEnterprises()]);
      setClients(loadedClients); setItems(loadedEnterprises);
      const inspection = inspectLegacyEnterprises(loadedClients);
      setLegacy(inspection);
      setLegacyMappings(Object.fromEntries(inspection.candidates.map((candidate) => [candidate.sourceId, candidate.clientId])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar empreendimentos e clientes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const activeCount = items.filter((item) => item.status === "active").length;
  const inactiveCount = items.length - activeCount;
  const cities = [...new Set(items.map((item) => item.municipality).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const clientName = clientsById.get(item.clientId)?.name ?? "";
      return (!term || item.name.toLocaleLowerCase("pt-BR").includes(term) || clientName.toLocaleLowerCase("pt-BR").includes(term))
        && (clientFilter === "all" || item.clientId === clientFilter)
        && (statusFilter === "all" || item.status === statusFilter)
        && (cityFilter === "all" || item.municipality === cityFilter);
    }).sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name, "pt-BR");
      if (sort === "client") return (clientsById.get(a.clientId)?.name ?? "").localeCompare(clientsById.get(b.clientId)?.name ?? "", "pt-BR");
      if (sort === "cases") return b.relatedCases - a.relatedCases || a.name.localeCompare(b.name, "pt-BR");
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [items, clientsById, search, clientFilter, statusFilter, cityFilter, sort]);

  const openCreate = () => { setOperationError(""); setFormState({ mode: "create" }); };

  async function saveNew(input: EnterpriseInput) {
    setBusy(true); setOperationError("");
    try { const enterprise = await createEnterprise(input); setItems((current) => [...current, enterprise]); setFormState(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível cadastrar o empreendimento."); throw error; }
    finally { setBusy(false); }
  }
  async function saveEdit(input: EnterpriseInput) {
    if (formState?.mode !== "edit") return;
    const id = formState.enterprise.id;
    setBusy(true); setOperationError("");
    try { const updated = await updateEnterprise(id, input); setItems((current) => current.map((item) => item.id === id ? updated : item)); setSelected((current) => current?.id === id ? updated : current); setFormState(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível atualizar o empreendimento."); throw error; }
    finally { setBusy(false); }
  }
  async function toggle(item: EnterpriseRecord) {
    const input: EnterpriseInput = { clientId: item.clientId, name: item.name, type: item.type, activity: item.activity, document: item.document, address: item.address, municipality: item.municipality, state: item.state, manager: item.manager, description: item.description, status: item.status === "active" ? "inactive" : "active", relatedCases: item.relatedCases };
    setBusy(true); setOperationError("");
    try { const updated = await updateEnterprise(item.id, input); setItems((current) => current.map((record) => record.id === item.id ? updated : record)); setSelected((current) => current?.id === item.id ? updated : current); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível alterar o status."); }
    finally { setBusy(false); }
  }
  async function remove(item: EnterpriseRecord) {
    if (!window.confirm(`Excluir definitivamente o empreendimento “${item.name}”?`)) return;
    setBusy(true); setOperationError("");
    try { await deleteEnterprise(item.id); setItems((current) => current.filter((record) => record.id !== item.id)); setSelected(null); }
    catch (error) { setOperationError(error instanceof Error ? error.message : "Não foi possível excluir o empreendimento."); }
    finally { setBusy(false); }
  }
  async function importLegacy() {
    const candidates = legacy.candidates;
    if (!candidates.length || legacyBusy) return;
    setLegacyBusy(true); setLegacyError(""); setLegacyMessage("");
    const imported: EnterpriseRecord[] = [];
    const failures: string[] = [];
    for (const candidate of candidates) {
      const clientId = legacyMappings[candidate.sourceId] ?? candidate.clientId;
      if (!clients.some((client) => client.id === clientId)) { failures.push(`${candidate.enterprise.name}: selecione um cliente cadastrado.`); continue; }
      const { id: _oldId, updatedAt: _oldUpdatedAt, ...legacyRecord } = candidate.enterprise;
      try {
        const created = await createEnterprise({ ...legacyRecord, clientId });
        markLegacyEnterpriseImported(candidate.sourceId, created.id);
        imported.push(created);
      } catch (error) {
        failures.push(`${candidate.enterprise.name}: ${error instanceof Error ? error.message : "falha na importação"}`);
      }
    }
    if (imported.length) setItems((current) => [...imported, ...current]);
    const refreshed = inspectLegacyEnterprises(clients);
    setLegacy(refreshed);
    setLegacyMappings(Object.fromEntries(refreshed.candidates.map((candidate) => [candidate.sourceId, legacyMappings[candidate.sourceId] ?? candidate.clientId])));
    setLegacyMessage(imported.length ? `${imported.length} empreendimento(s) copiado(s) para o PostgreSQL. O backup local foi mantido.` : "Nenhum registro foi importado.");
    if (failures.length) setLegacyError(failures.join(" "));
    setLegacyBusy(false);
  }

  function downloadLegacyBackup() {
    const raw = getLegacyEnterpriseBackup();
    if (raw === null) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "juris-connect-enterprises-local-backup.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const legacyPanel = legacy.exists && <section className="enterprise-migration-panel" aria-label="Migração de dados locais">
    <div className="enterprise-migration-heading"><div><strong>Dados locais preservados</strong><p>Encontramos uma cópia local de empreendimentos. Nada será removido do navegador.</p></div><button type="button" className="enterprise-backup-button" onClick={downloadLegacyBackup}>Baixar backup JSON</button></div>
    {legacy.parseError && <p className="enterprise-migration-warning" role="alert">O conteúdo local não pôde ser interpretado. Ele permanece intacto; baixe o backup para revisão manual.</p>}
    {legacy.invalidCount > 0 && <p className="enterprise-migration-warning">{legacy.invalidCount} registro(s) local(is) com formato não reconhecido não serão importados e continuam no backup.</p>}
    {legacy.candidates.length > 0 ? <><p className="enterprise-migration-summary">{legacy.candidates.length} registro(s) personalizado(s) aguardam associação a um cliente do PostgreSQL. Demonstrações inalteradas: {legacy.unchangedDemoCount} (não importadas).</p><div className="enterprise-migration-list">{legacy.candidates.map((candidate) => <label key={candidate.sourceId}><span><strong>{candidate.enterprise.name}</strong><small>Cliente anterior: {candidate.previousClientName || "não localizado nos dados locais"}</small></span><select aria-label={`Associar ${candidate.enterprise.name} a um cliente`} value={legacyMappings[candidate.sourceId] ?? ""} onChange={(event) => setLegacyMappings((current) => ({ ...current, [candidate.sourceId]: event.target.value }))}><option value="">Selecione um cliente atual</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.status === "inactive" ? " (inativo)" : ""}</option>)}</select></label>)}</div><div className="enterprise-migration-actions"><span>Importar cria registros no PostgreSQL e preserva esta cópia local.</span><button className="primary-button" disabled={legacyBusy || !clients.length || legacy.candidates.some((candidate) => !clients.some((client) => client.id === (legacyMappings[candidate.sourceId] ?? "")))} onClick={() => void importLegacy()}>{legacyBusy ? "Importando…" : "Importar registros selecionados"}</button></div></> : !legacy.parseError && <p className="enterprise-migration-summary">{legacy.unchangedDemoCount ? `A cópia contém ${legacy.unchangedDemoCount} registro(s) de demonstração sem alterações; não há dados personalizados pendentes.` : "Não há registros personalizados pendentes de importação."}</p>}
    {legacyMessage && <p className="enterprise-migration-success" role="status">{legacyMessage}</p>}{legacyError && <p className="enterprise-migration-warning" role="alert">{legacyError}</p>}
  </section>;

  return <div className="page-content enterprises-page">
    <PageTitle onCreate={clients.length && !busy ? openCreate : undefined}/>
    <div className="enterprise-api-notice"><span className="live-dot"/> Empreendimentos e vínculos carregados da API e persistidos no PostgreSQL.</div>
    {loadError && <div className="enterprise-api-error" role="alert">{loadError}<button onClick={() => void load()}>Tentar novamente</button></div>}
    {operationError && <div className="enterprise-api-error" role="alert">{operationError}<button onClick={() => setOperationError("")} aria-label="Fechar erro">×</button></div>}
    {legacyPanel}
    <section className="enterprise-stat-grid" aria-label="Resumo de empreendimentos">
      <StatCard title="Total de empreendimentos" value={items.length} note="cadastros no PostgreSQL" tone="violet" icon={<BuildingIcon/>}/>
      <StatCard title="Empreendimentos ativos" value={activeCount} note="em acompanhamento" tone="green"/>
      <StatCard title="Empreendimentos inativos" value={inactiveCount} note="cadastros desativados" tone="muted"/>
    </section>
    <section className="panel enterprise-list-panel">
      <div className="enterprise-list-heading"><div><h2>Portfólio de empreendimentos</h2><p>Os nomes dos clientes refletem o cadastro atual.</p></div><span className="enterprise-count-pill">{filtered.length} {filtered.length === 1 ? "empreendimento" : "empreendimentos"}</span></div>
      <div className="enterprise-toolbar">
        <label className="enterprise-search"><SearchIcon/><input aria-label="Pesquisar empreendimento ou cliente" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empreendimento ou cliente..."/>{search && <button aria-label="Limpar pesquisa" onClick={() => setSearch("")}><CloseIcon/></button>}</label>
        <FilterSelect label="Cliente" value={clientFilter} onChange={setClientFilter}><option value="all">Todos</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</FilterSelect>
        <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></FilterSelect>
        <FilterSelect label="Município" value={cityFilter} onChange={setCityFilter}><option value="all">Todos</option>{cities.map((city) => <option key={city}>{city}</option>)}</FilterSelect>
        <FilterSelect label="Ordenar" value={sort} onChange={(value) => setSort(value as SortBy)}><option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option><option value="client">Cliente</option><option value="cases">Mais processos</option></FilterSelect>
      </div>
      <div className="enterprise-table-scroll"><table className="enterprise-table"><thead><tr><th>EMPREENDIMENTO</th><th>CLIENTE VINCULADO</th><th>TIPO / ATIVIDADE</th><th>MUNICÍPIO / UF</th><th>RESPONSÁVEL</th><th>PROCESSOS</th><th>STATUS</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
        <td><button className="enterprise-name-button" onClick={() => setSelected(item)}><span className="enterprise-avatar"><BuildingIcon/></span><span><strong>{item.name}</strong><small>{item.type}</small></span></button></td>
        <td><button className="enterprise-client-link" onClick={() => setSelected(item)}>{clientsById.get(item.clientId)?.name ?? "Cliente não encontrado"}</button></td><td>{item.activity}</td><td>{item.municipality} / {item.state}</td><td>{item.manager}</td><td><span className="enterprise-cases-count">{item.relatedCases}</span></td><td><span className={"client-status status-" + item.status}><i/>{item.status === "active" ? "Ativo" : "Inativo"}</span></td>
        <td><div className="enterprise-row-actions"><button disabled={busy} onClick={() => setSelected(item)} aria-label={"Ver " + item.name}>Detalhes</button><button disabled={busy} onClick={() => { setOperationError(""); setFormState({ mode: "edit", enterprise: item }); }} aria-label={"Editar " + item.name}>Editar</button><button disabled={busy} onClick={() => void toggle(item)} aria-label={(item.status === "active" ? "Desativar " : "Ativar ") + item.name}>{item.status === "active" ? "Desativar" : "Ativar"}</button><button disabled={busy} onClick={() => void remove(item)} aria-label={"Excluir " + item.name}>Excluir</button></div></td>
      </tr>)}</tbody></table>{loading ? <div className="enterprise-empty"><strong>Carregando empreendimentos…</strong></div> : !loadError && filtered.length === 0 && clients.length > 0 && <div className="enterprise-empty"><span><SearchIcon/></span><strong>{items.length ? "Nenhum empreendimento encontrado" : "Nenhum empreendimento cadastrado"}</strong><p>{items.length ? "Altere a pesquisa ou os filtros para consultar outros registros." : "Cadastre um empreendimento para associá-lo a um cliente do PostgreSQL."}</p>{items.length > 0 && <button onClick={() => { setSearch(""); setClientFilter("all"); setStatusFilter("all"); setCityFilter("all"); }}>Limpar filtros</button>}{items.length === 0 && <button onClick={openCreate}>Cadastrar empreendimento</button>}</div>}{!clients.length && !loading && <div className="enterprise-empty"><strong>Cadastre um cliente primeiro</strong><p>Cada empreendimento precisa de um cliente cadastrado no PostgreSQL.</p><button onClick={onOpenClients}>Ir para Clientes</button></div>}</div>
      <div className="enterprise-list-footer"><span>Exibindo <strong>{filtered.length}</strong> de <strong>{items.length}</strong> empreendimentos no PostgreSQL</span><span>Vínculo relacional por UUID do cliente</span></div>
    </section>
    {formState && <EnterpriseForm mode={formState.mode} clients={clients} initial={formState.mode === "edit" ? formState.enterprise : null} saving={busy} onClose={() => setFormState(null)} onSubmit={formState.mode === "create" ? saveNew : saveEdit}/>}
    {selected && <EnterpriseDetails enterprise={items.find((item) => item.id === selected.id) ?? selected} client={clientsById.get(selected.clientId) ?? null} busy={busy} error={operationError} onClose={() => setSelected(null)} onEdit={() => { setOperationError(""); setFormState({ mode: "edit", enterprise: items.find((item) => item.id === selected.id) ?? selected }); }} onToggle={() => void toggle(items.find((item) => item.id === selected.id) ?? selected)} onDelete={() => void remove(items.find((item) => item.id === selected.id) ?? selected)} onOpenClient={() => { setSelected(null); onOpenClients(); }}/>}
  </div>;
}

function PageTitle({ onCreate }: { onCreate?: () => void }) {
  return <div className="page-heading enterprises-heading"><div><div className="eyebrow"><span className="live-dot"/> OPERAÇÃO E PORTFÓLIO</div><h1>Empreendimentos</h1><p>Acompanhe ativos, responsáveis e relações com clientes.</p></div>{onCreate && <button className="primary-button" onClick={onCreate}><PlusIcon/> Novo empreendimento</button>}</div>;
}
function StatCard({ title, value, note, tone, icon }: { title: string; value: number; note: string; tone: string; icon?: ReactNode }) {
  return <article className="enterprise-stat-card"><span className={"enterprise-stat-icon " + tone}>{icon ?? <i/>}</span><div><small>{title}</small><strong>{value}</strong><span>{note}</span></div></article>;
}
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="enterprise-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function EnterpriseForm({ mode, clients, initial, saving, onClose, onSubmit }: { mode: "create" | "edit"; clients: ClientRecord[]; initial: EnterpriseRecord | null; saving: boolean; onClose: () => void; onSubmit: (input: EnterpriseInput) => Promise<void> }) {
  const [form, setForm] = useState<EnterpriseInput>(initial ? { ...initial } : { ...blankForm, clientId: clients.find((client) => client.status === "active")?.id ?? clients[0]?.id ?? "" });
  const [error, setError] = useState("");
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  function change<K extends keyof EnterpriseInput>(key: K, value: EnterpriseInput[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.clientId || !clients.some((client) => client.id === form.clientId)) { setError("Selecione um cliente cadastrado."); return; }
    if (![form.name, form.type, form.activity, form.address, form.municipality, form.state, form.manager].every((value) => value.trim())) { setError("Preencha todos os campos obrigatórios."); return; }
    const digits = form.document.replace(/\D/g, "");
    if (digits && digits.length !== 14) { setError("CNPJ deve conter 14 dígitos ou ficar em branco."); return; }
    try { await onSubmit({ ...form, name: form.name.trim(), type: form.type.trim(), activity: form.activity.trim(), document: form.document.trim(), address: form.address.trim(), municipality: form.municipality.trim(), state: form.state.trim().toUpperCase() as EnterpriseInput["state"], manager: form.manager.trim(), description: form.description.trim(), relatedCases: Math.max(0, Number(form.relatedCases) || 0) }); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o empreendimento."); }
  }
  return <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="client-dialog enterprise-dialog" role="dialog" aria-modal="true" aria-labelledby="enterprise-form-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">PORTFÓLIO DE EMPREENDIMENTOS</span><h2 id="enterprise-form-title">{mode === "create" ? "Novo empreendimento" : "Editar empreendimento"}</h2><p>Cadastro e alterações serão persistidos pela API no PostgreSQL.</p></div><button type="button" className="client-close" onClick={onClose} aria-label="Fechar formulário"><CloseIcon/></button></header><form onSubmit={(event) => void submit(event)} noValidate><div className="client-form-body"><div className="enterprise-form-grid">
    <label className="field-wide">Nome do empreendimento <b>*</b><input autoFocus maxLength={120} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Parque Empresarial Central"/></label>
    <label className="field-wide">Cliente vinculado <b>*</b><select value={form.clientId} onChange={(event) => change("clientId", event.target.value)}><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.status === "inactive" ? " (inativo)" : ""}</option>)}</select><small className="enterprise-field-note">O vínculo usa o ID e acompanha o nome atualizado do cliente.</small></label>
    <label>Tipo de empreendimento <b>*</b><input maxLength={100} value={form.type} onChange={(event) => change("type", event.target.value)} placeholder="Ex.: Condomínio residencial"/></label>
    <label>Atividade principal <b>*</b><input maxLength={140} value={form.activity} onChange={(event) => change("activity", event.target.value)} placeholder="Ex.: Incorporação imobiliária"/></label>
    <label>CNPJ <span>(opcional)</span><input maxLength={24} value={form.document} onChange={(event) => change("document", event.target.value)} placeholder="00.000.000/0000-00"/></label>
    <label>Responsável principal <b>*</b><input maxLength={100} value={form.manager} onChange={(event) => change("manager", event.target.value)} placeholder="Nome do responsável"/></label>
    <label className="field-wide">Endereço <b>*</b><input maxLength={200} value={form.address} onChange={(event) => change("address", event.target.value)} placeholder="Rua, número e complemento"/></label>
    <label>Município <b>*</b><input maxLength={100} value={form.municipality} onChange={(event) => change("municipality", event.target.value)} placeholder="Cidade"/></label>
    <label>Estado <b>*</b><select value={form.state} onChange={(event) => change("state", event.target.value as EnterpriseInput["state"])}>{states.map((state) => <option key={state}>{state}</option>)}</select></label>
    <label className="field-wide">Descrição <textarea rows={3} maxLength={800} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="Descrição breve para acompanhamento interno"/></label>
    {mode === "edit" && <><label>Processos relacionados <span>(calculado)</span><input type="number" value={form.relatedCases} readOnly aria-readonly="true"/><small className="enterprise-field-note">Contagem derivada dos processos persistidos no PostgreSQL.</small></label><label className="enterprise-edit-status"><input type="checkbox" checked={form.status === "active"} onChange={(event) => change("status", event.target.checked ? "active" : "inactive")}/> Empreendimento ativo</label></>}
  </div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="client-form-hint"><b>*</b> Campos obrigatórios · Processos relacionados permanecem como indicador demonstrativo</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : mode === "create" ? "Cadastrar empreendimento" : "Salvar alterações"}</button></footer></form></section></div>;
}

function EnterpriseDetails({ enterprise, client, busy, error, onClose, onEdit, onToggle, onDelete, onOpenClient }: { enterprise: EnterpriseRecord; client: ClientRecord | null; busy: boolean; error: string; onClose: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void; onOpenClient: () => void }) {
  useEffect(() => { function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  return <div className="client-overlay client-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><aside className="client-drawer" role="dialog" aria-modal="true" aria-labelledby="enterprise-details-title"><header className="client-drawer-header"><button className="client-close" onClick={onClose} aria-label="Fechar detalhes"><CloseIcon/></button><span className="dialog-eyebrow">DETALHES DO EMPREENDIMENTO</span><div className="client-drawer-identity"><span className="enterprise-avatar large"><BuildingIcon/></span><div><h2 id="enterprise-details-title">{enterprise.name}</h2><span className={"client-status status-" + enterprise.status}><i/>{enterprise.status === "active" ? "Ativo" : "Inativo"}</span></div></div><div className="client-drawer-actions"><button className="client-cancel" disabled={busy} onClick={onToggle}>{enterprise.status === "active" ? "Desativar" : "Ativar"}</button><button className="primary-button" disabled={busy} onClick={onEdit}>Editar cadastro</button><button className="enterprise-delete-button" disabled={busy} onClick={onDelete}>Excluir</button></div></header>
    <div className="client-drawer-content">{error && <p className="client-form-error" role="alert">{error}</p>}<section className="client-detail-section"><h3>Informações gerais</h3><DetailRow label="Tipo" value={enterprise.type}/><DetailRow label="CNPJ" value={enterprise.document || "Não informado"}/></section>
      <section className="client-detail-section"><div className="detail-section-title"><h3>Cliente vinculado</h3>{client && <span className={"client-status status-" + client.status}><i/>{client.status === "active" ? "Ativo" : "Inativo"}</span>}</div>{client ? <><strong className="enterprise-detail-client-name">{client.name}</strong><DetailRow label="Contato" value={client.contactName}/><DetailRow label="E-mail" value={client.email}/><DetailRow label="Telefone" value={client.phone}/><button className="enterprise-open-client" onClick={onOpenClient}>Abrir cadastro do cliente <span aria-hidden="true">→</span></button></> : <p className="client-detail-text">O cliente vinculado não foi encontrado entre os clientes carregados da API.</p>}</section>
      <section className="client-detail-section"><h3>Localização</h3><DetailRow label="Endereço" value={enterprise.address}/><DetailRow label="Município / UF" value={enterprise.municipality + " / " + enterprise.state}/></section>
      <section className="client-detail-section"><h3>Atividade e responsável</h3><DetailRow label="Atividade" value={enterprise.activity}/><DetailRow label="Responsável" value={enterprise.manager}/></section>
      <section className="client-detail-section"><h3>Descrição</h3><p className="client-detail-text">{enterprise.description || "Nenhuma descrição cadastrada."}</p></section>
      <section className="client-detail-section"><div className="detail-section-title"><h3>Processos relacionados</h3><span>{enterprise.relatedCases}</span></div><p className="client-detail-text">Contagem calculada pela API a partir dos processos persistidos e vinculados a este empreendimento.</p></section>
      <div className="client-detail-demo-note"><span className="live-dot"/> Empreendimento carregado da API e persistido no PostgreSQL.</div>
    </div></aside></div>;
}
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="client-detail-row"><span>{label}</span><strong>{value}</strong></div>; }
