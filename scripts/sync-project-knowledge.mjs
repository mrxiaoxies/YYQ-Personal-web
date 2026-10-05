import { mkdir, readFile, writeFile } from "node:fs/promises";
import { defaultSiteContent } from "../shared/default-site-content.ts";
import { parseKnowledgeDocument } from "../netlify/functions/_shared/knowledge-schema.ts";

// 只同步经过人工核对的内置公开项目，不直接把管理员自由输入或整个任务对话当作事实。
const catalog = [
  ["codex-personal-site", "project-personal-site", ["个人网站", "网站维护"], ["React", "Vite", "TypeScript", "Tailwind CSS", "GitHub Pages", "Netlify"], "添加个人经历 RAG 问答；整理并同步 Codex 操作技能"],
  ["codex-auto-editing", "project-auto-editing", ["自动剪辑", "剪辑项目", "口播成片"], ["FFmpeg", "字幕", "旁白", "竖屏"], "分析抖音号并测试剪映流程"],
  ["codex-wechat-ai", "project-wechat-ai", ["微信 AI 好友", "微信助手"], ["FastAPI", "Windows 通知"], "已归档微信 AI 好友项目记录"],
  ["codex-rag", "project-rag-wiki", ["RAG 知识库项目", "Wiki 项目", "经历助手", "RAG Wiki 助手"], ["RAG", "Wiki", "BGE", "Embedding", "混合检索"], "添加个人经历 RAG 问答；学习搭建和操作RAG库"],
  ["codex-job-radar", "project-job-radar", ["招聘岗位辅助分析", "招聘工具", "求职工具", "Job Radar"], ["岗位筛选", "刷新会话", "浏览器扩展"], "设计招聘岗位筛选投递工具；既有接口实现记录"],
  ["codex-local-agent", "project-local-agent", ["本地 Agent", "本地执行器", "Runner 项目"], ["Agent", "Runner", "步骤事件"], "规划 Aget 自建步骤"],
  ["codex-windows-tools", "project-windows-tools", ["Windows 工具维护", "Notepad++ 安装", "虚拟环境排错"], ["PowerShell", "Notepad++", "Python", "venv", "SHA-256"], "安装 Notepad++；既有虚拟环境排错记录"],
  ["codex-slow-jigging", "project-slow-jigging", ["Slow Jigging", "钓鱼游戏", "游戏开发项目"], ["Unity", "C#", "钓鱼", "状态机", "A/B", "CSV"], "执行游戏开发计划；项目 VERIFICATION.md 的 v0.5.0 验收记录"],
  ["codex-3d-floorplan", "project-3d-floorplan", ["3D 户型", "户型建模", "户型图项目"], ["CAD", "SketchUp", "3D", "吊顶"], "优化3D户型图方案"],
  ["codex-disk-audit", "project-disk-audit", ["磁盘空间诊断", "C盘清理", "磁盘占用分析"], ["磁盘诊断", "只读扫描", "缓存分类"], "分析C盘空间占用"],
  ["codex-document-workflow", "project-document-workflow", ["视频话术整理", "转写文档", "视频转 Word"], ["Word", "转写", "时间标记"], "提炼视频话术并生成Word"]
];

const root = new URL("../", import.meta.url);
const knowledge = JSON.parse(await readFile(new URL("knowledge/index.json", root), "utf8"));
const files = new Map();
for (const [boardId, entryId, aliases, tags, provenance] of catalog) {
  const project = defaultSiteContent.sections.codex.projects.find(item => item.id === boardId);
  if (!project) throw new Error(`缺少已核对的项目 ${boardId}`);
  const skills = project.operationSkills ?? [];
  const sourceDocument = `docs/knowledge/${entryId}.md`;
  // 明确区分已记录成果和下一步；不会把计划或工具名转成精通声明。
  const snapshot = `${project.summary}\n当前阶段：${project.stage}。已记录里程碑：${project.milestones.join("；")}。操作经验：${skills.join("；")}。待完成：${project.next}。公开范围：${project.visibility}。这些记录体现 Codex 辅助实践，不表示每项技术均精通。`;
  const existing = knowledge.entries.find(entry => entry.id === entryId);
  if (existing) {
    existing.sourceDocuments = [sourceDocument];
    if (entryId !== "project-wechat-ai") {
      // 个人网站保留原有技术细节；替换旧自动剪辑状态，避免“仍只搭建中”的矛盾。
      const original = entryId === "project-personal-site" ? existing.content.split("\n项目进度同步：")[0] : "";
      existing.content = original ? `${original}\n项目进度同步：${snapshot}` : snapshot;
      existing.period = project.updated;
      existing.tags = [...new Set([...existing.tags, ...tags])];
      existing.aliases = [...new Set([...existing.aliases, ...aliases])];
    }
  } else knowledge.entries.push({ id: entryId, title: project.title, period: project.updated, company: "个人项目", role: "Codex 辅助实践", category: "personal-project", tags, aliases, content: snapshot, visibility: "public", sourceDocuments: [sourceDocument] });
  const operations = skills.map((skill, index) => `${index + 1}. ${skill}：用于完成或核验本项目对应步骤，实际完成程度以里程碑和阶段记录为准。`).join("\n");
  files.set(sourceDocument, `# ${project.title}\n\n核对日期：2026-10-05\n记录来源：${provenance}\n知识条目：${entryId}\n\n## 当前事实与阶段\n\n${project.summary}\n\n${project.stage}\n\n## 操作与用途\n\n${operations}\n\n## 已记录改动与验证\n\n${project.milestones.map(item => `- ${item}`).join("\n")}\n\n## 尚未完成\n\n${project.next}\n\n## 公开边界\n\n${project.visibility}。不归档完整聊天、账户、本机路径、私人资料或客户数据。操作记录不等于熟练程度认证。\n`);
}
const projects = knowledge.topics.find(topic => topic.id === "personal-projects");
projects.entryIds = [...new Set([...projects.entryIds, ...catalog.map(item => item[1])])];
projects.description = "公开个人项目与 Codex 操作实践的目标、技术、进度和验证边界，覆盖网站、RAG Wiki、剪辑、微信助手、招聘工具、本地执行器、游戏、建模和环境诊断。";
knowledge.version = "1.4.0";
knowledge.updatedAt = "2026-10-05";
parseKnowledgeDocument(knowledge);
files.set("knowledge/index.json", `${JSON.stringify(knowledge, null, 2)}\n`);
files.set("docs/knowledge/README.md", `# Codex 项目操作资料\n\n这是已核对并脱敏的公开摘要，不是完整任务记录。\n\n${catalog.map(([, id]) => `- [${id}](${id}.md)`).join("\n")}\n\n维护顺序：更新已核对进度数据 → npm run knowledge:sync → npm run vectors:build → npm run wiki:build → 测试和预览验收。\n`);
if (process.argv.includes("--check")) {
  for (const [file, content] of files) if (await readFile(new URL(file, root), "utf8") !== content) throw new Error(`项目资料不同步：${file}`);
  console.log(`项目资料一致：${catalog.length} 份文档，${knowledge.entries.length} 条知识`);
} else {
  await mkdir(new URL("docs/knowledge/", root), { recursive: true });
  for (const [file, content] of files) await writeFile(new URL(file, root), content);
  console.log(`已同步 ${catalog.length} 份项目文档，${knowledge.entries.length} 条知识`);
}
