import type { CodexProject, CodexSection } from "./site-content-schema.ts";
import { mergeOctoberCodexProjects } from "./october-codex-projects.ts";

type ProjectUpdate = Pick<CodexProject, "id" | "stage" | "updated" | "summary" | "next" | "milestones" | "timeline"> & { operationSkills: string[] };
const updates: ProjectUpdate[] = [
  {
    id: "codex-personal-site", stage: "后台管理已接入，持续优化中", updated: "2026.09.05",
    summary: "使用 Codex 维护 React / TypeScript 个人网站，完成四季交互、移动端优化、版本发布，并接入管理员登录、栏目编辑、内容保存与修订恢复。",
    operationSkills: ["需求拆解与代码定位", "React / TypeScript 页面维护", "Git 版本管理与发布", "GitHub Pages / Netlify 部署", "前后端字段与接口验证", "后台栏目管理与修订恢复"],
    milestones: ["管理员界面与栏目编辑接入", "公开内容与管理员保存接口接入"],
    next: "持续补充操作案例，并验证线上内容存储与后台发布链路。",
    timeline: [{ id: "site-admin-20260905", date: "2026.09.05", status: "completed", title: "后台内容管理接入", detail: "代码已支持管理员认证、分栏目编辑、版本冲突检查与历史修订；线上存储可用性单独核验。" }]
  },
  {
    id: "codex-auto-editing", stage: "口播成片流程已验证", updated: "2026.08.20",
    summary: "分析剪映结构化草稿，使用 FFmpeg 完成竖屏口播视频的素材拼接、缩放裁切、字幕叠加与旁白混音，并检查成片参数、音量和画面。",
    operationSkills: ["剪映草稿 JSON 结构分析", "素材整理与片段拼接", "竖屏缩放裁切", "字幕图层与关键词强调", "旁白混音与音量检测", "成片参数校验与抽帧检查"],
    milestones: ["完成竖屏口播成片生成", "核验分辨率、帧率、音频与抽帧画面"],
    next: "继续整理可复用的剪辑风格规则，并验证剪映内打开与导出流程。",
    timeline: [{ id: "editing-video-20260820", date: "2026.08.20 · 记录核对", status: "completed", title: "口播视频生成与校验", detail: "历史操作记录确认生成约 45 秒、1080×1920、30fps 的口播视频，完成字幕、音量及抽帧检查；剪映端到端自动剪辑仍待验证。" }]
  }
];

const additions: CodexProject[] = [
  {
    id: "codex-rag", title: "RAG 知识库与问答", stage: "网站问答已实践，本地建库学习中", updated: "2026.08.26",
    summary: "为个人网站建立经历知识库与检索问答，并学习本地文档切分、向量化和 Top-K 检索。将已部署的网站实践与尚未完成端到端验证的本地教学分开记录。",
    operationSkills: ["知识文档整理与元数据设计", "文本切分与重叠片段检查", "Embedding 模型与归一化一致性", "关键词与向量混合检索", "Top-K 来源与回答依据检查", "问答回归与接口验证"],
    milestones: ["网站 RAG 检索、问答与验证流程建立", "本地 ingest / search 教学脚本整理", "Python 虚拟环境创建与激活验证"],
    next: "安装本地建库依赖，实际执行文档入库与检索，并检查切分结果和召回质量。",
    links: [], visibility: "网站实践已公开；本地原型学习中",
    timeline: [
      { id: "rag-site-20260813", date: "2026.08.13 · 记录核对", status: "completed", title: "网站 RAG 发布与验证", detail: "历史记录确认网站问答完成混合检索、回归评估及 Netlify 接口验证。" },
      { id: "rag-local-20260826", date: "2026.08.26", status: "current", title: "本地 RAG 教学与环境排错", detail: "整理切分、向量化和检索脚本，并创建激活虚拟环境；Chroma 建库及检索尚未执行验证。" }
    ]
  },
  {
    id: "codex-job-radar", title: "招聘岗位辅助分析", stage: "接口与扩展原型开发中", updated: "2026.08.18",
    summary: "围绕 BOSS / 智联招聘设计岗位筛选工具，梳理简历匹配、公司信息核实、真实职位链接分析与用户确认的辅助投递流程，开发刷新会话接口及浏览器扩展对接。",
    operationSkills: ["招聘需求与筛选规则拆解", "岗位事实、推断与待核实信息区分", "刷新会话协议与数据校验", "接口持久化与会话安全", "浏览器扩展消息桥接原型"],
    milestones: ["确认真实职位分析与辅助投递范围", "实现刷新协议、校验与会话接口", "编写扩展桥接原型"],
    next: "完成页面迁移、扩展联调与完整测试构建，验证真实岗位分析链路。",
    links: [], visibility: "原型暂未公开",
    timeline: [{ id: "job-refresh-20260818", date: "2026.08.18", status: "current", title: "刷新接口与扩展桥接", detail: "协议、校验和会话接口已有实现；页面迁移、桥接联调及全量测试仍待完成。辅助投递保留用户确认步骤。" }]
  },
  {
    id: "codex-local-agent", title: "本地 Agent 工作流设计", stage: "架构设计与学习阶段", updated: "2026.08.26",
    summary: "梳理 Agent、Tool、Skill 与 RAG 的职责，设计连接云端任务和本地执行器的流程，让真实终端输出、步骤状态与操作结果可查看。",
    operationSkills: ["Agent / Tool / Skill / RAG 职责梳理", "本地 Runner 架构设计", "终端输出与步骤事件设计", "云端和本地执行边界分析", "安装与外部操作确认流程设计"],
    milestones: ["完成组件职责和执行边界梳理", "整理终端日志与进度事件设计"],
    next: "实现最小本地执行器，验证一条命令从发起到终端输出的完整链路。",
    links: [], visibility: "设计记录",
    timeline: [{ id: "agent-design-20260826", date: "2026.08.26", status: "current", title: "可见本地执行方案", detail: "设计本地 Runner、终端流与事件协议；尚未实现并验证完整执行系统。" }]
  },
  {
    id: "codex-windows-tools", title: "Windows 环境与工具维护", stage: "安装与排错流程已实践", updated: "2026.08.26",
    summary: "使用 Codex 辅助排查 PowerShell 与 Python 虚拟环境问题，完成指定目录的软件安装、官方安装包校验与重复安装清理，并检查保留程序的版本和路径。",
    operationSkills: ["PowerShell 路径与命令诊断", "Python venv 创建与激活", "执行策略与缺失文件原因区分", "官方安装包与 SHA-256 校验", "指定目录安装与版本检查", "重复安装定位和定向清理"],
    milestones: ["定位虚拟环境缺失并验证创建激活", "完成 Notepad++ 指定目录安装及校验", "移除重复安装并验证保留副本"],
    next: "持续积累环境问题的原因、操作步骤与验证结果。",
    links: [], visibility: "操作经验总结",
    timeline: [{ id: "windows-tools-20260826", date: "2026.08.26", status: "completed", title: "工具安装与环境排错", detail: "完成 Notepad++ 官方便携包校验和指定目录安装；排查虚拟环境缺失并验证激活后的 Python 路径与版本。" }]
  }
];

// Only replace an old built-in scalar when it has not been edited by the administrator.
// Explicit import merges lists by stable ID/text; normal reads never re-add deleted content.
export function mergeRecentCodexProjects(current: CodexSection, baseline: CodexSection): CodexSection {
  const result = structuredClone(current);
  for (const update of updates) {
    const project = result.projects.find(item => item.id === update.id);
    const previous = baseline.projects.find(item => item.id === update.id);
    if (!project) continue;
    for (const key of ["stage", "updated", "summary", "next"] as const) {
      if (previous && project[key] === previous[key]) project[key] = update[key];
    }
    project.operationSkills = [...new Set([...(project.operationSkills ?? []), ...update.operationSkills])];
    project.milestones = [...new Set([...project.milestones, ...update.milestones])];
    for (const entry of update.timeline) {
      if (!project.timeline.some(item => item.id === entry.id)) project.timeline.push(structuredClone(entry));
    }
  }
  for (const addition of additions) {
    if (!result.projects.some(item => item.id === addition.id)) result.projects.push(structuredClone(addition));
  }
  return mergeOctoberCodexProjects(result);
}
