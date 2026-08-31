import {
  parseSiteContentDocument,
  type SiteContentDocument,
  type SiteContentUpdate
} from "../../shared/site-content-schema.ts";

export type PublicAdminUser = { id: string; email: string; role: "admin" };
export type LoginInput = { email: string; password: string };
export type SetupInput = { email: string; password: string; setupToken: string };
export type RecoverInput = { email: string; password: string; recoveryToken: string };

export type RecentVisitor = {
  city?: string;
  country?: string;
  lastSeenAt: string;
  page: string;
  pageViews: number;
  referrer: string;
  sessionId: string;
  userAgent: string;
};

export type AnalyticsStats = {
  generatedAt: string;
  lastVisitAt: string | null;
  onlineCount: number;
  onlineWindowSeconds: number;
  recentVisitors: RecentVisitor[];
  todayVisits: number;
  totalVisitors: number;
  totalVisits: number;
};

export type RevisionSummary = {
  id: string;
  createdAt: string;
  actorEmail: string;
  sourceVersion: string;
  reason: "save" | "restore";
};

export type RestoreRevisionInput = {
  revisionId: string;
  expectedVersion: string;
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type AdminLocation = Pick<Location, "hostname" | "origin">;

export type AdminApiOptions = {
  configuredUrl?: string;
  fetch?: FetchImplementation;
  location?: AdminLocation;
};

type JsonRecord = Record<string, unknown>;

const NETLIFY_ADMIN_SITE = "https://yyq-web.netlify.app";
const INVALID_JSON = Symbol("invalid-json");
const INVALID_RESPONSE_MESSAGE = "The administrator API returned an invalid response.";
const REQUEST_FAILED_MESSAGE = "The administrator API request failed.";

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

function configuredAdminSiteUrl() {
  return import.meta.env?.VITE_ADMIN_SITE_URL ?? "";
}

function normalizeAdminSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function resolveAdminSiteUrl(
  location: Pick<AdminLocation, "hostname">,
  configuredUrl = configuredAdminSiteUrl()
): string {
  const explicitUrl = normalizeAdminSiteUrl(configuredUrl);
  if (explicitUrl) return explicitUrl;
  if (location.hostname.toLowerCase().endsWith(".github.io")) return NETLIFY_ADMIN_SITE;
  return "";
}

export function isAdminHostedHere(
  location: AdminLocation,
  configuredUrl = configuredAdminSiteUrl()
): boolean {
  const adminSiteUrl = resolveAdminSiteUrl(location, configuredUrl);
  if (!adminSiteUrl) return true;

  try {
    return new URL(adminSiteUrl).origin === location.origin;
  } catch {
    return false;
  }
}

function browserFetch(): FetchImplementation {
  if (typeof window !== "undefined") return window.fetch.bind(window);
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  throw new AdminApiError("missing_environment", 0, REQUEST_FAILED_MESSAGE);
}

function browserLocation(): AdminLocation {
  if (typeof window !== "undefined") return window.location;
  throw new AdminApiError("missing_environment", 0, REQUEST_FAILED_MESSAGE);
}

function requestDependencies(options: AdminApiOptions) {
  const location = options.location ?? browserLocation();
  return {
    baseUrl: resolveAdminSiteUrl(location, options.configuredUrl ?? configuredAdminSiteUrl()),
    fetch: options.fetch ?? browserFetch()
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: JsonRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function nonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalidResponse();
  return value;
}

function invalidResponse() {
  return new AdminApiError("invalid_response", 0, INVALID_RESPONSE_MESSAGE);
}

function parseNormalizedError(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["error"]) || !isRecord(value.error)) return null;
  if (!hasExactKeys(value.error, ["code", "message"])) return null;
  if (typeof value.error.code !== "string" || value.error.code.length === 0) return null;
  if (typeof value.error.message !== "string" || value.error.message.length === 0) return null;
  return { code: value.error.code, message: value.error.message };
}

async function requestJson(path: string, init: RequestInit, options: AdminApiOptions): Promise<unknown> {
  const dependencies = requestDependencies(options);
  let response: Response;

  try {
    response = await dependencies.fetch(`${dependencies.baseUrl}${path}`, init);
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError("network_error", 0, REQUEST_FAILED_MESSAGE);
  }

  const body = await response.json().catch(() => INVALID_JSON);
  if (!response.ok) {
    const normalized = parseNormalizedError(body);
    if (normalized) throw new AdminApiError(normalized.code, response.status, normalized.message);
    throw new AdminApiError("request_failed", response.status, REQUEST_FAILED_MESSAGE);
  }
  if (body === INVALID_JSON) throw invalidResponse();
  return body;
}

function getRequest(): RequestInit {
  return {
    credentials: "include",
    headers: { Accept: "application/json" },
    method: "GET"
  };
}

function mutationRequest(body: JsonRecord, method = "POST"): RequestInit {
  return {
    body: JSON.stringify(body),
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method
  };
}

function parsePublicAdminUser(value: unknown): PublicAdminUser {
  if (!isRecord(value) || !hasExactKeys(value, ["email", "id", "role"])) throw invalidResponse();
  if (value.role !== "admin") throw invalidResponse();
  return {
    email: requiredString(value.email),
    id: requiredString(value.id),
    role: "admin"
  };
}

function parseUserEnvelope(value: unknown): PublicAdminUser {
  if (!isRecord(value) || !hasExactKeys(value, ["user"])) throw invalidResponse();
  return parsePublicAdminUser(value.user);
}

function parseLogoutResponse(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["ok"]) || value.ok !== true) throw invalidResponse();
}

function parseRecentVisitor(value: unknown): RecentVisitor {
  if (!isRecord(value)) throw invalidResponse();
  const requiredKeys = ["lastSeenAt", "page", "pageViews", "referrer", "sessionId", "userAgent"];
  const optionalKeys = ["city", "country"];
  const actualKeys = Object.keys(value);
  if (
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key))
  ) {
    throw invalidResponse();
  }
  if (value.city !== undefined && typeof value.city !== "string") throw invalidResponse();
  if (value.country !== undefined && typeof value.country !== "string") throw invalidResponse();

  return {
    ...(value.city === undefined ? {} : { city: value.city }),
    ...(value.country === undefined ? {} : { country: value.country }),
    lastSeenAt: requiredString(value.lastSeenAt),
    page: requiredString(value.page),
    pageViews: nonNegativeNumber(value.pageViews),
    referrer: requiredString(value.referrer),
    sessionId: requiredString(value.sessionId),
    userAgent: requiredString(value.userAgent)
  };
}

function parseAnalyticsStats(value: unknown): AnalyticsStats {
  const keys = [
    "generatedAt",
    "lastVisitAt",
    "onlineCount",
    "onlineWindowSeconds",
    "recentVisitors",
    "todayVisits",
    "totalVisitors",
    "totalVisits"
  ];
  if (!isRecord(value) || !hasExactKeys(value, keys) || !Array.isArray(value.recentVisitors)) {
    throw invalidResponse();
  }
  if (value.lastVisitAt !== null && typeof value.lastVisitAt !== "string") throw invalidResponse();

  return {
    generatedAt: requiredString(value.generatedAt),
    lastVisitAt: value.lastVisitAt,
    onlineCount: nonNegativeNumber(value.onlineCount),
    onlineWindowSeconds: nonNegativeNumber(value.onlineWindowSeconds),
    recentVisitors: value.recentVisitors.map(parseRecentVisitor),
    todayVisits: nonNegativeNumber(value.todayVisits),
    totalVisitors: nonNegativeNumber(value.totalVisitors),
    totalVisits: nonNegativeNumber(value.totalVisits)
  };
}

function parseRevisionSummary(value: unknown): RevisionSummary {
  if (!isRecord(value) || !hasExactKeys(value, ["actorEmail", "createdAt", "id", "reason", "sourceVersion"])) {
    throw invalidResponse();
  }
  if (value.reason !== "save" && value.reason !== "restore") throw invalidResponse();
  return {
    actorEmail: requiredString(value.actorEmail),
    createdAt: requiredString(value.createdAt),
    id: requiredString(value.id),
    reason: value.reason,
    sourceVersion: requiredString(value.sourceVersion)
  };
}

function parseRevisions(value: unknown): RevisionSummary[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(parseRevisionSummary);
}

function parseDocument(value: unknown): SiteContentDocument {
  try {
    return parseSiteContentDocument(value);
  } catch {
    throw invalidResponse();
  }
}

export async function getCurrentAdmin(options: AdminApiOptions = {}): Promise<PublicAdminUser> {
  return parseUserEnvelope(await requestJson("/api/admin/auth?action=me", getRequest(), options));
}

export async function loginAdmin(input: LoginInput, options: AdminApiOptions = {}): Promise<PublicAdminUser> {
  return parseUserEnvelope(await requestJson(
    "/api/admin/auth?action=login",
    mutationRequest({ email: input.email, password: input.password }),
    options
  ));
}

export async function setupAdmin(input: SetupInput, options: AdminApiOptions = {}): Promise<PublicAdminUser> {
  return parseUserEnvelope(await requestJson(
    "/api/admin/auth?action=setup",
    mutationRequest({ email: input.email, password: input.password, setupToken: input.setupToken }),
    options
  ));
}

export async function recoverAdmin(input: RecoverInput, options: AdminApiOptions = {}): Promise<void> {
  parseUserEnvelope(await requestJson(
    "/api/admin/auth?action=recover",
    mutationRequest({ email: input.email, newPassword: input.password, recoveryToken: input.recoveryToken }),
    options
  ));
}

export async function logoutAdmin(options: AdminApiOptions = {}): Promise<void> {
  parseLogoutResponse(await requestJson(
    "/api/admin/auth?action=logout",
    mutationRequest({}),
    options
  ));
}

export async function loadAdminStats(options: AdminApiOptions = {}): Promise<AnalyticsStats> {
  return parseAnalyticsStats(await requestJson("/api/stats", getRequest(), options));
}

export async function saveContent(
  update: SiteContentUpdate,
  options: AdminApiOptions = {}
): Promise<SiteContentDocument> {
  const body = { expectedVersion: update.expectedVersion, sections: update.sections };
  return parseDocument(await requestJson("/api/admin/content", mutationRequest(body, "PUT"), options));
}

export async function loadRevisions(options: AdminApiOptions = {}): Promise<RevisionSummary[]> {
  return parseRevisions(await requestJson("/api/admin/revisions", getRequest(), options));
}

export async function restoreRevision(
  input: RestoreRevisionInput,
  options: AdminApiOptions = {}
): Promise<SiteContentDocument> {
  const body = { expectedVersion: input.expectedVersion, revisionId: input.revisionId };
  return parseDocument(await requestJson(
    "/api/admin/content?action=restore",
    mutationRequest(body),
    options
  ));
}
