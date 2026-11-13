import { useEffect, useState, type FormEvent } from "react";
import { confirmEmail, confirmPasswordReset, registerAccount, requestPasswordReset, signIn } from "./authApi";
import "./auth.css";

type AuthMode = "login" | "register" | "recover" | "reset" | "verify";
type Props = { onAuthenticated: () => Promise<void> };

function initialMode(): AuthMode {
  if (window.location.pathname === "/verify-email") return "verify";
  if (window.location.pathname === "/reset-password") return "reset";
  return "login";
}

function readActionToken(): string | null { return new URLSearchParams(window.location.hash.slice(1)).get("token"); }

export default function AuthPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [actionTokenReady, setActionTokenReady] = useState(false);

  useEffect(() => {
    setActionToken(readActionToken());
    if (window.location.hash) window.history.replaceState({}, "", window.location.pathname);
    setActionTokenReady(true);
  }, []);

  useEffect(() => {
    if (mode !== "verify" || !actionTokenReady) return;
    const token = actionToken;
    if (!token) { setError("O link de confirmação está incompleto."); return; }
    setBusy(true);
    void confirmEmail(token).then((result) => { setMessage(result.message); setMode("login"); window.history.replaceState({}, "", "/"); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Não foi possível confirmar o e-mail.")).finally(() => setBusy(false));
  }, [mode, actionToken, actionTokenReady]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "login") { await signIn(email, password); await onAuthenticated(); return; }
      if (mode === "register") { const result = await registerAccount({ name, organizationName, email, password }); setMessage(result.message); return; }
      if (mode === "recover") { const result = await requestPasswordReset(email); setMessage(result.message); return; }
      if (mode === "reset") {
        const token = actionToken;
        if (!token) throw new Error("O link de redefinição está incompleto.");
        const result = await confirmPasswordReset(token, password); setMessage(result.message); setMode("login"); window.history.replaceState({}, "", "/"); setPassword(""); return;
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível concluir a solicitação."); }
    finally { setBusy(false); }
  }

  const isLogin = mode === "login";
  const title = mode === "register" ? "Crie seu acesso" : mode === "recover" ? "Recuperar senha" : mode === "reset" ? "Defina uma nova senha" : mode === "verify" ? "Confirmando seu e-mail" : "Acesse seu espaço";

  return <main className="auth-screen">
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="auth-mark"><i/><i/><i/><i/></span><span>juris<b>connect</b></span></div>
      <p className="auth-eyebrow">GESTÃO JURÍDICA OPERACIONAL</p>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-intro">Entre com uma conta confirmada para acessar os dados da sua organização.</p>
      {mode !== "verify" && <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {mode === "register" && <>
          <label>Seu nome<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Nome do escritório<input autoComplete="organization" required minLength={2} maxLength={160} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label>
        </>}
        {mode !== "reset" && <label>E-mail<input type="email" autoComplete="email" required maxLength={160} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {mode !== "recover" && <label>{mode === "reset" ? "Nova senha" : "Senha"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />{mode !== "login" && <small>Use pelo menos 12 caracteres.</small>}</label>}
        {error && <p className="auth-feedback error" role="alert">{error}</p>}
        {message && <p className="auth-feedback success" role="status">{message}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Aguarde…" : isLogin ? "Entrar" : mode === "register" ? "Criar conta" : mode === "recover" ? "Enviar instruções" : "Redefinir senha"}</button>
      </form>}
      {mode === "verify" && <div className="auth-feedback" role="status">{busy ? "Validando o link…" : error || message}</div>}
      <nav className="auth-links" aria-label="Ações da conta">
        {isLogin && <><button type="button" onClick={() => { setMode("recover"); setError(""); setMessage(""); }}>Esqueci minha senha</button><button type="button" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Criar conta</button></>}
        {!isLogin && mode !== "verify" && <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar ao login</button>}
        {mode === "verify" && !busy && <button type="button" onClick={() => { setMode("login"); setError(""); }}>Ir para o login</button>}
      </nav>
      <p className="auth-footnote">Sua sessão é protegida pelo servidor. Cadastros e recuperação dependem do envio de e-mail estar configurado.</p>
    </section>
  </main>;
}
