import { getStore } from "@netlify/blobs";

declare const Netlify:
  | {
      env: {
        get(name: string): string | undefined;
      };
    }
  | undefined;

type LastSeenRecord = {
  lastSeenAt?: string;
};

const STORE_NAME = "yyq-site-analytics";
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_VISITOR_RETENTION_DAYS = 30;
const MAX_VISITOR_RETENTION_DAYS = 90;

export function getAnalyticsStore() {
  return getStore({ consistency: "strong", name: STORE_NAME });
}

export function getVisitorRetentionDays() {
  const configured = typeof Netlify !== "undefined" ? Netlify.env.get("VISITOR_RETENTION_DAYS") ?? "" : "";
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VISITOR_RETENTION_DAYS;
  return Math.min(Math.max(parsed, 1), MAX_VISITOR_RETENTION_DAYS);
}

function hasExpired(lastSeenAt: string | undefined, cutoff: number) {
  const timestamp = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
  return !Number.isFinite(timestamp) || timestamp < cutoff;
}

async function purgePrefix(store: ReturnType<typeof getAnalyticsStore>, prefix: string, cutoff: number) {
  const { blobs } = await store.list({ prefix });
  const results = await Promise.all(
    blobs.map(async ({ key }) => {
      try {
        const record = (await store.get(key, { type: "json" })) as LastSeenRecord | null;
        if (!record || !hasExpired(record.lastSeenAt, cutoff)) return false;
        await store.delete(key);
        return true;
      } catch {
        return false;
      }
    })
  );

  return results.filter(Boolean).length;
}

export async function purgeExpiredAnalytics() {
  const now = Date.now();
  const retentionDays = getVisitorRetentionDays();
  const store = getAnalyticsStore();
  const [expiredSessions, expiredVisitors] = await Promise.all([
    purgePrefix(store, "sessions/", now - SESSION_RETENTION_MS),
    purgePrefix(store, "visitors/", now - retentionDays * 24 * 60 * 60 * 1_000)
  ]);

  return { expiredSessions, expiredVisitors, retentionDays };
}
