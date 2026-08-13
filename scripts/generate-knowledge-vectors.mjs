import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_MODEL_ID,
  LOCAL_EMBEDDING_MODEL_ROOT_ENVIRONMENT_VARIABLE,
  buildKnowledgeEmbeddingText,
  buildTopicEmbeddingText,
  embedKnowledgeDocuments,
  getLocalEmbeddingModelDirectory
} from "../netlify/functions/_shared/embedding.ts";
import { parseKnowledgeDocument } from "../netlify/functions/_shared/knowledge-schema.ts";

const DEFAULT_KNOWLEDGE_PATH = "knowledge/index.json";
const DEFAULT_OUTPUT_PATH = "knowledge/vector-index.json";
const VECTOR_INDEX_SCHEMA_VERSION = 2;
const DOCUMENT_TEXT_FORMAT_VERSION = 1;

function printHelp() {
  console.log(`生成公开知识库的本地向量索引。

用法：
  node scripts/generate-knowledge-vectors.mjs [选项]

选项：
  --knowledge <路径>   知识库 JSON，默认 ${DEFAULT_KNOWLEDGE_PATH}
  --output <路径>      向量索引输出，默认 ${DEFAULT_OUTPUT_PATH}
  --model-root <路径>  本地模型根目录，默认 <当前工作目录>/models
  --help               显示帮助

模型目录应为：
  models/${LOCAL_EMBEDDING_MODEL_ID}/
`);
}

function parseArguments(argumentsList) {
  const options = {
    knowledgePath: DEFAULT_KNOWLEDGE_PATH,
    modelRoot: undefined,
    outputPath: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--help") return { ...options, help: true };
    if (!["--knowledge", "--model-root", "--output"].includes(argument)) {
      throw new Error(`无法识别的参数：${argument}`);
    }

    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`参数 ${argument} 缺少路径值。`);
    index += 1;

    if (argument === "--knowledge") options.knowledgePath = value;
    if (argument === "--model-root") options.modelRoot = value;
    if (argument === "--output") options.outputPath = value;
  }

  return { ...options, help: false };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateKnowledgeEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`知识条目 ${index + 1} 不是对象。`);
  }

  for (const field of ["id", "title", "category", "content", "visibility"]) {
    if (!isNonEmptyString(entry[field])) {
      throw new Error(`知识条目 ${index + 1} 的 ${field} 字段不能为空。`);
    }
  }

  for (const field of ["company", "period", "role"]) {
    if (typeof entry[field] !== "string") {
      throw new Error(`知识条目 ${entry.id} 的 ${field} 字段必须是字符串。`);
    }
  }

  for (const field of ["aliases", "tags"]) {
    if (!Array.isArray(entry[field]) || entry[field].some((value) => !isNonEmptyString(value))) {
      throw new Error(`知识条目 ${entry.id} 的 ${field} 字段必须是非空字符串数组。`);
    }
  }

  return entry;
}

async function loadPublicKnowledge(knowledgePath) {
  const source = parseKnowledgeDocument(JSON.parse(await readFile(knowledgePath, "utf8")));

  const entries = source.entries
    .map(validateKnowledgeEntry)
    .filter((entry) => entry.visibility === "public");
  const uniqueIds = new Set(entries.map((entry) => entry.id));

  if (entries.length === 0) throw new Error("知识库中没有可生成向量的公开条目。");
  if (uniqueIds.size !== entries.length) throw new Error("公开知识条目中存在重复 id。");

  return {
    entries,
    topics: source.topics,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
    version: source.version
  };
}

async function assertLocalModelFiles() {
  const modelDirectory = getLocalEmbeddingModelDirectory();
  const requiredFiles = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    path.join("onnx", "model_quantized.onnx")
  ];

  try {
    const fileStats = await Promise.all(requiredFiles.map((file) => stat(path.join(modelDirectory, file))));
    const modelFileStats = fileStats.at(-1);
    if (fileStats.some((fileStats) => !fileStats.isFile() || fileStats.size === 0)) throw new Error();
    if (!modelFileStats || modelFileStats.size < 20 * 1024 * 1024) throw new Error();
  } catch {
    throw new Error(
      `本地模型文件不完整。请确认 ${modelDirectory} 包含 config/tokenizer/vocab 文件及 onnx/model_quantized.onnx。`
    );
  }

  return modelDirectory;
}

function validateEmbeddings(embeddings, expectedCount) {
  if (embeddings.length !== expectedCount) {
    throw new Error(`向量数量异常：期望 ${expectedCount}，实际 ${embeddings.length}。`);
  }

  for (const [index, embedding] of embeddings.entries()) {
    if (
      embedding.length !== LOCAL_EMBEDDING_DIMENSIONS ||
      Array.from(embedding).some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`第 ${index + 1} 条向量不是有效的 ${LOCAL_EMBEDDING_DIMENSIONS} 维向量。`);
    }
  }
}

async function writeJsonAtomically(outputPath, value) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const knowledgePath = path.resolve(options.knowledgePath);
  const outputPath = path.resolve(options.outputPath);
  if (knowledgePath === outputPath) {
    throw new Error("--output 不能与 --knowledge 指向同一个文件，以免覆盖原始知识库。");
  }
  if (options.modelRoot) {
    process.env[LOCAL_EMBEDDING_MODEL_ROOT_ENVIRONMENT_VARIABLE] = path.resolve(options.modelRoot);
  }

  console.log(`[1/4] 校验本地模型：确保生成过程只读本地文件，不依赖线上下载。`);
  const modelDirectory = await assertLocalModelFiles();
  console.log(`      模型目录：${modelDirectory}`);

  console.log(`[2/4] 读取公开知识：私有条目不会进入 embedding 文本或向量索引。`);
  const knowledge = await loadPublicKnowledge(knowledgePath);
  const documentTexts = knowledge.entries.map(buildKnowledgeEmbeddingText);
  const topicTexts = knowledge.topics.map(buildTopicEmbeddingText);
  console.log(`      已读取 ${documentTexts.length} 条公开知识和 ${topicTexts.length} 个主题，知识版本 ${knowledge.version}。`);

  console.log(`[3/4] 生成条目和主题向量：使用 mean pooling 与 L2 normalize，文档不添加 query 指令。`);
  const embeddings = await embedKnowledgeDocuments([...documentTexts, ...topicTexts]);
  validateEmbeddings(embeddings, knowledge.entries.length + knowledge.topics.length);
  const entryEmbeddings = embeddings.slice(0, knowledge.entries.length);
  const topicEmbeddings = embeddings.slice(knowledge.entries.length);

  const vectorIndex = {
    schemaVersion: VECTOR_INDEX_SCHEMA_VERSION,
    documentTextFormatVersion: DOCUMENT_TEXT_FORMAT_VERSION,
    model: LOCAL_EMBEDDING_MODEL,
    modelId: LOCAL_EMBEDDING_MODEL_ID,
    dimension: LOCAL_EMBEDDING_DIMENSIONS,
    knowledgeVersion: knowledge.version,
    knowledgeUpdatedAt: knowledge.updatedAt,
    entryCount: knowledge.entries.length,
    topicCount: knowledge.topics.length,
    entries: knowledge.entries.map((entry, index) => ({
      id: entry.id,
      embedding: Array.from(entryEmbeddings[index])
    })),
    topics: knowledge.topics.map((topic, index) => ({
      id: topic.id,
      embedding: Array.from(topicEmbeddings[index])
    }))
  };

  console.log(`[4/4] 写入向量索引：供线上混合检索直接读取，避免每次请求重算文档向量。`);
  await writeJsonAtomically(outputPath, vectorIndex);
  console.log(`      已生成：${outputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`向量索引生成失败：${message}`);
  process.exitCode = 1;
});
