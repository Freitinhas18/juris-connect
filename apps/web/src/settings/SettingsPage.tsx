import { useCallback, useEffect, useState } from "react";
import { addOrganizationMember, getOrganizationAuditEvents, getOrganizationMembers, getSessions, removeOrganizationMember, revokeSession, updateOrganizationMemberRole, type AuthOrganization, type AuthSession, type OrganizationAuditEvent, type OrganizationMember } from "../auth/authApi";
import "./settings.css";

type ApiStatus = "loading" | "online" | "offline";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export default function SettingsPage({ userId, role }: { userId: string; role: AuthOrganization["role"] }) {
  const canManageMembers = role === "owner" || role === "admin";
  const [apiStatus, setApiStatus] = useState<ApiStatus>("loading");
  const [checkedAt, setCheckedAt] = useState("");
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [membersNotice, setMembersNotice] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("member");
  const [memberBusy, setMemberBusy] = useState("");
  const [auditEvents, setAuditEvents] = useState<OrganizationAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");

  const checkApi = useCallback(async () => {
    setApiStatus("loading");
    try {
      const response = await fetch(`${API_BASE}/health/db`, { cache: "no-store", credentials: "include" });
      if (!response.ok) throw new Error("API indisponível");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("db" in result) || result.db !== "ok") throw new Error("Banco indisponível");
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    } finally {
      setCheckedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try { setSessions(await getSessions()); }
    catch (error) { setSessionsError(error instanceof Error ? error.message : "Não foi possível carregar as sessões da conta."); }
    finally { setSessionsLoading(false); }
  }, []);

  const loadMembers = useCallback(async () => {
    if (!canManageMembers) { setMembersLoading(false); return; }
    setMembersLoading(true);
    setMembersError("");
    try { setMembers(await getOrganizationMembers()); }
    catch (error) { setMembersError(error instanceof Error ? error.message : "Não foi possível carregar os membros da organização."); }
    finally { setMembersLoading(false); }
  }, [canManageMembers]);

  const loadAuditEvents = useCallback(async () => {
    if (!canManageMembers) { setAuditLoading(false); return; }
    setAuditLoading(true); setAuditError("");
    try { setAuditEvents(await getOrganizationAuditEvents()); }
    catch (error) { setAuditError(error instanceof Error ? error.message : "Não foi possível carregar a auditoria da organização."); }
    finally { setAuditLoading(false); }
  }, [canManageMembers]);

  useEffect(() => { void checkApi(); }, [checkApi]);
  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);
  useEffect(() => { void loadAuditEvents(); }, [loadAuditEvents]);

  async function handleRevoke(session: AuthSession) {
    setRevokingId(session.id);
    setSessionsError("");
    setSessionNotice("");
    try {
      await revokeSession(session.id);
      setSessionNotice("Sessão encerrada. O dispositivo precisará entrar novamente.");
      await loadSessions();
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Não foi possível encerrar a sessão.");
    } finally { setRevokingId(""); }
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberBusy("add"); setMembersError(""); setMembersNotice("");
    try {
      await addOrganizationMember(memberEmail, memberRole);
      setMemberEmail("");
      setMembersNotice("Membro adicionado. Nenhum convite por e-mail foi enviado.");
      await Promise.all([loadMembers(), loadAuditEvents()]);
    } catch (error) { setMembersError(error instanceof Error ? error.message : "Não foi possível adicionar o membro."); }
    finally { setMemberBusy(""); }
  }

  async function handleRoleChange(member: OrganizationMember, nextRole: AuthOrganization["role"]) {
    setMemberBusy(member.id); setMembersError(""); setMembersNotice("");
    try {
      await updateOrganizationMemberRole(member.id, nextRole);
      setMembersNotice(`Papel de ${member.name} atualizado.`);
      await Promise.all([loadMembers(), loadAuditEvents()]);
    } catch (error) { setMembersError(error instanceof Error ? error.message : "Não foi possível atualizar o papel."); }
    finally { setMemberBusy(""); }
  }

  async function handleRemoveMember(member: OrganizationMember) {
    if (!window.confirm(`Remover ${member.name} desta organização? As sessões desta organização serão encerradas.`)) return;
    setMemberBusy(member.id); setMembersError(""); setMembersNotice("");
    try {
      await removeOrganizationMember(member.id);
      setMembersNotice(`${member.name} removido. As sessões da organização foram encerradas.`);
      await Promise.all([loadMembers(), loadAuditEvents()]);
    } catch (error) { setMembersError(error instanceof Error ? error.message : "Não foi possível remover o membro."); }
    finally { setMemberBusy(""); }
  }

  const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <div className="page-content settings-page">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / ADMINISTRAÇÃO</div><h1>Configurações</h1><p>Status das integrações e disponibilidade dos ajustes do workspace.</p></div></div>
    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Serviços conectados</h2><p>Leitura de saúde dos serviços já disponíveis no backend.</p></div><button className="secondary-button" type="button" onClick={() => void checkApi()} disabled={apiStatus === "loading"}>{apiStatus === "loading" ? "Verificando…" : "Verificar novamente"}</button></div>
      <article className="settings-status-card"><span className={`settings-status-dot ${apiStatus}`} aria-hidden="true"/><div><strong>API e PostgreSQL</strong><p>{apiStatus === "loading" ? "Verificando a saúde da API e do banco…" : apiStatus === "online" ? "API respondeu e confirmou acesso ao banco de dados." : "Sem resposta saudável da API ou do banco. Confira se os serviços estão ativos."}</p>{checkedAt && <small>Última verificação: {checkedAt}</small>}</div><span className={`settings-status-label ${apiStatus}`}>{apiStatus === "loading" ? "Verificando" : apiStatus === "online" ? "Disponível" : "Indisponível"}</span></article>
    </section>
    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Sessões da conta</h2><p>Consulte acessos ativos e encerre sessões em outros dispositivos.</p></div><button className="secondary-button" type="button" onClick={() => void loadSessions()} disabled={sessionsLoading}>{sessionsLoading ? "Atualizando…" : "Atualizar lista"}</button></div>
      {sessionsError && <div className="settings-session-message error" role="alert">{sessionsError}</div>}
      {sessionNotice && <div className="settings-session-message success" role="status">{sessionNotice}</div>}
      {sessionsLoading && sessions.length === 0 ? <div className="settings-session-empty" role="status">Carregando sessões…</div> : sessions.length === 0 ? <div className="settings-session-empty">Nenhuma sessão ativa encontrada.</div> : <div className="settings-session-list">{sessions.map((session) => <article className="settings-session-row" key={session.id}>
        <div className="settings-session-device"><span className={`settings-status-dot ${session.isCurrent ? "online" : ""}`} aria-hidden="true"/><div><strong>{session.isCurrent ? "Este dispositivo" : "Outro dispositivo"}</strong><p>{session.isCurrent ? "Sessão atual" : `Último registro: ${dateTime(session.lastSeenAt)}`}</p><small>Criada em {dateTime(session.createdAt)} · expira em {dateTime(session.expiresAt)}</small></div></div>
        {session.isCurrent ? <span className="settings-current-session">Atual</span> : <button className="secondary-button danger-button" type="button" onClick={() => void handleRevoke(session)} disabled={Boolean(revokingId)}>{revokingId === session.id ? "Encerrando…" : "Encerrar sessão"}</button>}
      </article>)}</div>}
      <p className="settings-session-footnote">O último registro não acompanha cada requisição. IP, navegador e localização não são coletados. O logout encerra a sessão deste dispositivo.</p>
    </section>
    <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Membros da organização</h2><p>{canManageMembers ? "Gerencie o acesso de contas já verificadas nesta organização." : "A gestão de membros está disponível para owner e admin."}</p></div>{canManageMembers && <button className="secondary-button" type="button" onClick={() => void loadMembers()} disabled={membersLoading}>{membersLoading ? "Atualizando…" : "Atualizar lista"}</button>}</div>
      {canManageMembers ? <>
        {membersError && <div className="settings-session-message error" role="alert">{membersError}</div>}
        {membersNotice && <div className="settings-session-message success" role="status">{membersNotice}</div>}
        <form className="settings-member-form" onSubmit={(event) => void handleAddMember(event)}>
          <label className="settings-member-email">E-mail de conta verificada<input type="email" required maxLength={160} autoComplete="off" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="pessoa@escritorio.com.br" /></label>
          <label className="settings-member-role">Papel inicial<select value={memberRole} onChange={(event) => setMemberRole(event.target.value as "admin" | "member")}><option value="member">Membro</option><option value="admin">Administrador</option></select></label>
          <button className="primary-button" type="submit" disabled={memberBusy === "add" || !memberEmail.trim()}>{memberBusy === "add" ? "Adicionando…" : "Adicionar conta"}</button>
        </form>
        <p className="settings-member-note">A conta precisa existir e ter o e-mail confirmado. Esta ação não envia convite nem cria conta.</p>
        {membersLoading && members.length === 0 ? <div className="settings-session-empty" role="status">Carregando membros…</div> : members.length === 0 ? <div className="settings-session-empty">Nenhum membro encontrado.</div> : <div className="settings-member-list">{members.map((member) => <article className="settings-member-row" key={member.id}>
          <div className="settings-session-device"><span className={`settings-status-dot ${member.role === "owner" ? "online" : ""}`} aria-hidden="true"/><div><strong>{member.name}{member.userId === userId ? " · Você" : ""}</strong><p>{member.email}</p><small>Associado em {dateTime(member.createdAt)}</small></div></div>
          <div className="settings-member-actions"><label><span className="sr-only">Papel de {member.name}</span><select aria-label={`Papel de ${member.name}`} value={member.role} disabled={memberBusy === member.id || role !== "owner" && member.role === "owner"} onChange={(event) => void handleRoleChange(member, event.target.value as AuthOrganization["role"])}><option value="owner">Owner</option><option value="admin">Administrador</option><option value="member">Membro</option></select></label><button className="secondary-button danger-button" type="button" onClick={() => void handleRemoveMember(member)} disabled={Boolean(memberBusy) || member.userId === userId || role !== "owner" && member.role === "owner"}>{memberBusy === member.id ? "Salvando…" : "Remover"}</button></div>
        </article>)}</div>}
      </> : <div className="settings-session-empty">Somente administradores autorizados podem consultar ou alterar a lista de membros.</div>}
    </section>
    {canManageMembers && <section className="settings-section">
      <div className="settings-section-heading"><div><h2>Auditoria de acesso</h2><p>Alterações de membros e papéis registradas nesta organização.</p></div><button className="secondary-button" type="button" onClick={() => void loadAuditEvents()} disabled={auditLoading}>{auditLoading ? "Atualizando…" : "Atualizar auditoria"}</button></div>
      {auditError && <div className="settings-session-message error" role="alert">{auditError}</div>}
      {auditLoading && auditEvents.length === 0 ? <div className="settings-session-empty" role="status">Carregando eventos…</div> : auditEvents.length === 0 ? <div className="settings-session-empty">Ainda não há alterações de acesso registradas.</div> : <div className="settings-audit-list">{auditEvents.map((event) => <article className="settings-audit-row" key={event.id}>
        <div><strong>{event.action === "member.added" ? "Membro adicionado" : event.action === "member.role_changed" ? "Papel alterado" : event.action === "member.removed" ? "Membro removido" : "Acesso atualizado"}</strong><p>{event.actorName} → {event.targetName ?? "Conta removida"}</p><small>{event.action === "member.role_changed" ? `${String(event.metadata.previousRole)} → ${String(event.metadata.newRole)}` : event.action === "member.removed" ? `${String(event.metadata.revokedSessionCount ?? 0)} sessões encerradas` : `Papel: ${String(event.metadata.role ?? "—")}`}</small></div>
        <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
      </article>)}</div>}
      <p className="settings-session-footnote">Últimos 50 eventos. Esta trilha registra alterações de membros; não é um registro imutável contra operadores com acesso direto ao banco.</p>
    </section>}
    <section className="settings-section settings-unavailable">
      <div className="settings-section-heading"><div><h2>Ajustes do workspace</h2><p>Esses controles ainda não possuem suporte funcional no sistema.</p></div></div>
      <div className="settings-unavailable-content"><strong>Disponível em uma etapa futura</strong><p>Preferências de perfil, equipe, notificações e identidade visual não são editáveis nesta versão. Nenhuma configuração será salva ou simulada por esta tela.</p></div>
    </section>
    <p className="settings-footnote">Esta tela não altera configurações do backend, do banco ou do navegador.</p>
  </div>;
}
