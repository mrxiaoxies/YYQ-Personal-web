import knowledgeData from "../knowledge/index.json" with { type: "json" };
import vectorIndex from "../knowledge/vector-index.json" with { type: "json" };

import { embedKnowledgeQuery } from "../netlify/functions/_shared/embedding.ts";
import {
  SEMANTIC_EMBEDDING_DIMENSIONS,
  SEMANTIC_EMBEDDING_MODEL,
  retrieveKnowledge
} from "../netlify/functions/_shared/retrieval.ts";

const detailedPositiveCases = [
  ["接口返回怪怪的，你平时会去哪几处找原因？", "skill-api-data-environment"],
  ["银行客服那个项目你平时咋查日志？", "work-cec-bank-platform"],
  ["银行客服平台技术栈是什么？", "work-cec-bank-platform"],
  ["两套数据源对不上时你怎么验报表？", "work-cec-data-disclosure"],
  ["养老金文件从传上去到签发下载，你都测了啥？", "work-cec-pension"],
  ["养老金项目有哪些工具？", "work-cec-pension"],
  ["那台 NANO 工控机跑久了，你怎么判断稳不稳？", "work-lanjian-edge-ai"],
  ["分众那种广告播放器，你测过直播和串口没？", "work-focusmedia-player"],
  ["摄像头识别人后通知这条链路，你怎么验的？", "work-jiangnan-eagle-eye"],
  ["设备壳体焊完，你怎么验密封、温度和结构？", "work-jiangnan-hardware"],
  ["做功能测试时，输入边界和出错情况你怎么覆盖？", "skill-testing-methods"],
  ["个人网站用了哪些技术？", "project-personal-site"],
  ["你的站从改代码到发布，怎么尽量保证稳定？", "project-personal-site"],
  ["自动剪视频现在走到哪一步了？", "project-auto-editing"],
  ["微信那个 AI 助手怎么防止把消息发错人？", "project-wechat-ai"],
  ["你平时怎么拿 Codex 帮你做项目？", "skill-ai-workflow"],
  ["说说你这几年的公司和岗位。", "work-overview"],
  ["你比较擅长哪些软件测试方向？", "profile-overview"],
  ["你是谁，平时主要做什么？", "profile-overview"],
  ["双库取数和账期锁住的场景你碰到过吗？", "work-cec-data-disclosure"],
  ["作品集网站是怎么部署和优化的？", "project-personal-site"]
];

const broadTopicCases = [
  { topicId: "testing-skills", subjects: ["测试", "测试技能", "测试能力", "软件测试经验"] },
  { topicId: "tools-technology", subjects: ["工具", "测试工具", "技术栈", "开发工具"] },
  { topicId: "work-experience", subjects: ["工作经验", "测试工作经验", "职业经历", "公司经历"] },
  { topicId: "ai-workflow", subjects: ["AI 工作流", "Codex 使用经验", "人工智能工具经验"] },
  { topicId: "personal-projects", subjects: ["个人项目", "业余项目", "项目经历"] }
];
const broadPrefixes = ["", "你", "您", "杨烨齐"];
const broadForms = [
  (prefix, subject) => `${prefix}${prefix ? "有" : ""}哪些${subject}？`,
  (prefix, subject) => `请介绍一下${prefix ? `${prefix}的` : ""}${subject}`,
  (prefix, subject) => `${subject}方面${prefix || "你"}会什么`
];
const generatedBroadCases = broadTopicCases.flatMap(({ topicId, subjects }) =>
  subjects.flatMap((subject) =>
    broadPrefixes.flatMap((prefix) =>
      broadForms.map((form) => ({ question: form(prefix, subject), topicId }))
    )
  )
);

const unknownSpecificCases = [
  "React 项目怎么上线？",
  "AI 工作流怎么设计？",
  "压力测试怎么做？",
  "性能测试怎么入门？",
  "MySQL 索引怎么优化？",
  "Linux 怎么排查磁盘满？",
  "你用过哪些自动化测试框架？",
  "你会 Selenium 吗？",
  "你会禅道吗？",
  "你平时用禅道吗？",
  "你平时用禅道工具吗？",
  "你会哪些 CI 工具？",
  "你会哪些自动化测试工具？",
  "你会用 Postman 和禅道吗？",
  "你用禅道做过接口测试吗？",
  "你做过 pytest 自动化测试吗？",
  "AI 电话总结是不是自动化测试框架？",
  "摄像头项目做过人脸识别考勤吗？",
  "微信机器人支持语音通话吗？",
  "自动剪辑能直接发布到抖音吗？",
  "广告机支持 4K HDR 吗？",
  "硬件项目测过电磁兼容吗？",
  "天气冷的时候工控机温度怎么测？"
];

const projectIsolationCases = [
  "养老金项目用了 Codex 吗？",
  "银行客服平台是用 React 开发的吗？",
  "个人网站用 MySQL 存数据吗？",
  "银行客服平台用过 jtop 吗？",
  "广告机项目用了 Postman 吗？",
  "自动剪辑项目用 MySQL 吗？"
];

const documentEmbeddings = Object.fromEntries(
  vectorIndex.entries.map((entry) => [entry.id, entry.embedding])
);
const topicEmbeddings = Object.fromEntries(
  vectorIndex.topics.map((topic) => [topic.id, topic.embedding])
);

function cosine(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function semanticInput(queryEmbedding) {
  return {
    dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
    documentEmbeddings,
    knowledgeVersion: vectorIndex.knowledgeVersion,
    model: SEMANTIC_EMBEDDING_MODEL,
    queryEmbedding,
    topicEmbeddings
  };
}

function semanticTop(queryEmbedding) {
  return vectorIndex.entries
    .map((entry) => ({ id: entry.id, similarity: cosine(queryEmbedding, entry.embedding) }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 2);
}

async function evaluate(question, expectedId) {
  const queryEmbedding = await embedKnowledgeQuery(question);
  const semantic = semanticTop(queryEmbedding);
  const result = retrieveKnowledge(question, { limit: 3, semantic: semanticInput(queryEmbedding) });
  const actualId = result.hits[0]?.entry.id ?? "—";
  const passed = expectedId ? result.accepted && actualId === expectedId : !result.accepted;

  return {
    actual: actualId,
    accepted: result.accepted ? "是" : "否",
    expected: expectedId ?? "拒答",
    margin: Number(((semantic[0]?.similarity ?? 0) - (semantic[1]?.similarity ?? 0)).toFixed(3)),
    passed: passed ? "通过" : "失败",
    question,
    semanticTop: semantic[0]?.id ?? "—",
    similarity: Number((semantic[0]?.similarity ?? 0).toFixed(3))
  };
}

async function evaluateBroad({ question, topicId }) {
  const queryEmbedding = await embedKnowledgeQuery(question);
  const result = retrieveKnowledge(question, { limit: 6, semantic: semanticInput(queryEmbedding) });
  const actualTopic = result.topic?.id ?? "—";
  const passed = result.accepted && result.topic?.mode === "overview" && actualTopic === topicId;
  return {
    actual: actualTopic,
    expected: topicId,
    passed,
    question
  };
}

function rate(passed, total) {
  return total === 0 ? 0 : passed / total;
}

async function main() {
  if (vectorIndex.model !== SEMANTIC_EMBEDDING_MODEL) throw new Error("向量索引模型与检索器不一致。");
  if (vectorIndex.dimension !== SEMANTIC_EMBEDDING_DIMENSIONS) throw new Error("向量索引维度与检索器不一致。");
  if (vectorIndex.knowledgeVersion !== knowledgeData.version) throw new Error("向量索引与知识库版本不一致。");
  if (vectorIndex.schemaVersion !== 2) throw new Error("向量索引不是主题检索要求的 schema v2。");
  if (vectorIndex.topicCount !== knowledgeData.topics.length) throw new Error("向量主题数与知识库不一致。");

  console.log("[1/4] 细节召回：原有自然口语仍需命中正确公开经历。");
  const detailedResults = [];
  for (const [question, expectedId] of detailedPositiveCases) {
    detailedResults.push(await evaluate(question, expectedId));
  }
  console.table(detailedResults);

  console.log(`[2/4] 宽泛主题：用 ${generatedBroadCases.length} 个规则生成的改写验证泛化召回。`);
  const broadResults = [];
  for (const item of generatedBroadCases) {
    broadResults.push(await evaluateBroad(item));
  }
  const broadFailures = broadResults.filter((item) => !item.passed);
  if (broadFailures.length > 0) console.table(broadFailures);

  console.log("[3/4] 未知能力：具体且未公开的技能、工具或行为必须拒答。");
  const unknownResults = [];
  for (const question of unknownSpecificCases) unknownResults.push(await evaluate(question));
  const unknownFailures = unknownResults.filter((item) => item.passed !== "通过");
  if (unknownFailures.length > 0) console.table(unknownFailures);

  console.log("[4/4] 项目隔离：其他项目出现过的技术不能跨项目拼接。");
  const isolationResults = [];
  for (const question of projectIsolationCases) isolationResults.push(await evaluate(question));
  const isolationFailures = isolationResults.filter((item) => item.passed !== "通过");
  if (isolationFailures.length > 0) console.table(isolationFailures);

  const detailedPassed = detailedResults.filter((item) => item.passed === "通过").length;
  const broadPassed = broadResults.filter((item) => item.passed).length;
  const unknownFalseAnswers = unknownResults.filter((item) => item.accepted === "是").length;
  const isolationPassed = isolationResults.filter((item) => item.passed === "通过").length;
  const broadRecall = rate(broadPassed, broadResults.length);
  const isolationRate = rate(isolationPassed, isolationResults.length);
  console.log(
    `真实向量评估：细节 ${detailedPassed}/${detailedResults.length}；宽泛主题召回 ${(broadRecall * 100).toFixed(1)}%；未知具体能力误答 ${unknownFalseAnswers}；项目隔离 ${(isolationRate * 100).toFixed(1)}%。`
  );
  if (
    detailedPassed !== detailedResults.length ||
    broadRecall < 0.95 ||
    unknownFalseAnswers !== 0 ||
    isolationRate !== 1
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
