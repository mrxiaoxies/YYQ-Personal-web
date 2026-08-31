import type { Config, Context } from "@netlify/functions";

import { parseSiteContentUpdate } from "../../shared/site-content-schema.ts";
import { authenticateAdminRequest } from "./admin-auth.ts";
import type { PublicAdminUser } from "./_shared/admin-auth-service.ts";
import { readBoundedJson, resolveAdminRequestOrigin } from "./_shared/admin-security.ts";
import { baseHeaders, resolveCorsOrigin } from "./_shared/netlify-http.ts";
import {
  createBlobSiteContentStore,
  SiteContentStoreError,
  type SiteContentStore
} from "./_shared/site-content-store.ts";

export type SiteContentHandlerDependencies = {
  authenticate?: (req: Request) => Promise<PublicAdminUser | null>;
  contentStore?: SiteContentStore;
};

type SiteContentHandler = (req: Request, context: Context) => Promise<Response>;
type Route = "admin-content" | "admin-revisions" | "public-content";
type PublicErrorCode =
  | "body_too_large"
  | "content_conflict"
  | "forbidden_origin"
  | "internal_error"
  | "invalid_input"
  | "method_not_allowed"
  | "not_found"
  | "service_unavailable"
  | "unauthorized"
  | "unsupported_media_type";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const ALLOWED_HEADERS = "Content-Type";
const PUBLIC_CONTENT_PATH = "/api/site-content";
const ADMIN_CONTENT_PATH = "/api/admin/content";
const ADMIN_REVISIONS_PATH = "/api/admin/revisions";

const ERROR_DETAILS: Record<PublicErrorCode, { message: string; status: number }> = {
  body_too_large: { message: "The JSON request body is too large.", status: 413 },
  content_conflict: { message: "Site content changed before this request could be published.", status: 409 },
  forbidden_origin: { message: "This origin is not allowed to access site content.", status: 403 },
  internal_error: { message: "The site content request failed.", status: 500 },
  invalid_input: { message: "Invalid site content request.", status: 422 },
  method_not_allowed: { message: "This method is not allowed for the site content route.", status: 405 },
  not_found: { message: "The site content route was not found.", status: 404 },
  service_unavailable: { message: "Site content storage is temporarily unavailable.", status: 503 },
  unauthorized: { message: "Administrator authentication is required.", status: 401 },
  unsupported_media_type: { message: "Site content requests must use application/json.", status: 415 }
};

class SiteContentHttpError extends Error {
  readonly code: PublicErrorCode;

  constructor(code: PublicErrorCode) {
    super(code);
    this.name = "SiteContentHttpError";
    this.code = code;
  }
}

let defaultContentStore: SiteContentStore | undefined;

function getDefaultContentStore() {
  defaultContentStore ??= createBlobSiteContentStore();
  return defaultContentStore;
}

function requestId(context: Context) {
  return typeof context.requestId === "string" ? context.requestId : undefined;
}

function routeFor(req: Request): Route {
  const path = new URL(req.url).pathname;
  if (path === PUBLIC_CONTENT_PATH) return "public-content";
  if (path === ADMIN_CONTENT_PATH) return "admin-content";
  if (path === ADMIN_REVISIONS_PATH) return "admin-revisions";
  throw new SiteContentHttpError("not_found");
}

function corsHeaders(corsOrigin: string | undefined, credentialed: boolean) {
  const headers = baseHeaders(corsOrigin);
  if (credentialed && corsOrigin) headers.set("Access-Control-Allow-Credentials", "true");
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  corsOrigin: string | undefined,
  credentialed: boolean,
  id: string | undefined
) {
  const headers = corsHeaders(corsOrigin, credentialed);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  if (id) headers.set("X-Request-Id", id);
  return new Response(JSON.stringify(body), { headers, status });
}

function errorResponse(
  code: PublicErrorCode,
  corsOrigin: string | undefined,
  credentialed: boolean,
  id: string | undefined,
  allow?: string
) {
  const details = ERROR_DETAILS[code];
  const response = jsonResponse(
    { error: { code, message: details.message } },
    details.status,
    corsOrigin,
    credentialed,
    id
  );
  if (allow) response.headers.set("Allow", allow);
  return response;
}

function allowedMethods(route: Route) {
  if (route === "public-content") return "GET, OPTIONS";
  if (route === "admin-content") return "PUT, POST, OPTIONS";
  return "GET, OPTIONS";
}

function optionsResponse(route: Route, corsOrigin: string | undefined, credentialed: boolean) {
  const headers = corsHeaders(corsOrigin, credentialed);
  headers.set("Access-Control-Allow-Methods", allowedMethods(route));
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { headers, status: 204 });
}

function hasJsonContentType(req: Request) {
  const contentType = req.headers.get("Content-Type");
  if (!contentType) return false;
  const [mediaType] = contentType.split(";", 1);
  return mediaType.trim().toLowerCase() === "application/json";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictObject(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw new SiteContentHttpError("invalid_input");
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SiteContentHttpError("invalid_input");
  }
  return value;
}

function requiredString(value: unknown, maxLength = 200) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new SiteContentHttpError("invalid_input");
  }
  return value;
}

async function readStrictJson(req: Request) {
  if (!hasJsonContentType(req)) throw new SiteContentHttpError("unsupported_media_type");
  try {
    return await readBoundedJson(req);
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) {
      throw new SiteContentHttpError("body_too_large");
    }
    throw new SiteContentHttpError("invalid_input");
  }
}

async function readContentUpdate(req: Request) {
  const value = await readStrictJson(req);
  try {
    return parseSiteContentUpdate(value);
  } catch {
    throw new SiteContentHttpError("invalid_input");
  }
}

async function readRestoreInput(req: Request) {
  const body = strictObject(await readStrictJson(req), ["expectedVersion", "revisionId"]);
  return {
    expectedVersion: requiredString(body.expectedVersion),
    revisionId: requiredString(body.revisionId)
  };
}

function requireNoAction(req: Request) {
  if (new URL(req.url).searchParams.getAll("action").length !== 0) {
    throw new SiteContentHttpError("invalid_input");
  }
}

function requireRestoreAction(req: Request) {
  const actions = new URL(req.url).searchParams.getAll("action");
  if (actions.length !== 1 || actions[0] === "") throw new SiteContentHttpError("invalid_input");
  if (actions[0] !== "restore") throw new SiteContentHttpError("not_found");
}

function validateRouteContract(req: Request, route: Route) {
  if (route === "public-content") {
    requireNoAction(req);
    if (req.method !== "GET" && req.method !== "OPTIONS") throw new SiteContentHttpError("method_not_allowed");
    return;
  }
  if (route === "admin-revisions") {
    requireNoAction(req);
    if (req.method !== "GET" && req.method !== "OPTIONS") throw new SiteContentHttpError("method_not_allowed");
    return;
  }
  if (req.method === "POST") requireRestoreAction(req);
  else requireNoAction(req);
  if (req.method !== "PUT" && req.method !== "POST" && req.method !== "OPTIONS") {
    throw new SiteContentHttpError("method_not_allowed");
  }
}

async function authenticate(
  req: Request,
  authenticateRequest: (req: Request) => Promise<PublicAdminUser | null>
) {
  try {
    const actor = await authenticateRequest(req);
    if (!actor) throw new SiteContentHttpError("unauthorized");
    return actor;
  } catch (error) {
    if (error instanceof SiteContentHttpError) throw error;
    throw new SiteContentHttpError("internal_error");
  }
}

async function callStore<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SiteContentStoreError) {
      if (error.code === "content_conflict") throw new SiteContentHttpError("content_conflict");
      throw new SiteContentHttpError("invalid_input");
    }
    throw new SiteContentHttpError("service_unavailable");
  }
}

export function createSiteContentHandler({
  authenticate: authenticateRequest = authenticateAdminRequest,
  contentStore
}: SiteContentHandlerDependencies = {}): SiteContentHandler {
  return async (req, context) => {
    let corsOrigin: string | undefined;
    let credentialed = false;
    let route: Route | undefined;
    const id = requestId(context);

    try {
      route = routeFor(req);
      validateRouteContract(req, route);

      if (route === "public-content") {
        const resolved = resolveCorsOrigin(req, context);
        if (!resolved.allowed) throw new SiteContentHttpError("forbidden_origin");
        corsOrigin = resolved.origin;
        if (req.method === "OPTIONS") return optionsResponse(route, corsOrigin, false);
        const store = contentStore ?? getDefaultContentStore();
        const document = await callStore(() => store.getCurrent());
        return jsonResponse(document, 200, corsOrigin, false, id);
      }

      const resolved = resolveAdminRequestOrigin(req, context);
      if (!resolved.allowed) throw new SiteContentHttpError("forbidden_origin");
      corsOrigin = resolved.origin;
      credentialed = true;
      if (req.method === "OPTIONS") return optionsResponse(route, corsOrigin, true);

      const actor = await authenticate(req, authenticateRequest);
      const store = contentStore ?? getDefaultContentStore();
      if (route === "admin-revisions") {
        const revisions = await callStore(() => store.listRevisions());
        return jsonResponse(revisions, 200, corsOrigin, true, id);
      }
      if (req.method === "PUT") {
        const update = await readContentUpdate(req);
        const result = await callStore(() => store.save(update, actor));
        return jsonResponse(result.document, 200, corsOrigin, true, id);
      }
      const input = await readRestoreInput(req);
      const document = await callStore(() => store.restore(input.revisionId, input.expectedVersion, actor));
      return jsonResponse(document, 200, corsOrigin, true, id);
    } catch (error) {
      const code = error instanceof SiteContentHttpError ? error.code : "internal_error";
      return errorResponse(
        code,
        corsOrigin,
        credentialed,
        id,
        code === "method_not_allowed" && route ? allowedMethods(route) : undefined
      );
    }
  };
}

const handler = createSiteContentHandler();

export default handler;

export const config: Config = {
  method: ["GET", "PUT", "POST", "OPTIONS"],
  path: [PUBLIC_CONTENT_PATH, ADMIN_CONTENT_PATH, ADMIN_REVISIONS_PATH]
};
