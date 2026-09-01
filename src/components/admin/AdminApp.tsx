import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { SiteContentDocument } from "../../../shared/site-content-schema.ts";
import {
  AdminApiError,
  getCurrentAdmin,
  isAdminHostedHere,
  loadAdminStats,
  loadRevisions,
  loginAdmin,
  logoutAdmin,
  recoverAdmin,
  resolveAdminSiteUrl,
  restoreRevision,
  setupAdmin,
  type AnalyticsStats,
  type LoginInput,
  type PublicAdminUser,
  type RecoverInput,
  type RevisionSummary,
  type SetupInput
} from "../../lib/admin-api.ts";
import { fetchSiteContent } from "../../lib/site-content-client.ts";
import { AdminAuthView, type AdminAuthMode } from "./AdminAuthView.tsx";
import { AdminHome } from "./AdminHome.tsx";
import {
  AdminSectionEditor,
  type AdminSectionKey
} from "./AdminSectionEditor.tsx";
import {
  adminErrorMessage,
  isAdminGenerationCurrent,
  isLocalViteLocation,
  isUnauthorizedAdminError,
  replacePublishedDocument,
  shouldPollAdminStats
} from "./admin-ui-state.ts";

export type AdminScreen =
  | { name: "loading" }
  | { name: "auth"; mode: AdminAuthMode }
  | { name: "home" }
  | { name: "edit"; section: AdminSectionKey };

export type AdminAppProps = {
  content: SiteContentDocument;
  onPublished(document: SiteContentDocument): void;
};

const DEFAULT_NETLIFY_ADMIN_URL = "https://yyq-web.netlify.app/#admin";

function managementUrlFor(location: Location): string {
  try {
    const resolved = resolveAdminSiteUrl(location);
    if (!resolved) return DEFAULT_NETLIFY_ADMIN_URL;
    const url = new URL(resolved);
    url.hash = "admin";
    return url.href;
  } catch {
    return DEFAULT_NETLIFY_ADMIN_URL;
  }
}

export function AdminExternalEntry(): ReactElement {
  const managementUrl = useMemo(() => managementUrlFor(window.location), []);

  return (
    <section className="admin-external-shell" aria-labelledby="admin-external-title">
      <div className="admin-auth-card liquid-glass glass-panel">
        <p className="admin-eyebrow">Administrator Console</p>
        <h1 id="admin-external-title">管理界面托管在 Netlify</h1>
        <p>GitHub Pages 仅展示公开网站，不会在此请求管理员会话或管理接口。</p>
        <a className="admin-primary-link" href={managementUrl}>前往 Netlify 管理界面</a>
      </div>
    </section>
  );
}

export function AdminApp({ content, onPublished }: AdminAppProps): ReactElement {
  const hostedHere = useMemo(() => isAdminHostedHere(window.location), []);
  const managementUrl = useMemo(() => managementUrlFor(window.location), []);
  const localVite = useMemo(() => isLocalViteLocation(window.location), []);
  const [screen, setScreen] = useState<AdminScreen>({ name: "loading" });
  const [user, setUser] = useState<PublicAdminUser | null>(null);
  const [currentContent, setCurrentContent] = useState(content);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsMessage, setStatsMessage] = useState("");
  const [revisionsMessage, setRevisionsMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [serviceNotice, setServiceNotice] = useState("");
  const [busyRevisionId, setBusyRevisionId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const statsRequestRef = useRef(0);
  const revisionsRequestRef = useRef(0);
  const restoreRequestRef = useRef(0);
  const logoutRequestRef = useRef(0);
  const logoutInFlightRef = useRef(false);

  const generationIsCurrent = useCallback((generation: number) => (
    isAdminGenerationCurrent(generation, generationRef.current, mountedRef.current)
  ), []);

  const enterLogin = useCallback((statusMessage = "") => {
    generationRef.current += 1;
    statsRequestRef.current += 1;
    revisionsRequestRef.current += 1;
    setUser(null);
    setStats(null);
    setRevisions([]);
    setStatsLoading(false);
    setBusyRevisionId(null);
    setStatsMessage("");
    setRevisionsMessage("");
    setAuthBusy(false);
    setAuthError("");
    setAuthStatus(statusMessage);
    setScreen({ name: "auth", mode: "login" });
  }, []);

  const publishDocument = useCallback((document: SiteContentDocument) => {
    setCurrentContent((current) => replacePublishedDocument(current, document));
    onPublished(document);
  }, [onPublished]);

  const refreshStats = useCallback(async (generation: number) => {
    const request = statsRequestRef.current + 1;
    statsRequestRef.current = request;
    setStatsLoading(true);
    try {
      const nextStats = await loadAdminStats();
      if (!generationIsCurrent(generation) || statsRequestRef.current !== request) return;
      setStats(nextStats);
      setStatsMessage("");
    } catch (error) {
      if (!generationIsCurrent(generation) || statsRequestRef.current !== request) return;
      if (isUnauthorizedAdminError(error)) {
        enterLogin("登录状态已失效，请重新登录。");
        return;
      }
      setStatsMessage(adminErrorMessage(error));
    } finally {
      if (generationIsCurrent(generation) && statsRequestRef.current === request) {
        setStatsLoading(false);
      }
    }
  }, [enterLogin, generationIsCurrent]);

  const refreshRevisions = useCallback(async (generation: number) => {
    const request = revisionsRequestRef.current + 1;
    revisionsRequestRef.current = request;
    try {
      const nextRevisions = await loadRevisions();
      if (!generationIsCurrent(generation) || revisionsRequestRef.current !== request) return;
      setRevisions(nextRevisions);
      setRevisionsMessage("");
    } catch (error) {
      if (!generationIsCurrent(generation) || revisionsRequestRef.current !== request) return;
      if (isUnauthorizedAdminError(error)) {
        enterLogin("登录状态已失效，请重新登录。");
        return;
      }
      setRevisionsMessage(adminErrorMessage(error));
    }
  }, [enterLogin, generationIsCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      statsRequestRef.current += 1;
      revisionsRequestRef.current += 1;
      restoreRequestRef.current += 1;
      logoutRequestRef.current += 1;
      logoutInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentContent((current) => (
      current.version === content.version ? current : content
    ));
  }, [content]);

  useEffect(() => {
    if (!hostedHere) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setScreen({ name: "loading" });

    void getCurrentAdmin().then((currentUser) => {
      if (!generationIsCurrent(generation)) return;
      setUser(currentUser);
      setAuthError("");
      setServiceNotice("");
      setScreen({ name: "home" });
    }).catch((error: unknown) => {
      if (!generationIsCurrent(generation)) return;
      if (isUnauthorizedAdminError(error)) {
        setScreen({ name: "auth", mode: "login" });
        return;
      }
      setServiceNotice(localVite
        ? "当前是本地 Vite 预览，未启动 Netlify Functions；请打开 Netlify 管理界面完成登录和发布。"
        : "管理服务暂时不可用，仍可稍后重试登录。");
      setScreen({ name: "auth", mode: "login" });
    });

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [generationIsCurrent, hostedHere, localVite]);

  useEffect(() => {
    if (user === null || screen.name !== "home") return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let timer: number | null = null;

    const stopTimer = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const startTimer = () => {
      stopTimer();
      if (!shouldPollAdminStats({
        authenticated: true,
        screen: "home",
        visibility: document.visibilityState
      })) return;
      timer = window.setInterval(() => void refreshStats(generation), 10_000);
    };
    const onVisibilityChange = () => {
      if (!generationIsCurrent(generation)) return;
      if (document.visibilityState === "visible") {
        void refreshStats(generation);
      }
      startTimer();
    };

    void refreshStats(generation);
    void refreshRevisions(generation);
    startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (generationRef.current === generation) generationRef.current += 1;
      statsRequestRef.current += 1;
      revisionsRequestRef.current += 1;
    };
  }, [generationIsCurrent, refreshRevisions, refreshStats, screen.name, user?.id]);

  async function runAuth(
    action: () => Promise<PublicAdminUser>,
    success: (nextUser: PublicAdminUser) => void
  ) {
    if (authBusy) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      const nextUser = await action();
      if (!generationIsCurrent(generation)) return;
      success(nextUser);
    } catch (error) {
      if (!generationIsCurrent(generation)) return;
      setAuthError(adminErrorMessage(error));
    } finally {
      if (generationIsCurrent(generation)) setAuthBusy(false);
    }
  }

  async function handleRecover(input: RecoverInput) {
    if (authBusy) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      await recoverAdmin(input);
      if (!generationIsCurrent(generation)) return;
      enterLogin("密码已重置，请使用新密码登录。");
    } catch (error) {
      if (!generationIsCurrent(generation)) return;
      setAuthError(adminErrorMessage(error));
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    const request = logoutRequestRef.current + 1;
    logoutRequestRef.current = request;
    enterLogin();
    setAuthBusy(true);
    setServiceNotice("");
    try {
      await logoutAdmin();
      if (!mountedRef.current || logoutRequestRef.current !== request) return;
      setAuthStatus("已安全退出管理员账号。");
    } catch (error) {
      if (!mountedRef.current || logoutRequestRef.current !== request) return;
      if (isUnauthorizedAdminError(error)) {
        setAuthStatus("已安全退出管理员账号。");
      } else {
        setServiceNotice("本地管理界面已退出，但服务器会话未确认注销；刷新页面前请视为该会话仍可能有效。");
      }
    } finally {
      if (logoutRequestRef.current === request) logoutInFlightRef.current = false;
      if (mountedRef.current && logoutRequestRef.current === request) setAuthBusy(false);
    }
  }

  async function handleRestore(revision: RevisionSummary) {
    if (busyRevisionId !== null) return;
    const request = restoreRequestRef.current + 1;
    restoreRequestRef.current = request;
    setBusyRevisionId(revision.id);
    setRevisionsMessage("");
    try {
      const restored = await restoreRevision({
        expectedVersion: currentContent.version,
        revisionId: revision.id
      });
      if (!mountedRef.current || restoreRequestRef.current !== request) return;
      publishDocument(restored);
      await refreshRevisions(generationRef.current);
    } catch (error) {
      if (!mountedRef.current || restoreRequestRef.current !== request) return;
      if (isUnauthorizedAdminError(error)) {
        enterLogin("登录状态已失效，请重新登录。");
        return;
      }
      setRevisionsMessage(error instanceof AdminApiError && error.status === 409
        ? "内容版本已更新，恢复操作未执行。请刷新数据后再试。"
        : adminErrorMessage(error));
    } finally {
      if (mountedRef.current && restoreRequestRef.current === request) setBusyRevisionId(null);
    }
  }

  const loadRemoteContent = useCallback(async (): Promise<SiteContentDocument> => {
    const result = await fetchSiteContent(window.fetch.bind(window), window.location);
    if (result.source !== "remote") {
      throw new AdminApiError("service_unavailable", 503, "The remote site content is unavailable.");
    }
    return result.document;
  }, []);

  async function handleHomeRefresh() {
    const generation = generationRef.current;
    setRevisionsMessage("");
    void refreshStats(generation);
    void refreshRevisions(generation);
    try {
      const latest = await loadRemoteContent();
      if (!generationIsCurrent(generation)) return;
      publishDocument(latest);
    } catch (error) {
      if (!generationIsCurrent(generation)) return;
      if (isUnauthorizedAdminError(error)) {
        enterLogin("登录状态已失效，请重新登录。");
        return;
      }
      setRevisionsMessage(adminErrorMessage(error));
    }
  }

  if (!hostedHere) {
    return <AdminExternalEntry />;
  }

  if (screen.name === "loading") {
    return <section className="admin-loading" aria-live="polite" role="status">正在检查管理员登录状态…</section>;
  }

  if (screen.name === "auth") {
    return (
      <AdminAuthView
        busy={authBusy}
        errorMessage={authError}
        managementUrl={localVite ? managementUrl : ""}
        mode={screen.mode}
        serviceNotice={serviceNotice}
        statusMessage={authStatus}
        onLogin={(input: LoginInput) => runAuth(
          () => loginAdmin(input),
          (nextUser) => {
            setUser(nextUser);
            setServiceNotice("");
            setScreen({ name: "home" });
          }
        )}
        onModeChange={(mode) => {
          if (authBusy) return;
          setAuthError("");
          setAuthStatus("");
          setScreen({ name: "auth", mode });
        }}
        onRecover={handleRecover}
        onSetup={(input: SetupInput) => runAuth(
          () => setupAdmin(input),
          (nextUser) => {
            setUser(nextUser);
            setServiceNotice("");
            setScreen({ name: "home" });
          }
        )}
      />
    );
  }

  if (screen.name === "edit") {
    return (
      <div className="admin-shell">
        <AdminSectionEditor
          document={currentContent}
          key={screen.section}
          onBack={() => setScreen({ name: "home" })}
          onPublished={publishDocument}
          onReloadLatest={loadRemoteContent}
          onUnauthorized={() => enterLogin("登录状态已失效，请重新登录。")}
          section={screen.section}
        />
      </div>
    );
  }

  if (user === null) {
    return <section className="admin-loading" aria-live="polite" role="status">正在返回登录界面…</section>;
  }

  return (
    <div className="admin-shell">
      <AdminHome
        busyRevisionId={busyRevisionId}
        contentVersion={currentContent.version}
        revisions={revisions}
        revisionsMessage={revisionsMessage}
        stats={stats}
        statsLoading={statsLoading}
        statsMessage={statsMessage}
        user={user}
        onEdit={(section) => {
          if (busyRevisionId === null) setScreen({ name: "edit", section });
        }}
        onLogout={() => void handleLogout()}
        onRefresh={() => void handleHomeRefresh()}
        onRestore={(revision) => void handleRestore(revision)}
      />
    </div>
  );
}
