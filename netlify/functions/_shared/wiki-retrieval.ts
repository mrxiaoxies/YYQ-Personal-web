import type { WikiPage } from "./wiki-schema.ts";

function compact(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export type WikiSubquery = { query: string; sourceEntryId: string };
export function wikiSubqueries(query: string, pages: WikiPage[]): WikiSubquery[] {
  const normalized = compact(query);
  const projects = pages.filter(page => page.kind === "project" && page.sourceEntryIds.length === 1);
  const named = projects.flatMap(page => {
    const shortTitle = page.title.split("与")[0].replace(/本地工作流$|工作流项目$|测试$/, "");
    const anchors = [page.title, shortTitle, ...page.aliases].map(compact).filter(anchor => anchor.length >= 4 && normalized.includes(anchor));
    return anchors.length ? [{ page, anchor: anchors.sort((a,b) => b.length-a.length)[0] }] : [];
  });
  if (named.length === 2 && /共同|差异|区别|比较|对比|关系|不同|相同/.test(query)) {
    let remainder = normalized;
    for (const item of named) remainder = remainder.replaceAll(item.anchor, "");
    // 仅分解纯比较问题。带具体技术限定的问题必须保留完整原问题走原始门控。
    remainder = remainder.replace(/有什么|有哪些|各自|分别|共同点|相同点|不同点|差异|区别|比较|对比|关系|相同|不同|你|的|和|与|跟|项目|请|介绍|一下|是|什么|之间|它们|这两个|两个|有|吗|呢/g, "");
    if (!remainder) return named.map(({ page }) => ({ query: page.title, sourceEntryId: page.sourceEntryIds[0] }));
  }
  // 技能到项目关系仅使用资料中的明确标签；不从相似项目推断未知技能。
  if (/哪些项目|哪个项目|项目.*体现/.test(query) && !named.length) {
    const skill = ["Linux", "Postman", "MySQL", "Codex"].find(term => normalized.includes(compact(term)));
    if (!skill) return [];
    const remainder = normalized.replace(compact(skill), "").replace(/哪些项目|哪个项目|体现|了|你的|你|的|经验|能力|使用|用过|有哪些|有|在|中|技术|技能/g, "");
    if (remainder) return [];
    return projects.filter(page => page.keywords.some(alias => compact(alias) === compact(skill)))
      .slice(0, 4).map(page => ({ query: `${page.title} ${skill}经验`, sourceEntryId: page.sourceEntryIds[0] }));
  }
  return [];
}

export function planWikiEvidence(query: string, pages: WikiPage[], acceptedSourceIds: ReadonlySet<string>) {
  const available = pages.filter(page => page.sourceEntryIds.every(id => acceptedSourceIds.has(id)));
  const normalized = compact(query);
  const score = (page: WikiPage) => [page.title, ...page.aliases, ...page.keywords].reduce((sum, term) => sum + (normalized.includes(compact(term)) ? 1 : 0), 0);
  const ranked = available.map(page => ({page, score:score(page)})).filter(item => item.score > 0).sort((a,b)=>b.score-a.score);
  const selected = ranked.slice(0, 3).map(item => item.page);
  const linked = new Set(selected.flatMap(page => page.relatedPageIds));
  // 最多一跳且最多四页；所有链接页面也必须满足本次已接受来源集合。
  const result = [...selected, ...available.filter(page => linked.has(page.id) && !selected.includes(page))].slice(0, 4);
  let length = 0;
  const bounded = result.filter(page => { length += JSON.stringify(page).length; return length <= 5800; });
  const context = JSON.stringify(bounded.map(page => ({ title: page.title, summary: page.summary, sourceEntryIds: page.sourceEntryIds, relatedPageIds: page.relatedPageIds })));
  return { pages: bounded, context };
}
