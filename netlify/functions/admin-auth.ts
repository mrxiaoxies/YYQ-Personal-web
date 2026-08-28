import type { Config, Context } from "@netlify/functions";

import {
  AdminAuthError,
  createAdminAuthService,
  type AdminAuthService,
  type PublicAdminUser
} from "./_shared/admin-auth-service.ts";
import {
  clearSessionCookie,
  readBoundedJson,
  readSessionCookie,
  resolveAdminRequestOrigin,
  sessionCookie
} from "./_shared/admin-security.ts";

export type AdminAuthHandlerDependencies = {
  service?: AdminAuthService;
  now?: () => Date;
};

type AdminAuthHandler = (req: Request, context: Context) => Promise<Response>;

type PublicErrorCode =
  | "body_too_large"
  | "forbidden_origin"
  | "internal_error"
  | "invalid_credentials"
  | "invalid_input"
  | "method_not_allowed"
  | "missing_configuration"
  | "not_found"
  | "rate_limited"
  | "setup_closed"
  | "token_consumed"
  | "unauthorized"
  | "unsupported_media_type";

type ErrorDetails = {
  message: string;
  status: number;
};

type JsonRecord = Record<string, unknown>;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";
const POST_ACTIONS = new Set(["login", "logout", "recover", "setup"]);
const ALL_ACTIONS = new Set(["login", "logout", "me", "recover", "setup"]);

const ERROR_DETAILS: Record<PublicErrorCode, ErrorDetails> = {
  body_too_large: { message: "The JSON request body is too large.", status: 413 },
  forbidden_origin: { message: "This origin is not allowed to manage the administrator session.", status: 403 },
  internal_error: { message: "Administrator authentication failed.", status: 500 },
  invalid_credentials: { message: "Invalid administrator credentials.", status: 401 },
  invalid_input: { message: "Invalid administrator request.", status: 422 },
  method_not_allowed: { message: "This administrator authentication method is not allowed.", status: 405 },
  missing_configuration: { message: "Administrator authentication is not configured.", status: 503 },
  not_found: { message: "Administrator authentication action was not found.", status: 404 },
  rate_limited: { message: "Too many login attempts.", status: 429 },
  setup_closed: { message: "Administrator setup is closed.", status: 409 },
  token_consumed: { message: "This recovery token has already been used.", status: 409 },
  unauthorized: { message: "Administrator authentication is required.", status: 401 },
  unsupported_media_type: { message: "Administrator requests must use application/json.", status: 415 }
};

let defaultService: AdminAuthService | undefined;

function getDefaultService() {
  defaultService ??= createAdminAuthService();
  return defaultService;
}

function corsHeaders(corsOrigin: string | undefined) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin"
  });

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return headers;
}

function jsonResponse(body: unknown, status: number, corsOrigin: string | undefined, requestId: string | undefined) {
  const headers = corsHeaders(corsOrigin);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  if (requestId) headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(body), { headers, status });
}

function errorResponse(
  code: PublicErrorCode,
  corsOrigin: string | undefined,
  requestId: string | undefined,
  statusOverride?: number
) {
  const details = ERROR_DETAILS[code];
  return jsonResponse(
    { error: { code, message: details.message } },
    statusOverride ?? details.status,
    corsOrigin,
    requestId
  );
}

function okResponse(body: unknown, corsOrigin: string | undefined, requestId: string | undefined, setCookie?: string) {
  const response = jsonResponse(body, 200, corsOrigin, requestId);
  if (setCookie) response.headers.set("Set-Cookie", setCookie);
  return response;
}

function optionsResponse(req: Request, context: Context) {
  const origin = req.headers.get("Origin");
  if (origin) {
    const resolved = resolveAdminRequestOrigin(req, context);
    if (!resolved.allowed) return errorResponse("forbidden_origin", undefined, context.requestId);

    const headers = corsHeaders(resolved.origin);
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    headers.set("Access-Control-Max-Age", "600");
    return new Response(null, { headers, status: 204 });
  }

  const headers = corsHeaders(undefined);
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { headers, status: 204 });
}

function optionalCorsOrigin(req: Request, context: Context) {
  if (!req.headers.get("Origin")) return { allowed: true, origin: undefined };
  return resolveAdminRequestOrigin(req, context);
}

function requireWriteOrigin(req: Request, context: Context) {
  const resolved = resolveAdminRequestOrigin(req, context);
  if (!resolved.allowed) throw new HttpAuthError("forbidden_origin");
  return resolved.origin;
}

function requestId(context: Context) {
  return typeof context.requestId === "string" ? context.requestId : undefined;
}

function strictAction(req: Request) {
  const actions = new URL(req.url).searchParams.getAll("action");
  if (actions.length !== 1 || actions[0] === "") throw new HttpAuthError("invalid_input");
  const [action] = actions;
  if (!ALL_ACTIONS.has(action)) throw new HttpAuthError("not_found");
  return action;
}

function hasJsonContentType(req: Request) {
  const contentType = req.headers.get("Content-Type");
  if (!contentType) return false;
  const [mediaType] = contentType.split(";", 1);
  return mediaType.trim().toLowerCase() === "application/json";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictObject(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw new HttpAuthError("invalid_input");
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new HttpAuthError("invalid_input");
  }
  return value;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) throw new HttpAuthError("invalid_input");
  return value;
}

function normalizeEmailForRateLimit(value: string) {
  return value.trim().toLowerCase();
}

function trustedClientIp(context: Context) {
  const ip = (context as Context & { ip?: unknown }).ip;
  return typeof ip === "string" && ip.trim().length > 0 ? ip.trim() : "unknown";
}

function rateLimitKey(email: string, context: Context) {
  return `${normalizeEmailForRateLimit(email)}|${trustedClientIp(context)}`;
}

async function readStrictJson(req: Request) {
  if (!hasJsonContentType(req)) throw new HttpAuthError("unsupported_media_type");

  try {
    return await readBoundedJson(req);
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) throw new HttpAuthError("body_too_large");
    throw new HttpAuthError("invalid_input");
  }
}

async function readSetupInput(req: Request) {
  const body = strictObject(await readStrictJson(req), ["email", "password", "setupToken"]);
  return {
    email: requiredString(body.email),
    password: requiredString(body.password),
    setupToken: requiredString(body.setupToken)
  };
}

async function readLoginInput(req: Request, context: Context) {
  const body = strictObject(await readStrictJson(req), ["email", "password"]);
  const email = normalizeEmailForRateLimit(requiredString(body.email));
  return {
    email,
    password: requiredString(body.password),
    rateLimitKey: rateLimitKey(email, context)
  };
}

async function readRecoverInput(req: Request) {
  const body = strictObject(await readStrictJson(req), ["email", "newPassword", "recoveryToken"]);
  return {
    email: requiredString(body.email),
    newPassword: requiredString(body.newPassword),
    recoveryToken: requiredString(body.recoveryToken)
  };
}

async function readLogoutInput(req: Request) {
  strictObject(await readStrictJson(req), []);
}

function mapServiceError(error: AdminAuthError): PublicErrorCode {
  switch (error.code) {
    case "invalid_credentials":
    case "invalid_recovery_token":
    case "invalid_setup_token":
      return "invalid_credentials";
    case "invalid_input":
      return "invalid_input";
    case "rate_limited":
      return "rate_limited";
    case "setup_closed":
      return "setup_closed";
    case "setup_unavailable":
      return "missing_configuration";
    case "token_consumed":
      return "token_consumed";
  }
}

class HttpAuthError extends Error {
  readonly code: PublicErrorCode;

  constructor(code: PublicErrorCode) {
    super(code);
    this.name = "HttpAuthError";
    this.code = code;
  }
}

function publicUserBody(user: PublicAdminUser) {
  return { user: { email: user.email, id: user.id, role: user.role } };
}

async function handleGetMe(req: Request, service: AdminAuthService, corsOrigin: string | undefined, id: string | undefined) {
  const user = await service.authenticate(readSessionCookie(req));
  if (!user) return errorResponse("unauthorized", corsOrigin, id);
  return okResponse(publicUserBody(user), corsOrigin, id);
}

export function createAdminAuthHandler({ service }: AdminAuthHandlerDependencies = {}): AdminAuthHandler {
  return async (req, context) => {
    let corsOrigin: string | undefined;
    const id = requestId(context);

    try {
      const authService = service ?? getDefaultService();
      if (req.method === "OPTIONS") return optionsResponse(req, context);

      const action = strictAction(req);
      if (req.method === "GET") {
        if (action !== "me") throw new HttpAuthError("method_not_allowed");
        const resolved = optionalCorsOrigin(req, context);
        if (!resolved.allowed) throw new HttpAuthError("forbidden_origin");
        corsOrigin = resolved.origin;
        return await handleGetMe(req, authService, corsOrigin, id);
      }

      if (req.method !== "POST" || !POST_ACTIONS.has(action)) throw new HttpAuthError("method_not_allowed");
      corsOrigin = requireWriteOrigin(req, context);

      switch (action) {
        case "login": {
          const result = await authService.login(await readLoginInput(req, context));
          return okResponse(publicUserBody(result.user), corsOrigin, id, sessionCookie(result.sessionToken));
        }
        case "logout": {
          await readLogoutInput(req);
          await authService.logout(readSessionCookie(req));
          return okResponse({ ok: true }, corsOrigin, id, clearSessionCookie());
        }
        case "recover": {
          const result = await authService.recover(await readRecoverInput(req));
          return okResponse(publicUserBody(result.user), corsOrigin, id, clearSessionCookie());
        }
        case "setup": {
          const result = await authService.setup(await readSetupInput(req));
          return okResponse(publicUserBody(result.user), corsOrigin, id, sessionCookie(result.sessionToken));
        }
        default:
          throw new HttpAuthError("not_found");
      }
    } catch (error) {
      if (error instanceof HttpAuthError) return errorResponse(error.code, corsOrigin, id);
      if (error instanceof AdminAuthError) return errorResponse(mapServiceError(error), corsOrigin, id);
      return errorResponse("internal_error", corsOrigin, id);
    }
  };
}

export async function authenticateAdminRequest(req: Request): Promise<PublicAdminUser | null> {
  try {
    return await getDefaultService().authenticate(readSessionCookie(req));
  } catch {
    return null;
  }
}

const handler = createAdminAuthHandler();

export default handler;

export const config: Config = {
  method: ["GET", "POST", "OPTIONS"],
  path: "/api/admin/auth"
};