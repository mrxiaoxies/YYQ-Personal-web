import { getAnalyticsStore } from "./_shared/analytics-store";

declare const Netlify:
  | {
      env: {
        get(name: string): string | undefined;
      };
    }
  | undefined;

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

type AnalyticsContext = {
  geo?: {
    city?: string;
    country?: {
      code?: string;
      name?: string;
    };
  };
};

const SUMMARY_KEY = "summary";
const ONLINE_WINDOW_MS = 90_000;
const MAX_RECENT_VISITORS = 12;
const MAX_VISIT_BODY_BYTES = 2_048;

function getAdminToken() {
  return typeof Netlify !== "undefined" ? Netlify.env.get("VISITOR_ADMIN_TOKEN") ?? "" : "";
}

function normalizeOrigin(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    const origin = parsed.origin;
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins() {
  const configured = typeof Netlify !== "undefined" ? Netlify.env.get("VISITOR_ALLOWED_ORIGINS") ?? "" : "";
  return new Set(
    configured
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean)
  );
}

function getAllowedRequestOrigin(req: Request) {
  const origin = normalizeOrigin(req.headers.get("origin") ?? "");
  return origin && getAllowedOrigins().has(origin) ? origin : "";
}

function responseHeaders(req: Request) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin"
  });
  const allowedOrigin = getAllowedRequestOrigin(req);

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Max-Age", "600");
  }

  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: responseHeaders(req),
    status
  });
}

function cleanString(value: unknown, fallback = "", maxLength = 220) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || fallback;
}

function cleanClientId(value: unknown, prefix: "session" | "visitor") {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 88);
  return new RegExp(`^${prefix}-[a-zA-Z0-9_-]{12,80}$`).test(cleaned) ? cleaned : "";
}

function cleanReferrer(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "direct";
  return normalizeOrigin(value) || "direct";
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

async function readSummary(store: ReturnType<typeof getAnalyticsStore>) {
  const summary = (await store.get(SUMMARY_KEY, { type: "json" })) as AnalyticsSummary | null;
  const normalized = summary ?? emptySummary();
  const dayKey = getShanghaiDayKey();

  if (normalized.dayKey !== dayKey) {
    normalized.dayKey = dayKey;
    normalized.todayVisits = 0;
  }

  return normalized;
}

async function collectStats(store: ReturnType<typeof getAnalyticsStore>) {
  const summary = await readSummary(store);
  const now = Date.now();
  const sessions = await store.list({ prefix: "sessions/" });
  const activeSessions: SessionRecord[] = [];

  await Promise.all(
    sessions.blobs.map(async ({ key }) => {
      const session = (await store.get(key, { type: "json" })) as SessionRecord | null;
      if (!session?.lastSeenAt) return;

      const age = now - new Date(session.lastSeenAt).getTime();
      if (Number.isFinite(age) && age <= ONLINE_WINDOW_MS) activeSessions.push(session);
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

async function readVisitBody(req: Request) {
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VISIT_BODY_BYTES) return null;

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_VISIT_BODY_BYTES) return null;

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleVisit(req: Request, context: AnalyticsContext) {
  if (!getAllowedRequestOrigin(req)) return jsonResponse(req, { error: "Forbidden" }, 403);

  const body = await readVisitBody(req);
  const visitorId = cleanClientId(body?.visitorId, "visitor");
  const sessionId = cleanClientId(body?.sessionId, "session");
  if (!body || !visitorId || !sessionId) return jsonResponse(req, { error: "Invalid request" }, 400);

  const store = getAnalyticsStore();
  const eventType = body.event === "heartbeat" ? "heartbeat" : "pageview";
  const now = new Date();
  const nowIso = now.toISOString();
  const visitorKey = `visitors/${visitorId}`;
  const sessionKey = `sessions/${sessionId}`;

  const existingVisitor = (await store.get(visitorKey, { type: "json" })) as VisitorRecord | null;
  const existingSession = (await store.get(sessionKey, { type: "json" })) as SessionRecord | null;
  const summary = await readSummary(store);

  if (!existingVisitor) summary.totalVisitors += 1;

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
    referrer: cleanReferrer(body.referrer),
    sessionId,
    userAgent: cleanString(body.userAgent, "unknown", 180),
    visitorId
  } satisfies SessionRecord);

  await store.setJSON(SUMMARY_KEY, summary);

  return jsonResponse(req, { ok: true });
}

async function handleStats(req: Request) {
  const adminToken = getAdminToken();
  const submittedToken = req.headers.get("x-admin-token") ?? "";

  if (!adminToken) return jsonResponse(req, { error: "Analytics dashboard is disabled" }, 503);
  if (!submittedToken || submittedToken !== adminToken) return jsonResponse(req, { error: "Unauthorized" }, 401);
  if (req.headers.has("origin") && !getAllowedRequestOrigin(req)) return jsonResponse(req, { error: "Forbidden" }, 403);

  const stats = await collectStats(getAnalyticsStore());
  return jsonResponse(req, stats);
}

export default async (req: Request, context: AnalyticsContext) => {
  const pathname = new URL(req.url).pathname;

  if (req.method === "OPTIONS") {
    if ((pathname !== "/api/visit" && pathname !== "/api/stats") || !getAllowedRequestOrigin(req)) {
      return jsonResponse(req, { error: "Forbidden" }, 403);
    }

    return new Response(null, { headers: responseHeaders(req), status: 204 });
  }

  if (pathname === "/api/visit" && req.method === "POST") return handleVisit(req, context);
  if (pathname === "/api/stats" && req.method === "GET") return handleStats(req);

  return jsonResponse(req, { error: "Method not allowed" }, 405);
};

export const config = {
  method: ["GET", "POST", "OPTIONS"],
  path: ["/api/visit", "/api/stats"],
  rateLimit: {
    aggregateBy: ["ip", "domain"],
    windowLimit: 30,
    windowSize: 60
  }
};
