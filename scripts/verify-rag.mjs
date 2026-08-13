const requestedBase = process.argv[2] || process.env.RAG_BASE_URL || "http://localhost:8888";

function normalizeBase(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("RAG 地址必须使用 http 或 https");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} 没有返回有效 JSON（HTTP ${response.status}）`);
  }
}

async function ask(base, question, label, timeoutMs = 35_000) {
  const response = await fetch(`${base}/api/ask`, {
    body: JSON.stringify({ conversation: [], question }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await readJson(response, label);
  if (!response.ok) {
    throw new Error(`${label}失败（HTTP ${response.status}，${payload.error?.code ?? "unknown"}）`);
  }
  return payload;
}

function requireTrace(payload, label) {
  if (payload.retrievalTrace?.schemaVersion !== 2) {
    throw new Error(`${label}没有返回 schema v2 检索轨迹`);
  }
}

async function main() {
  const base = normalizeBase(requestedBase);
  console.log(`[1/5] 健康检查：确认条目、主题向量和回答服务都已就绪（${base}/api/health）`);
  const healthResponse = await fetch(`${base}/api/health`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  const health = await readJson(healthResponse, "健康检查");
  if (!healthResponse.ok || health.status !== "ready") {
    throw new Error(`健康检查未就绪（HTTP ${healthResponse.status}，状态 ${health.status ?? "unknown"}）`);
  }
  if (health.retrieval?.indexTopicCount !== 5) throw new Error("健康检查没有报告 5 个主题向量");
  console.log(`      通过：知识条目 ${health.knowledge?.entryCount ?? "?"}，主题向量 ${health.retrieval.indexTopicCount}，模型 ${health.model ?? "?"}`);

  console.log("[2/5] 工作经验概括：验证多证据聚合与服务器计算的从业跨度");
  const work = await ask(base, "请概括你的测试工作经验", "工作经验概括");
  if (
    !/以下基于个人网站中的公开资料概括/.test(work.answer ?? "") ||
    !/从业跨度/.test(work.answer ?? "") ||
    !Array.isArray(work.sources) ||
    !work.sources.some((source) => source.title === "公开工作经历概览")
  ) {
    throw new Error("工作经验概括缺少公开概括前缀、从业跨度或工作来源");
  }
  requireTrace(work, "工作经验概括");
  if (
    work.retrievalTrace.topicTitle !== "工作经验公开概括" ||
    !work.retrievalTrace.factDerivationTypes?.includes("duration")
  ) {
    throw new Error("工作经验概括轨迹缺少主题或时间事实推导标记");
  }
  console.log("      通过：回答基于多条公开资料，并由服务端加入可追溯从业跨度");

  console.log("[3/5] 宽泛工具概括：验证自然问法可以聚合技能与工具证据");
  const tools = await ask(base, "你有哪些测试工具？", "工具概括");
  if (
    !/以下基于个人网站中的公开资料概括/.test(tools.answer ?? "") ||
    !Array.isArray(tools.sources) ||
    !tools.sources.some((source) => source.title === "技能与工具公开概览")
  ) {
    throw new Error("工具概括缺少公开概括前缀或技能与工具来源");
  }
  requireTrace(tools, "工具概括");
  console.log(`      通过：聚合 ${tools.retrievalTrace.topicEvidenceCount ?? "?"} 条公开证据`);

  console.log("[4/5] 未知能力拒答：确认 Selenium 不会被相似主题强行回答");
  const unknown = await ask(base, "你会 Selenium 吗？", "未知能力拒答", 20_000);
  if (!/没有足够信息/.test(unknown.answer ?? "") || !Array.isArray(unknown.sources) || unknown.sources.length !== 0) {
    throw new Error("未知 Selenium 能力没有按预期拒答或返回了伪造来源");
  }
  requireTrace(unknown, "未知能力拒答");
  console.log("      通过：未知具体能力被拒答，来源为空");

  console.log("[5/5] 项目隔离：确认养老金项目不会借用其他条目的 Codex 经验");
  const isolated = await ask(base, "养老金项目用了 Codex 吗？", "项目隔离", 20_000);
  if (!/没有足够信息/.test(isolated.answer ?? "") || !Array.isArray(isolated.sources) || isolated.sources.length !== 0) {
    throw new Error("跨项目 Codex 声明没有按预期拒答或返回了伪造来源");
  }
  requireTrace(isolated, "项目隔离");
  console.log("      通过：跨项目技术拼接被拒答，来源为空");
  console.log("RAG 端到端验证通过。");
}

main().catch((error) => {
  console.error(`RAG 验证失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
