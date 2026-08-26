import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "./default-site-content.ts";
import { parseSiteContentDocument, parseSiteContentUpdate } from "./site-content-schema.ts";

test("built-in site content satisfies schema v1", () => {
  const parsed = parseSiteContentDocument(defaultSiteContent);
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(Object.keys(parsed.sections), ["home", "codex", "showcase", "skills", "resume", "contact"]);
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
