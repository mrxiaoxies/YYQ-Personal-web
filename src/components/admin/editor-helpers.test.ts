import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "../../../shared/default-site-content.ts";
import {
  buildContentUpdate,
  createEditorId,
  deepClone,
  insertListItem,
  moveListItem,
  removeListItem
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
