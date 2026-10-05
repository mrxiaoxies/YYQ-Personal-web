import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, sep } from "node:path";
import { compileWiki } from "../netlify/functions/_shared/wiki-schema.ts";
import { parseKnowledgeDocument } from "../netlify/functions/_shared/knowledge-schema.ts";

function option(name) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const root = option("--output") ? pathToFileURL(resolve(option("--output")) + sep) : new URL("../knowledge/wiki/", import.meta.url);
const sourceUrl = option("--source") ? pathToFileURL(resolve(option("--source"))) : new URL("../knowledge/index.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));
const manifest = compileWiki(parseKnowledgeDocument(source));
const files = new Map([["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`]]);
function render(page) {
  return `# ${page.title}\n\n${page.summary}\n\n## 原始证据\n\n${page.sourceEntryIds.map(id => `- knowledge/index.json#${id}`).join("\n")}\n\n## 相关页面\n\n${page.relatedPageIds.map(id => `- [${id}](${id}.md)`).join("\n")}\n\n来源摘要：${page.sourceDigest}\n`;
}
for (const page of manifest.pages) files.set(`${page.id}.md`, render(page));
if (process.argv.includes("--check")) {
  // 只读检查用于构建门控；资料或页面改变必须先重新编译。
  const actualNames = await readdir(root);
  if (actualNames.some(name => !files.has(name))) throw new Error("Wiki 存在未编译或过期文件");
  for (const [name, content] of files) {
    if (await readFile(new URL(name, root), "utf8") !== content) throw new Error(`Wiki 需重新编译：${name}`);
  }
  console.log(`Wiki 校验通过：${manifest.pages.length} 页`);
} else {
  await mkdir(root, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(new URL("manifest.json", root), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const page of previous?.pages ?? []) {
    // 只清理旧 manifest 中、路径安全且内容仍等于旧生成结果的单个文件，保留手工文件。
    if (!/^[a-z0-9-]+$/.test(page.id) || files.has(`${page.id}.md`)) continue;
    const target = new URL(`${page.id}.md`, root);
    try {
      if (await readFile(target, "utf8") !== render(page)) throw new Error(`旧页面已有手工改动，需先审阅：${page.id}`);
      await unlink(target);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const [name, content] of files) await writeFile(new URL(name, root), content);
  console.log(`Wiki 已编译：${manifest.pages.length} 页 → ${fileURLToPath(root)}`);
}
