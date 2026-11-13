import { useEffect, useMemo, useState } from "react";
import { getClients } from "../clients/clientRepository";
import { getEnterprises } from "../enterprises/enterpriseRepository";
import { getProcesses } from "../processes/processRepository";
import { getTasks } from "../tasks/taskRepository";
import { getObligations } from "../obligations/obligationRepository";
import { createDocument, deleteDocument, getDocuments, updateDocument } from "./documentRepository";
import { MAX_DOCUMENT_SIZE, readDocumentFile, removeDocumentFile, storeDocumentFile } from "./documentStorage";
import { documentCategories, documentStatuses, type DocumentCategory, type DocumentInput, type DocumentLinks, type DocumentRecord } from "./documentTypes";
import "./documents.css";

const emptyLinks = (): DocumentLinks => ({ clientIds: [], enterpriseIds: [], processIds: [], taskIds: [], occurrences: [] });
const blankInput = (): DocumentInput => ({ name: "", description: "", category: "Outros", responsible: "Lucas Martins", status: "Pendente", links: emptyLinks() });
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(date));

export default function DocumentsPage() {
  const [records, setRecords] = useState(getDocuments);
  const [clients] = useState(getClients);
  const [enterprises] = useState(getEnterprises);
  const [processes] = useState(getProcesses);
  const [tasks] = useState(getTasks);
  const [obligations] = useState(getObligations);
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
    void readDocumentFile(selected.id).then((blob) => { if (active && blob) setPreviewUrl(URL.createObjectURL(blob)); }).catch(() => { if (active) setError("Não foi possível ler o arquivo do IndexedDB."); }).finally(() => { if (active) setPreviewBusy(false); });
    return () => { active = false; };
  }, [selected?.id, records]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function startCreate() { setEditing(null); setFormOpen(true); setForm(blankInput()); setFile(null); setError(""); }
  function startEdit(record: DocumentRecord) { setEditing(record); setFormOpen(true); setForm({ name: record.name, description: record.description, category: record.category, responsible: record.responsible, status: record.status, links: { ...record.links } }); setFile(null); setError(""); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!editing && !file) { setError("Selecione um arquivo para continuar."); return; }
    if (file && file.size > MAX_DOCUMENT_SIZE) { setError("O arquivo excede o limite demonstrativo de 20 MB."); return; }
    try {
      if (editing) { setRecords(updateDocument(editing.id, form, records)); setSelectedId(editing.id); }
      else if (file) { const id = crypto.randomUUID(); await storeDocumentFile(id, file); const created = createDocument(form, file, records, id); setRecords(created); setSelectedId(id); }
      setEditing(null); setFormOpen(false); setFile(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o arquivo localmente."); }
  }
  async function remove(record: DocumentRecord) { if (!window.confirm(`Remover “${record.name}” e o arquivo local associado?`)) return; try { await removeDocumentFile(record.id); setRecords(deleteDocument(record.id, records)); setSelectedId(null); } catch { setError("Não foi possível remover o arquivo local associado."); } }
  async function download(record: DocumentRecord) { try { const blob = await readDocumentFile(record.id); if (!blob) { setError("Arquivo não encontrado no IndexedDB deste navegador."); return; } const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = record.originalName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { setError("Não foi possível acessar o arquivo local."); } }
  function patchLinks<K extends keyof DocumentLinks>(key: K, values: DocumentLinks[K]) { setForm((current) => ({ ...current, links: { ...current.links, [key]: values } })); }
  const clientName = (id: string) => clients.find((item) => item.id === id)?.name ?? "Cliente removido";
  const enterpriseName = (id: string) => enterprises.find((item) => item.id === id)?.name ?? "Empreendimento removido";
  const processName = (id: string) => processes.find((item) => item.id === id)?.name ?? "Processo removido";
  const taskName = (id: string) => tasks.find((item) => item.id === id)?.title ?? "Tarefa removida";
  const occurrenceName = (obligationId: string, occurrenceId: string) => { const obligation = obligations.find((item) => item.id === obligationId); const occurrence = obligation?.occurrences.find((item) => item.id === occurrenceId); return `${obligation?.title ?? "Condicionante removida"} · ${occurrence?.referencePeriod ?? "ocorrência removida"}`; };

  return <div className="page-content documents-page">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / BIBLIOTECA</div><h1>Documentos</h1><p>Centralize arquivos demonstrativos e encontre-os pelos registros relacionados.</p></div><button className="primary-button" onClick={startCreate}>＋ Novo documento</button></div>
    <div className="demo-notice"><span className="demo-dot"/> Armazenamento demonstrativo local · metadados no navegador e arquivos no IndexedDB deste dispositivo.</div>
    <section className="documents-stats" aria-label="Indicadores de documentos"><article><span>Total</span><strong>{records.length}</strong></article>{documentStatuses.map((status) => <article key={status}><span>{status}</span><strong>{counts[status]}</strong></article>)}</section>
    <section className="panel documents-library"><div className="documents-toolbar"><label className="document-search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou descrição"/></label><select aria-label="Categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>Todas</option>{documentCategories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Tipo de arquivo" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>Todos</option>{[...new Set(records.map((item) => item.extension))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="Todos">Todos os clientes</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Empreendimento" value={enterpriseFilter} onChange={(event) => setEnterpriseFilter(event.target.value)}><option value="Todos">Todos os empreendimentos</option>{enterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Processo" value={processFilter} onChange={(event) => setProcessFilter(event.target.value)}><option value="Todos">Todos os processos</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option>{documentStatuses.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>DOCUMENTO</th><th>CATEGORIA</th><th>TIPO / TAMANHO</th><th>INCLUSÃO</th><th>RESPONSÁVEL</th><th>RELACIONAMENTOS</th><th>STATUS</th><th/></tr></thead><tbody>{visible.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className="document-row"><td><strong>{item.name}</strong><small>{item.description || "Sem descrição"}</small></td><td>{item.category}</td><td><span className="file-type">{item.extension}</span> {formatSize(item.size)}</td><td>{formatDate(item.addedAt)}</td><td>{item.responsible}</td><td>{item.links.clientIds.length + item.links.enterpriseIds.length + item.links.processIds.length + item.links.taskIds.length + item.links.occurrences.length} vínculos</td><td><span className={`document-status status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span></td><td><button className="row-more" aria-label={`Abrir ${item.name}`} onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>···</button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="documents-empty"><div className="documents-empty-icon">▤</div><strong>{records.length ? "Nenhum documento encontrado" : "Sua biblioteca começa aqui"}</strong><p>{records.length ? "Ajuste os filtros ou a busca." : "Adicione um arquivo para organizar documentos demonstrativos e relacioná-los aos registros."}</p>{!records.length && <button className="primary-button" onClick={startCreate}>＋ Adicionar documento</button>}</div>}</div>
      <div className="table-footer"><span>Exibindo <strong>{visible.length}</strong> de {records.length} documentos demonstrativos</span><span>Limite por arquivo: 20 MB</span></div>
    </section>
    {formOpen && <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section className="client-dialog document-dialog" role="dialog" aria-modal="true" aria-labelledby="document-form-title"><div className="client-dialog-head"><div><div className="eyebrow">BIBLIOTECA LOCAL</div><h2 id="document-form-title">{editing ? "Editar documento" : "Adicionar documento"}</h2><p>O arquivo ficará armazenado somente neste navegador.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={(event) => void submit(event)}><div className="document-form-scroll">
      {!editing && <label className="document-file-picker">Arquivo *<input type="file" required accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(event) => { const chosen = event.target.files?.[0] ?? null; setFile(chosen); if (chosen && !form.name.trim()) setForm((current) => ({ ...current, name: chosen.name })); }}/><small>{file ? `${file.name} · ${formatSize(file.size)}` : "PDF, imagens e documentos · até 20 MB"}</small></label>}
      <div className="document-form-grid"><label>Nome do documento *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label>Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as DocumentCategory })}>{documentCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DocumentInput["status"] })}>{documentStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><label>Responsável pelo registro *<input required value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })}/></label></div>
      <label>Descrição<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
      <fieldset className="document-links"><legend>Relacionar a registros</legend>
        <label>Clientes<select multiple value={form.links.clientIds} onChange={(event) => patchLinks("clientIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Empreendimentos<select multiple value={form.links.enterpriseIds} onChange={(event) => patchLinks("enterpriseIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{enterprises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Processos<select multiple value={form.links.processIds} onChange={(event) => patchLinks("processIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Tarefas<select multiple value={form.links.taskIds} onChange={(event) => patchLinks("taskIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{tasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Ocorrências de condicionantes<select multiple value={form.links.occurrences.map((item) => `${item.obligationId}|${item.occurrenceId}`)} onChange={(event) => patchLinks("occurrences", Array.from(event.target.selectedOptions, (option) => { const [obligationId, occurrenceId] = option.value.split("|"); return { obligationId, occurrenceId }; }))}>{obligations.flatMap((obligation) => obligation.occurrences.map((occurrence) => <option key={occurrence.id} value={`${obligation.id}|${occurrence.id}`}>{obligation.title} · {occurrence.referencePeriod}</option>))}</select></label>
      </fieldset>{error && <p className="document-error" role="alert">{error}</p>}</div><div className="client-form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="primary-button">{editing ? "Salvar alterações" : "Adicionar documento"}</button></div></form></section></div>}
    {selected && <div className="client-overlay document-detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="client-drawer document-drawer" role="dialog" aria-modal="true" aria-labelledby="document-detail-title"><div className="client-drawer-head"><div><div className="eyebrow">DETALHES DO DOCUMENTO</div><h2 id="document-detail-title">{selected.name}</h2></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes">×</button></div><div className="document-detail-scroll"><div className="document-detail-actions"><span className={`document-status status-${selected.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.status}</span><button className="secondary-button" onClick={() => startEdit(selected)}>Editar</button><button className="secondary-button" onClick={() => void download(selected)}>Baixar arquivo</button><button className="document-delete" onClick={() => void remove(selected)}>Remover</button></div>{error && <p className="document-error" role="alert">{error}</p>}<section className="document-preview">{previewBusy ? <span>Carregando pré-visualização…</span> : previewUrl && selected.mimeType === "application/pdf" ? <iframe title={`Pré-visualização de ${selected.name}`} src={previewUrl}/> : previewUrl ? <img src={previewUrl} alt={`Pré-visualização de ${selected.name}`}/> : <div><span className="file-type large">{selected.extension}</span><strong>{selected.originalName}</strong><small>Pré-visualização indisponível para este tipo de arquivo.</small><button className="secondary-button" onClick={() => void download(selected)}>Baixar para visualizar</button></div>}</section><section className="document-info"><h3>Informações</h3><dl><div><dt>Categoria</dt><dd>{selected.category}</dd></div><div><dt>Arquivo</dt><dd>{selected.originalName}</dd></div><div><dt>Tipo MIME</dt><dd>{selected.mimeType}</dd></div><div><dt>Tamanho</dt><dd>{formatSize(selected.size)}</dd></div><div><dt>Incluído em</dt><dd>{formatDate(selected.addedAt)}</dd></div><div><dt>Responsável</dt><dd>{selected.responsible}</dd></div><div><dt>Descrição</dt><dd>{selected.description || "Sem descrição"}</dd></div></dl></section><section className="document-info"><h3>Relacionamentos</h3><ul className="document-link-list">{selected.links.clientIds.map((id) => <li key={id}>Cliente <span>{clientName(id)}</span></li>)}{selected.links.enterpriseIds.map((id) => <li key={id}>Empreendimento <span>{enterpriseName(id)}</span></li>)}{selected.links.processIds.map((id) => <li key={id}>Processo <span>{processName(id)}</span></li>)}{selected.links.taskIds.map((id) => <li key={id}>Tarefa <span>{taskName(id)}</span></li>)}{selected.links.occurrences.map((item) => <li key={item.occurrenceId}>Ocorrência <span>{occurrenceName(item.obligationId, item.occurrenceId)}</span></li>)}{!selected.links.clientIds.length && !selected.links.enterpriseIds.length && !selected.links.processIds.length && !selected.links.taskIds.length && !selected.links.occurrences.length && <li>Sem registros relacionados</li>}</ul></section><section className="document-info"><h3>Histórico</h3><ul className="document-history">{[...selected.history].reverse().map((entry) => <li key={entry.id}><i/><div><strong>{entry.message}</strong><small>{formatDate(entry.date)} · {entry.actor}</small></div></li>)}</ul></section></div></aside></div>}
  </div>;
}
