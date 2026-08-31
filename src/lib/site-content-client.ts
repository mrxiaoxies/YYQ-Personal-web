import { defaultSiteContent } from "../../shared/default-site-content.ts";
import {
  parseSiteContentDocument,
  type SiteContentDocument
} from "../../shared/site-content-schema.ts";

export type SiteContentSource = "fallback" | "remote";

export type SiteContentResult = {
  document: SiteContentDocument;
  source: SiteContentSource;
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function configuredApiBase() {
  return import.meta.env?.VITE_SITE_CONTENT_API_BASE ?? "";
}

function normalizeApiBase(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function fallbackDocument() {
  return parseSiteContentDocument(JSON.parse(JSON.stringify(defaultSiteContent)));
}

export function resolveSiteContentApiBase(
  location: Pick<URL, "hostname">,
  configuredBase = configuredApiBase()
) {
  const explicitBase = normalizeApiBase(configuredBase);
  if (explicitBase) return explicitBase;
  if (location.hostname.toLowerCase().endsWith(".github.io")) {
    return "https://yyq-web.netlify.app";
  }
  return "";
}

export async function fetchSiteContent(
  fetchImpl: FetchImplementation,
  location: Pick<URL, "hostname">,
  configuredBase = configuredApiBase()
): Promise<SiteContentResult> {
  try {
    const base = resolveSiteContentApiBase(location, configuredBase);
    const response = await fetchImpl(`${base}/api/site-content`, {
      headers: { Accept: "application/json" },
      method: "GET"
    });
    if (!response.ok) throw new Error("site content request failed");

    return {
      document: parseSiteContentDocument(await response.json()),
      source: "remote"
    };
  } catch {
    return {
      document: fallbackDocument(),
      source: "fallback"
    };
  }
}

export function createDefaultSiteContentDocument() {
  return fallbackDocument();
}
