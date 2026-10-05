import { createHash } from "node:crypto";
import type { KnowledgeDocument, KnowledgeEntry } from "./knowledge-schema.ts";

export type WikiPage = {
  id: string;
  title: string;
  kind: "person" | "project" | "skill" | "timeline";
  aliases: string[];
  keywords: string[];
  summary: string;
  sourceEntryIds: string[];
  relatedPageIds: string[];
  sourceDigest: string;
};
export type WikiManifest = { schemaVersion: 1; knowledgeVersion: string; pages: WikiPage[] };

function digest(entries: KnowledgeEntry[]) {
  // 摘要覆盖实际事实字段；正文、时间、可见性变化均使旧页面失效。
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export function compileWiki(document: KnowledgeDocument): WikiManifest {
  const entries = document.entries.filter(entry => entry.visibility === "public");
  const pages: WikiPage[] = entries.map(entry => ({
    id: entry.id,
    title: entry.title,
    kind: entry.category.includes("project") ? "project" : entry.category === "profile" ? "person" : entry.category === "work-overview" ? "timeline" : "skill",
    aliases: entry.aliases,
    keywords: entry.tags,
    summary: entry.content,
    sourceEntryIds: [entry.id],
    relatedPageIds: [],
    sourceDigest: digest([entry])
  }));
  for (const topic of document.topics) {
    const sources = entries.filter(entry => topic.entryIds.includes(entry.id));
    if (!sources.length) continue;
    pages.push({
      id: `topic-${topic.id}`, title: topic.title,
      kind: topic.category === "work" ? "timeline" : topic.category === "project" ? "project" : "skill",
      aliases: topic.lexicalAnchors,
      keywords: topic.lexicalAnchors,
      // 首版采用可复现的来源编译，不用 LLM 编造新的事实或关系。
      summary: sources.map(entry => `${entry.title}：${entry.content}`).join("\n"),
      sourceEntryIds: sources.map(entry => entry.id),
      relatedPageIds: sources.map(entry => entry.id),
      sourceDigest: digest(sources)
    });
    for (const page of pages.filter(page => topic.entryIds.includes(page.id))) {
      page.relatedPageIds.push(`topic-${topic.id}`);
    }
  }
  return { schemaVersion: 1, knowledgeVersion: document.version, pages };
}

export function validateWikiManifest(value: unknown, document: KnowledgeDocument): { pages: WikiPage[]; issues: string[] } {
  const expected = compileWiki(document);
  const issues: string[] = [];
  if (!value || typeof value !== "object" || !Array.isArray((value as WikiManifest).pages)) {
    return { pages: [], issues: ["invalid-manifest"] };
  }
  const manifest = value as WikiManifest;
  if (manifest.schemaVersion !== 1 || manifest.knowledgeVersion !== document.version) {
    return { pages: [], issues: ["wiki-version-mismatch"] };
  }
  const pages = expected.pages.filter(page => {
    const candidates = manifest.pages.filter(item => item?.id === page.id);
    // 与确定性编译结果逐字段比较，既校验来源新鲜度，也拒绝手改正文和链接。
    if (candidates.length !== 1 || JSON.stringify(candidates[0]) !== JSON.stringify(page)) {
      issues.push(`invalid-or-stale:${page.id}`);
      return false;
    }
    return true;
  });
  for (const page of manifest.pages) {
    if (!expected.pages.some(item => item.id === page?.id)) issues.push(`unknown-page:${page?.id}`);
  }
  return { pages, issues };
}
