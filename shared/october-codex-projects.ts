import type { CodexProject, CodexSection } from "./site-content-schema.ts";

// 核对过的公开操作摘要；不带账号、住宅尺寸、本机目录或原始私密内容。
export const octoberCodexProjects: CodexProject[] = [
  { id: "codex-slow-jigging", title: "Slow Jigging 钓鱼游戏", stage: "v0.5.0 参数对比原型，待真人试玩", updated: "2026.10.05",
    summary: "使用 Unity 2022.3 与 C# 开发 Windows 钓鱼原型，完成精准提竿和稳定收线、鱼获尺寸与模型、A/B 手感参数和本地试玩记录。17 项规则测试、20 次自动捕获及失败/取消记录已验证，真人手感和联机尚未验证。",
    operationSkills: ["C# 钓鱼状态机与规则测试", "Unity Windows 构建与运行日志检查", "程序音效与中文交互反馈", "鱼获尺寸与旋转特写", "A/B 参数对比与配置隔离", "自动样本和真人试玩 CSV 分开记录"],
    milestones: ["v0.5.0 Windows 原型构建", "17 项规则测试通过", "A/B 各 10 次自动捕获及失败、取消记录验证"],
    next: "收集三位玩家独立试玩反馈，继续验证双客户端移动与抛竿同步；Steam 联机未完成。", links: [], visibility: "公开开发概括，构建暂未公开下载",
    timeline: [{ id: "fishing-p02-20261005", date: "2026.10.05", status: "current", title: "P02 参数对比与记录", detail: "标准/舒适两套参数和试玩记录已实现；自动验收不能替代真人手感与联机验收。" }] },
  { id: "codex-3d-floorplan", title: "3D 户型建模与方案迭代", stage: "V40 模型已保存，吊顶需求待确认", updated: "2026.09.18 · 记录核对",
    summary: "围绕 CAD 户型到 3D 模型开展方案迭代，核对 SketchUp 模型中的吊顶、梁边单眼皮、窗帘槽和灯位，保存 V39/V40 模型并检查效果。只公开建模操作，不公开住宅布局与尺寸。",
    operationSkills: ["CAD 到 3D 模型方案梳理", "SketchUp 模型版本迭代", "吊顶、梁边与灯位核对", "截图与模型交叉检查", "实体与空心需求澄清"],
    milestones: ["V39 薄竖边单眼皮修正", "V40 梁边单眼皮连接天花板", "保存新版模型并检查效果"],
    next: "确认沙发吊顶是内部空心需求还是漏面问题，再修改；不视为最终装修验收。", links: [], visibility: "公开操作概括，户型文件不公开",
    timeline: [{ id: "floorplan-v40-20260918", date: "2026.09.18 · 记录核对", status: "current", title: "模型细节迭代", detail: "V40 已保存，沙发吊顶要求尚未明确，未擅自修改。" }] },
  { id: "codex-disk-audit", title: "Windows 磁盘空间诊断", stage: "只读占用分析已完成", updated: "2026.09.15 · 记录核对",
    summary: "只读扫描 Windows 磁盘占用，区分应用、缓存、个人文件与系统组件，核对软件登记路径和实际目录。完成清理候选与处理边界分析，没有执行删除，也没有已释放空间的成果。",
    operationSkills: ["PowerShell 文件占用统计", "目录分类与重复计数辨识", "访问失败及硬链接统计误差说明", "登记路径与实际文件核对", "缓存和个人资料清理边界判断"],
    milestones: ["目录占用分类和候选分析", "识别残留安装记录与实际占用的区别"],
    next: "用户明确选择后再处理清理候选，分别验证目标和实际释放空间。", links: [], visibility: "公开诊断方法，个人目录明细不公开",
    timeline: [{ id: "disk-readonly-20260915", date: "2026.09.15 · 记录核对", status: "completed", title: "只读诊断与复核", detail: "区分扫描估算和真实占用，保留个人资料与系统组件，未执行清理。" }] },
  { id: "codex-document-workflow", title: "视频话术与文档整理", stage: "带时间标记的转写文档已生成", updated: "2026.09 · 记录核对",
    summary: "将视频话术整理为 Word 文档，按需求保留重复、口头语和互动并附时间标记。已生成 5 页原始转写版本，存在机器识别错字，尚未经逐字校对。",
    operationSkills: ["视频话术提取与版本整理", "原始转写与精简文案分开保存", "时间标记与 Word 输出", "识别误差和校对状态说明"],
    milestones: ["生成 5 页带时间标记的原始转写文档", "注明识别误差与待校对状态"],
    next: "逐字校对识别内容，再生成适合使用场景的精简版本。", links: [], visibility: "公开流程总结，原视频与全文不公开",
    timeline: [{ id: "transcription-202609", date: "2026.09 · 记录核对", status: "current", title: "原始转写文档", detail: "文档已生成，原文特征与时间标记保留，人工校对未完成。" }] }
];

export function mergeOctoberCodexProjects(section: CodexSection): CodexSection {
  const result = structuredClone(section);
  const rag = result.projects.find(project => project.id === "codex-rag");
  if (rag) {
    // 只替换已知内置文案，管理员自定义内容仍保留；新记录按稳定 ID 合并。
    if (rag.updated === "2026.08.26") {
      rag.updated = "2026.10.05";
      if (rag.stage === "网站问答已实践，本地建库学习中") rag.stage = "RAG + Wiki 首版已验证，非生产预览";
      if (rag.summary.startsWith("为个人网站建立经历知识库与检索问答，并学习本地文档切分")) rag.summary = "个人网站已实现本地 BGE 混合检索、主题加权聚合和事实推导；新增 Wiki 来源编译、过期校验与多项目证据规划，v0.5.0 非生产问答验收通过。Wiki 为确定性编译，LLM 自动增量维护未实现；本地 Chroma 教学建库尚未验证。";
      if (rag.next.startsWith("安装本地建库依赖")) rag.next = "继续验证多项目问题，后续设计经审核的 LLM 增量整理；本地 Chroma 建库单独验证。";
    }
    rag.operationSkills = [...new Set([...(rag.operationSkills ?? []), "Wiki Markdown 与 manifest 编译", "来源摘要与过期页面校验", "多项目查询与双方来源检查", "未知能力拒答及事实推导边界"])];
    rag.milestones = [...new Set([...rag.milestones, "v0.5.0 Wiki 首版与真实问答验收", "437 项测试与 Draft 7/7 验收通过（当次记录）"])];
    if (!rag.timeline.some(item => item.id === "rag-wiki-20261005")) rag.timeline.push({ id: "rag-wiki-20261005", date: "2026.10.05", status: "completed", title: "RAG + Wiki 首版验证", detail: "当次 21 页 Wiki、437 项测试和 Draft 7/7 验收通过，正式环境未更新；页面数会随资料变化。" });
  }
  const site = result.projects.find(project => project.id === "codex-personal-site");
  if (site && !site.timeline.some(item => item.id === "site-wiki-20261005")) {
    site.timeline.push({ id: "site-wiki-20261005", date: "2026.10.05", status: "completed", title: "经历助手接入 Wiki 组织层", detail: "非生产预览验证项目比较、原始来源与事实推导，项目板内容和知识资料分别维护。" });
    site.operationSkills = [...new Set([...(site.operationSkills ?? []), "RAG + Wiki 资料维护与问答验证"])];
  }
  for (const project of octoberCodexProjects) if (!result.projects.some(item => item.id === project.id)) result.projects.push(structuredClone(project));
  return result;
}
