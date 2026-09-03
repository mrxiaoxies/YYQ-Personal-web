import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

import { authenticateAdminRequest } from "./admin-auth.ts";
import type { PublicAdminUser } from "./_shared/admin-auth-service.ts";
import {
  resolveAdminRequestOrigin,
  resolveOptionalAdminReadOrigin
} from "./_shared/admin-security.ts";
import { baseHeaders, resolvePublicSiteCorsOrigin } from "./_shared/netlify-http.ts";

type AnalyticsSummary = {
  totalVisits: number;
  totalVisitors: number;
  dayKey: string;
  todayVisits: number;
  lastVisitAt: string | null;
};

type VisitorRecord = {
  firstSeenAt: string;
  lastSeenAt: string;
};

type SessionRecord = {
  city?: string;
  country?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  page: string;
  pageViews: number;
  referrer: string;
  sessionId: string;
  userAgent: string;
  visitorId: string;
};

export type AnalyticsStore = {
  delete(key: string): Promise<void>;
  get(key: string, options: { type: "json" }): Promise<unknown>;
  list(options: { prefix: string }): Promise<{ blobs: Array<{ key: string }> }>;
  setJSON(key: string, value: Record<string, unknown>): Promise<unknown>;
};

export type AnalyticsHandlerDependencies = {
  authenticate?: (req: Request) => Promise<PublicAdminUser | null>;
  getAnalyticsStore?: () => AnalyticsStore;
};

type AnalyticsHandler = (req: Request, context: Context) => Promise<Response>;
type AnalyticsRoute = "stats" | "visit";
type PublicErrorCode =
  | "forbidden_origin"
  | "internal_error"
  | "invalid_input"
  | "method_not_allowed"
  | "not_found"
  | "unauthorized";

const STORE_NAME = "yyq-site-analytics";
const SUMMARY_KEY = "summary";
const ONLINE_WINDOW_MS = 90_000;
const MAX_RECENT_VISITORS = 12;
const VISIT_PATH = "/api/visit";
const STATS_PATH = "/api/stats";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const ALLOWED_HEADERS = "Content-Type";

const ERROR_DETAILS: Record<PublicErrorCode, { message: string; status: number }> = {
  forbidden_origin: { message: "This origin is not allowed to access analytics.", status: 403 },
  internal_error: { message: "The analytics request failed.", status: 500 },
  invalid_input: { message: "Invalid analytics request.", status: 422 },
  method_not_allowed: { message: "This method is not allowed for the analytics route.", status: 405 },
  not_found: { message: "The analytics route was not found.", status: 404 },
  unauthorized: { message: "Administrator authentication is required.", status: 401 }
};

class AnalyticsHttpError extends Error {
  readonly code: PublicErrorCode;

  constructor(code: PublicErrorCode) {
    super(code);
    this.name = "AnalyticsHttpError";
    this.code = code;
  }
}

let defaultAnalyticsStore: AnalyticsStore | undefined;

function getDefaultAnalyticsStore() {
  defaultAnalyticsStore ??= getStore({ consistency: "strong", name: STORE_NAME });
  return defaultAnalyticsStore;
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
  requestId: string | undefined
) {
  const headers = corsHeaders(corsOrigin, credentialed);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  if (requestId) headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(body), { headers, status });
}

function errorResponse(
  code: PublicErrorCode,
  corsOrigin: string | undefined,
  credentialed: boolean,
  requestId: string | undefined,
  allow?: string
) {
  const details = ERROR_DETAILS[code];
  const response = jsonResponse(
    { error: { code, message: details.message } },
    details.status,
    corsOrigin,
    credentialed,
    requestId
  );
  if (allow) response.headers.set("Allow", allow);
  return response;
}

function routeFor(req: Request): AnalyticsRoute {
  const pathname = new URL(req.url).pathname;
  if (pathname === VISIT_PATH) return "visit";
  if (pathname === STATS_PATH) return "stats";
  throw new AnalyticsHttpError("not_found");
}

function requiredMethod(route: AnalyticsRoute) {
  return route === "visit" ? "POST" : "GET";
}

function allowedMethods(route: AnalyticsRoute) {
  return `${requiredMethod(route)}, OPTIONS`;
}

function contractMethod(req: Request) {
  if (req.method !== "OPTIONS") return req.method;
  const requestedMethod = req.headers.get("Access-Control-Request-Method");
  if (!requestedMethod) throw new AnalyticsHttpError("invalid_input");
  return requestedMethod;
}

function validateRouteContract(req: Request, route: AnalyticsRoute) {
  if ([...new URL(req.url).searchParams].length !== 0) throw new AnalyticsHttpError("invalid_input");
  if (contractMethod(req) !== requiredMethod(route)) throw new AnalyticsHttpError("method_not_allowed");
}

function optionsResponse(route: AnalyticsRoute, corsOrigin: string | undefined, credentialed: boolean) {
  const headers = corsHeaders(corsOrigin, credentialed);
  headers.set("Access-Control-Allow-Methods", allowedMethods(route));
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { headers, status: 204 });
}

function cleanString(value: unknown, fallback = "", maxLength = 220) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || fallback;
}

function cleanId(value: unknown) {
  if (typeof value !== "string") return crypto.randomUUID();
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned || crypto.randomUUID();
}

function getShanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).format(date);
}

function emptySummary(): AnalyticsSummary {
  return {
    dayKey: getShanghaiDayKey(),
    lastVisitAt: null,
    todayVisits: 0,
    totalVisitors: 0,
    totalVisits: 0
  };
}

async function readSummary(store: AnalyticsStore) {
  const summary = (await store.get(SUMMARY_KEY, { type: "json" })) as AnalyticsSummary | null;
  const normalized = summary ?? emptySummary();
  const dayKey = getShanghaiDayKey();

  if (normalized.dayKey !== dayKey) {
    normalized.dayKey = dayKey;
    normalized.todayVisits = 0;
  }

  return normalized;
}

async function collectStats(store: AnalyticsStore) {
  const summary = await readSummary(store);
  const now = Date.now();
  const sessions = await store.list({ prefix: "sessions/" });
  const activeSessions: SessionRecord[] = [];

  await Promise.all(
    sessions.blobs.map(async ({ key }) => {
      const session = (await store.get(key, { type: "json" })) as SessionRecord | null;
      if (!session?.lastSeenAt) return;

      const lastSeenTime = new Date(session.lastSeenAt).getTime();
      const age = now - lastSeenTime;

      if (age <= ONLINE_WINDOW_MS) {
        activeSessions.push(session);
        return;
      }

      if (age > 24 * 60 * 60 * 1000) {
        await store.delete(key);
      }
    })
  );

  activeSessions.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  return {
    generatedAt: new Date().toISOString(),
    lastVisitAt: summary.lastVisitAt,
    onlineCount: activeSessions.length,
    onlineWindowSeconds: Math.round(ONLINE_WINDOW_MS / 1000),
    recentVisitors: activeSessions.slice(0, MAX_RECENT_VISITORS).map((session) => ({
      city: session.city ?? "",
      country: session.country ?? "",
      lastSeenAt: session.lastSeenAt,
      page: session.page,
      pageViews: session.pageViews,
      referrer: session.referrer,
      sessionId: session.sessionId.slice(0, 8),
      userAgent: session.userAgent
    })),
    todayVisits: summary.todayVisits,
    totalVisitors: summary.totalVisitors,
    totalVisits: summary.totalVisits
  };
}

function visitBody(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function handleVisit(req: Request, context: Context, store: AnalyticsStore) {
  const body = visitBody(await req.json().catch(() => ({})));
  const eventType = body.event === "heartbeat" ? "heartbeat" : "pageview";
  const now = new Date();
  const nowIso = now.toISOString();
  const visitorId = cleanId(body.visitorId);
  const sessionId = cleanId(body.sessionId);
  const visitorKey = `visitors/${visitorId}`;
  const sessionKey = `sessions/${sessionId}`;

  const existingVisitor = (await store.get(visitorKey, { type: "json" })) as VisitorRecord | null;
  const existingSession = (await store.get(sessionKey, { type: "json" })) as SessionRecord | null;
  const summary = await readSummary(store);

  if (!existingVisitor) {
    summary.totalVisitors += 1;
  }

  if (eventType === "pageview") {
    summary.totalVisits += 1;
    summary.todayVisits += 1;
    summary.lastVisitAt = nowIso;
  }

  await store.setJSON(visitorKey, {
    firstSeenAt: existingVisitor?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso
  } satisfies VisitorRecord);

  await store.setJSON(sessionKey, {
    city: cleanString(context.geo?.city, "", 80),
    country: cleanString(context.geo?.country?.name ?? context.geo?.country?.code, "", 80),
    firstSeenAt: existingSession?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    page: cleanString(body.page, "/", 180),
    pageViews: (existingSession?.pageViews ?? 0) + (eventType === "pageview" ? 1 : 0),
    referrer: cleanString(body.referrer, "direct", 220),
    sessionId,
    userAgent: cleanString(body.userAgent, "unknown", 180),
    visitorId
  } satisfies SessionRecord);

  await store.setJSON(SUMMARY_KEY, summary);
  return { ok: true };
}

async function requireAdministrator(
  req: Request,
  authenticate: (req: Request) => Promise<PublicAdminUser | null>
) {
  try {
    const user = await authenticate(req);
    if (!user) throw new AnalyticsHttpError("unauthorized");
    return user;
  } catch (error) {
    if (error instanceof AnalyticsHttpError) throw error;
    throw new AnalyticsHttpError("internal_error");
  }
}

export function createAnalyticsHandler({
  authenticate = authenticateAdminRequest,
  getAnalyticsStore = getDefaultAnalyticsStore
}: AnalyticsHandlerDependencies = {}): AnalyticsHandler {
  return async (req, context) => {
    let corsOrigin: string | undefined;
    let credentialed = false;
    let route: AnalyticsRoute | undefined;
    const requestId = typeof context.requestId === "string" ? context.requestId : undefined;

    try {
      route = routeFor(req);
      validateRouteContract(req, route);

      if (route === "visit") {
        const resolved = resolvePublicSiteCorsOrigin(req, context);
        const requestOrigin = req.headers.get("Origin");
        if (!resolved.allowed || (requestOrigin !== null && resolved.origin !== requestOrigin)) {
          throw new AnalyticsHttpError("forbidden_origin");
        }
        corsOrigin = resolved.origin;
        if (req.method === "OPTIONS") return optionsResponse(route, corsOrigin, false);

        const result = await handleVisit(req, context, getAnalyticsStore());
        return jsonResponse(result, 200, corsOrigin, false, requestId);
      }

      const resolved = req.method === "GET"
        ? resolveOptionalAdminReadOrigin(req, context)
        : resolveAdminRequestOrigin(req, context);
      if (!resolved.allowed) throw new AnalyticsHttpError("forbidden_origin");
      corsOrigin = resolved.origin;
      credentialed = true;
      if (req.method === "OPTIONS") return optionsResponse(route, corsOrigin, true);

      await requireAdministrator(req, authenticate);
      const stats = await collectStats(getAnalyticsStore());
      return jsonResponse(stats, 200, corsOrigin, true, requestId);
    } catch (error) {
      const code = error instanceof AnalyticsHttpError ? error.code : "internal_error";
      return errorResponse(
        code,
        corsOrigin,
        credentialed,
        requestId,
        code === "method_not_allowed" && route ? allowedMethods(route) : undefined
      );
    }
  };
}

const handler = createAnalyticsHandler();

export default handler;

export const config: Config = {
  method: ["GET", "POST", "OPTIONS"],
  path: [VISIT_PATH, STATS_PATH]
};
