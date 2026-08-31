import assert from "node:assert/strict";
import test from "node:test";

import { defaultSiteContent } from "../../shared/default-site-content.ts";
import {
  fetchSiteContent,
  resolveSiteContentApiBase
} from "./site-content-client.ts";

const netlifyUrl = new URL("https://yyq-web.netlify.app/");

test("GitHub Pages reads public content from Netlify", () => {
  assert.equal(
    resolveSiteContentApiBase(new URL("https://mrxiaoxies.github.io/YYQ-Personal-web/")),
    "https://yyq-web.netlify.app"
  );
});

test("Netlify and local development use the same-origin content API", () => {
  assert.equal(resolveSiteContentApiBase(netlifyUrl), "");
  assert.equal(resolveSiteContentApiBase(new URL("http://127.0.0.1:5173/")), "");
});

test("an explicit API base wins and is normalized", () => {
  assert.equal(
    resolveSiteContentApiBase(netlifyUrl, "https://content.example.com/"),
    "https://content.example.com"
  );
});

test("fetch requests the resolved endpoint and parses a remote document", async () => {
  const remoteDocument = {
    ...structuredClone(defaultSiteContent),
    version: "content-remote",
    updatedAt: "2026-08-31T00:00:00.000Z"
  };
  let requestedUrl = "";

  const result = await fetchSiteContent(async (input) => {
    requestedUrl = String(input);
    return Response.json(remoteDocument);
  }, new URL("https://mrxiaoxies.github.io/YYQ-Personal-web/"));

  assert.equal(requestedUrl, "https://yyq-web.netlify.app/api/site-content");
  assert.equal(result.source, "remote");
  assert.deepEqual(result.document, remoteDocument);
  assert.notEqual(result.document, remoteDocument);
});

test("HTTP, network, JSON, and schema failures fall back without throwing", async () => {
  const cases = [
    async () => new Response("unavailable", { status: 503 }),
    async () => {
      throw new Error("offline");
    },
    async () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    async () => Response.json({ ...defaultSiteContent, schemaVersion: 99 })
  ];

  for (const fetchImpl of cases) {
    const result = await fetchSiteContent(fetchImpl, netlifyUrl);
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.document, defaultSiteContent);
    assert.notEqual(result.document, defaultSiteContent);
  }
});

test("fallback documents do not share mutable nested state", async () => {
  const failingFetch = async () => new Response("bad", { status: 503 });
  const first = await fetchSiteContent(failingFetch, netlifyUrl);
  const second = await fetchSiteContent(failingFetch, netlifyUrl);

  first.document.sections.home.titleLines[0] = "changed";
  assert.equal(second.document.sections.home.titleLines[0], defaultSiteContent.sections.home.titleLines[0]);
});
