import { getStore } from "@netlify/blobs";

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

const STORE_NAME = "yyq-site-analytics";
const SUMMARY_KEY = "summary";
const ONLINE_WINDOW_MS = 90_000;
const MAX_RECENT_VISITORS = 12;

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
};

function getAdminToken() {
  return typeof Netlify !== "undefined" ? Netlify.env.get("VISITOR_ADMIN_TOKEN") ?? "" : "";
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers ?? {})
    }
  });
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

async function readSummary(store: ReturnType<typeof getStore>) {
  const summary = (await store.get(SUMMARY_KEY, { type: "json" })) as AnalyticsSummary | null;
  const normalized = summary ?? emptySummary();
  const dayKey = getShanghaiDayKey();

  if (normalized.dayKey !== dayKey) {
    normalized.dayKey = dayKey;
    normalized.todayVisits = 0;
  }

  return normalized;
}

async function collectStats(store: ReturnType<typeof getStore>) {
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

async function handleVisit(req: Request, context: { geo?: any }) {
  const store = getStore({ consistency: "strong", name: STORE_NAME });
  const body = await req.json().catch(() => ({}));
  const eventType = body?.event === "heartbeat" ? "heartbeat" : "pageview";
  const now = new Date();
  const nowIso = now.toISOString();
  const visitorId = cleanId(body?.visitorId);
  const sessionId = cleanId(body?.sessionId);
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
    page: cleanString(body?.page, "/", 180),
    pageViews: (existingSession?.pageViews ?? 0) + (eventType === "pageview" ? 1 : 0),
    referrer: cleanString(body?.referrer, "direct", 220),
    sessionId,
    userAgent: cleanString(body?.userAgent, "unknown", 180),
    visitorId
  } satisfies SessionRecord);

  await store.setJSON(SUMMARY_KEY, summary);

  return jsonResponse({ ok: true });
}

async function handleStats(req: Request) {
  const adminToken = getAdminToken();
  const submittedToken = req.headers.get("x-admin-token") ?? "";

  if (adminToken && submittedToken !== adminToken) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getStore({ consistency: "strong", name: STORE_NAME });
  const stats = await collectStats(store);
  return jsonResponse(stats);
}

export default async (req: Request, context: { geo?: any }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const pathname = new URL(req.url).pathname;

  if (pathname === "/api/visit" && req.method === "POST") {
    return handleVisit(req, context);
  }

  if (pathname === "/api/stats" && req.method === "GET") {
    return handleStats(req);
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
};

export const config = {
  method: ["GET", "POST", "OPTIONS"],
  path: ["/api/visit", "/api/stats"]
};
