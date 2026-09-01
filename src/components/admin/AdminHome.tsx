import type { ReactElement } from "react";

import type {
  AnalyticsStats,
  PublicAdminUser,
  RevisionSummary
} from "../../lib/admin-api.ts";
import {
  adminSectionLabels,
  type AdminSectionKey
} from "./AdminSectionEditor.tsx";

export type AdminHomeProps = {
  busyRevisionId: string | null;
  contentVersion: string;
  revisions: RevisionSummary[];
  revisionsMessage: string;
  stats: AnalyticsStats | null;
  statsLoading: boolean;
  statsMessage: string;
  user: PublicAdminUser;
  onEdit(section: AdminSectionKey): void;
  onLogout(): void;
  onRefresh(): void;
  onRestore(revision: RevisionSummary): void;
};

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "暂无记录";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Shanghai"
    }).format(new Date(timestamp));
  } catch {
    return "时间未知";
  }
}

export function AdminHome({
  busyRevisionId,
  contentVersion,
  revisions,
  revisionsMessage,
  stats,
  statsLoading,
  statsMessage,
  user,
  onEdit,
  onLogout,
  onRefresh,
  onRestore
}: AdminHomeProps): ReactElement {
  const metrics = [
    { detail: "每次页面打开会记录一次", label: "总访问次数", value: formatMetric(stats?.totalVisits) },
    { detail: "按浏览器访客 ID 统计", label: "独立访客", value: formatMetric(stats?.totalVisitors) },
    { detail: "按北京时间自然日统计", label: "今日访问", value: formatMetric(stats?.todayVisits) },
    {
      detail: formatMetric(stats?.onlineWindowSeconds) + " 秒内有心跳的访客",
      label: "当前在线",
      value: formatMetric(stats?.onlineCount)
    }
  ];
  const revisionBusy = busyRevisionId !== null;

  return (
    <section className="admin-home" aria-labelledby="admin-home-title">
      <header className="admin-toolbar liquid-glass glass-panel">
        <div>
          <p className="admin-eyebrow">Personal Site Console</p>
          <h1 id="admin-home-title">网站内容管理</h1>
          <p>{user.email} · 当前版本 {contentVersion}</p>
        </div>
        <div className="admin-toolbar-actions">
          <button disabled={revisionBusy} onClick={onRefresh} type="button">刷新数据</button>
          <button disabled={revisionBusy} onClick={onLogout} type="button">退出登录</button>
        </div>
      </header>

      {statsMessage && <p className="admin-banner admin-banner--error" role="alert">{statsMessage}</p>}
      {revisionsMessage && <p className="admin-banner admin-banner--warning" role="status">{revisionsMessage}</p>}

      <section aria-labelledby="admin-stats-title">
        <div className="admin-subheading">
          <div>
            <p className="admin-eyebrow">Live Analytics</p>
            <h2 id="admin-stats-title">访问统计</h2>
          </div>
          <p aria-live="polite">{statsLoading ? "正在刷新…" : "更新时间 " + formatDateTime(stats?.generatedAt)}</p>
        </div>
        <div className="admin-metrics-grid">
          {metrics.map((metric) => (
            <article className="admin-metric-card liquid-glass glass-panel" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel liquid-glass glass-panel" aria-labelledby="admin-visitors-title">
        <div className="admin-subheading">
          <div>
            <p className="admin-eyebrow">Online Sessions</p>
            <h2 id="admin-visitors-title">当前在线访客</h2>
          </div>
          <p>最近访问 {formatDateTime(stats?.lastVisitAt)}</p>
        </div>
        <div className="admin-session-list">
          {stats?.recentVisitors.length ? stats.recentVisitors.map((visitor) => (
            <article className="admin-session-row" key={visitor.sessionId + "-" + visitor.lastSeenAt}>
              <div>
                <strong>访客 {visitor.sessionId}</strong>
                <span>{visitor.page || "/"}</span>
              </div>
              <div>
                <strong>{formatDateTime(visitor.lastSeenAt)}</strong>
                <span>
                  {visitor.country || "未知地区"}{visitor.city ? " · " + visitor.city : ""} · {formatMetric(visitor.pageViews)} 次页面访问
                </span>
              </div>
            </article>
          )) : <p className="admin-empty-state">当前没有在线访客。</p>}
        </div>
      </section>

      <section aria-labelledby="admin-sections-title">
        <div className="admin-subheading">
          <div>
            <p className="admin-eyebrow">Published Content</p>
            <h2 id="admin-sections-title">编辑网站栏目</h2>
          </div>
          <p>保存后立即发布</p>
        </div>
        <div className="admin-section-grid">
          {(Object.keys(adminSectionLabels) as AdminSectionKey[]).map((section) => (
            <button
              className="admin-section-card liquid-glass glass-panel"
              key={section}
              onClick={() => onEdit(section)}
              type="button"
            >
              <span>{adminSectionLabels[section]}</span>
              <small>修改标题与内容</small>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel liquid-glass glass-panel" aria-labelledby="admin-revisions-title">
        <div className="admin-subheading">
          <div>
            <p className="admin-eyebrow">Revision History</p>
            <h2 id="admin-revisions-title">最近发布版本</h2>
          </div>
          <p>恢复也会生成一个新版本</p>
        </div>
        <div className="admin-revision-list">
          {revisions.length ? revisions.map((revision) => (
            <article className="admin-revision-row" key={revision.id}>
              <div>
                <strong>{revision.reason === "restore" ? "恢复发布" : "内容发布"}</strong>
                <span>{formatDateTime(revision.createdAt)} · {revision.actorEmail}</span>
                <small>来源版本 {revision.sourceVersion}</small>
              </div>
              <button
                disabled={revisionBusy}
                onClick={() => {
                  if (window.confirm("确认恢复 " + formatDateTime(revision.createdAt) + " 的版本？恢复后会立即发布。")) {
                    onRestore(revision);
                  }
                }}
                type="button"
              >
                {busyRevisionId === revision.id ? "正在恢复…" : "恢复此版本"}
              </button>
            </article>
          )) : <p className="admin-empty-state">暂无可恢复的历史版本。</p>}
        </div>
      </section>
    </section>
  );
}
