import { useEffect, useMemo, useState } from "react";
import { listClients } from "../clients/clientApi";
import { listEnterprises } from "../enterprises/enterpriseApi";
import { listProcesses } from "../processes/processApi";
import { listTasks } from "../tasks/taskApi";
import { listObligations } from "../obligations/obligationApi";
import { deleteDocument as deleteDocumentRequest, documentFileUrl, listDocuments, updateDocument as updateDocumentRequest, uploadDocument } from "./documentApi";
import { MAX_DOCUMENT_SIZE } from "./documentStorage";
import { backupLegacyDocuments, inspectLegacyDocuments, legacyFile, mapLegacyLinks, markLegacyDocumentImported, type LegacyAssociationIssue } from "./documentLegacy";
import { documentCategories, documentStatuses, type DocumentCategory, type DocumentInput, type DocumentLinks, type DocumentRecord } from "./documentTypes";
import "./documents.css";

const emptyLinks = (): DocumentLinks => ({ clientIds: [], enterpriseIds: [], processIds: [], taskIds: [], occurrences: [] });
const blankInput = (): DocumentInput => ({ name: "", description: "", category: "Outros", responsible: "Lucas Martins", status: "Pendente", links: emptyLinks() });
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(date));

export default function DocumentsPage() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [clients, setClients] = useState<Awaited<ReturnType<typeof listClients>>>([]);
  const [enterprises, setEnterprises] = useState<Awaited<ReturnType<typeof listEnterprises>>>([]);
  const [processes, setProcesses] = useState<Awaited<ReturnType<typeof listProcesses>>>([]);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof listTasks>>>([]);
  const [obligations, setObligations] = useState<Awaited<ReturnType<typeof listObligations>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [legacyRecords, setLegacyRecords] = useState<DocumentRecord[]>([]);
  const [legacyError, setLegacyError] = useState("");
  const [legacyNotice, setLegacyNotice] = useState("");
  const [importingLegacy, setImportingLegacy] = useState<DocumentRecord | null>(null);
  const [legacyIssues, setLegacyIssues] = useState<LegacyAssociationIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [clientFilter, setClientFilter] = useState("Todos");
  const [enterpriseFilter, setEnterpriseFilter] = useState("Todos");
  const [processFilter, setProcessFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [form, setForm] = useState<DocumentInput>(blankInput);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);

  async function load() {
    setLoading(true); setLoadError("");
    const inspection = inspectLegacyDocuments(); setLegacyRecords(inspection.candidates);
    if (inspection.invalid) setLegacyError("Os metadados locais estão inválidos. A origem foi mantida; faça backup antes de qualquer ação.");
    const results = await Promise.allSettled([listDocuments(), listClients(), listEnterprises(), listProcesses(), listTasks(), listObligations()]);
    const [docsResult, clientsResult, enterprisesResult, processesResult, tasksResult, obligationsResult] = results;
    if (docsResult.status === "fulfilled") setRecords(docsResult.value);
    if (clientsResult.status === "fulfilled") setClients(clientsResult.value);
    if (enterprisesResult.status === "fulfilled") setEnterprises(enterprisesResult.value);
    if (processesResult.status === "fulfilled") setProcesses(processesResult.value);
    if (tasksResult.status === "fulfilled") setTasks(tasksResult.value);
    if (obligationsResult.status === "fulfilled") setObligations(obligationsResult.value);
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Falha ao consultar API"] : []);
    if (errors.length) setLoadError(errors.join(" "));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const selected = records.find((item) => item.id === selectedId) ?? null;
  const visible = useMemo(() => records.filter((item) => {
    const haystack = `${item.name} ${item.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (categoryFilter === "Todas" || item.category === categoryFilter) && (typeFilter === "Todos" || item.extension === typeFilter) && (clientFilter === "Todos" || item.links.clientIds.includes(clientFilter)) && (enterpriseFilter === "Todos" || item.links.enterpriseIds.includes(enterpriseFilter)) && (processFilter === "Todos" || item.links.processIds.includes(processFilter)) && (statusFilter === "Todos" || item.status === statusFilter);
  }).sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [records, query, categoryFilter, typeFilter, clientFilter, enterpriseFilter, processFilter, statusFilter]);
  const counts = useMemo(() => Object.fromEntries(documentStatuses.map((status) => [status, records.filter((item) => item.status === status).length])) as Record<(typeof documentStatuses)[number], number>, [records]);

  useEffect(() => {
    let active = true;
    setPreviewUrl("");
    if (!selected || !["application/pdf", "image/png", "image/jpeg"].includes(selected.mimeType)) return;
    setPreviewBusy(true);
    void fetch(documentFileUrl(selected.id, true), { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("Arquivo indisponível"); const blob = await response.blob(); if (active) setPreviewUrl(URL.createObjectURL(blob)); }).catch(() => { if (active) setError("Não foi possível carregar o arquivo armazenado no servidor."); }).finally(() => { if (active) setPreviewBusy(false); });
    return () => { active = false; };
  }, [selected?.id, records]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function startCreate() { setEditing(null); setImportingLegacy(null); setLegacyIssues([]); setFormOpen(true); setForm(blankInput()); setFile(null); setError(""); }
  function startEdit(record: DocumentRecord) { setEditing(record); setImportingLegacy(null); setLegacyIssues([]); setFormOpen(true); setForm({ name: record.name, description: record.description, category: record.category, responsible: record.responsible, status: record.status, links: { ...record.links } }); setFile(null); setError(""); }
  async function startLegacyImport(record: DocumentRecord) {
    setError("");
    try { const sourceFile = await legacyFile(record); if (!sourceFile) { setLegacyError(`O arquivo original de “${record.name}” não foi encontrado no IndexedDB. Metadados e origem foram mantidos.`); return; }
      const remapped = mapLegacyLinks(record, { clients, enterprises, processes, tasks, obligations });
      setImportingLegacy(record); setEditing(null); setFormOpen(true); setForm({ name: record.name, description: record.description, category: record.category, responsible: record.responsible, status: record.status, links: remapped.links }); setLegacyIssues(remapped.issues); setFile(sourceFile);
    } catch { setLegacyError(`Não foi possível ler o arquivo local de “${record.name}”. A origem foi mantida.`); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (importingLegacy && legacyIssues.length) { setError("Associe cada vínculo legado a um registro atual antes de importar."); return; }
    if (!editing && !file) { setError("Selecione um arquivo para continuar."); return; }
    if (file && file.size > MAX_DOCUMENT_SIZE) { setError("O arquivo excede o limite de 20 MB."); return; }
    setBusy(true);
    try {
      if (editing) { const updated = await updateDocumentRequest(editing.id, form); setRecords((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelectedId(updated.id); }
      else if (file) {
        if (importingLegacy && !backupLegacyDocuments()) throw new Error("Não foi possível criar backup dos metadados locais; importação cancelada.");
        const created = await uploadDocument(form, file, importingLegacy?.history, importingLegacy?.addedAt, importingLegacy?.id);
        if (importingLegacy) { markLegacyDocumentImported(importingLegacy.id); setLegacyRecords((current) => current.filter((item) => item.id !== importingLegacy.id)); setLegacyNotice(`“${created.name}” foi importado com arquivo e metadados. A cópia local original foi preservada.`); }
        setRecords((current) => [created, ...current]); setSelectedId(created.id);
      }
      setEditing(null); setImportingLegacy(null); setFormOpen(false); setFile(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o arquivo no servidor."); }
    finally { setBusy(false); }
  }
  async function remove(record: DocumentRecord) { if (!window.confirm(`Remover “${record.name}” e o arquivo persistente do servidor?`)) return; setBusy(true); try { await deleteDocumentRequest(record.id); setRecords((current) => current.filter((item) => item.id !== record.id)); setSelectedId(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível remover o documento."); } finally { setBusy(false); } }
  function download(record: DocumentRecord) { const anchor = document.createElement("a"); anchor.href = documentFileUrl(record.id); anchor.download = record.originalName; document.body.append(anchor); anchor.click(); anchor.remove(); }
  function patchLinks<K extends keyof DocumentLinks>(key: K, values: DocumentLinks[K]) { setForm((current) => ({ ...current, links: { ...current.links, [key]: values } })); }
  function mapLegacyIssue(issue: LegacyAssociationIssue, value: string) {
    if (!value) return;
    setForm((current) => {
      if (issue.kind === "occurrences") { const [obligationId, occurrenceId] = value.split("|"); return { ...current, links: { ...current.links, occurrences: [...current.links.occurrences, { obligationId, occurrenceId }] } }; }
      return { ...current, links: { ...current.links, [issue.kind]: [...current.links[issue.kind], value] } };
    });
    setLegacyIssues((current) => current.filter((item) => !(item.kind === issue.kind && item.oldValue === issue.oldValue)));
  }
  const clientName = (id: string) => clients.find((item) => item.id === id)?.name ?? "Cliente removido";
  const enterpriseName = (id: string) => enterprises.find((item) => item.id === id)?.name ?? "Empreendimento removido";
  const processName = (id: string) => processes.find((item) => item.id === id)?.name ?? "Processo removido";
  const taskName = (id: string) => tasks.find((item) => item.id === id)?.title ?? "Tarefa removida";
  const occurrenceName = (obligationId: string, occurrenceId: string) => { const obligation = obligations.find((item) => item.id === obligationId); const occurrence = obligation?.occurrences.find((item) => item.id === occurrenceId); return `${obligation?.title ?? "Condicionante removida"} · ${occurrence?.referencePeriod ?? "ocorrência removida"}`; };

  if (loading) return <div className="page-content documents-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE / BIBLIOTECA</div><h1>Documentos</h1></div></div><p className="document-api-state">Carregando documentos e vínculos pelo backend…</p></div>;

  return <div className="page-content documents-page">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / BIBLIOTECA</div><h1>Documentos</h1><p>Centralize arquivos persistidos no servidor e encontre-os pelos registros relacionados.</p></div><button className="primary-button" onClick={startCreate}>＋ Novo documento</button></div>
    <div className="demo-notice"><span className="demo-dot"/> Documentos e metadados persistidos <span>·</span> Acesso protegido por sessão e organização. O armazenamento de arquivos é local e ainda não tem backup gerenciado.</div>
    {loadError && <div className="document-error document-api-error" role="alert">{loadError}<button onClick={() => void load()}>Tentar novamente</button></div>}
    {legacyRecords.length > 0 && <section className="document-legacy-panel"><div><strong>Documentos locais encontrados</strong><p>{legacyRecords.length} registro(s) no localStorage. A importação transfere o arquivo do IndexedDB e os metadados; os dados locais não serão apagados.</p></div><button type="button" className="secondary-button" onClick={() => { const raw = backupLegacyDocuments(); if (!raw) { setLegacyError("Não foi possível criar o backup."); return; } const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "juris-connect-documentos-backup.json"; anchor.click(); URL.revokeObjectURL(url); }}>Baixar backup dos metadados</button>{legacyRecords.map((record) => <div className="document-legacy-row" key={record.id}><span>{record.name} · {formatSize(record.size)}</span><button type="button" onClick={() => void startLegacyImport(record)}>Importar arquivo e metadados</button></div>)}{legacyError && <p role="alert">{legacyError}</p>}{legacyNotice && <p role="status">{legacyNotice}</p>}</section>}
    <section className="documents-stats" aria-label="Indicadores de documentos"><article><span>Total</span><strong>{records.length}</strong></article>{documentStatuses.map((status) => <article key={status}><span>{status}</span><strong>{counts[status]}</strong></article>)}</section>
    <section className="panel documents-library"><div className="documents-toolbar"><label className="document-search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou descrição"/></label><select aria-label="Categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>Todas</option>{documentCategories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Tipo de arquivo" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>Todos</option>{[...new Set(records.map((item) => item.extension))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="Todos">Todos os clientes</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Empreendimento" value={enterpriseFilter} onChange={(event) => setEnterpriseFilter(event.target.value)}><option value="Todos">Todos os empreendimentos</option>{enterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Processo" value={processFilter} onChange={(event) => setProcessFilter(event.target.value)}><option value="Todos">Todos os processos</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option>{documentStatuses.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>DOCUMENTO</th><th>CATEGORIA</th><th>TIPO / TAMANHO</th><th>INCLUSÃO</th><th>RESPONSÁVEL</th><th>RELACIONAMENTOS</th><th>STATUS</th><th/></tr></thead><tbody>{visible.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className="document-row"><td><strong>{item.name}</strong><small>{item.description || "Sem descrição"}</small></td><td>{item.category}</td><td><span className="file-type">{item.extension}</span> {formatSize(item.size)}</td><td>{formatDate(item.addedAt)}</td><td>{item.responsible}</td><td>{item.links.clientIds.length + item.links.enterpriseIds.length + item.links.processIds.length + item.links.taskIds.length + item.links.occurrences.length} vínculos</td><td><span className={`document-status status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span></td><td><button className="row-more" aria-label={`Abrir ${item.name}`} onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>···</button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="documents-empty"><div className="documents-empty-icon">▤</div><strong>{records.length ? "Nenhum documento encontrado" : "Sua biblioteca começa aqui"}</strong><p>{records.length ? "Ajuste os filtros ou a busca." : "Adicione um arquivo para organizar documentos e relacioná-los aos registros."}</p>{!records.length && <button className="primary-button" onClick={startCreate}>＋ Adicionar documento</button>}</div>}</div>
      <div className="table-footer"><span>Exibindo <strong>{visible.length}</strong> de {records.length} documentos do PostgreSQL</span><span>Limite por arquivo: 20 MB</span></div>
    </section>
    {formOpen && <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="client-dialog document-dialog" role="dialog" aria-modal="true" aria-labelledby="document-form-title"><div className="client-dialog-head"><div><div className="eyebrow">ARMAZENAMENTO DO SERVIDOR</div><h2 id="document-form-title">{editing ? "Editar documento" : "Adicionar documento"}</h2><p>O arquivo será enviado ao armazenamento persistente do servidor.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={(event) => void submit(event)}><div className="document-form-scroll">
      {!editing && <label className="document-file-picker">Arquivo *<input type="file" required={!importingLegacy} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(event) => { const chosen = event.target.files?.[0] ?? null; setFile(chosen); if (chosen && !form.name.trim()) setForm((current) => ({ ...current, name: chosen.name })); }}/><small>{file ? `${file.name} · ${formatSize(file.size)}` : "PDF, imagens e documentos · até 20 MB"}</small></label>}
      <div className="document-form-grid"><label>Nome do documento *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label>Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as DocumentCategory })}>{documentCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DocumentInput["status"] })}>{documentStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><label>Responsável pelo registro *<input required value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })}/></label></div>
      <label>Descrição<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
      <fieldset className="document-links"><legend>Relacionar a registros</legend>
        <label>Clientes<select multiple value={form.links.clientIds} onChange={(event) => patchLinks("clientIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Empreendimentos<select multiple value={form.links.enterpriseIds} onChange={(event) => patchLinks("enterpriseIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{enterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Processos<select multiple value={form.links.processIds} onChange={(event) => patchLinks("processIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Tarefas<select multiple value={form.links.taskIds} onChange={(event) => patchLinks("taskIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Ocorrências de condicionantes<select multiple value={form.links.occurrences.map((item) => `${item.obligationId}|${item.occurrenceId}`)} onChange={(event) => patchLinks("occurrences", Array.from(event.target.selectedOptions, (option) => { const [obligationId, occurrenceId] = option.value.split("|"); return { obligationId, occurrenceId }; }))}>{obligations.flatMap((obligation) => obligation.occurrences.map((occurrence) => <option key={occurrence.id} value={`${obligation.id}|${occurrence.id}`}>{obligation.title} · {occurrence.referencePeriod}</option>))}</select></label>
      </fieldset>{importingLegacy && legacyIssues.length > 0 && <section className="document-legacy-review" aria-label="Vínculos legados sem correspondência"><strong>Relacione os registros antigos</strong><p>Alguns IDs locais não são UUIDs do banco atual. Associe cada um pelo nome para preservar os vínculos na importação.</p>{legacyIssues.map((issue) => <label key={`${issue.kind}:${issue.oldValue}`}>{issue.kind === "clientIds" ? "Cliente" : issue.kind === "enterpriseIds" ? "Empreendimento" : issue.kind === "processIds" ? "Processo" : issue.kind === "taskIds" ? "Tarefa" : "Ocorrência"}<small>{issue.label}</small><select required defaultValue="" onChange={(event) => mapLegacyIssue(issue, event.target.value)}><option value="">Selecione o registro atual…</option>{issue.kind === "clientIds" && clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{issue.kind === "enterpriseIds" && enterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{issue.kind === "processIds" && processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{issue.kind === "taskIds" && tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}{issue.kind === "occurrences" && obligations.flatMap((obligation) => obligation.occurrences.map((occurrence) => <option key={occurrence.id} value={`${obligation.id}|${occurrence.id}`}>{obligation.title} · {occurrence.referencePeriod}</option>))}</select></label>)}</section>}{error && <p className="document-error" role="alert">{error}</p>}</div><div className="client-form-actions"><button type="button" className="secondary-button" onClick={() => { setFormOpen(false); setImportingLegacy(null); setLegacyIssues([]); }}>Cancelar</button><button type="submit" className="primary-button" disabled={busy || legacyIssues.length > 0}>{busy ? "Salvando…" : importingLegacy ? "Importar arquivo e metadados" : editing ? "Salvar alterações" : "Adicionar documento"}</button></div></form></section></div>}
    {selected && <div className="client-overlay document-detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="client-drawer document-drawer" role="dialog" aria-modal="true" aria-labelledby="document-detail-title"><div className="client-drawer-head"><div><div className="eyebrow">DETALHES DO DOCUMENTO</div><h2 id="document-detail-title">{selected.name}</h2></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes">×</button></div><div className="document-detail-scroll"><div className="document-detail-actions"><span className={`document-status status-${selected.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.status}</span><button className="secondary-button" onClick={() => startEdit(selected)}>Editar</button><button className="secondary-button" onClick={() => download(selected)}>Baixar arquivo</button><button className="document-delete" disabled={busy} onClick={() => void remove(selected)}>Remover</button></div>{error && <p className="document-error" role="alert">{error}</p>}<section className="document-preview">{previewBusy ? <span>Carregando pré-visualização…</span> : previewUrl && selected.mimeType === "application/pdf" ? <iframe title={`Pré-visualização de ${selected.name}`} src={previewUrl}/> : previewUrl ? <img src={previewUrl} alt={`Pré-visualização de ${selected.name}`}/> : <div><span className="file-type large">{selected.extension}</span><strong>{selected.originalName}</strong><small>Pré-visualização indisponível para este tipo de arquivo.</small><button className="secondary-button" onClick={() => void download(selected)}>Baixar para visualizar</button></div>}</section><section className="document-info"><h3>Informações</h3><dl><div><dt>Categoria</dt><dd>{selected.category}</dd></div><div><dt>Arquivo</dt><dd>{selected.originalName}</dd></div><div><dt>Tipo MIME</dt><dd>{selected.mimeType}</dd></div><div><dt>Tamanho</dt><dd>{formatSize(selected.size)}</dd></div><div><dt>Incluído em</dt><dd>{formatDate(selected.addedAt)}</dd></div><div><dt>Responsável</dt><dd>{selected.responsible}</dd></div><div><dt>Descrição</dt><dd>{selected.description || "Sem descrição"}</dd></div></dl></section><section className="document-info"><h3>Relacionamentos</h3><ul className="document-link-list">{selected.links.clientIds.map((id) => <li key={id}>Cliente <span>{clientName(id)}</span></li>)}{selected.links.enterpriseIds.map((id) => <li key={id}>Empreendimento <span>{enterpriseName(id)}</span></li>)}{selected.links.processIds.map((id) => <li key={id}>Processo <span>{processName(id)}</span></li>)}{selected.links.taskIds.map((id) => <li key={id}>Tarefa <span>{taskName(id)}</span></li>)}{selected.links.occurrences.map((item) => <li key={item.occurrenceId}>Ocorrência <span>{occurrenceName(item.obligationId, item.occurrenceId)}</span></li>)}{!selected.links.clientIds.length && !selected.links.enterpriseIds.length && !selected.links.processIds.length && !selected.links.taskIds.length && !selected.links.occurrences.length && <li>Sem registros relacionados</li>}</ul></section><section className="document-info"><h3>Histórico</h3><ul className="document-history">{[...selected.history].reverse().map((entry) => <li key={entry.id}><i/><div><strong>{entry.message}</strong><small>{formatDate(entry.date)} · {entry.actor}</small></div></li>)}</ul></section></div></aside></div>}
  </div>;
}
