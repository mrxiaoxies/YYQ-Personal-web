import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import type {
  SiteContentDocument,
  SiteContentSections
} from "../../../shared/site-content-schema.ts";
import { AdminApiError, saveContent } from "../../lib/admin-api.ts";
import { buildContentUpdate, deepClone } from "./editor-helpers.ts";
import {
  TypedSectionEditor,
  type AdminSectionKey
} from "./section-editors.tsx";

export type { AdminSectionKey } from "./section-editors.tsx";

export const adminSectionLabels: Record<AdminSectionKey, string> = {
  home: "首页",
  codex: "Codex 项目",
  showcase: "作品展示",
  skills: "技能",
  resume: "简历",
  contact: "联系信息"
};

export type AdminSectionEditorProps = {
  document: SiteContentDocument;
  section: AdminSectionKey;
  onBack(): void;
  onPublished(document: SiteContentDocument): void;
  onReloadLatest(): Promise<SiteContentDocument>;
  onUnauthorized(): void;
};

type EditorStatus = "idle" | "saving" | "published" | "conflict" | "error";

export function AdminSectionEditor({
  document,
  section,
  onBack,
  onPublished,
  onReloadLatest,
  onUnauthorized
}: AdminSectionEditorProps): ReactElement {
  const [baseDocument, setBaseDocument] = useState(document);
  const [draft, setDraft] = useState<SiteContentSections[AdminSectionKey]>(() => deepClone(document.sections[section]));
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [publishedAt, setPublishedAt] = useState("");
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    setBaseDocument(document);
    setDraft(deepClone(document.sections[section]));
    setStatus("idle");
    setPublishedAt("");
  }, [document.version, section]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "saving" || reloading) return;
    setStatus("saving");
    try {
      const savedDocument = await saveContent(buildContentUpdate(baseDocument, section, draft));
      setBaseDocument(savedDocument);
      setDraft(deepClone(savedDocument.sections[section]));
      setPublishedAt(savedDocument.updatedAt);
      setStatus("published");
      onPublished(savedDocument);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        setStatus("idle");
        onUnauthorized();
        return;
      }
      if (error instanceof AdminApiError && error.status === 409) {
        setStatus("conflict");
        return;
      }
      setStatus("error");
    }
  }

  async function handleReloadLatest() {
    if (status === "saving" || reloading) return;
    setReloading(true);
    try {
      const latest = await onReloadLatest();
      setBaseDocument(latest);
      setDraft(deepClone(latest.sections[section]));
      setPublishedAt("");
      setStatus("idle");
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        onUnauthorized();
      } else {
        setStatus("error");
      }
    } finally {
      setReloading(false);
    }
  }

  return (
    <section className="admin-section-editor" aria-labelledby="admin-section-editor-title">
      <header>
        <button type="button" onClick={onBack}>返回管理首页</button>
        <div>
          <p>保存后立即发布</p>
          <h1 id="admin-section-editor-title">编辑{adminSectionLabels[section]}</h1>
        </div>
      </header>

      {status === "conflict" && (
        <div role="alert" className="admin-editor-message admin-editor-message--warning">
          <p>内容已在其他位置更新。你的当前草稿仍被保留。</p>
          <button type="button" disabled={reloading} onClick={() => void handleReloadLatest()}>
            {reloading ? "正在载入…" : "重新载入最新内容"}
          </button>
        </div>
      )}
      {status === "error" && (
        <p role="alert" className="admin-editor-message admin-editor-message--error">
          操作未完成，请稍后重试。
        </p>
      )}
      {status === "published" && (
        <p role="status" className="admin-editor-message admin-editor-message--success">
          已发布{publishedAt ? " · " + new Date(publishedAt).toLocaleString("zh-CN") : ""}
        </p>
      )}

      <form onSubmit={(event) => void handleSave(event)}>
        <TypedSectionEditor section={section} value={draft} onChange={(next) => {
          setDraft(next);
          if (status === "published" || status === "error") {
            setStatus("idle");
            setPublishedAt("");
          }
        }} />
        <div className="admin-editor-submit">
          <button type="submit" disabled={status === "saving" || reloading}>
            {status === "saving" ? "正在发布…" : "保存并发布"}
          </button>
        </div>
      </form>
    </section>
  );
}
