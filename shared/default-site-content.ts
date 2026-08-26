import type { SiteContentDocument } from "./site-content-schema.ts";

export const defaultSiteContent: SiteContentDocument = {
  schemaVersion: 1,
  version: "builtin-0.3.1",
  updatedAt: "2026-08-13T00:00:00.000Z",
  sections: {
    home: {
      eyebrow: "Software Test Engineer / AI Workflow Builder",
      titleLines: ["把复杂流程", "测试到安静可靠。"],
      subtitle: "杨烨齐｜软件测试工程师 · Linux 环境搭建 / 接口 / 数据验证",
      primaryActionLabel: "查看项目进度",
      secondaryActionLabel: "下载简历信息"
    },
    codex: {
      eyebrow: "Codex Workbench",
      title: "项目进度板",
      copy: "使用 Codex 进行项目细节、进度",
      projects: [
        {
          id: "codex-personal-site",
          title: "个人网站",
          stage: "持续优化中",
          updated: "2026.07.13",
          summary: "已完成四季滚动背景、液态玻璃面板、项目进度与简历模块，并加入春夏秋冬掉落物和夏季萤火虫路径动效。",
          milestones: ["四季背景切换", "花瓣/绿叶/秋叶/雪花", "萤火虫轨迹动效", "移动端体验优化", "首屏背景和字体资源压缩"],
          next: "继续补充项目案例与可公开的测试证据。",
          links: [{ id: "codex-personal-site-link-1", label: "GitHub 仓库", href: "https://github.com/mrxiaoxies/YYQ-Personal-web" }],
          visibility: "已公开",
          timeline: [
            { id: "codex-personal-site-timeline-1", date: "2026.06.12", status: "completed", title: "站点基础建立", detail: "建立 GitHub 发布准备、版本记录、操作文档与跨环境 npm 脚本。" },
            { id: "codex-personal-site-timeline-2", date: "2026.06.13", status: "completed", title: "移动端四季背景", detail: "新增窄屏季节背景，并优化玻璃、光效与滚动渲染表现。" },
            { id: "codex-personal-site-timeline-3", date: "2026.06.18", status: "completed", title: "本地字体与启动校验", detail: "引入中文字体子集，并补充 Node 检测、手机访问提示与检查能力。" },
            { id: "codex-personal-site-timeline-4", date: "2026.06.19", status: "completed", title: "Codex 维护工作流", detail: "建立站点更新、校验、发布与部署的维护流程。" },
            { id: "codex-personal-site-timeline-5", date: "2026.07.08", status: "completed", title: "四季动效扩展", detail: "接入花瓣、绿叶、秋叶、雪花及夏季萤火虫路径动画。" },
            { id: "codex-personal-site-timeline-6", date: "2026.07.09", status: "completed", title: "线上资源路径修复", detail: "修复 GitHub Pages 上掉落物和萤火虫资源的路径问题。" },
            { id: "codex-personal-site-timeline-7", date: "2026.07.13", status: "completed", title: "可读性与移动端视觉修正", detail: "增强文字对比度，并让移动端黑雾跟随主标题中心。" },
            { id: "codex-personal-site-timeline-8", date: "2026.07.13", status: "completed", title: "首屏资源压缩", detail: "背景改为 WebP，仅挂载当前季与下一季，并按实际使用精简字体。" },
            { id: "codex-personal-site-timeline-9", date: "2026.07.13", status: "completed", title: "项目板信息化", detail: "以阶段、更新时间、里程碑、下一步和公开链接替代无口径百分比。" },
            { id: "codex-personal-site-timeline-10", date: "日期未定", status: "planned", title: "补充公开测试证据", detail: "继续完善可公开的项目案例与测试证据。" }
          ]
        },
        {
          id: "codex-auto-editing",
          title: "自动剪辑项目",
          stage: "任务搭建中",
          updated: "2026.07.13",
          summary: "搭建从素材导入、脚本拆分、片段筛选到字幕封面输出的自动剪辑流程，目标是减少重复剪辑操作并提高成片效率。",
          milestones: ["明确素材导入与整理范围", "梳理脚本与镜头拆分步骤", "定义字幕与封面输出环节"],
          next: "收敛为可运行的最小流程，并验证字幕与封面输出。",
          links: [],
          visibility: "暂未公开",
          timeline: [
            { id: "codex-auto-editing-timeline-1", date: "2026.07.08", status: "completed", title: "项目方向记录", detail: "在项目板中记录自动剪辑方向、任务状态与工作流要点。" },
            { id: "codex-auto-editing-timeline-2", date: "日期未记录（截至 2026.07.13）", status: "completed", title: "素材与脚本流程梳理", detail: "明确素材导入与整理范围，并梳理脚本与镜头拆分步骤。" },
            { id: "codex-auto-editing-timeline-3", date: "日期未记录（截至 2026.07.13）", status: "completed", title: "输出环节定义", detail: "定义字幕与封面输出环节，作为后续最小流程的边界。" },
            { id: "codex-auto-editing-timeline-4", date: "2026.07.13 · 状态快照", status: "current", title: "任务搭建中", detail: "当前处于流程搭建阶段；该日期为状态更新时间，不代表项目完成日期。" },
            { id: "codex-auto-editing-timeline-5", date: "日期未定", status: "planned", title: "最小可运行流程验证", detail: "收敛为可运行流程，并验证字幕与封面输出。" }
          ]
        },
        {
          id: "codex-wechat-ai",
          title: "微信 AI 好友",
          stage: "等待真实通知联调",
          updated: "2026.05.18",
          summary: "PC 桌面微信 AI 好友的本地后台已发布；PC-only 接入层原型已编写，但真实通知到草稿的端到端链路仍待联调。",
          milestones: ["v3.0.0 本地后台发布", "PC-only 微信接入层原型编写", "Windows 通知与聊天复制双重确认", "微信窗口检测与非微信通知过滤", "无抢鼠标控制与自动发送安全闸门"],
          next: "用一条真实微信新消息联调“通知识别 → 进入聊天 → 复制确认 → 生成草稿”；自动发送继续保持关闭。",
          links: [],
          visibility: "暂未公开",
          timeline: [
            { id: "codex-wechat-ai-timeline-1", date: "2026.05.17", status: "completed", title: "v3.0.0 本地后台发布", detail: "发布 FastAPI 本地后台，提供消息、草稿、AI 回复、风险拦截与自动监听相关接口，并完成语法编译与版本导入检查。" },
            { id: "codex-wechat-ai-timeline-2", date: "2026.05.17–05.18", status: "completed", title: "PC-only 接入层原型编写", detail: "将集中式微信实现拆分为通知、窗口、剪贴板、解析、输入与工作流模块；保留兼容入口与已发送消息去重，代码尚待提交与端到端联调。" },
            { id: "codex-wechat-ai-timeline-3", date: "2026.05.17", status: "completed", title: "双确认与发送闸门", detail: "只有 Windows 通知与当前聊天复制都确认时才允许自动发送；其他来源仅填入草稿或展示，避免误发。" },
            { id: "codex-wechat-ai-timeline-4", date: "2026.05.17", status: "completed", title: "窗口检测与通知过滤修复", detail: "修复窗口枚举与尺寸阈值问题，识别到 Weixin 窗口；同时收紧通知来源过滤，不再把浏览器或系统通知误判为微信消息。" },
            { id: "codex-wechat-ai-timeline-5", date: "2026.05.18", status: "completed", title: "无抢鼠标交互改造", detail: "移除真实鼠标移动与点击；自动监听空闲时仅检查 Windows 通知，发现微信通知后才进入聊天复制确认。" },
            { id: "codex-wechat-ai-timeline-6", date: "2026.05.18 · 状态快照", status: "current", title: "等待真实通知联调", detail: "微信窗口检测正常，监听运行且自动发送关闭；尚未捕获可用的真实微信通知，消息、草稿与完整链路都未产生成功记录。" },
            { id: "codex-wechat-ai-timeline-7", date: "收到真实消息后", status: "planned", title: "验证完整消息链路", detail: "验证通知识别、进入聊天、复制确认、字段解析与生成草稿，并在双确认前不自动发送。" }
          ]
        }
      ]
    },
    showcase: {
      eyebrow: "Work Showcase",
      title: "项目展示",
      copy: "以标准格式归档网站测试用例，覆盖首页、导航与页面展示。",
      cardTitle: "网站用例",
      cardDescription: "YYQ 个人网站测试用例 · 73 条功能用例 · 3 个工作表",
      tags: ["XLSX", "标准测试格式", "首页 · 导航 · 页面展示"],
      downloadLabel: "下载用例",
      downloadHref: "files/YYQ个人网站测试用例-标准格式.xlsx"
    },
    skills: {
      eyebrow: "Skills",
      title: "测试能力与工具栈",
      copy: "环境系统测试，后端系统维护，环境搭建，AI工具操作",
      groups: [
        {
          id: "skills-ai",
          title: "AI 工具能力",
          items: [
            { id: "skills-ai-item-1", label: "Codex 协作开发" },
            { id: "skills-ai-item-2", label: "Builder.io 可视化编辑" },
            { id: "skills-ai-item-3", label: "提示词拆解与优化" },
            { id: "skills-ai-item-4", label: "AI 工作流梳理" }
          ]
        },
        {
          id: "skills-black-box",
          title: "黑盒测试",
          items: [
            { id: "skills-black-box-item-1", label: "冒烟测试" },
            { id: "skills-black-box-item-2", label: "边界值" },
            { id: "skills-black-box-item-3", label: "有效类" },
            { id: "skills-black-box-item-4", label: "错误处理" },
            { id: "skills-black-box-item-5", label: "UI 界面测试" },
            { id: "skills-black-box-item-6", label: "业务流程测试" }
          ]
        },
        {
          id: "skills-gray-box",
          title: "灰盒与环境",
          items: [
            { id: "skills-gray-box-item-1", label: "Mobaxterm" },
            { id: "skills-gray-box-item-2", label: "Linux 指令" },
            { id: "skills-gray-box-item-3", label: "弱网测试" },
            { id: "skills-gray-box-item-4", label: "Notepad++ 配置修改" },
            { id: "skills-gray-box-item-5", label: "客户环境搭建" }
          ]
        },
        {
          id: "skills-api-data",
          title: "接口与数据",
          items: [
            { id: "skills-api-data-item-1", label: "Postman" },
            { id: "skills-api-data-item-2", label: "MySQL增删改查操作" },
            { id: "skills-api-data-item-3", label: "日志定位" },
            { id: "skills-api-data-item-4", label: "前端控制台辅助判断" }
          ]
        }
      ]
    },
    resume: {
      eyebrow: "Resume",
      title: "公司与项目经历",
      copy: "",
      companies: [
        {
          id: "zhongdianjinxin-software",
          company: "中电金信软件",
          period: "2024.05 至今",
          role: "测试工程师",
          projects: [
            {
              id: "zhongdianjinxin-software-project-1",
              title: "银行客服大平台升级维护测试",
              time: "2024.05",
              summary: "银行客服平台优化升级、业务流程更新、新功能协助测试，并兼容 AI 对话平台自动化电话总结测试。",
              points: [
                { id: "zhongdianjinxin-software-project-1-point-1", text: "Postman 接口测试、造数查数" },
                { id: "zhongdianjinxin-software-project-1-point-2", text: "Mobaxterm 联调跳板机跑批数据" },
                { id: "zhongdianjinxin-software-project-1-point-3", text: "查看日志并定位问题原因" }
              ]
            },
            {
              id: "zhongdianjinxin-software-project-2",
              title: "数据披露双数据源 + 锁账",
              time: "2025.06",
              summary: "验证报表生成取值方向、双数据源联动逻辑和锁账相关数据条件。",
              points: [
                { id: "zhongdianjinxin-software-project-2-point-1", text: "MySQL 造数满足条件" },
                { id: "zhongdianjinxin-software-project-2-point-2", text: "多表联动取值验证" },
                { id: "zhongdianjinxin-software-project-2-point-3", text: "单逻辑和多逻辑覆盖" }
              ]
            },
            {
              id: "zhongdianjinxin-software-project-3",
              title: "养老金系统管理",
              time: "2026.02",
              summary: "验证养老金账户、护照、状态、个税计算，以及上传到报表生成的完整流程。",
              points: [
                { id: "zhongdianjinxin-software-project-3-point-1", text: "上传-签发-下载-报表生成" },
                { id: "zhongdianjinxin-software-project-3-point-2", text: "金额字段核对" },
                { id: "zhongdianjinxin-software-project-3-point-3", text: "数据库表逻辑与前端字段配合测试" }
              ]
            }
          ]
        },
        {
          id: "shanghai-lanjian-technology",
          company: "上海蓝涧科技",
          period: "2022.12 至 2024.01",
          role: "研发测试",
          projects: [
            {
              id: "shanghai-lanjian-technology-project-1",
              title: "自研边缘化 AI 工控机测试",
              time: "2022.12 - 2024.01",
              summary: "负责机器版本环境搭建、NANO 模块烧录、依赖安装、硬件与整机组装测试。",
              points: [
                { id: "shanghai-lanjian-technology-project-1-point-1", text: "Linux 客户环境搭建" },
                { id: "shanghai-lanjian-technology-project-1-point-2", text: "jtop / stress 压力测试" },
                { id: "shanghai-lanjian-technology-project-1-point-3", text: "lsusb 设备兼容识别" },
                { id: "shanghai-lanjian-technology-project-1-point-4", text: "脚本优化测试步骤" }
              ]
            }
          ]
        },
        {
          id: "shanghai-focus-media",
          company: "上海分众传媒",
          period: "2021.10 至 2022.07",
          role: "项目工程师",
          projects: [
            {
              id: "shanghai-focus-media-project-1",
              title: "广告机不同型号灰盒测试",
              time: "2021.10 - 2022.07",
              summary: "覆盖广告机功能、APK 问题、硬件增减影响、压力测试、直播流推送与指令识别。",
              points: [
                { id: "shanghai-focus-media-project-1-point-1", text: "串口指令测试" },
                { id: "shanghai-focus-media-project-1-point-2", text: "分辨率与显示关系配置" },
                { id: "shanghai-focus-media-project-1-point-3", text: "VMware 搭建 Linux 测试环境" },
                { id: "shanghai-focus-media-project-1-point-4", text: "LR 性能测试基础" }
              ]
            }
          ]
        },
        {
          id: "jiangnan-shipyard-group",
          company: "江南造船集团",
          period: "2018.01 至 2021.05",
          role: "软件测试工程师",
          projects: [
            {
              id: "jiangnan-shipyard-group-project-1",
              title: "鹰眼系统摄像头测试",
              time: "2019.10 - 2020.09",
              summary: "验证摄像头对违规行为人员的识别、处罚信息调取、处罚程度判断和通知扣款流程。",
              points: [
                { id: "jiangnan-shipyard-group-project-1-point-1", text: "Excel 设计测试用例" },
                { id: "jiangnan-shipyard-group-project-1-point-2", text: "用例评审与执行" },
                { id: "jiangnan-shipyard-group-project-1-point-3", text: "Bug 跟踪提交" },
                { id: "jiangnan-shipyard-group-project-1-point-4", text: "前后端问题归因" }
              ]
            },
            {
              id: "jiangnan-shipyard-group-project-2",
              title: "设备外壳氩弧焊",
              time: "2019.12",
              summary: "根据图纸设计参与设备外壳钣金焊接和硬件结构测试。",
              points: [
                { id: "jiangnan-shipyard-group-project-2-point-1", text: "外壳设计修改建议" },
                { id: "jiangnan-shipyard-group-project-2-point-2", text: "硬件密封性、温度、结构验证" }
              ]
            }
          ]
        }
      ]
    },
    contact: {
      eyebrow: "Reach Me",
      title: "上海市普陀区 · 杨烨齐",
      details: "17601252443 · 2279113571@qq.com",
      modalTitle: "WeChat",
      modalRegion: "中国大陆",
      modalDescription: "扫二维码，添加我为朋友。",
      phone: "17601252443",
      email: "2279113571@qq.com"
    }
  }
};
