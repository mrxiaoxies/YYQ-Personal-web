import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("重新编译会移除已转私有来源的旧生成页，检查随后通过", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yyq-wiki-test-"));
  try {
    const source = JSON.parse(await readFile(new URL("../knowledge/index.json", import.meta.url), "utf8"));
    const sourcePath = join(directory, "source.json");
    const outputPath = join(directory, "wiki");
    const script = fileURLToPath(new URL("compile-wiki.mjs", import.meta.url));
    const args = [script, "--source", sourcePath, "--output", outputPath];
    await writeFile(sourcePath, JSON.stringify(source));
    execFileSync(process.execPath, args);
    await access(join(outputPath, "project-personal-site.md"));
    source.entries.find(entry => entry.id === "project-personal-site").visibility = "private";
    for (const topic of source.topics) topic.entryIds = topic.entryIds.filter(id => id !== "project-personal-site");
    await writeFile(sourcePath, JSON.stringify(source));
    execFileSync(process.execPath, args);
    await assert.rejects(access(join(outputPath, "project-personal-site.md")));
    execFileSync(process.execPath, [...args, "--check"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
