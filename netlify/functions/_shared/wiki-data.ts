import manifest from "../../../knowledge/wiki/manifest.json" with { type: "json" };
import { knowledgeDocument } from "./knowledge-data.ts";
import { validateWikiManifest } from "./wiki-schema.ts";

// 加载时校验，不让过期或手改的页面绕过原始事实来源。
export const wikiValidation = validateWikiManifest(manifest, knowledgeDocument);
export const wikiPages = wikiValidation.pages;
