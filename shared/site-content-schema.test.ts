import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent, legacyDefaultSiteContent } from "./default-site-content.ts";
import { mergeRecentCodexProjects } from "./recent-codex-projects.ts";
import { parseSiteContentDocument, parseSiteContentUpdate } from "./site-content-schema.ts";

test("built-in site content satisfies schema v1", () => {
  const parsed = parseSiteContentDocument(defaultSiteContent);
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(Object.keys(parsed.sections), ["home", "codex", "showcase", "skills", "resume", "contact"]);
});

test("browser merge validates eleven projects without the Node Buffer global", () => {
  const current = structuredClone(legacyDefaultSiteContent);
  current.sections.codex.projects[0].summary = "管理员自己的简介";
  const merged = mergeRecentCodexProjects(current.sections.codex, legacyDefaultSiteContent.sections.codex);
  const update = { expectedVersion: current.version, sections: { ...current.sections, codex: merged } };
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer")!;
  try {
    Object.defineProperty(globalThis, "Buffer", { configurable: true, value: undefined });
    const parsed = parseSiteContentUpdate(update);
    assert.equal(parsed.sections.codex.projects.length, 11);
    assert.equal(parsed.sections.codex.projects[0].summary, "管理员自己的简介");
    assert.deepEqual(mergeRecentCodexProjects(parsed.sections.codex, legacyDefaultSiteContent.sections.codex), parsed.sections.codex);
  } finally {
    Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
  }
});

test("content update enforces its UTF-8 byte limit for multibyte project skills", () => {
  const update = { expectedVersion: defaultSiteContent.version, sections: structuredClone(defaultSiteContent.sections) };
  update.sections.codex.projects[0].operationSkills = Array(20).fill("汉".repeat(2_000));
  const serialized = JSON.stringify(update);
  assert.ok(serialized.length < 128 * 1024);
  assert.ok(new TextEncoder().encode(serialized).byteLength > 128 * 1024);
  assert.throws(() => parseSiteContentUpdate(update), /no larger than 131072 bytes/);
});

test("content update rejects unknown fields and unsafe targets", () => {
  const unknown = structuredClone(defaultSiteContent) as Record<string, unknown>;
  unknown.extra = true;
  assert.throws(() => parseSiteContentDocument(unknown), /extra/);

  const update = {
    expectedVersion: defaultSiteContent.version,
    sections: structuredClone(defaultSiteContent.sections)
  };
  update.sections.codex.projects[0].links = [{ id: "bad-link", label: "bad", href: "javascript:alert(1)" }];
  assert.throws(() => parseSiteContentUpdate(update), /href/);
});

test("content update rejects HTTP(S) links without literal double slashes", () => {
  for (const href of ["http:example.com", "http:/example.com", "https:example.com"]) {
    const update = {
      expectedVersion: defaultSiteContent.version,
      sections: structuredClone(defaultSiteContent.sections)
    };
    update.sections.codex.projects[0].links = [{ id: "malformed-link", label: "bad", href }];
    assert.throws(() => parseSiteContentUpdate(update), /href/);
  }
});

test("document rejects whitespace-only required text", () => {
  const document = structuredClone(defaultSiteContent);
  document.sections.home.eyebrow = " \t\n ";
  assert.throws(() => parseSiteContentDocument(document), /eyebrow/);
});

test("showcase allows safe public files and rejects traversal", () => {
  const safe = structuredClone(defaultSiteContent);
  safe.sections.showcase.downloadHref = "files/YYQ个人网站测试用例-标准格式.xlsx";
  assert.doesNotThrow(() => parseSiteContentDocument(safe));

  safe.sections.showcase.downloadHref = "files/../.env";
  assert.throws(() => parseSiteContentDocument(safe), /downloadHref/);
});

test("project operation skills round-trip and old documents remain readable", () => {
  const document = structuredClone(defaultSiteContent);
  Object.assign(document.sections.codex.projects[0], { operationSkills: ["接口验证", "版本发布"] });
  const parsed = parseSiteContentDocument(document);
  assert.deepEqual(parsed.sections.codex.projects[0].operationSkills, ["接口验证", "版本发布"]);
  delete document.sections.codex.projects[0].operationSkills;
  assert.deepEqual(parseSiteContentDocument(document).sections.codex.projects[0].operationSkills, []);
  Object.assign(document.sections.codex.projects[0], { operationSkills: [""] });
  assert.throws(() => parseSiteContentDocument(document), /operationSkills/);
  Object.assign(document.sections.codex.projects[0], { operationSkills: Array(61).fill("技能") });
  assert.throws(() => parseSiteContentDocument(document), /operationSkills/);
});
