import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@juris-connect/shared";
import { createChannel, fetchChannels, fetchMessages } from "./communicationApi";
import { closeCommunicationSocket, connectCommunicationSocket, joinChannel, listenForMessages, sendMessage } from "./communicationSocket";
import type { ChatChannel } from "./communicationTypes";
import "./communication.css";

const PAGE_SIZE = 50;
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const group of groups) for (const message of group) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
function timeLabel(value: string): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }

export default function CommunicationPage({ userId }: { userId: string }) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelPrivate, setChannelPrivate] = useState(false);
  const [channelCreateError, setChannelCreateError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [socketError, setSocketError] = useState("");
  const [joinState, setJoinState] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [joinError, setJoinError] = useState("");
  const [newMessageCount, setNewMessageCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeChannelIdRef = useRef("");
  const shouldScrollRef = useRef(true);
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const filteredChannels = useMemo(() => channels.filter((channel) => channel.name.toLowerCase().includes(channelSearch.toLowerCase())), [channels, channelSearch]);

  activeChannelIdRef.current = activeChannelId;
  const insertMessage = useCallback((message: ChatMessage) => {
    if (message.channelId !== activeChannelIdRef.current) return;
    setMessages((current) => mergeMessages(current, [message]));
    if (!shouldScrollRef.current) setNewMessageCount((count) => count + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    setChannelsLoading(true);
    fetchChannels().then((items) => { if (alive) { setChannels(items); setChannelsError(""); setActiveChannelId((current) => current && items.some((channel) => channel.id === current) ? current : items[0]?.id ?? ""); } }).catch((error: unknown) => { if (alive) setChannelsError(error instanceof Error ? error.message : "Falha ao carregar canais."); }).finally(() => { if (alive) setChannelsLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setConnection("connecting");
    const socket = connectCommunicationSocket();
    const onConnect = () => { setConnection("connected"); setSocketError(""); };
    const onDisconnect = (reason: string) => { setConnection("disconnected"); if (reason !== "io client disconnect") setSocketError("Conexão interrompida. Tentando reconectar…"); };
    const onConnectError = (error: Error) => { setConnection("error"); setSocketError(error.message || "Falha ao conectar ao serviço de comunicação."); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    const offMessages = listenForMessages(socket, insertMessage);
    if (socket.connected) onConnect();
    return () => { offMessages(); socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect_error", onConnectError); closeCommunicationSocket(socket); };
  }, [insertMessage]);

  useEffect(() => {
    if (!activeChannelId) { setMessages([]); setHasOlder(false); return; }
    let alive = true;
    setMessages([]); setMessagesError(""); setMessagesLoading(true); setHasOlder(false); setNewMessageCount(0); setJoinState("idle"); setJoinError("");
    fetchMessages(activeChannelId, { limit: PAGE_SIZE }).then((items) => { if (alive) { setMessages((current) => mergeMessages(items, current)); setHasOlder(items.length === PAGE_SIZE); } }).catch((error: unknown) => { if (alive) setMessagesError(error instanceof Error ? error.message : "Falha ao carregar histórico."); }).finally(() => { if (alive) setMessagesLoading(false); });
    return () => { alive = false; };
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    const socket = connectCommunicationSocket();
    let alive = true;
    const join = () => { setJoinState("joining"); setJoinError(""); void joinChannel(socket, activeChannelId).then(() => { if (alive) setJoinState("joined"); }).catch((error: unknown) => { if (alive) { setJoinState("error"); setJoinError(error instanceof Error ? error.message : "Não foi possível entrar no canal."); } }); };
    socket.on("connect", join);
    if (socket.connected) join();
    return () => { alive = false; socket.off("connect", join); };
  }, [activeChannelId]);

  useEffect(() => {
    if (shouldScrollRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function submitChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = channelName.trim();
    if (!name) { setChannelCreateError("Informe um nome para o canal."); return; }
    if (name.length > 80) { setChannelCreateError("O nome deve ter no máximo 80 caracteres."); return; }
    try { const channel = await createChannel({ name, isPrivate: channelPrivate }); setChannels((current) => [...current.filter((item) => item.id !== channel.id), channel].sort((a, b) => a.name.localeCompare(b.name))); setActiveChannelId(channel.id); setCreatingChannel(false); setChannelName(""); setChannelPrivate(false); setChannelCreateError(""); }
    catch (error) { setChannelCreateError(error instanceof Error ? error.message : "Não foi possível criar o canal."); }
  }

  async function loadOlder() {
    if (!activeChannelId || !messages.length || loadingOlder) return;
    const before = messages[0]?.createdAt;
    if (!before) return;
    setLoadingOlder(true); setMessagesError("");
    try { const older = await fetchMessages(activeChannelId, { before, limit: PAGE_SIZE }); shouldScrollRef.current = false; setMessages((current) => mergeMessages(older, current)); setHasOlder(older.length === PAGE_SIZE); }
    catch (error) { setMessagesError(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores."); }
    finally { setLoadingOlder(false); }
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!activeChannelId || !content || sending) return;
    if (content.length > 4000) { setSendError("A mensagem pode ter no máximo 4.000 caracteres."); return; }
    if (connection !== "connected" || joinState !== "joined") { setSendError(joinError || "Conecte-se e entre no canal antes de enviar."); return; }
    const socket = connectCommunicationSocket();
    setSending(true); setSendError("");
    try { await sendMessage(socket, activeChannelId, content); setDraft(""); shouldScrollRef.current = true; }
    catch (error) { setSendError(error instanceof Error ? error.message : "Falha ao enviar mensagem."); }
    finally { setSending(false); }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }
  const connectivityLabel = connection === "connected" ? "Conectado" : connection === "connecting" ? "Conectando" : connection === "disconnected" ? "Reconectando" : "Indisponível";
  const connectivityClass = connection === "connected" ? "online" : connection === "connecting" || connection === "disconnected" ? "pending" : "offline";

  return <div className="page-content communication-page">
    <div className="page-heading communication-heading"><div><div className="eyebrow">WORKSPACE / EQUIPE</div><h1>Comunicação</h1><p>Converse nos canais conectados à API do Juris Connect.</p></div><span className="communication-real-badge"><i/> Backend real</span></div>
    <div className="communication-shell">
      <aside className="communication-sidebar"><div className="communication-sidebar-head"><div><h2>Canais</h2><span>{channels.length} canais</span></div><button className="communication-add" aria-label="Criar canal" title="Criar canal" onClick={() => { setCreatingChannel((current) => !current); setChannelCreateError(""); }}>＋</button></div>
        <label className="channel-search"><span aria-hidden="true">⌕</span><input value={channelSearch} onChange={(event) => setChannelSearch(event.target.value)} placeholder="Buscar canal"/></label>
        <div className="connection-indicator"><i className={connectivityClass}/><span>{connectivityLabel}</span>{connection === "connected" && <small>Socket.IO</small>}</div>
        {socketError && <div className="communication-inline-error" role="status">{socketError}</div>}
        {creatingChannel && <form className="channel-create-form" onSubmit={(event) => void submitChannel(event)}><label>Nome do canal<input autoFocus maxLength={80} value={channelName} onChange={(event) => { setChannelName(event.target.value); setChannelCreateError(""); }} placeholder="Ex.: equipe-jurídica"/></label><label className="channel-private-option"><input type="checkbox" checked={channelPrivate} onChange={(event) => setChannelPrivate(event.target.checked)}/> Marcar como privado</label>{channelPrivate && <p>Somente membros adicionados ao canal podem consultar e participar.</p>}{channelCreateError && <span className="communication-inline-error" role="alert">{channelCreateError}</span>}<div><button type="button" className="channel-cancel" onClick={() => setCreatingChannel(false)}>Cancelar</button><button type="submit" className="primary-button">Criar canal</button></div></form>}
        <div className="channel-list" aria-label="Lista de canais">{channelsLoading ? <div className="communication-state compact">Carregando canais…</div> : channelsError ? <div className="communication-state compact"><strong>API indisponível</strong><p>{channelsError}</p><button onClick={() => { setChannelsLoading(true); setChannelsError(""); fetchChannels().then((items) => { setChannels(items); setActiveChannelId(items[0]?.id ?? ""); }).catch((error: unknown) => setChannelsError(error instanceof Error ? error.message : "Falha ao carregar canais.")).finally(() => setChannelsLoading(false)); }}>Tentar novamente</button></div> : filteredChannels.length ? filteredChannels.map((channel) => <button key={channel.id} className={`channel-item ${channel.id === activeChannelId ? "active" : ""}`} onClick={() => { setActiveChannelId(channel.id); shouldScrollRef.current = true; }}><span className="channel-hash">#</span><span className="channel-name">{channel.name}</span>{channel.isPrivate && <span className="channel-private-tag" title="Acesso limitado à organização e aos membros do canal">Privado</span>}</button>) : <div className="communication-state compact">{channels.length ? "Nenhum canal corresponde à busca." : "Ainda não há canais."}</div>}</div>
        <div className="communication-sidebar-note">Identidade validada pela sessão do usuário; o acesso aos canais respeita a organização e, nos canais privados, a associação de membros.</div>
      </aside>
      <section className="conversation-panel" aria-label="Conversa">
        {activeChannel ? <><header className="conversation-header"><div className="conversation-channel-mark">#</div><div><h2>{activeChannel.name}</h2><p>{activeChannel.isPrivate ? "Canal privado · acesso controlado por associação" : "Canal público da organização"}</p></div><div className={`conversation-status ${connectivityClass}`}><i/>{connectivityLabel}</div></header>
          {(joinError || messagesError) && <div className="communication-banner-error" role="alert">{joinError || messagesError}</div>}
          <div className="message-list" ref={scrollRef} onScroll={(event) => { const element = event.currentTarget; shouldScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; if (shouldScrollRef.current) setNewMessageCount(0); }}>
            {newMessageCount > 0 && <button className="new-messages-indicator" onClick={() => { shouldScrollRef.current = true; setNewMessageCount(0); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }}>{newMessageCount} {newMessageCount === 1 ? "nova mensagem" : "novas mensagens"} ↓</button>}
            {hasOlder && <button className="load-older-button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}</button>}
            {messagesLoading && messages.length === 0 ? <div className="communication-state">Carregando mensagens…</div> : messagesError && messages.length === 0 ? <div className="communication-state"><strong>Não foi possível carregar o histórico</strong><p>{messagesError}</p><button onClick={() => { setMessagesError(""); setMessagesLoading(true); fetchMessages(activeChannel.id, { limit: PAGE_SIZE }).then((items) => { setMessages(items); setHasOlder(items.length === PAGE_SIZE); }).catch((error: unknown) => setMessagesError(error instanceof Error ? error.message : "Falha ao carregar histórico.")).finally(() => setMessagesLoading(false)); }}>Tentar novamente</button></div> : messages.length === 0 ? <div className="communication-state"><div className="conversation-empty-icon">☰</div><strong>Nenhuma mensagem neste canal</strong><p>As mensagens enviadas à API aparecerão aqui.</p></div> : messages.map((message) => <article key={message.id} className={`chat-message ${message.authorId === userId ? "own-message" : ""}`}><div className="message-avatar">{message.authorName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"}</div><div className="message-body"><header><strong>{message.authorName}{message.authorId === userId && <small>Você</small>}</strong><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></header><p>{message.content}</p></div></article>)}
          </div>
          <div className="composer-area">{joinState === "joining" && <div className="composer-note">Entrando no canal…</div>}{joinState === "error" && <div className="composer-note error">{joinError}</div>}{connection !== "connected" && <div className="composer-note">{connection === "disconnected" ? "Reconectando ao Socket.IO…" : "Envio indisponível até conectar ao Socket.IO."}</div>}{sendError && <div className="composer-note error" role="alert">{sendError}</div>}<form className="message-composer" onSubmit={(event) => void submitMessage(event)}><textarea value={draft} onChange={(event) => { setDraft(event.target.value); setSendError(""); }} onKeyDown={onComposerKeyDown} maxLength={4000} placeholder={joinState === "joined" ? `Mensagem em #${activeChannel.name}` : "Aguardando entrada no canal…"} disabled={joinState !== "joined" || connection !== "connected"} rows={2} aria-label="Mensagem"/><button className="send-message-button" type="submit" disabled={sending || !draft.trim() || joinState !== "joined" || connection !== "connected"} aria-label="Enviar mensagem">{sending ? "…" : "↑"}</button><div className="composer-hint">Enter para enviar · Shift + Enter para nova linha <span>{draft.length}/4000</span></div></form></div>
        </> : <div className="communication-state conversation-no-channel"><div className="conversation-empty-icon">#</div><strong>{channelsLoading ? "Carregando canais…" : channelsError ? "API indisponível" : "Selecione um canal"}</strong><p>{channelsError || "Escolha um canal na lista ou crie um novo para começar."}</p></div>}
      </section>
    </div>
    <footer className="communication-footer"><span>Mensagens obtidas em tempo real da API Juris Connect</span><span>{activeChannel ? `${messages.length} mensagens carregadas` : "Sem canal selecionado"}</span></footer>
  </div>;
}
