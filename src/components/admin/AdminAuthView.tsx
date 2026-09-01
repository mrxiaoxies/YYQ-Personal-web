import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import type { LoginInput, RecoverInput, SetupInput } from "../../lib/admin-api.ts";

export type AdminAuthMode = "login" | "setup" | "recover";

export type AdminAuthViewProps = {
  busy: boolean;
  errorMessage: string;
  managementUrl: string;
  mode: AdminAuthMode;
  serviceNotice: string;
  statusMessage: string;
  onLogin(input: LoginInput): Promise<void>;
  onModeChange(mode: AdminAuthMode): void;
  onRecover(input: RecoverInput): Promise<void>;
  onSetup(input: SetupInput): Promise<void>;
};

const MODE_COPY: Record<AdminAuthMode, { eyebrow: string; title: string; submit: string }> = {
  login: { eyebrow: "Administrator Login", title: "管理员登录", submit: "登录管理界面" },
  setup: { eyebrow: "One-time Setup", title: "初始化管理员账号", submit: "创建管理员账号" },
  recover: { eyebrow: "Account Recovery", title: "重置管理员密码", submit: "重置密码" }
};

export function AdminAuthView({
  busy,
  errorMessage,
  managementUrl,
  mode,
  serviceNotice,
  statusMessage,
  onLogin,
  onModeChange,
  onRecover,
  onSetup
}: AdminAuthViewProps): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oneTimeToken, setOneTimeToken] = useState("");

  useEffect(() => {
    setPassword("");
    setOneTimeToken("");
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (mode === "login") {
      await onLogin({ email, password });
      return;
    }
    if (mode === "setup") {
      await onSetup({ email, password, setupToken: oneTimeToken });
      return;
    }
    await onRecover({ email, password, recoveryToken: oneTimeToken });
  }

  const copy = MODE_COPY[mode];

  return (
    <section className="admin-auth-shell" aria-labelledby="admin-auth-title">
      <div className="admin-auth-card liquid-glass glass-panel">
        <p className="admin-eyebrow">{copy.eyebrow}</p>
        <h1 id="admin-auth-title">{copy.title}</h1>
        <p className="admin-auth-intro">账号、密码和一次性令牌只会提交到管理员接口，不会保存在浏览器中。</p>

        {serviceNotice && (
          <div className="admin-banner admin-banner--notice" role="status">
            <p>{serviceNotice}</p>
            {managementUrl && <a href={managementUrl}>打开 Netlify 管理界面</a>}
          </div>
        )}
        {statusMessage && <p className="admin-banner admin-banner--success" role="status">{statusMessage}</p>}
        {errorMessage && <p className="admin-banner admin-banner--error" role="alert">{errorMessage}</p>}

        <form className="admin-auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="admin-form-field">
            <span>管理员邮箱</span>
            <input
              autoComplete="email"
              disabled={busy}
              inputMode="email"
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="admin-form-field">
            <span>{mode === "login" ? "密码" : "新密码"}</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={busy}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {mode !== "login" && (
            <label className="admin-form-field">
              <span>{mode === "setup" ? "一次性初始化令牌" : "一次性恢复令牌"}</span>
              <input
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setOneTimeToken(event.target.value)}
                required
                type="password"
                value={oneTimeToken}
              />
            </label>
          )}

          <button className="admin-primary-button" disabled={busy} type="submit">
            {busy ? "正在提交…" : copy.submit}
          </button>
        </form>

        <div className="admin-auth-switches" aria-label="切换管理员账号操作">
          {mode !== "login" && (
            <button disabled={busy} onClick={() => onModeChange("login")} type="button">返回登录</button>
          )}
          {mode !== "setup" && (
            <button disabled={busy} onClick={() => onModeChange("setup")} type="button">首次初始化</button>
          )}
          {mode !== "recover" && (
            <button disabled={busy} onClick={() => onModeChange("recover")} type="button">找回密码</button>
          )}
        </div>
      </div>
    </section>
  );
}
