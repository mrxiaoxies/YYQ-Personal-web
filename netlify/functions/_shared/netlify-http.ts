import type { Context } from "@netlify/functions";

export type EnvironmentReader = (name: string) => string | undefined;

export type AIGatewayConfig = {
  apiKey: string;
  baseURL: string;
  source: "netlify-ai-gateway" | "openai-compatible";
};

const LOCAL_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8888",
  "http://localhost:8888"
];
const GITHUB_PAGES_ORIGIN = "https://mrxiaoxies.github.io";

export function getNetlifyEnv(name: string) {
  const netlifyValue = typeof Netlify === "undefined" ? undefined : Netlify.env.get(name);
  const processValue = typeof process === "undefined" ? undefined : process.env[name];
  return netlifyValue?.trim() || processValue?.trim() || undefined;
}

export function resolveAIGatewayConfig(
  readEnvironment: EnvironmentReader = getNetlifyEnv
): AIGatewayConfig | undefined {
  const netlifyApiKey = readEnvironment("NETLIFY_AI_GATEWAY_KEY");
  const netlifyBaseURL = readEnvironment("NETLIFY_AI_GATEWAY_BASE_URL");
  if (netlifyApiKey && netlifyBaseURL) {
    return {
      apiKey: netlifyApiKey,
      baseURL: netlifyBaseURL,
      source: "netlify-ai-gateway"
    };
  }

  const openAIApiKey = readEnvironment("OPENAI_API_KEY");
  const openAIBaseURL = readEnvironment("OPENAI_BASE_URL");
  if (openAIApiKey && openAIBaseURL) {
    return {
      apiKey: openAIApiKey,
      baseURL: openAIBaseURL,
      source: "openai-compatible"
    };
  }

  return undefined;
}

function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function configuredOrigins() {
  return [
    getNetlifyEnv("PUBLIC_SITE_ALLOWED_ORIGINS"),
    getNetlifyEnv("KNOWLEDGE_ALLOWED_ORIGINS")
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value));
}

export function resolveCorsOrigin(req: Request, context: Context) {
  const origin = req.headers.get("Origin");
  if (!origin) return { allowed: true, origin: undefined };

  const normalized = normalizeOrigin(origin);
  if (!normalized || normalized !== origin.replace(/\/$/, "")) {
    return { allowed: false, origin: undefined };
  }

  const allowedOrigins = new Set([
    normalizeOrigin(req.url),
    normalizeOrigin(context.site?.url),
    GITHUB_PAGES_ORIGIN,
    ...LOCAL_ORIGINS,
    ...configuredOrigins()
  ]);

  return {
    allowed: allowedOrigins.has(normalized),
    origin: normalized
  };
}

export function baseHeaders(corsOrigin?: string) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin"
  });

  if (corsOrigin) headers.set("Access-Control-Allow-Origin", corsOrigin);
  return headers;
}

export function jsonResponse(body: unknown, status: number, corsOrigin?: string, requestId?: string) {
  const headers = baseHeaders(corsOrigin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (requestId) headers.set("X-Request-Id", requestId);

  return new Response(JSON.stringify(body), { headers, status });
}
