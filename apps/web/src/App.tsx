import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigation, type ModuleKey } from "./demoData";
const ClientsPage = lazy(() => import("./clients/ClientsPage"));
const EnterprisesPage = lazy(() => import("./enterprises/EnterprisesPage"));
const ProcessesPage = lazy(() => import("./processes/ProcessesPage"));
const TasksPage = lazy(() => import("./tasks/TasksPage"));
const ObligationsPage = lazy(() => import("./obligations/ObligationsPage"));
const DocumentsPage = lazy(() => import("./documents/DocumentsPage"));
const CommunicationPage = lazy(() => import("./communication/CommunicationPage"));
const SettingsPage = lazy(() => import("./settings/SettingsPage"));
import { loadDashboardData, type DashboardData } from "./dashboard/dashboardApi";
import AuthPage from "./auth/AuthPage";
import { changeActiveOrganization, getCurrentProfile, getOrganizations, signOut, type AuthOrganization, type AuthProfile } from "./auth/authApi";
import "./styles.css";
import "./redesign.css";

type IconName = (typeof navigation)[number]["icon"] | "search" | "chevron" | "plus" | "arrow" | "more" | "bell" | "clock" | "spark" | "menu" | "calendar";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    users: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35"/></>,
    building: <><path d="M4 21V5.5L13 3v18M13 9h7v12M2 21h20"/><path d="M7 8h2m-2 4h2m-2 4h2m8-1h1m-1 4h1"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"/></>,
    check: <><path d="M9 11 12 14 21 5"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h8"/></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.3a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1A1.7 1.7 0 1 1 7.6 3.3l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.3a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, chevron: <path d="m9 18 6-6-6-6"/>, plus: <path d="M12 5v14m-7-7h14"/>, arrow: <><path d="M7 17 17 7M7 7h10v10"/></>, more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Zm7 12 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>, menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const pageTitles: Record<ModuleKey, string> = { dashboard: "Dashboard", clients: "Clientes", developments: "Empreendimentos", cases: "Processos", tasks: "Tarefas", conditions: "Condicionantes", documents: "Documentos", communication: "Comunicação", settings: "Configurações" };

function App() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dashboardSearchRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [organizations, setOrganizations] = useState<AuthOrganization[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const refreshProfile = useCallback(async () => {
    setAuthError("");
    const current = await getCurrentProfile();
    setProfile(current);
    if (current) {
      const memberships = await getOrganizations();
      setOrganizations(memberships);
    } else setOrganizations([]);
  }, []);

  useEffect(() => {
    void refreshProfile().catch((reason: unknown) => setAuthError(reason instanceof Error ? reason.message : "Não foi possível validar sua sessão.")).finally(() => setAuthLoading(false));
  }, [refreshProfile]);

  useEffect(() => {
    const focusDashboardSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setActive("dashboard");
      requestAnimationFrame(() => dashboardSearchRef.current?.focus());
    };
    window.addEventListener("keydown", focusDashboardSearch);
    return () => window.removeEventListener("keydown", focusDashboardSearch);
  }, []);

  async function logout() {
    try { await signOut(); } finally { setProfile(null); setOrganizations([]); }
  }

  async function selectOrganization(organizationId: string) {
    try {
      await changeActiveOrganization(organizationId);
      await refreshProfile();
      setActive("dashboard");
    } catch (reason) { setAuthError(reason instanceof Error ? reason.message : "Não foi possível trocar de organização."); }
  }

  if (authLoading) return <main className="auth-loading" role="status">Validando sessão…</main>;
  if (!profile) return <AuthPage onAuthenticated={refreshProfile}/>;

  const initials = profile.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "JC";
  const roleLabel = profile.role === "owner" ? "Proprietário" : profile.role === "admin" ? "Administrador" : "Membro";

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Barra lateral">
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span><span></span></div><span>juris<span className="brand-light">connect</span></span></div>
      {organizations.length > 1 ? <label className="workspace-card workspace-select"><div className="workspace-avatar">{profile.organization.name[0]?.toUpperCase() ?? "O"}</div><span><strong>Organização ativa</strong><select aria-label="Organização ativa" value={profile.organization.id} onChange={(event) => void selectOrganization(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></span></label> : <div className="workspace-card" aria-label={`Organização ${profile.organization.name}`}><div className="workspace-avatar">{profile.organization.name[0]?.toUpperCase() ?? "O"}</div><span><strong>{profile.organization.name}</strong><small>{roleLabel}</small></span></div>}
      <div className="nav-label">ESPAÇO DE TRABALHO</div>
      <nav className="main-nav" id="workspace-nav" aria-label="Navegação principal">{navigation.map((item) => <button type="button" key={item.key} className={`nav-item ${active === item.key ? "active" : ""}`} aria-current={active === item.key ? "page" : undefined} onClick={() => { setActive(item.key); setSidebarOpen(false); }}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Icon name="spark" size={17}/></div><strong>Precisa de ajuda?</strong><p>A central de suporte ainda não está disponível nesta versão.</p><span className="help-unavailable">Em desenvolvimento</span></div><button className="user-profile authenticated-profile" type="button" onClick={() => void logout()} aria-label={`Sair da conta ${profile.user.name}`}><div className="avatar user-avatar">{initials}</div><span><strong>{profile.user.name}</strong><small>{roleLabel} · Sair</small></span></button></div>
    </aside>
    <main className="main-area" id="main-content" tabIndex={-1}>
      <header className="topbar"><div className="mobile-brand"><button type="button" className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={sidebarOpen} aria-controls="workspace-nav"><Icon name="menu"/></button><div className="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div><div className="breadcrumbs" aria-label="Localização"><span>{profile.organization.name}</span><Icon name="chevron" size={14}/><strong>{pageTitles[active]}</strong></div><div className="topbar-actions">{active === "dashboard" && <label className="search-box"><Icon name="search" size={17}/><input ref={dashboardSearchRef} aria-label="Filtrar processos no painel" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar processos..."/><kbd aria-hidden="true">Ctrl/⌘ K</kbd></label>}<button type="button" className="icon-button notification" aria-label="Notificações indisponíveis nesta versão" title="Notificações em desenvolvimento" disabled><Icon name="bell"/></button><div className="avatar top-avatar" aria-label={`Perfil de ${profile.user.name}`} title={profile.user.name}>{initials}</div></div></header>
      {authError && <div className="auth-inline-error" role="alert">{authError}</div>}
      <Suspense fallback={<section className="module-loading" role="status" aria-live="polite"><span className="loading-indicator" aria-hidden="true"/>Carregando {pageTitles[active].toLocaleLowerCase("pt-BR")}…</section>}>
        {active === "dashboard" ? <Dashboard query={query} setActive={setActive}/> : active === "clients" ? <ClientsPage/> : active === "developments" ? <EnterprisesPage onOpenClients={() => setActive("clients")}/> : active === "cases" ? <ProcessesPage onOpenEnterprises={() => setActive("developments")}/> : active === "tasks" ? <TasksPage onOpenProcesses={() => setActive("cases")}/> : active === "conditions" ? <ObligationsPage onOpenProcesses={() => setActive("cases")}/> : active === "documents" ? <DocumentsPage/> : active === "communication" ? <CommunicationPage userId={profile.user.id}/> : <SettingsPage key={profile.organization.id} userId={profile.user.id} role={profile.role}/>}
      </Suspense>
    </main>
    {sidebarOpen && <button className="scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}/>}
  </div>;
}

function Dashboard({ query, setActive }: { query: string; setActive: (key: ModuleKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    setLoading(true); setError("");
    void loadDashboardData().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados do painel.")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toLocaleUpperCase("pt-BR");
  const clientById = useMemo(() => new Map((data?.clients ?? []).map((client) => [client.id, client])), [data]);
  const enterpriseById = useMemo(() => new Map((data?.enterprises ?? []).map((enterprise) => [enterprise.id, enterprise])), [data]);
  const cases = useMemo(() => (data?.processes ?? []).filter((item) => `${item.protocol} ${item.name} ${item.entity}`.toLowerCase().includes(query.trim().toLowerCase())).map((item) => {
    const enterprise = enterpriseById.get(item.enterpriseId); const client = enterprise ? clientById.get(enterprise.clientId) : undefined;
    return { ...item, clientName: client?.name ?? "Cliente indisponível", area: item.processType, deadline: item.dueDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${item.dueDate}T12:00:00`)) : "Sem prazo", color: "lavender" };
  }).slice(0, 5), [data, enterpriseById, clientById, query]);
  const dashboardMetrics = useMemo(() => {
    if (!data) return [];
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const monthAhead = new Date(todayDate); monthAhead.setDate(monthAhead.getDate() + 30);
    const nearDue = data.obligations.flatMap((obligation) => obligation.occurrences).filter((occurrence) => {
      const due = new Date(`${occurrence.dueDate}T00:00:00`);
      return occurrence.status !== "Cumprida" && occurrence.status !== "Dispensada" && due >= todayDate && due <= monthAhead;
    }).length;
    const activeProcesses = data.processes.filter((item) => !["Concluído", "Suspenso", "Cancelado"].includes(item.status)).length;
    const openTasks = data.tasks.filter((item) => !["Concluída", "Cancelada"].includes(item.status)).length;
    return [
      { label: "Total de clientes", value: data.clients.length, note: "cadastros na API", icon: "users", tone: "violet" },
      { label: "Empreendimentos cadastrados", value: data.enterprises.length, note: "registros na API", icon: "building", tone: "blue" },
      { label: "Processos ativos", value: activeProcesses, note: "não concluídos ou suspensos", icon: "briefcase", tone: "green" },
      { label: "Tarefas pendentes", value: openTasks, note: "em aberto", icon: "check", tone: "blue" },
      { label: "Condicionantes próximas do vencimento", value: nearDue, note: "vencimento nos próximos 30 dias", icon: "calendar", tone: "amber" },
      { label: "Documentos cadastrados", value: data.documents.length, note: "arquivos na API", icon: "file", tone: "violet" },
    ];
  }, [data]);
  const upcoming = useMemo(() => {
    if (!data) return [];
    const entries: Array<{ date: string; title: string; detail: string }> = [];
    for (const item of data.processes) if (item.dueDate && !["Concluído", "Cancelado"].includes(item.status)) entries.push({ date: item.dueDate, title: item.name, detail: `Processo · ${enterpriseById.get(item.enterpriseId)?.name ?? "Empreendimento"}` });
    for (const item of data.tasks) if (item.dueDate && !["Concluída", "Cancelada"].includes(item.status)) entries.push({ date: item.dueDate, title: item.title, detail: "Tarefa" });
    for (const item of data.obligations) for (const occurrence of item.occurrences) if (occurrence.status !== "Cumprida" && occurrence.status !== "Dispensada") entries.push({ date: occurrence.dueDate, title: item.title, detail: `Condicionante · ${occurrence.referencePeriod}` });
    const todayIso = new Date().toISOString().slice(0, 10); const limit = new Date(); limit.setDate(limit.getDate() + 30); const limitIso = limit.toISOString().slice(0, 10);
    return entries.filter((item) => item.date >= todayIso && item.date <= limitIso).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [data, enterpriseById]);
  const activities = useMemo(() => {
    if (!data) return [];
    return [
      ...data.processes.flatMap((process) => process.history.map((item) => ({ id: `process-${process.id}-${item.id}`, date: item.date, text: `${item.message} · ${process.name}` }))),
      ...data.tasks.flatMap((task) => task.history.map((item) => ({ id: `task-${task.id}-${item.id}`, date: item.date, text: `${item.message} · ${task.title}` }))),
      ...data.obligations.flatMap((obligation) => obligation.history.map((item) => ({ id: `obligation-${obligation.id}-${item.id}`, date: item.date, text: `${item.message} · ${obligation.title}` }))),
      ...data.documents.flatMap((document) => document.history.map((item) => ({ id: `document-${document.id}-${item.id}`, date: item.date, text: `${item.message} · ${document.name}` }))),
    ].filter((item) => Number.isFinite(Date.parse(item.date))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [data]);
  const formatRelative = (date: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
    return minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.floor(minutes / 60)} h` : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(date));
  };
  const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
  return <div className="page-content"><div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> {today}</div><h1>Visão geral</h1><p>Resumo dos registros conectados ao Juris Connect.</p></div><button className="primary-button" onClick={() => setActive("cases")}><Icon name="plus" size={17}/> Novo processo</button></div>
    <div className="demo-notice"><span className="demo-dot"/> Dados do backend <span>·</span> Indicadores derivados das listas da API; sem registros demonstrativos fixos nesta tela.</div>
    {error && <div className="dashboard-error" role="alert"><strong>Não foi possível atualizar o painel</strong><span>{error}</span><button type="button" onClick={refresh}>Tentar novamente</button></div>}
    <section className="metric-grid" aria-label="Indicadores reais">{loading && !data ? Array.from({ length: 6 }, (_, index) => <article className="metric-card metric-loading" key={index} aria-label="Carregando indicador"><span/></article>) : dashboardMetrics.map((metric) => <article className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><div className={`metric-icon ${metric.tone}`}><Icon name={metric.icon as IconName} size={17}/></div></div><div className="metric-value">{metric.value}</div><div className="metric-foot"><span>{metric.note}</span></div></article>)}</section>
    {data && dashboardMetrics.every((item) => item.value === 0) && <div className="dashboard-empty">Nenhum registro cadastrado ainda. Os indicadores serão preenchidos conforme os módulos forem utilizados.</div>}
    <div className="dashboard-grid"><section className="panel cases-panel"><div className="panel-heading"><div><h2>Processos em destaque</h2><p>Processos reais cadastrados no backend.</p></div><button className="text-button" onClick={() => setActive("cases")}>Ver todos <Icon name="chevron" size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>PROCESSO</th><th>CLIENTE</th><th>ÁREA</th><th>PRAZO</th><th>STATUS</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td><div className="case-name">{item.name}<small>{item.protocol || "Sem protocolo"}</small></div></td><td>{item.clientName}</td><td><span className="area-pill">{item.area}</span></td><td><span className="deadline">{item.deadline}</span></td><td><span className="priority">{item.status}</span></td></tr>)}</tbody></table>{loading && !data ? <div className="empty-state">Carregando processos…</div> : !error && cases.length === 0 ? <div className="empty-state">{query ? "Nenhum processo corresponde à pesquisa." : "Nenhum processo cadastrado."}</div> : null}</div><div className="table-footer"><span>{data ? `${cases.length} processo(s) exibido(s)` : "Dados carregados da API"}</span><button onClick={() => setActive("cases")}>Abrir processos <Icon name="arrow" size={14}/></button></div></section>
      <section className="panel deadlines-panel"><div className="panel-heading"><div><h2>Próximos prazos</h2><p>Registros em aberto com vencimento em até 30 dias.</p></div></div><div className="upcoming-list">{upcoming.map((item) => <div className="upcoming-item" key={`${item.date}-${item.title}`}><div className="date-tile violet"><strong>{formatDate(item.date).split(" ")[0]}</strong><small>{formatDate(item.date).split(" ")[1]?.toUpperCase()}</small></div><div className="upcoming-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><span className="deadline">{formatDate(item.date)}</span></div>)}{data && !loading && upcoming.length === 0 && <div className="empty-state">Nenhum prazo próximo cadastrado.</div>}</div><button className="calendar-link" onClick={() => setActive("tasks")}><Icon name="calendar" size={16}/> Abrir tarefas <Icon name="arrow" size={14}/></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Eventos registrados nos históricos dos módulos.</p></div></div><div className="activity-list">{activities.map((activity) => <div className="activity-item" key={activity.id}><div className="avatar activity-avatar lavender">JC</div><div className="activity-copy"><p>{activity.text}</p><span><Icon name="clock" size={13}/>{formatRelative(activity.date)}</span></div></div>)}{data && !loading && activities.length === 0 && <div className="empty-state">Ainda não há atividades registradas.</div>}</div></section>
      <section className="focus-card"><div className="focus-orb orb-one"/><div className="focus-orb orb-two"/><div className="focus-content"><span className="focus-kicker"><Icon name="spark" size={14}/> JURIS CONNECT</span><h2>Uma operação jurídica<br/>mais clara e organizada.</h2><p>Resumo atualizado a partir dos registros existentes.</p><button onClick={() => setActive("cases")}>Explorar processos <Icon name="arrow" size={14}/></button></div><div className="focus-art"><div className="art-window"><div className="art-bar"><i/><i/><i/></div><div className="art-lines"><span/><span/><span/><span/></div><div className="art-card"><span className="art-check">✓</span><div><b>Visão consolidada</b><small>Dados da API</small></div></div></div></div></section></div>
    <footer className="page-footer"><span>© {new Date().getFullYear()} Juris Connect</span><span>Fonte: API e PostgreSQL</span></footer>
  </div>;
}

export default App;
