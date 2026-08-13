import { readFile } from "node:fs/promises";
import path from "node:path";

import type { KnowledgeTopic } from "./knowledge-schema.ts";
import { loadTransformersWeb } from "./transformers-web.ts";

export const LOCAL_EMBEDDING_MODEL = "bge-small-zh-v1.5";
export const LOCAL_EMBEDDING_MODEL_ID = "Xenova/bge-small-zh-v1.5";
export const LOCAL_EMBEDDING_DIMENSIONS = 512;
export const BGE_QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章：";

export const LOCAL_EMBEDDING_MODEL_ROOT_ENVIRONMENT_VARIABLE = "RAG_EMBEDDING_MODEL_ROOT";

export type KnowledgeEmbeddingSource = {
  aliases: readonly string[];
  category: string;
  company: string;
  content: string;
  period: string;
  role: string;
  tags: readonly string[];
  title: string;
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  "personal-project": "个人项目",
  profile: "个人概览",
  skill: "技术能力",
  "work-overview": "工作经历概览",
  "work-project": "工作项目"
};

async function createLocalFeatureExtractor() {
  const { env, pipeline } = await loadTransformersWeb();
  const modelRoot = getLocalEmbeddingModelRoot();

  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = modelRoot;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.customCache = {
    async match(request: RequestInfo | URL) {
      const requestedPath =
        typeof request === "string"
          ? request
          : request instanceof URL
            ? request.pathname
            : request.url;
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(requestedPath)) return undefined;

      const resolvedPath = path.resolve(requestedPath);
      const relativePath = path.relative(modelRoot, resolvedPath);
      if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return undefined;
      }

      try {
        const bytes = await readFile(resolvedPath);
        return new Response(bytes, {
          headers: { "Content-Length": String(bytes.byteLength) },
          status: 200
        });
      } catch {
        return undefined;
      }
    },
    async put() {
      // 远程模型已禁用；该方法只为满足 Transformers customCache 契约。
    }
  } as unknown as Cache;

  return pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL_ID, {
    device: "wasm",
    dtype: "q8",
    local_files_only: true
  });
}

let featureExtractorPromise: ReturnType<typeof createLocalFeatureExtractor> | undefined;

function getLocalFeatureExtractor() {
  featureExtractorPromise ??= createLocalFeatureExtractor().catch((error: unknown) => {
    featureExtractorPromise = undefined;
    throw error;
  });

  return featureExtractorPromise;
}

function assertText(value: string, label: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${label}不能为空。`);
  return normalized;
}

function splitEmbeddingTensor(data: unknown, dimensions: readonly number[], expectedCount: number) {
  if (!Array.isArray(dimensions) || dimensions.length !== 2) {
    throw new Error(`Embedding 输出维度异常：期望二维张量，实际为 [${dimensions.join(", ")}]。`);
  }

  if (dimensions[0] !== expectedCount || dimensions[1] !== LOCAL_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding 输出维度异常：期望 [${expectedCount}, ${LOCAL_EMBEDDING_DIMENSIONS}]，实际为 [${dimensions.join(", ")}]。`
    );
  }

  if (!data || typeof (data as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
    throw new Error("Embedding 输出不包含可读取的向量数据。");
  }

  const values = Array.from(data as Iterable<number | bigint>, (value) => Number(value));
  const expectedLength = expectedCount * LOCAL_EMBEDDING_DIMENSIONS;

  if (values.length !== expectedLength || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding 数据异常：期望 ${expectedLength} 个有限数值，实际为 ${values.length} 个。`);
  }

  return Array.from({ length: expectedCount }, (_, index) => {
    const start = index * LOCAL_EMBEDDING_DIMENSIONS;
    return Float32Array.from(values.slice(start, start + LOCAL_EMBEDDING_DIMENSIONS));
  });
}

async function embedTexts(texts: readonly string[]) {
  if (texts.length === 0) return [];

  const normalizedTexts = texts.map((text, index) => assertText(text, `第 ${index + 1} 条文本`));
  const extractor = await getLocalFeatureExtractor();
  const output = await extractor(normalizedTexts, { pooling: "mean", normalize: true });

  return splitEmbeddingTensor(output.data, output.dims, normalizedTexts.length);
}

export function getLocalEmbeddingModelRoot() {
  const configuredRoot = process.env[LOCAL_EMBEDDING_MODEL_ROOT_ENVIRONMENT_VARIABLE]?.trim();
  return path.resolve(configuredRoot || path.join(process.cwd(), "models"));
}

export function getLocalEmbeddingModelDirectory() {
  return path.join(getLocalEmbeddingModelRoot(), ...LOCAL_EMBEDDING_MODEL_ID.split("/"));
}

export function buildKnowledgeEmbeddingText(entry: KnowledgeEmbeddingSource) {
  const category = CATEGORY_LABELS[entry.category] ?? entry.category;
  const employment = [entry.company, entry.role, entry.period].filter(Boolean).join(" / ");

  return [
    `标题：${entry.title}`,
    `类别：${category}`,
    employment ? `任职：${employment}` : "",
    entry.tags.length > 0 ? `主题：${entry.tags.join("、")}` : "",
    entry.aliases.length > 0 ? `常见问法：${entry.aliases.join("；")}` : "",
    `公开事实：${entry.content}`
  ]
    .filter(Boolean)
    .join("\n");
}

// 主题描述单独生成向量，让宽泛问题按“主题”竞争，而不是被迫依赖某一条简历切片。
export function buildTopicEmbeddingText(topic: KnowledgeTopic) {
  return [
    `主题：${topic.title}`,
    `主题说明：${topic.description}`,
    `稳定主题词：${topic.lexicalAnchors.join("、")}`
  ].join("\n");
}

export async function embedKnowledgeDocuments(texts: readonly string[]) {
  return embedTexts(texts);
}

export async function embedKnowledgeDocument(text: string) {
  const [embedding] = await embedTexts([text]);
  if (!embedding) throw new Error("Embedding 模型没有返回文档向量。");
  return embedding;
}

export async function embedKnowledgeQuery(query: string) {
  const normalizedQuery = assertText(query, "检索问题");
  const [embedding] = await embedTexts([`${BGE_QUERY_INSTRUCTION}${normalizedQuery}`]);
  if (!embedding) throw new Error("Embedding 模型没有返回问题向量。");
  return embedding;
}
