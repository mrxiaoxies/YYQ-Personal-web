import type { Config, Context } from "@netlify/functions";

import { getHybridRetrievalMetadata } from "./_shared/hybrid-retrieval.ts";
import { getKnowledgeMetadata } from "./_shared/retrieval.ts";
import {
  baseHeaders,
  getNetlifyEnv,
  jsonResponse,
  resolveAIGatewayConfig,
  resolveCorsOrigin
} from "./_shared/netlify-http.ts";

const DEFAULT_MODEL = "gpt-5.4-mini";

type EnvironmentReader = (name: string) => string | undefined;

function publicRetrievalMetadata() {
  const metadata = getHybridRetrievalMetadata();
  return {
    dimensions: metadata.dimensions,
    indexEntryCount: metadata.indexEntryCount,
    indexTopicCount: metadata.indexTopicCount,
    indexReady: metadata.indexReady,
    knowledgeVersion: metadata.knowledgeVersion,
    mode: metadata.mode,
    model: metadata.model
  };
}

export function createHealthHandler(readEnvironment: EnvironmentReader = getNetlifyEnv) {
  return async (req: Request, context: Context) => {
    const requestId = context.requestId;
    const cors = resolveCorsOrigin(req, context);

    if (!cors.allowed) {
      return jsonResponse(
        { error: { code: "cors_forbidden", message: "该来源不允许访问此接口" }, requestId },
        403,
        undefined,
        requestId
      );
    }

    if (req.method === "OPTIONS") {
      const headers = baseHeaders(cors.origin);
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Max-Age", "600");
      if (requestId) headers.set("X-Request-Id", requestId);
      return new Response(null, { headers, status: 204 });
    }

    if (req.method !== "GET") {
      const response = jsonResponse(
        { error: { code: "method_not_allowed", message: "只支持 GET 请求" }, requestId },
        405,
        cors.origin,
        requestId
      );
      response.headers.set("Allow", "GET, OPTIONS");
      return response;
    }

    const knowledge = getKnowledgeMetadata();
    const retrieval = publicRetrievalMetadata();
    const model = readEnvironment("KNOWLEDGE_MODEL") ?? DEFAULT_MODEL;
    const gateway = resolveAIGatewayConfig(readEnvironment);

    if (!gateway) {
      return jsonResponse(
        {
          code: "gateway_not_configured",
          knowledge,
          model,
          retrieval,
          service: "knowledge-assistant",
          status: "unavailable"
        },
        503,
        cors.origin,
        requestId
      );
    }

    return jsonResponse(
      {
        gateway: gateway.source,
        knowledge,
        model,
        retrieval,
        service: "knowledge-assistant",
        status: "ready"
      },
      200,
      cors.origin,
      requestId
    );
  };
}

export default createHealthHandler();

export const config: Config = {
  method: ["GET", "OPTIONS"],
  path: "/api/health"
};
