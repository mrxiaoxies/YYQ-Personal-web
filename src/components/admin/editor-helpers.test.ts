import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "../../../shared/default-site-content.ts";
import {
  acceptEditorVersion,
  buildContentUpdate,
  createEditorId,
  decideIncomingDocument,
  deepClone,
  insertListItem,
  isEditorOperationCurrent,
  moveListItem,
  removeListItem,
  selectEditorRenderDraft
} from "./editor-helpers.ts";

test("deepClone isolates nested section changes", () => {
  const original = defaultSiteContent.sections.codex;
  const clone = deepClone(original);
  clone.projects[0].timeline[0].detail = "changed";
  assert.notEqual(clone.projects[0].timeline[0].detail, original.projects[0].timeline[0].detail);
});

test("buildContentUpdate replaces one section and preserves the document version", () => {
  const home = deepClone(defaultSiteContent.sections.home);
  home.subtitle = "updated subtitle";
  const update = buildContentUpdate(defaultSiteContent, "home", home);
  assert.equal(update.expectedVersion, defaultSiteContent.version);
  assert.equal(update.sections.home.subtitle, "updated subtitle");
  assert.deepEqual(update.sections.codex, defaultSiteContent.sections.codex);
  assert.notEqual(update.sections, defaultSiteContent.sections);
  assert.equal(defaultSiteContent.sections.home.subtitle === "updated subtitle", false);
});

test("buildContentUpdate can bind a dirty draft to its original baseVersion", () => {
  const home = deepClone(defaultSiteContent.sections.home);
  home.subtitle = "dirty draft";

  const update = buildContentUpdate(defaultSiteContent, "home", home, "content-original");

  assert.equal(update.expectedVersion, "content-original");
});

test("a same-section external version preserves a dirty draft and its baseVersion", () => {
  const decision = decideIncomingDocument({
    baseVersion: "content-base",
    currentSection: "home",
    dirty: true,
    incomingSection: "home",
    incomingVersion: "content-external"
  });

  assert.deepEqual(decision, {
    baseVersion: "content-base",
    dirty: true,
    externalConflict: true,
    replaceDraft: false
  });
});

test("same-section external content is only accepted through an explicit action", () => {
  const decision = decideIncomingDocument({
    baseVersion: "content-base",
    currentSection: "home",
    dirty: false,
    incomingSection: "home",
    incomingVersion: "content-external"
  });

  assert.equal(decision.replaceDraft, false);
  assert.equal(decision.externalConflict, true);
  assert.deepEqual(acceptEditorVersion("content-external"), {
    baseVersion: "content-external",
    dirty: false,
    externalConflict: false
  });
});

test("an explicit section switch accepts the incoming base and clears dirty state", () => {
  assert.deepEqual(decideIncomingDocument({
    baseVersion: "content-base",
    currentSection: "home",
    dirty: true,
    incomingSection: "resume",
    incomingVersion: "content-next"
  }), {
    baseVersion: "content-next",
    dirty: false,
    externalConflict: false,
    replaceDraft: true
  });
});

test("operation guards require a mounted editor, matching token, and current section", () => {
  const token = { id: 4, section: "skills" as const };

  assert.equal(isEditorOperationCurrent(token, token, "skills", true), true);
  assert.equal(isEditorOperationCurrent(token, { id: 5, section: "skills" }, "skills", true), false);
  assert.equal(isEditorOperationCurrent(token, token, "contact", true), false);
  assert.equal(isEditorOperationCurrent(token, token, "skills", false), false);
  assert.equal(isEditorOperationCurrent(token, null, "skills", true), false);
});

test("Home to Codex transition renders a safe cloned Codex draft and disables editing", () => {
  const homeDraft = deepClone(defaultSiteContent.sections.home);
  homeDraft.subtitle = "unsaved home";

  const selection = selectEditorRenderDraft(
    { section: "home", value: homeDraft },
    "codex",
    defaultSiteContent,
    false
  );

  assert.equal(selection.bindingMatchesSection, false);
  assert.equal(selection.disabled, true);
  assert.deepEqual(selection.value, defaultSiteContent.sections.codex);
  assert.notEqual(selection.value, defaultSiteContent.sections.codex);
  assert.equal("subtitle" in selection.value, false);
});

test("an active matching draft is rendered directly and stays editable when idle", () => {
  const codexDraft = deepClone(defaultSiteContent.sections.codex);
  const selection = selectEditorRenderDraft(
    { section: "codex", value: codexDraft },
    "codex",
    defaultSiteContent,
    false
  );

  assert.equal(selection.bindingMatchesSection, true);
  assert.equal(selection.disabled, false);
  assert.equal(selection.value, codexDraft);
});

test("a busy section switch remains disabled and never exposes the previous draft type", () => {
  const selection = selectEditorRenderDraft(
    { section: "home", value: deepClone(defaultSiteContent.sections.home) },
    "codex",
    defaultSiteContent,
    true
  );

  assert.equal(selection.bindingMatchesSection, false);
  assert.equal(selection.disabled, true);
  assert.deepEqual(selection.value, defaultSiteContent.sections.codex);
});

test("moveListItem moves in both directions and ignores boundaries", () => {
  const input = ["a", "b", "c"];
  assert.deepEqual(moveListItem(input, 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveListItem(input, 1, 1), ["a", "c", "b"]);
  assert.deepEqual(moveListItem(input, 0, -1), input);
  assert.deepEqual(moveListItem(input, input.length - 1, 1), input);
  assert.deepEqual(input, ["a", "b", "c"]);
});

test("removal and insertion return new arrays without mutating input", () => {
  const input = ["a", "b"];
  assert.deepEqual(removeListItem(input, 0), ["b"]);
  assert.deepEqual(insertListItem(input, 1, "new"), ["a", "new", "b"]);
  assert.deepEqual(input, ["a", "b"]);
});

test("createEditorId passes through an injectable UUID source", () => {
  assert.equal(createEditorId(() => "123e4567-e89b-42d3-a456-426614174000"), "123e4567-e89b-42d3-a456-426614174000");
});
