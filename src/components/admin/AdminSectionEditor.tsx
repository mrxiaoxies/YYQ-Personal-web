import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";

import type {
  SiteContentDocument,
  SiteContentSections
} from "../../../shared/site-content-schema.ts";
import { AdminApiError, saveContent } from "../../lib/admin-api.ts";
import {
  acceptEditorVersion,
  buildContentUpdate,
  decideIncomingDocument,
  deepClone,
  isEditorOperationCurrent,
  type EditorOperationToken
} from "./editor-helpers.ts";
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
type EditorOperation = "save" | "reload";

export function AdminSectionEditor({
  document,
  section,
  onBack,
  onPublished,
  onReloadLatest,
  onUnauthorized
}: AdminSectionEditorProps): ReactElement {
  const [baseDocument, setBaseDocument] = useState(document);
  const [baseVersion, setBaseVersion] = useState(document.version);
  const [draft, setDraft] = useState<SiteContentSections[AdminSectionKey]>(() => deepClone(document.sections[section]));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [publishedAt, setPublishedAt] = useState("");
  const [operation, setOperation] = useState<EditorOperation | null>(null);
  const mountedRef = useRef(false);
  const currentSectionRef = useRef<AdminSectionKey>(section);
  const previousSectionRef = useRef<AdminSectionKey>(section);
  const baseVersionRef = useRef(document.version);
  const dirtyRef = useRef(false);
  const operationSequenceRef = useRef(0);
  const activeOperationRef = useRef<EditorOperationToken | null>(null);

  currentSectionRef.current = section;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeOperationRef.current = null;
      operationSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const decision = decideIncomingDocument({
      baseVersion: baseVersionRef.current,
      currentSection: previousSectionRef.current,
      dirty: dirtyRef.current,
      incomingSection: section,
      incomingVersion: document.version
    });

    if (decision.replaceDraft) {
      activeOperationRef.current = null;
      operationSequenceRef.current += 1;
      previousSectionRef.current = section;
      baseVersionRef.current = decision.baseVersion;
      dirtyRef.current = decision.dirty;
      setOperation(null);
      setBaseDocument(document);
      setBaseVersion(decision.baseVersion);
      setDraft(deepClone(document.sections[section]));
      setDirty(decision.dirty);
      setStatus("idle");
      setPublishedAt("");
      return;
    }

    previousSectionRef.current = section;
    if (decision.externalConflict) {
      setStatus("conflict");
    }
  }, [document.version, section]);

  function beginOperation(kind: EditorOperation): EditorOperationToken | null {
    if (activeOperationRef.current !== null) return null;
    const token = {
      id: operationSequenceRef.current + 1,
      section: currentSectionRef.current
    };
    operationSequenceRef.current = token.id;
    activeOperationRef.current = token;
    setOperation(kind);
    return token;
  }

  function operationIsCurrent(token: EditorOperationToken) {
    return isEditorOperationCurrent(
      token,
      activeOperationRef.current,
      currentSectionRef.current,
      mountedRef.current
    );
  }

  function finishOperation(token: EditorOperationToken) {
    if (!operationIsCurrent(token)) return;
    activeOperationRef.current = null;
    setOperation(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = beginOperation("save");
    if (token === null) return;
    setStatus("saving");
    try {
      const update = buildContentUpdate(baseDocument, section, draft, baseVersion);
      const savedDocument = await saveContent(update);
      if (!operationIsCurrent(token)) return;
      const accepted = acceptEditorVersion(savedDocument.version);
      baseVersionRef.current = accepted.baseVersion;
      dirtyRef.current = accepted.dirty;
      setBaseDocument(savedDocument);
      setBaseVersion(accepted.baseVersion);
      setDraft(deepClone(savedDocument.sections[section]));
      setDirty(accepted.dirty);
      setPublishedAt(savedDocument.updatedAt);
      setStatus("published");
      if (operationIsCurrent(token)) onPublished(savedDocument);
    } catch (error) {
      if (!operationIsCurrent(token)) return;
      if (error instanceof AdminApiError && error.status === 401) {
        setStatus("idle");
        if (operationIsCurrent(token)) onUnauthorized();
        return;
      }
      if (error instanceof AdminApiError && error.status === 409) {
        setStatus("conflict");
        return;
      }
      setStatus("error");
    } finally {
      finishOperation(token);
    }
  }

  async function handleReloadLatest() {
    const token = beginOperation("reload");
    if (token === null) return;
    try {
      const latest = await onReloadLatest();
      if (!operationIsCurrent(token)) return;
      const accepted = acceptEditorVersion(latest.version);
      baseVersionRef.current = accepted.baseVersion;
      dirtyRef.current = accepted.dirty;
      setBaseDocument(latest);
      setBaseVersion(accepted.baseVersion);
      setDraft(deepClone(latest.sections[section]));
      setDirty(accepted.dirty);
      setPublishedAt("");
      setStatus("idle");
    } catch (error) {
      if (!operationIsCurrent(token)) return;
      if (error instanceof AdminApiError && error.status === 401) {
        if (operationIsCurrent(token)) onUnauthorized();
      } else {
        setStatus("error");
      }
    } finally {
      finishOperation(token);
    }
  }

  const isBusy = operation !== null;

  return (
    <section className="admin-section-editor" aria-labelledby="admin-section-editor-title">
      <header>
        <button type="button" disabled={isBusy} onClick={onBack}>返回管理首页</button>
        <div>
          <p>保存后立即发布</p>
          <h1 id="admin-section-editor-title">编辑{adminSectionLabels[section]}</h1>
        </div>
      </header>

      {status === "conflict" && (
        <div role="alert" className="admin-editor-message admin-editor-message--warning">
          <p>内容已在其他位置更新。你的当前草稿仍被保留。</p>
          <button type="button" disabled={isBusy} onClick={() => void handleReloadLatest()}>
            {operation === "reload" ? "正在载入…" : "重新载入最新内容"}
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
      {dirty && status !== "conflict" && (
        <p role="status" className="admin-editor-message">有未发布更改</p>
      )}

      <form onSubmit={(event) => void handleSave(event)}>
        <fieldset disabled={isBusy} className="admin-editor-operation-fieldset">
          <legend>栏目草稿内容</legend>
          <TypedSectionEditor section={section} value={draft} onChange={(next) => {
            dirtyRef.current = true;
            setDraft(next);
            setDirty(true);
            if (status === "published" || status === "error") {
              setStatus("idle");
              setPublishedAt("");
            }
          }} />
          <div className="admin-editor-submit">
            <button type="submit" disabled={isBusy}>
              {operation === "save" ? "正在发布…" : "保存并发布"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
