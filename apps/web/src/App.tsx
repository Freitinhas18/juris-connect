import { useMemo, useState } from "react";
import { demoActivities, demoCases, demoMetrics, demoUpcoming, navigation, type ModuleKey } from "./demoData";
import ClientsPage from "./clients/ClientsPage";
import EnterprisesPage from "./enterprises/EnterprisesPage";
import ProcessesPage from "./processes/ProcessesPage";
import TasksPage from "./tasks/TasksPage";
import ObligationsPage from "./obligations/ObligationsPage";
import DocumentsPage from "./documents/DocumentsPage";
import "./styles.css";

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
  const filteredCases = useMemo(() => demoCases.filter((item) => `${item.number} ${item.subject} ${item.client}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span><span></span></div><span>juris<span className="brand-light">connect</span></span><button className="workspace-switch" aria-label="Selecionar espaço"><Icon name="chevron" size={15}/></button></div>
      <button className="workspace-card"><div className="workspace-avatar">V</div><span><strong>Vértice Legal</strong><small>Plano profissional</small></span><Icon name="chevron" size={15}/></button>
      <div className="nav-label">ESPAÇO DE TRABALHO</div>
      <nav className="main-nav" aria-label="Navegação principal">{navigation.map((item) => <button key={item.key} className={`nav-item ${active === item.key ? "active" : ""}`} onClick={() => { setActive(item.key); setSidebarOpen(false); }}><Icon name={item.icon}/><span>{item.label}</span>{"badge" in item && <small className="nav-badge">{item.badge}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Icon name="spark" size={17}/></div><strong>Precisa de ajuda?</strong><p>Acesse nossa central de suporte e encontre respostas.</p><button>Visitar central <Icon name="arrow" size={14}/></button></div><button className="user-profile"><div className="avatar user-avatar">LM</div><span><strong>Lucas Martins</strong><small>Administrador</small></span><Icon name="more" size={18}/></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Abrir menu"><Icon name="menu"/></button><div className="brand-mark"><span></span><span></span><span></span><span></span></div></div><div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14}/><strong>{pageTitles[active]}</strong></div><div className="topbar-actions"><label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar processos, clientes..."/><kbd>⌘ K</kbd></label><button className="icon-button notification" aria-label="Notificações"><Icon name="bell"/><i/></button><div className="avatar top-avatar">LM</div></div></header>
      {active === "dashboard" ? <Dashboard cases={filteredCases} setActive={setActive}/> : active === "clients" ? <ClientsPage/> : active === "developments" ? <EnterprisesPage onOpenClients={() => setActive("clients")}/> : active === "cases" ? <ProcessesPage onOpenEnterprises={() => setActive("developments")}/> : active === "tasks" ? <TasksPage onOpenProcesses={() => setActive("cases")}/> : active === "conditions" ? <ObligationsPage onOpenProcesses={() => setActive("cases")}/> : active === "documents" ? <DocumentsPage/> : <ModulePlaceholder title={pageTitles[active]} module={active}/>}
    </main>
    {sidebarOpen && <button className="scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}/>}
  </div>;
}

function Dashboard({ cases, setActive }: { cases: typeof demoCases[number][]; setActive: (key: ModuleKey) => void }) {
  return <div className="page-content"><div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> QUARTA-FEIRA, 12 DE NOVEMBRO DE 2026</div><h1>Bom dia, Lucas <span className="wave">✦</span></h1><p>Aqui está o resumo da sua operação jurídica.</p></div><button className="primary-button" onClick={() => setActive("cases")}><Icon name="plus" size={17}/> Novo processo</button></div>
    <div className="demo-notice"><span className="demo-dot"/> Painel de demonstração <span>·</span> Os dados exibidos são ilustrativos e não representam registros persistidos.</div>
    <section className="metric-grid" aria-label="Indicadores demonstrativos">{demoMetrics.map((metric) => <article className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><div className={`metric-icon ${metric.tone}`}><Icon name={metric.icon} size={17}/></div></div><div className="metric-value">{metric.value}</div><div className="metric-foot"><span className={`metric-change ${metric.tone}`}>{metric.change}</span><span>{metric.note}</span></div><div className={`metric-spark ${metric.tone}`}><svg viewBox="0 0 110 30" preserveAspectRatio="none"><path d="M0 23 C12 21 14 14 26 18 S43 24 52 13 S67 18 77 9 S94 12 110 3"/></svg></div></article>)}</section>
    <div className="dashboard-grid"><section className="panel cases-panel"><div className="panel-heading"><div><h2>Processos em destaque</h2><p>Acompanhe os casos que precisam de atenção.</p></div><button className="text-button" onClick={() => setActive("cases")}>Ver todos <Icon name="chevron" size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>PROCESSO</th><th>CLIENTE</th><th>ÁREA</th><th>PRÓXIMO PRAZO</th><th>PRIORIDADE</th><th/></tr></thead><tbody>{cases.map((item) => <tr key={item.number}><td><div className="case-name">{item.subject}<small>{item.number}</small></div></td><td><div className="client-cell"><span className={`client-avatar ${item.color}`}>{item.initials}</span>{item.client}</div></td><td><span className="area-pill">{item.area}</span></td><td><span className={item.priority === "Urgente" ? "deadline urgent" : "deadline"}>{item.priority === "Urgente" && <i/>}{item.deadline}</span></td><td><span className={`priority priority-${item.priority.toLowerCase()}`}><i/>{item.priority}</span></td><td><button className="row-more" aria-label="Mais opções"><Icon name="more" size={17}/></button></td></tr>)}</tbody></table>{cases.length === 0 && <div className="empty-state">Nenhum resultado para “{""}”.</div>}</div><div className="table-footer"><span>Exibindo <strong>{cases.length}</strong> itens demonstrativos</span><button onClick={() => setActive("cases")}>Abrir gestão de processos <Icon name="arrow" size={14}/></button></div></section>
      <section className="panel deadlines-panel"><div className="panel-heading"><div><h2>Próximos prazos</h2><p>Fique à frente dos compromissos.</p></div><button className="icon-button subtle" aria-label="Mais opções"><Icon name="more"/></button></div><div className="upcoming-list">{demoUpcoming.map((item) => <div className="upcoming-item" key={item.title}><div className={`date-tile ${item.tone}`}><strong>{item.day}</strong><small>{item.month}</small></div><div className="upcoming-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><Icon name="chevron" size={16}/></div>)}</div><button className="calendar-link" onClick={() => setActive("tasks")}><Icon name="calendar" size={16}/> Ver agenda completa <Icon name="arrow" size={14}/></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>O que está acontecendo no workspace.</p></div><button className="text-button">Ver atividades <Icon name="chevron" size={15}/></button></div><div className="activity-list">{demoActivities.map((activity, index) => <div className="activity-item" key={activity.name}><div className={`avatar activity-avatar ${activity.color}`}>{activity.initials}</div><div className="activity-copy"><p><strong>{activity.name}</strong> {activity.action} <b>{activity.target}</b></p><span><Icon name="clock" size={13}/>{activity.time}</span></div>{index < demoActivities.length - 1 && <i className="activity-line"/>}</div>)}</div></section>
      <section className="focus-card"><div className="focus-orb orb-one"/><div className="focus-orb orb-two"/><div className="focus-content"><span className="focus-kicker"><Icon name="spark" size={14}/> VISÃO GERAL</span><h2>Uma operação jurídica<br/>mais clara e organizada.</h2><p>Centralize processos, prazos e equipes em um só lugar.</p><button onClick={() => setActive("cases")}>Explorar processos <Icon name="arrow" size={14}/></button></div><div className="focus-art"><div className="art-window"><div className="art-bar"><i/><i/><i/></div><div className="art-lines"><span/><span/><span/><span/></div><div className="art-card"><span className="art-check">✓</span><div><b>Prazo acompanhado</b><small>Atualizado agora</small></div></div></div></div></section></div>
    <footer className="page-footer"><span>© 2026 Juris Connect</span><span>Ambiente demonstrativo <i/> Todos os dados são fictícios</span></footer>
  </div>;
}

function ModulePlaceholder({ title, module }: { title: string; module: ModuleKey }) {
  const navItem = navigation.find((item) => item.key === module);
  return <div className="page-content module-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE / {title.toUpperCase()}</div><h1>{title}</h1><p>Organize e acompanhe {title.toLowerCase()} em um só lugar.</p></div><button className="primary-button"><Icon name="plus" size={17}/> Novo {module === "clients" ? "cliente" : module === "cases" ? "processo" : title.toLowerCase()}</button></div><div className="demo-notice"><span className="demo-dot"/> Módulo demonstrativo <span>·</span> Estrutura inicial para validação visual.</div><section className="module-welcome"><div className="module-icon"><Icon name={navItem?.icon ?? "grid"} size={24}/></div><h2>Seu espaço de {title.toLowerCase()}</h2><p>Esta área está pronta para receber os fluxos de {title.toLowerCase()}. Os dados e ações serão conectados às fontes apropriadas nas próximas etapas.</p><div className="module-placeholder-row"><span><i/> Visão organizada</span><span><i/> Acompanhamento centralizado</span><span><i/> Atualizações em um só lugar</span></div></section></div>;
}

export default App;
