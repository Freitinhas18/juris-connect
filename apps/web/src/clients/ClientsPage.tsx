import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient, getClients, toggleClientStatus, updateClient } from "./clientRepository";
import type { ClientInput, ClientKind, ClientRecord, ClientStatus } from "./clientTypes";
import "./clients.css";

type FilterStatus = "all" | ClientStatus;
type SortOrder = "name-asc" | "name-desc" | "newest" | "ventures";
type DialogState = { mode: "create" } | { mode: "edit"; client: ClientRecord } | null;

const emptyForm: ClientInput = { name: "", kind: "Empresa", document: "", contactName: "", email: "", phone: "", address: "", notes: "", status: "active" };
const clientKinds: ClientKind[] = ["Empresa", "Pessoa física", "Condomínio", "Órgão público"];

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function BuildingIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5.5L13 3v18M13 9h7v12M2 21h20"/><path d="M7 8h2m-2 4h2m-2 4h2m8-1h1m-1 4h1"/></svg>; }

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>(getClients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sort, setSort] = useState<SortOrder>("name-asc");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const activeCount = clients.filter((client) => client.status === "active").length;
  const inactiveCount = clients.length - activeCount;
  const filteredClients = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return clients.filter((client) => {
      const matchesSearch = !needle || client.name.toLocaleLowerCase("pt-BR").includes(needle);
      const matchesStatus = statusFilter === "all" || client.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name, "pt-BR");
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "ventures") return b.ventures.length - a.ventures.length || a.name.localeCompare(b.name, "pt-BR");
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [clients, search, sort, statusFilter]);

  function commitCreate(input: ClientInput) {
    setClients((current) => createClient(input, current));
    setDialog(null);
  }

  function commitEdit(input: ClientInput) {
    if (dialog?.mode !== "edit") return;
    const id = dialog.client.id;
    setClients((current) => updateClient(id, input, current));
    setSelected((current) => current?.id === id ? { ...current, ...input } : current);
    setDialog(null);
  }

  function changeStatus(client: ClientRecord) {
    setClients((current) => toggleClientStatus(client.id, current));
    setSelected((current) => current?.id === client.id ? { ...current, status: current.status === "active" ? "inactive" : "active" } : current);
  }

  return <div className="page-content clients-page">
    <div className="page-heading clients-heading"><div><div className="eyebrow"><span className="live-dot"/> RELACIONAMENTO JURÍDICO</div><h1>Clientes</h1><p>Gerencie os cadastros e acompanhe os vínculos da sua carteira.</p></div><button className="primary-button" onClick={() => setDialog({ mode: "create" })}><PlusIcon/> Novo cliente</button></div>
    <div className="demo-notice"><span className="demo-dot"/> Ambiente demonstrativo <span>·</span> Os dados e alterações desta área ficam apenas neste navegador.</div>

    <section className="client-stat-grid" aria-label="Resumo da carteira demonstrativa">
      <article className="client-stat-card"><span className="client-stat-icon violet"><BuildingIcon/></span><div><small>Total de clientes</small><strong>{clients.length}</strong><span>cadastros demonstrativos</span></div></article>
      <article className="client-stat-card"><span className="client-stat-icon green"><i/></span><div><small>Clientes ativos</small><strong>{activeCount}</strong><span>relacionamentos ativos</span></div></article>
      <article className="client-stat-card"><span className="client-stat-icon muted"><i/></span><div><small>Clientes inativos</small><strong>{inactiveCount}</strong><span>cadastros desativados</span></div></article>
    </section>

    <section className="panel client-list-panel">
      <div className="client-list-heading"><div><h2>Carteira de clientes</h2><p>Consulte contatos e vínculos com empreendimentos.</p></div><span className="client-count-pill">{filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}</span></div>
      <div className="client-toolbar"><label className="client-search"><SearchIcon/><input aria-label="Pesquisar cliente por nome ou empresa" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou empresa..."/>{search && <button type="button" aria-label="Limpar pesquisa" onClick={() => setSearch("")}><CloseIcon/></button>}</label><label className="client-select-label"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label><label className="client-select-label sort-select"><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}><option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option><option value="newest">Mais recentes</option><option value="ventures">Empreendimentos</option></select></label></div>
      <div className="client-table-scroll"><table className="client-table"><thead><tr><th>CLIENTE</th><th>TIPO</th><th>CONTATO PRINCIPAL</th><th>E-MAIL</th><th>TELEFONE</th><th>EMPREENDIMENTOS</th><th>STATUS</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filteredClients.map((client) => <tr key={client.id}>
        <td><button className="client-name-button" onClick={() => setSelected(client)}><span className="client-company-avatar">{client.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><span><strong>{client.name}</strong><small>{client.document || "Documento não informado"}</small></span></button></td>
        <td><span className="client-kind">{client.kind}</span></td><td className="client-contact">{client.contactName}</td><td><a className="client-email" href={`mailto:${client.email}`}>{client.email}</a></td><td className="client-phone">{client.phone}</td><td><span className="venture-count">{client.ventures.length}</span></td><td><span className={`client-status status-${client.status}`}><i/>{client.status === "active" ? "Ativo" : "Inativo"}</span></td>
        <td><div className="client-row-actions"><button onClick={() => setSelected(client)} aria-label={`Ver detalhes de ${client.name}`}>Detalhes</button><button onClick={() => setDialog({ mode: "edit", client })} aria-label={`Editar ${client.name}`}>Editar</button><button onClick={() => changeStatus(client)} aria-label={`${client.status === "active" ? "Desativar" : "Ativar"} ${client.name}`}>{client.status === "active" ? "Desativar" : "Ativar"}</button></div></td>
      </tr>)}</tbody></table>{filteredClients.length === 0 && <div className="client-empty"><span><SearchIcon/></span><strong>Nenhum cliente encontrado</strong><p>Ajuste a pesquisa ou os filtros para ver outros cadastros.</p><button onClick={() => { setSearch(""); setStatusFilter("all"); }}>Limpar filtros</button></div>}</div>
      <div className="client-list-footer"><span>Exibindo <strong>{filteredClients.length}</strong> de <strong>{clients.length}</strong> clientes demonstrativos</span><span>As alterações são armazenadas localmente</span></div>
    </section>

    {dialog && <ClientFormDialog mode={dialog.mode} initial={dialog.mode === "edit" ? dialog.client : null} onClose={() => setDialog(null)} onSubmit={dialog.mode === "create" ? commitCreate : commitEdit}/>}
    {selected && <ClientDetails client={clients.find((client) => client.id === selected.id) ?? selected} onClose={() => setSelected(null)} onEdit={() => setDialog({ mode: "edit", client: clients.find((client) => client.id === selected.id) ?? selected })} onToggleStatus={() => changeStatus(clients.find((client) => client.id === selected.id) ?? selected)}/>}
  </div>;
}

function ClientFormDialog({ mode, initial, onClose, onSubmit }: { mode: "create" | "edit"; initial: ClientRecord | null; onClose: () => void; onSubmit: (input: ClientInput) => void }) {
  const [form, setForm] = useState<ClientInput>(initial ? { name: initial.name, kind: initial.kind, document: initial.document, contactName: initial.contactName, email: initial.email, phone: initial.phone, address: initial.address, notes: initial.notes, status: initial.status } : emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.contactName.trim() || !form.email.trim() || !form.phone.trim()) { setError("Preencha nome, contato, e-mail e telefone."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Informe um e-mail válido."); return; }
    if (form.phone.replace(/\D/g, "").length < 10) { setError("Informe um telefone com DDD."); return; }
    const documentDigits = form.document.replace(/\D/g, "");
    if (documentDigits && documentDigits.length !== 11 && documentDigits.length !== 14) { setError("CPF ou CNPJ deve conter 11 ou 14 dígitos."); return; }
    onSubmit({ ...form, name: form.name.trim(), document: form.document.trim(), contactName: form.contactName.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim(), notes: form.notes.trim() });
  }

  function update<K extends keyof ClientInput>(key: K, value: ClientInput[K]) { setForm((current) => ({ ...current, [key]: value })); setError(""); }

  return <div className="client-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="client-dialog" role="dialog" aria-modal="true" aria-labelledby="client-form-title"><header className="client-dialog-header"><div><span className="dialog-eyebrow">CARTEIRA DE CLIENTES</span><h2 id="client-form-title">{mode === "create" ? "Novo cliente" : "Editar cliente"}</h2><p>Os dados deste formulário são demonstrativos e ficam neste navegador.</p></div><button type="button" className="client-close" onClick={onClose} aria-label="Fechar formulário"><CloseIcon/></button></header>
    <form onSubmit={submit} noValidate><div className="client-form-body"><div className="client-form-grid"><label className="field-wide">Nome ou razão social <b>*</b><input autoFocus required maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Empresa ou pessoa cliente"/></label><label>Tipo de cliente <b>*</b><select value={form.kind} onChange={(event) => update("kind", event.target.value as ClientKind)}>{clientKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label>CPF/CNPJ <span>(opcional)</span><input maxLength={24} value={form.document} onChange={(event) => update("document", event.target.value)} placeholder="Documento demonstrativo"/></label><label>Contato principal <b>*</b><input required maxLength={100} value={form.contactName} onChange={(event) => update("contactName", event.target.value)} placeholder="Nome do contato"/></label><label>E-mail <b>*</b><input required type="email" maxLength={160} value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="contato@exemplo.com"/></label><label>Telefone <b>*</b><input required type="tel" maxLength={24} value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="(00) 00000-0000"/></label><label className="field-wide">Endereço <input maxLength={200} value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Rua, número, cidade e estado"/></label><label className="field-wide">Observações <textarea rows={3} maxLength={800} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Anotações internas sobre o relacionamento"/></label>{mode === "edit" && <label className="client-form-status"><input type="checkbox" checked={form.status === "active"} onChange={(event) => update("status", event.target.checked ? "active" : "inactive")}/> Cliente ativo</label>}</div>{error && <p className="client-form-error" role="alert">{error}</p>}<p className="client-form-hint"><b>*</b> Campos obrigatórios</p></div><footer className="client-dialog-footer"><button type="button" className="client-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">{mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}</button></footer></form></section></div>;
}

function ClientDetails({ client, onClose, onEdit, onToggleStatus }: { client: ClientRecord; onClose: () => void; onEdit: () => void; onToggleStatus: () => void }) {
  useEffect(() => { function handleKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey); }, [onClose]);
  return <div className="client-overlay client-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="client-drawer" role="dialog" aria-modal="true" aria-labelledby="client-details-title"><header className="client-drawer-header"><button className="client-close" onClick={onClose} aria-label="Fechar detalhes"><CloseIcon/></button><span className="dialog-eyebrow">DETALHES DO CLIENTE</span><div className="client-drawer-identity"><span className="client-company-avatar large">{client.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><div><h2 id="client-details-title">{client.name}</h2><span className={`client-status status-${client.status}`}><i/>{client.status === "active" ? "Ativo" : "Inativo"}</span></div></div><div className="client-drawer-actions"><button className="client-cancel" onClick={onToggleStatus}>{client.status === "active" ? "Desativar cliente" : "Ativar cliente"}</button><button className="primary-button" onClick={onEdit}>Editar cadastro</button></div></header>
    <div className="client-drawer-content"><section className="client-detail-section"><h3>Informações cadastrais</h3><DetailRow label="Tipo de cliente" value={client.kind}/><DetailRow label="CPF/CNPJ" value={client.document || "Não informado"}/><DetailRow label="Cadastro demonstrativo" value={new Date(`${client.createdAt}T12:00:00`).toLocaleDateString("pt-BR")}/></section><section className="client-detail-section"><h3>Contato principal</h3><DetailRow label="Nome" value={client.contactName}/><DetailRow label="E-mail" value={client.email}/><DetailRow label="Telefone" value={client.phone}/></section><section className="client-detail-section"><h3>Endereço</h3><p className="client-detail-text">{client.address || "Endereço não informado."}</p></section><section className="client-detail-section"><h3>Observações</h3><p className="client-detail-text">{client.notes || "Nenhuma observação cadastrada."}</p></section><section className="client-detail-section"><div className="detail-section-title"><h3>Empreendimentos vinculados</h3><span>{client.ventures.length}</span></div>{client.ventures.length ? <ul className="venture-list">{client.ventures.map((venture) => <li key={venture}><span className="venture-icon"><BuildingIcon/></span>{venture}</li>)}</ul> : <p className="client-detail-text">Nenhum empreendimento demonstrativo vinculado.</p>}</section>{client.relatedCases !== undefined && <section className="client-detail-section"><div className="detail-section-title"><h3>Processos relacionados</h3><span>{client.relatedCases}</span></div><p className="client-detail-text">Quantidade informativa dos dados demonstrativos; sem consulta a processos persistidos.</p></section>}<div className="client-detail-demo-note"><span className="demo-dot"/> Registro demonstrativo armazenado localmente neste navegador.</div></div></aside></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) { return <div className="client-detail-row"><span>{label}</span><strong>{value}</strong></div>; }
