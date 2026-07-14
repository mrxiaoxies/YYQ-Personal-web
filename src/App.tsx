import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";

const navItems = [
  { label: "Home", href: "#home" },
  { label: "Codex", href: "#codex" },
  { label: "Skills", href: "#skills" },
  { label: "Resume", href: "#resume" },
  { label: "Reach Me", href: "#contact" }
];

const assetUrl = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;

const seasonBackgrounds = [
  {
    key: "spring",
    label: "Spring",
    image: assetUrl("images/seasons/spring.webp"),
    mobileImage: assetUrl("images/seasons/mobile/spring.webp")
  },
  {
    key: "summer",
    label: "Summer",
    image: assetUrl("images/seasons/summer.webp"),
    mobileImage: assetUrl("images/seasons/mobile/summer.webp")
  },
  {
    key: "autumn",
    label: "Autumn",
    image: assetUrl("images/seasons/autumn.webp"),
    mobileImage: assetUrl("images/seasons/mobile/autumn.webp")
  },
  {
    key: "winter",
    label: "Winter",
    image: assetUrl("images/seasons/winter.webp"),
    mobileImage: assetUrl("images/seasons/mobile/winter.webp")
  }
];

const fallingSpriteSets = {
  spring: [
    { image: assetUrl("images/leaves/petal-slender.png"), ratio: 0.94 },
    { image: assetUrl("images/leaves/petal-round.png"), ratio: 1.29 }
  ],
  summer: [
    { image: assetUrl("images/leaves/summer-leaf-long.png"), ratio: 1.63 },
    { image: assetUrl("images/leaves/summer-leaf-maple.png"), ratio: 1.24 },
    { image: assetUrl("images/leaves/summer-leaf-narrow.png"), ratio: 1.52 }
  ],
  autumn: [
    { image: assetUrl("images/leaves/autumn-maple.png"), ratio: 1.08 },
    { image: assetUrl("images/leaves/autumn-leaf-long.png"), ratio: 1.62 }
  ],
  winter: [
    { image: assetUrl("images/leaves/winter-snowflake-1.png"), ratio: 1 },
    { image: assetUrl("images/leaves/winter-snowflake-2.png"), ratio: 1 },
    { image: assetUrl("images/leaves/winter-snowflake-3.png"), ratio: 1 }
  ]
};

type FallingSpriteSetKey = keyof typeof fallingSpriteSets;

const summerFireflySprite = assetUrl("images/effects/summer-firefly.png");

type RecentVisitor = {
  city?: string;
  country?: string;
  lastSeenAt: string;
  page: string;
  pageViews: number;
  referrer: string;
  sessionId: string;
  userAgent: string;
};

type AnalyticsStats = {
  generatedAt: string;
  lastVisitAt: string | null;
  onlineCount: number;
  onlineWindowSeconds: number;
  recentVisitors: RecentVisitor[];
  todayVisits: number;
  totalVisitors: number;
  totalVisits: number;
};

const analyticsVisitorIdKey = "yyq-analytics-visitor-id";
const analyticsSessionIdKey = "yyq-analytics-session-id";
const analyticsApiBase = (import.meta.env.VITE_ANALYTICS_API_BASE ?? "").replace(/\/$/, "");

function analyticsEndpoint(path: "/api/stats" | "/api/visit") {
  return `${analyticsApiBase}${path}`;
}

function createClientId(prefix: string) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomId}`;
}

function getStoredClientId(storage: Storage, key: string, prefix: string) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;

    const next = createClientId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return createClientId(prefix);
  }
}

function postAnalyticsEvent(event: "heartbeat" | "pageview", useBeacon = false) {
  if (typeof window === "undefined") return;

  const payload = {
    event,
    page: `${window.location.pathname}${window.location.hash || ""}`,
    referrer: document.referrer || "direct",
    sessionId: getStoredClientId(window.sessionStorage, analyticsSessionIdKey, "session"),
    userAgent: navigator.userAgent,
    visitorId: getStoredClientId(window.localStorage, analyticsVisitorIdKey, "visitor")
  };

  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(analyticsEndpoint("/api/visit"), blob);
    return;
  }

  void fetch(analyticsEndpoint("/api/visit"), {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST"
  }).catch(() => {
    // Vite dev server does not expose Netlify functions; ignore local 404/network noise.
  });
}

function useVisitorAnalytics(disabled: boolean) {
  useEffect(() => {
    if (disabled) return;

    postAnalyticsEvent("pageview");

    const heartbeatTimer = window.setInterval(() => postAnalyticsEvent("heartbeat"), 30_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") postAnalyticsEvent("heartbeat");
      if (document.visibilityState === "hidden") postAnalyticsEvent("heartbeat", true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      postAnalyticsEvent("heartbeat", true);
    };
  }, [disabled]);
}

function useMediaQuery(query: string) {
  const getMatches = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);

    onChange();
    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

type ProjectLink = {
  href: string;
  label: string;
};

type TimelineStatus = "completed" | "current" | "planned";

type TimelineEntry = {
  date: string;
  detail: string;
  status: TimelineStatus;
  title: string;
};

type CodexProject = {
  links: ProjectLink[];
  milestones: string[];
  next: string;
  stage: string;
  summary: string;
  timeline: TimelineEntry[];
  title: string;
  updated: string;
  visibility: string;
};

const codexProjects: CodexProject[] = [
  {
    title: "个人网站",
    stage: "持续优化中",
    updated: "2026.07.13",
    summary: "已完成四季滚动背景、液态玻璃面板、项目进度与简历模块，并加入春夏秋冬掉落物和夏季萤火虫路径动效。",
    milestones: ["四季背景切换", "花瓣/绿叶/秋叶/雪花", "萤火虫轨迹动效", "移动端体验优化", "首屏背景和字体资源压缩"],
    next: "继续补充项目案例与可公开的测试证据。",
    links: [{ label: "GitHub 仓库", href: "https://github.com/mrxiaoxies/YYQ-Personal-web" }],
    visibility: "已公开",
    timeline: [
      {
        date: "2026.06.12",
        status: "completed",
        title: "站点基础建立",
        detail: "建立 GitHub 发布准备、版本记录、操作文档与跨环境 npm 脚本。"
      },
      {
        date: "2026.06.13",
        status: "completed",
        title: "移动端四季背景",
        detail: "新增窄屏季节背景，并优化玻璃、光效与滚动渲染表现。"
      },
      {
        date: "2026.06.18",
        status: "completed",
        title: "本地字体与启动校验",
        detail: "引入中文字体子集，并补充 Node 检测、手机访问提示与检查能力。"
      },
      {
        date: "2026.06.19",
        status: "completed",
        title: "Codex 维护工作流",
        detail: "建立站点更新、校验、发布与部署的维护流程。"
      },
      {
        date: "2026.07.08",
        status: "completed",
        title: "四季动效扩展",
        detail: "接入花瓣、绿叶、秋叶、雪花及夏季萤火虫路径动画。"
      },
      {
        date: "2026.07.09",
        status: "completed",
        title: "线上资源路径修复",
        detail: "修复 GitHub Pages 上掉落物和萤火虫资源的路径问题。"
      },
      {
        date: "2026.07.13",
        status: "completed",
        title: "可读性与移动端视觉修正",
        detail: "增强文字对比度，并让移动端黑雾跟随主标题中心。"
      },
      {
        date: "2026.07.13",
        status: "completed",
        title: "首屏资源压缩",
        detail: "背景改为 WebP，仅挂载当前季与下一季，并按实际使用精简字体。"
      },
      {
        date: "2026.07.13",
        status: "completed",
        title: "项目板信息化",
        detail: "以阶段、更新时间、里程碑、下一步和公开链接替代无口径百分比。"
      },
      {
        date: "日期未定",
        status: "planned",
        title: "补充公开测试证据",
        detail: "继续完善可公开的项目案例与测试证据。"
      }
    ]
  },
  {
    title: "自动剪辑项目",
    stage: "任务搭建中",
    updated: "2026.07.13",
    summary: "搭建从素材导入、脚本拆分、片段筛选到字幕封面输出的自动剪辑流程，目标是减少重复剪辑操作并提高成片效率。",
    milestones: ["明确素材导入与整理范围", "梳理脚本与镜头拆分步骤", "定义字幕与封面输出环节"],
    next: "收敛为可运行的最小流程，并验证字幕与封面输出。",
    links: [],
    visibility: "暂未公开",
    timeline: [
      {
        date: "2026.07.08",
        status: "completed",
        title: "项目方向记录",
        detail: "在项目板中记录自动剪辑方向、任务状态与工作流要点。"
      },
      {
        date: "日期未记录（截至 2026.07.13）",
        status: "completed",
        title: "素材与脚本流程梳理",
        detail: "明确素材导入与整理范围，并梳理脚本与镜头拆分步骤。"
      },
      {
        date: "日期未记录（截至 2026.07.13）",
        status: "completed",
        title: "输出环节定义",
        detail: "定义字幕与封面输出环节，作为后续最小流程的边界。"
      },
      {
        date: "2026.07.13 · 状态快照",
        status: "current",
        title: "任务搭建中",
        detail: "当前处于流程搭建阶段；该日期为状态更新时间，不代表项目完成日期。"
      },
      {
        date: "日期未定",
        status: "planned",
        title: "最小可运行流程验证",
        detail: "收敛为可运行流程，并验证字幕与封面输出。"
      }
    ]
  },
  {
    title: "微信 AI 好友",
    stage: "等待真实通知联调",
    updated: "2026.05.18",
    summary: "PC 桌面微信 AI 好友的本地后台已发布；PC-only 接入层原型已编写，但真实通知到草稿的端到端链路仍待联调。",
    milestones: [
      "v3.0.0 本地后台发布",
      "PC-only 微信接入层原型编写",
      "Windows 通知与聊天复制双重确认",
      "微信窗口检测与非微信通知过滤",
      "无抢鼠标控制与自动发送安全闸门"
    ],
    next: "用一条真实微信新消息联调“通知识别 → 进入聊天 → 复制确认 → 生成草稿”；自动发送继续保持关闭。",
    links: [],
    visibility: "暂未公开",
    timeline: [
      {
        date: "2026.05.17",
        status: "completed",
        title: "v3.0.0 本地后台发布",
        detail: "发布 FastAPI 本地后台，提供消息、草稿、AI 回复、风险拦截与自动监听相关接口，并完成语法编译与版本导入检查。"
      },
      {
        date: "2026.05.17–05.18",
        status: "completed",
        title: "PC-only 接入层原型编写",
        detail: "将集中式微信实现拆分为通知、窗口、剪贴板、解析、输入与工作流模块；保留兼容入口与已发送消息去重，代码尚待提交与端到端联调。"
      },
      {
        date: "2026.05.17",
        status: "completed",
        title: "双确认与发送闸门",
        detail: "只有 Windows 通知与当前聊天复制都确认时才允许自动发送；其他来源仅填入草稿或展示，避免误发。"
      },
      {
        date: "2026.05.17",
        status: "completed",
        title: "窗口检测与通知过滤修复",
        detail: "修复窗口枚举与尺寸阈值问题，识别到 Weixin 窗口；同时收紧通知来源过滤，不再把浏览器或系统通知误判为微信消息。"
      },
      {
        date: "2026.05.18",
        status: "completed",
        title: "无抢鼠标交互改造",
        detail: "移除真实鼠标移动与点击；自动监听空闲时仅检查 Windows 通知，发现微信通知后才进入聊天复制确认。"
      },
      {
        date: "2026.05.18 · 状态快照",
        status: "current",
        title: "等待真实通知联调",
        detail: "微信窗口检测正常，监听运行且自动发送关闭；尚未捕获可用的真实微信通知，消息、草稿与完整链路都未产生成功记录。"
      },
      {
        date: "收到真实消息后",
        status: "planned",
        title: "验证完整消息链路",
        detail: "验证通知识别、进入聊天、复制确认、字段解析与生成草稿，并在双确认前不自动发送。"
      }
    ]
  }
];

const skillGroups = [
  {
    title: "AI 工具能力",
    items: ["Codex 协作开发", "Builder.io 可视化编辑", "提示词拆解与优化", "AI 工作流梳理"]
  },
  {
    title: "黑盒测试",
    items: ["冒烟测试", "边界值", "有效类", "错误处理", "UI 界面测试", "业务流程测试"]
  },
  {
    title: "灰盒与环境",
    items: ["Mobaxterm", "Linux 指令", "弱网测试", "Notepad++ 配置修改", "客户环境搭建"]
  },
  {
    title: "接口与数据",
    items: ["Postman", "MySQL增删改查操作", "日志定位", "前端控制台辅助判断"]
  }
];

const resumeCompanies = [
  {
    company: "中电金信软件",
    period: "2024.05 至今",
    role: "测试工程师",
    projects: [
      {
        title: "银行客服大平台升级维护测试",
        time: "2024.05",
        summary: "银行客服平台优化升级、业务流程更新、新功能协助测试，并兼容 AI 对话平台自动化电话总结测试。",
        points: ["Postman 接口测试、造数查数", "Mobaxterm 联调跳板机跑批数据", "查看日志并定位问题原因"]
      },
      {
        title: "数据披露双数据源 + 锁账",
        time: "2025.06",
        summary: "验证报表生成取值方向、双数据源联动逻辑和锁账相关数据条件。",
        points: ["MySQL 造数满足条件", "多表联动取值验证", "单逻辑和多逻辑覆盖"]
      },
      {
        title: "养老金系统管理",
        time: "2026.02",
        summary: "验证养老金账户、护照、状态、个税计算，以及上传到报表生成的完整流程。",
        points: ["上传-签发-下载-报表生成", "金额字段核对", "数据库表逻辑与前端字段配合测试"]
      }
    ]
  },
  {
    company: "上海蓝涧科技",
    period: "2022.12 至 2024.01",
    role: "研发测试",
    projects: [
      {
        title: "自研边缘化 AI 工控机测试",
        time: "2022.12 - 2024.01",
        summary: "负责机器版本环境搭建、NANO 模块烧录、依赖安装、硬件与整机组装测试。",
        points: ["Linux 客户环境搭建", "jtop / stress 压力测试", "lsusb 设备兼容识别", "脚本优化测试步骤"]
      }
    ]
  },
  {
    company: "上海分众传媒",
    period: "2021.10 至 2022.07",
    role: "项目工程师",
    projects: [
      {
        title: "广告机不同型号灰盒测试",
        time: "2021.10 - 2022.07",
        summary: "覆盖广告机功能、APK 问题、硬件增减影响、压力测试、直播流推送与指令识别。",
        points: ["串口指令测试", "分辨率与显示关系配置", "VMware 搭建 Linux 测试环境", "LR 性能测试基础"]
      }
    ]
  },
  {
    company: "江南造船集团",
    period: "2018.01 至 2021.05",
    role: "软件测试工程师",
    projects: [
      {
        title: "鹰眼系统摄像头测试",
        time: "2019.10 - 2020.09",
        summary: "验证摄像头对违规行为人员的识别、处罚信息调取、处罚程度判断和通知扣款流程。",
        points: ["Excel 设计测试用例", "用例评审与执行", "Bug 跟踪提交", "前后端问题归因"]
      },
      {
        title: "设备外壳氩弧焊",
        time: "2019.12",
        summary: "根据图纸设计参与设备外壳钣金焊接和硬件结构测试。",
        points: ["外壳设计修改建议", "硬件密封性、温度、结构验证"]
      }
    ]
  }
];

function FloatingForest({ fixedSeason }: { fixedSeason?: FallingSpriteSetKey }) {
  const isCompactVisual = useMediaQuery("(max-width: 767px)");
  const fixedSeasonIndex = fixedSeason ? Math.max(seasonBackgrounds.findIndex((season) => season.key === fixedSeason), 0) : 0;
  const layerRefs = useRef(new Map<number, HTMLImageElement>());
  const [activeSeasonStart, setActiveSeasonStart] = useState(fixedSeasonIndex);
  const activeSeasonStartRef = useRef(fixedSeasonIndex);
  const seasonBlendRef = useRef(0);
  const [fallingSpriteSetKey, setFallingSpriteSetKey] = useState<FallingSpriteSetKey>("spring");
  const [isSummerBackground, setIsSummerBackground] = useState(false);
  const fallingSpriteSetRef = useRef<FallingSpriteSetKey>("spring");
  const isSummerBackgroundRef = useRef(false);
  const particleCount = isCompactVisual ? 12 : 34;
  const leafCount = isCompactVisual ? 8 : 24;
  const fireflyCount = 2;
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }, (_, index) => ({
        delay: `${index * -0.72}s`,
        duration: `${13 + (index % 7) * 2.4}s`,
        left: `${(index * 29 + 9) % 100}%`,
        opacity: `${0.13 + (index % 5) * 0.055}`,
        size: `${1.5 + (index % 3) * 0.75}px`,
        top: `${(index * 17) % 96}%`
      })),
    [particleCount]
  );
  const leaves = useMemo(
    () =>
      Array.from({ length: leafCount }, (_, index) => {
        const sprites = fallingSpriteSets[fallingSpriteSetKey];
        const sprite = sprites[index % sprites.length];
        const maxSize = isCompactVisual ? 12 : 18;
        const width = sprite.ratio > 1 ? Math.round(maxSize / sprite.ratio) : maxSize;
        const height = sprite.ratio > 1 ? maxSize : Math.round(maxSize * sprite.ratio);
        const direction = index % 2 === 0 ? 1 : -1;

        return {
          delay: `${index * -1.36}s`,
          drift: `${direction * (42 + (index % 6) * 16)}px`,
          duration: `${18 + (index % 7) * 2.2}s`,
          height: `${height}px`,
          image: sprite.image,
          left: `${(index * 37 + 11) % 100}%`,
          midDrift: `${direction * (18 + (index % 6) * 7)}px`,
          opacity: `${0.78 + (index % 3) * 0.06}`,
          rotate: `${(index * 43) % 360}deg`,
          spin: `${260 + (index % 5) * 54}deg`,
          width: `${width}px`
        };
      }),
    [fallingSpriteSetKey, isCompactVisual, leafCount]
  );
  const fireflies = useMemo(
    () => {
      const size = isCompactVisual ? 18 : 24;
      const routes = [
        {
          delay: "-4.8s",
          duration: isCompactVisual ? "32s" : "40s",
          opacity: 0.84,
          points: isCompactVisual
            ? [
                ["92vw", "18vh", "-50deg", "138deg"],
                ["76vw", "28vh", "-32deg", "150deg"],
                ["58vw", "26vh", "-60deg", "120deg"],
                ["42vw", "33vh", "-36deg", "154deg"],
                ["25vw", "28vh", "-64deg", "116deg"],
                ["9vw", "35vh", "-42deg", "144deg"],
                ["3vw", "42vh", "-18deg", "162deg"]
              ]
            : [
                ["90vw", "12vh", "-48deg", "138deg"],
                ["76vw", "23vh", "-34deg", "150deg"],
                ["59vw", "27vh", "-60deg", "120deg"],
                ["45vw", "24vh", "-30deg", "156deg"],
                ["29vw", "30vh", "-68deg", "112deg"],
                ["13vw", "25vh", "-42deg", "146deg"],
                ["4vw", "33vh", "-20deg", "162deg"]
              ]
        },
        {
          delay: "-16s",
          duration: isCompactVisual ? "36s" : "46s",
          opacity: 0.78,
          points: isCompactVisual
            ? [
                ["5vw", "76vh", "134deg", "-36deg"],
                ["18vw", "65vh", "118deg", "-52deg"],
                ["33vw", "70vh", "154deg", "-22deg"],
                ["47vw", "61vh", "118deg", "-58deg"],
                ["65vw", "56vh", "146deg", "-32deg"],
                ["83vw", "65vh", "118deg", "-62deg"],
                ["94vw", "52vh", "162deg", "-18deg"]
              ]
            : [
                ["6vw", "74vh", "136deg", "-38deg"],
                ["20vw", "62vh", "116deg", "-54deg"],
                ["37vw", "69vh", "154deg", "-22deg"],
                ["52vw", "60vh", "118deg", "-58deg"],
                ["68vw", "55vh", "146deg", "-34deg"],
                ["84vw", "64vh", "118deg", "-62deg"],
                ["94vw", "49vh", "160deg", "-20deg"]
              ]
        }
      ].slice(0, fireflyCount);

      return routes.map((route) => ({
        delay: route.delay,
        duration: route.duration,
        left: "0",
        dimOpacity: `${(route.opacity * 0.68).toFixed(3)}`,
        opacity: `${route.opacity.toFixed(3)}`,
        softOpacity: `${(route.opacity * 0.88).toFixed(3)}`,
        top: "0",
        width: `${size}px`,
        height: `${Math.round(size * 0.97)}px`,
        x0: route.points[0][0],
        y0: route.points[0][1],
        r0: route.points[0][2],
        rb0: route.points[0][3],
        x1: route.points[1][0],
        y1: route.points[1][1],
        r1: route.points[1][2],
        rb1: route.points[1][3],
        x2: route.points[2][0],
        y2: route.points[2][1],
        r2: route.points[2][2],
        rb2: route.points[2][3],
        x3: route.points[3][0],
        y3: route.points[3][1],
        r3: route.points[3][2],
        rb3: route.points[3][3],
        x4: route.points[4][0],
        y4: route.points[4][1],
        r4: route.points[4][2],
        rb4: route.points[4][3],
        x5: route.points[5][0],
        y5: route.points[5][1],
        r5: route.points[5][2],
        rb5: route.points[5][3],
        x6: route.points[6][0],
        y6: route.points[6][1],
        r6: route.points[6][2],
        rb6: route.points[6][3]
      }));
    },
    [fireflyCount, isCompactVisual]
  );

  useEffect(() => {
    if (fixedSeason) {
      const nextFallingSpriteSetKey = fixedSeason;
      const nextIsSummerBackground = fixedSeason === "summer";

      activeSeasonStartRef.current = fixedSeasonIndex;
      seasonBlendRef.current = 0;
      setActiveSeasonStart(fixedSeasonIndex);

      if (fallingSpriteSetRef.current !== nextFallingSpriteSetKey) {
        fallingSpriteSetRef.current = nextFallingSpriteSetKey;
        setFallingSpriteSetKey(nextFallingSpriteSetKey);
      }

      if (isSummerBackgroundRef.current !== nextIsSummerBackground) {
        isSummerBackgroundRef.current = nextIsSummerBackground;
        setIsSummerBackground(nextIsSummerBackground);
      }

      return;
    }

    let frameId = 0;

    const updateSeasonLayers = () => {
      const scrollTop = window.scrollY;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const scrollProgress = Math.min(1, Math.max(0, scrollTop / maxScroll));
      const nextFallingSpriteSetKey: FallingSpriteSetKey =
        scrollProgress >= 5 / 6
          ? "winter"
          : scrollProgress >= 1 / 2
            ? "autumn"
            : scrollProgress >= 1 / 6
              ? "summer"
              : "spring";
      const nextIsSummerBackground = scrollProgress >= 1 / 6 && scrollProgress < 1 / 2;

      if (fallingSpriteSetRef.current !== nextFallingSpriteSetKey) {
        fallingSpriteSetRef.current = nextFallingSpriteSetKey;
        setFallingSpriteSetKey(nextFallingSpriteSetKey);
      }

      if (isSummerBackgroundRef.current !== nextIsSummerBackground) {
        isSummerBackgroundRef.current = nextIsSummerBackground;
        setIsSummerBackground(nextIsSummerBackground);
      }

      const scaledProgress = scrollProgress * (seasonBackgrounds.length - 1);
      const nextActiveSeasonStart = Math.min(Math.floor(scaledProgress), seasonBackgrounds.length - 2);
      const nextSeasonBlend = scaledProgress - nextActiveSeasonStart;
      seasonBlendRef.current = nextSeasonBlend;

      if (activeSeasonStartRef.current !== nextActiveSeasonStart) {
        activeSeasonStartRef.current = nextActiveSeasonStart;
        setActiveSeasonStart(nextActiveSeasonStart);
      }

      const currentLayer = layerRefs.current.get(nextActiveSeasonStart);
      const nextLayer = layerRefs.current.get(nextActiveSeasonStart + 1);
      if (currentLayer) currentLayer.style.opacity = (1 - nextSeasonBlend).toFixed(3);
      if (nextLayer) nextLayer.style.opacity = nextSeasonBlend.toFixed(3);

      frameId = 0;
    };

    const requestSeasonUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateSeasonLayers);
    };

    updateSeasonLayers();
    window.addEventListener("scroll", requestSeasonUpdate, { passive: true });
    window.addEventListener("resize", requestSeasonUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", requestSeasonUpdate);
      window.removeEventListener("resize", requestSeasonUpdate);
    };
  }, [fixedSeason, fixedSeasonIndex, isCompactVisual]);

  const visibleSeasonIndexes = fixedSeason ? [fixedSeasonIndex] : [activeSeasonStart, activeSeasonStart + 1];

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {visibleSeasonIndexes.map((index) => {
        const season = seasonBackgrounds[index];
        const isCurrentLayer = index === activeSeasonStart;
        const opacity = fixedSeason ? 1 : isCurrentLayer ? 1 - seasonBlendRef.current : seasonBlendRef.current;
        const isInitialSeason = fixedSeason ? true : index === 0;

        return (
          <img
            alt=""
            aria-hidden="true"
            className={`season-background season-background-${season.key} absolute inset-0 h-full w-full object-cover`}
            decoding="async"
            fetchPriority={isInitialSeason ? "high" : "low"}
            key={season.key}
            loading={isInitialSeason ? "eager" : "lazy"}
            ref={(node) => {
              if (node) {
                layerRefs.current.set(index, node);
              } else {
                layerRefs.current.delete(index);
              }
            }}
            src={isCompactVisual ? season.mobileImage : season.image}
            style={{ opacity }}
          />
        );
      })}
      <div className="forest-depth absolute inset-0" />
      <div className="forest-light absolute inset-0" />
      <div className="forest-mist absolute inset-0" />
      <div
        aria-hidden="true"
        className={`forest-firefly-layer absolute inset-0 ${isSummerBackground ? "is-summer-active" : ""}`}
      >
        {fireflies.map((firefly, index) => (
          <span
            className="forest-firefly absolute"
            key={`firefly-${index}`}
            style={
              {
                animationDelay: firefly.delay,
                height: firefly.height,
                left: firefly.left,
                top: firefly.top,
                width: firefly.width,
                "--firefly-duration": firefly.duration,
                "--firefly-dim-opacity": firefly.dimOpacity,
                "--firefly-image": `url("${summerFireflySprite}")`,
                "--firefly-opacity": firefly.opacity,
                "--firefly-soft-opacity": firefly.softOpacity,
                "--firefly-r0": firefly.r0,
                "--firefly-r1": firefly.r1,
                "--firefly-r2": firefly.r2,
                "--firefly-r3": firefly.r3,
                "--firefly-r4": firefly.r4,
                "--firefly-r5": firefly.r5,
                "--firefly-r6": firefly.r6,
                "--firefly-rb0": firefly.rb0,
                "--firefly-rb1": firefly.rb1,
                "--firefly-rb2": firefly.rb2,
                "--firefly-rb3": firefly.rb3,
                "--firefly-rb4": firefly.rb4,
                "--firefly-rb5": firefly.rb5,
                "--firefly-rb6": firefly.rb6,
                "--firefly-x0": firefly.x0,
                "--firefly-x1": firefly.x1,
                "--firefly-x2": firefly.x2,
                "--firefly-x3": firefly.x3,
                "--firefly-x4": firefly.x4,
                "--firefly-x5": firefly.x5,
                "--firefly-x6": firefly.x6,
                "--firefly-y0": firefly.y0,
                "--firefly-y1": firefly.y1,
                "--firefly-y2": firefly.y2,
                "--firefly-y3": firefly.y3,
                "--firefly-y4": firefly.y4,
                "--firefly-y5": firefly.y5,
                "--firefly-y6": firefly.y6
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div aria-hidden="true" className="forest-leaf-layer absolute inset-0">
        {leaves.map((leaf, index) => (
          <span
            className={`forest-leaf forest-leaf-${index % 3} absolute`}
            key={`leaf-${index}`}
            style={
              {
                animationDelay: leaf.delay,
                left: leaf.left,
                top: "-14vh",
                width: leaf.width,
                height: leaf.height,
                "--leaf-drift": leaf.drift,
                "--leaf-duration": leaf.duration,
                "--leaf-image": `url("${leaf.image}")`,
                "--leaf-mid-drift": leaf.midDrift,
                "--leaf-opacity": leaf.opacity,
                "--leaf-rotate": leaf.rotate,
                "--leaf-spin": leaf.spin
              } as CSSProperties
            }
          />
        ))}
      </div>
      {particles.map((particle, index) => (
        <span
          aria-hidden="true"
          className="forest-particle absolute rounded-[1px]"
          key={`particle-${index}`}
          style={
            {
              animationDelay: particle.delay,
              left: particle.left,
              opacity: particle.opacity,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              "--particle-duration": particle.duration
            } as CSSProperties
          }
        />
      ))}
      <div className="forest-vignette absolute inset-0" />
    </div>
  );
}

function DynamicLightRig() {
  const isCompactVisual = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (isCompactVisual) {
      const root = document.documentElement;
      root.style.setProperty("--light-x", "32%");
      root.style.setProperty("--light-y", "18%");
      root.style.setProperty("--light-intensity", "0.72");
      return;
    }

    let frameId = 0;
    const root = document.documentElement;

    const animateLight = (time: number) => {
      const x = 28 + Math.sin(time / 5200) * 12 + Math.sin(time / 9300) * 6;
      const y = 18 + Math.cos(time / 6800) * 9;
      const intensity = 0.72 + Math.sin(time / 4100) * 0.16;

      root.style.setProperty("--light-x", `${x.toFixed(2)}%`);
      root.style.setProperty("--light-y", `${y.toFixed(2)}%`);
      root.style.setProperty("--light-intensity", intensity.toFixed(3));

      frameId = window.requestAnimationFrame(animateLight);
    };

    frameId = window.requestAnimationFrame(animateLight);

    return () => window.cancelAnimationFrame(frameId);
  }, [isCompactVisual]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9] overflow-hidden">
      <div className="trace-light trace-light-main absolute inset-0" />
      <div className="trace-light trace-light-soft absolute inset-0" />
    </div>
  );
}

/*
function SeasonalForest({ season }: { season: SeasonKey }) {
  const particles = Array.from({ length: season === "winter" ? 42 : season === "autumn" ? 30 : 24 }, (_, index) => ({
    delay: `${index * -0.46}s`,
    left: `${(index * 31 + 7) % 100}%`,
    size: `${season === "autumn" ? 3 + (index % 3) : 2 + (index % 2)}px`,
    top: `${(index * 23) % 100}%`
  }));

  return (
    <div className={`season-forest season-${season}`}>
      <div className="season-base" />
      <div className="season-leaves season-leaves-far" />
      <div className="season-leaves season-leaves-mid" />
      <div className="season-leaves season-leaves-near" />
      <div className="season-weather" />
      {particles.map((particle, index) => (
        <span
          aria-hidden="true"
          className="season-particle"
          key={`${season}-${index}`}
          style={
            {
              animationDelay: particle.delay,
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function SeasonReview() {
  const [season, setSeason] = useState<SeasonKey>("spring");
  const activeScene = seasonScenes.find((scene) => scene.key === season) ?? seasonScenes[0];

  return (
    <main className="season-review min-h-screen overflow-hidden bg-[#07131b] text-white">
      <SeasonalForest season={season} />

      <nav className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a className="text-3xl tracking-tight" href="/" style={{ fontFamily: "var(--font-display)" }}>
          Yang Yeqi<sup className="text-xs">®</sup>
        </a>
        <div className="liquid-glass flex gap-2 rounded-full p-1.5">
          {seasonScenes.map((scene) => (
            <button
              className={`season-tab ${scene.key === season ? "season-tab-active" : ""}`}
              key={scene.key}
              onClick={() => setSeason(scene.key)}
              type="button"
            >
              {scene.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl flex-col justify-center px-6 pb-24">
        <p className="max-w-xl text-sm uppercase tracking-[0.32em] text-white/58">{activeScene.weather}</p>
        <h1 className="mt-5 max-w-3xl text-6xl font-normal leading-none sm:text-8xl" style={{ fontFamily: "var(--font-display)" }}>
          {activeScene.label}
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/64">
          Fixed camera, layered foliage motion, {activeScene.breeze} seasonal wind.
        </p>
      </section>
    </main>
  );
}

*/
function SectionHeading({
  eyebrow,
  title,
  copy,
  eyebrowClassName = "text-sm font-medium text-forest-muted-foreground",
  copyClassName = "text-base text-forest-muted-foreground sm:text-lg"
}: {
  eyebrow: string;
  title: string;
  copy: string;
  eyebrowClassName?: string;
  copyClassName?: string;
}) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <p className={`uppercase tracking-[0.28em] ${eyebrowClassName}`}>{eyebrow}</p>
      <h2
        className="mt-4 text-4xl font-normal leading-none tracking-[-1.2px] text-foreground sm:text-6xl"
        style={{ fontFamily: "var(--font-cjk-display)" }}
      >
        {title}
      </h2>
      {copy ? <p className={`mt-5 leading-relaxed ${copyClassName}`}>{copy}</p> : null}
    </div>
  );
}

function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    let frameId = 0;

    const updateRevealState = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const enterTop = viewportHeight * 0.88;
      const enterBottom = viewportHeight * 0.04;
      const exitTop = viewportHeight * 1.08;
      const exitBottom = -viewportHeight * 0.08;
      const rect = panel.getBoundingClientRect();
      const shouldEnter = rect.top < enterTop && rect.bottom > enterBottom;
      const shouldExit = rect.top > exitTop || rect.bottom < exitBottom;

      setIsInView((current) => {
        if (!current && shouldEnter) return true;
        if (current && shouldExit) return false;
        return current;
      });

      frameId = 0;
    };

    const requestRevealUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateRevealState);
    };

    updateRevealState();
    window.addEventListener("scroll", requestRevealUpdate, { passive: true });
    window.addEventListener("resize", requestRevealUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", requestRevealUpdate);
      window.removeEventListener("resize", requestRevealUpdate);
    };
  }, []);

  return (
    <div
      className={`scroll-reveal ${isInView ? "is-in-view" : ""} liquid-glass glass-panel light-reactive ${className}`}
      ref={panelRef}
    >
      {children}
    </div>
  );
}

function formatMetric(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "暂无记录";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

function AnalyticsDashboard() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("yyq-admin-token") ?? "";
  });
  const [tokenInput, setTokenInput] = useState(token);

  const loadStats = useCallback(async (nextToken = token) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(analyticsEndpoint("/api/stats"), {
        headers: nextToken ? { "x-admin-token": nextToken } : {},
        method: "GET"
      });

      if (response.status === 401) {
        setStats(null);
        setError("后台口令未填写或不正确。请填写 Netlify 环境变量 VISITOR_ADMIN_TOKEN 对应的口令。");
        return;
      }

      if (!response.ok) throw new Error(`stats request failed: ${response.status}`);

      const nextStats = (await response.json()) as AnalyticsStats;
      setStats(nextStats);
    } catch {
      setStats(null);
      setError("暂时连接不到统计接口。本地 Vite 预览不会启动 Netlify Functions，部署到 Netlify 后即可记录真实访问。");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStats();

    const timer = window.setInterval(() => {
      void loadStats();
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [loadStats]);

  const saveToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    setToken(nextToken);
    window.sessionStorage.setItem("yyq-admin-token", nextToken);
    void loadStats(nextToken);
  };

  const metrics = [
    { detail: "每次页面打开会记录一次", label: "总访问次数", value: formatMetric(stats?.totalVisits) },
    { detail: "按浏览器访客 ID 统计", label: "独立访客", value: formatMetric(stats?.totalVisitors) },
    { detail: "按北京时间自然日统计", label: "今日访问", value: formatMetric(stats?.todayVisits) },
    { detail: `${stats?.onlineWindowSeconds ?? 90} 秒内有心跳的访客`, label: "当前在线", value: formatMetric(stats?.onlineCount) }
  ];

  return (
    <section className="relative z-10 min-h-screen px-6 pb-28 pt-32">
      <SectionHeading
        copy="实时查看网站访问次数、独立访客和当前在线人数。这个入口不会显示在导航里，访问 #admin 即可进入。"
        copyClassName="text-base font-semibold text-white sm:text-lg"
        eyebrow="Admin Console"
        eyebrowClassName="text-base font-semibold text-white"
        title="访问统计后台"
      />

      <div className="mx-auto max-w-6xl space-y-5">
        <GlassPanel className="admin-toolbar p-5">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-forest-muted-foreground">Live Status</p>
            <p className="mt-2 text-sm text-foreground">
              最新刷新：{isLoading ? "正在刷新" : formatDateTime(stats?.generatedAt)}
            </p>
          </div>

          <form className="admin-token-form" onSubmit={saveToken}>
            <input
              aria-label="后台口令"
              className="admin-token-input"
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="后台口令，可选"
              type="password"
              value={tokenInput}
            />
            <Button className="liquid-glass forest-control light-reactive rounded-full px-5 py-2 text-sm text-foreground" type="submit" variant="ghost">
              刷新统计
            </Button>
          </form>
        </GlassPanel>

        {error ? <GlassPanel className="p-5 text-sm font-semibold text-white">{error}</GlassPanel> : null}

        <div className="grid gap-5 md:grid-cols-4">
          {metrics.map((metric) => (
            <GlassPanel className="admin-metric-card p-5" key={metric.label}>
              <p className="text-sm uppercase tracking-[0.2em] text-forest-muted-foreground">{metric.label}</p>
              <p className="mt-4 text-4xl font-semibold text-foreground">{metric.value}</p>
              <p className="mt-3 text-sm text-forest-muted-foreground">{metric.detail}</p>
            </GlassPanel>
          ))}
        </div>

        <GlassPanel className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-forest-muted-foreground">Online Sessions</p>
              <h3 className="mt-3 text-3xl font-semibold text-foreground">当前在线访客</h3>
            </div>
            <p className="text-sm text-forest-muted-foreground">最近访问：{formatDateTime(stats?.lastVisitAt)}</p>
          </div>

          <div className="admin-session-list mt-6">
            {stats?.recentVisitors.length ? (
              stats.recentVisitors.map((visitor) => (
                <div className="admin-session-row" key={`${visitor.sessionId}-${visitor.lastSeenAt}`}>
                  <div>
                    <p className="font-semibold text-foreground">访客 {visitor.sessionId}</p>
                    <p className="mt-1 text-sm text-forest-muted-foreground">{visitor.page || "/"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{formatDateTime(visitor.lastSeenAt)}</p>
                    <p className="mt-1 text-sm text-forest-muted-foreground">
                      {visitor.country || "未知地区"}{visitor.city ? ` · ${visitor.city}` : ""} · {visitor.pageViews} 次页面访问
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm font-semibold text-forest-muted-foreground">当前没有在线访客。</p>
            )}
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}

function ProjectTimelinePage() {
  const statusLabels: Record<TimelineStatus, string> = {
    completed: "已完成",
    current: "当前记录",
    planned: "待推进"
  };
  const statusClasses: Record<TimelineStatus, string> = {
    completed: "border-emerald-200/30 bg-emerald-200/10 text-emerald-50",
    current: "border-sky-200/30 bg-sky-200/10 text-sky-50",
    planned: "border-amber-100/30 bg-amber-100/10 text-amber-50"
  };
  const dotClasses: Record<TimelineStatus, string> = {
    completed: "bg-emerald-100",
    current: "bg-sky-100",
    planned: "bg-amber-100"
  };

  return (
    <div className="relative z-10 min-h-screen px-6 pb-28 pt-36">
      <section className="mx-auto max-w-6xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.32em] text-forest-muted-foreground">Codex Project Timeline</p>
        <h1 className="mt-5 text-5xl font-normal tracking-[-1.2px] text-foreground sm:text-7xl" style={{ fontFamily: "var(--font-cjk-display)" }}>
          项目进度
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-forest-muted-foreground sm:text-lg">
          按时间与里程碑逐项记录 Codex 项目。标为“状态快照”的日期仅表示记录更新时间，不代表该项目在当天完成。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs">
          <span className="rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-emerald-50">已完成</span>
          <span className="rounded-full border border-sky-200/30 bg-sky-200/10 px-3 py-1 text-sky-50">当前记录</span>
          <span className="rounded-full border border-amber-100/30 bg-amber-100/10 px-3 py-1 text-amber-50">待推进</span>
        </div>
        <Button asChild className="liquid-glass forest-control light-reactive mt-8 rounded-full px-6 py-2.5 text-sm text-foreground" type="button" variant="ghost">
          <a href="#codex">返回项目板</a>
        </Button>
      </section>

      <div className="mx-auto mt-16 grid max-w-6xl gap-7">
        {codexProjects.map((project) => (
          <GlassPanel className="p-6 sm:p-8" key={project.title}>
            <header className="grid gap-6 border-b border-white/10 pb-7 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-forest-muted-foreground">Codex Project</p>
                <h2 className="mt-4 text-4xl leading-tight text-foreground sm:text-5xl" style={{ fontFamily: "var(--font-cjk-display)" }}>
                  {project.title}
                </h2>
                <p className="mt-4 max-w-3xl leading-relaxed text-forest-muted-foreground">{project.summary}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-left md:min-w-[260px]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-forest-muted-foreground">当前阶段</dt>
                  <dd className="mt-2 text-sm text-foreground">{project.stage}</dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-forest-muted-foreground">更新时间</dt>
                  <dd className="mt-2 text-sm text-foreground">{project.updated}</dd>
                </div>
              </dl>
            </header>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-forest-muted-foreground">时间轴 / 里程碑</p>
              <div className="relative mt-6">
                <div aria-hidden="true" className="absolute bottom-6 left-[7px] top-6 w-px bg-white/15" />
                <ol className="space-y-6">
                  {project.timeline.map((entry) => (
                    <li className="relative pl-10" key={`${entry.date}-${entry.title}`}>
                      <span aria-hidden="true" className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-[#18332c] ${dotClasses[entry.status]}`} />
                      <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs font-semibold tracking-[0.12em] text-forest-muted-foreground">{entry.date}</p>
                          <span className={`rounded-full border px-3 py-1 text-xs ${statusClasses[entry.status]}`}>{statusLabels[entry.status]}</span>
                        </div>
                        <h3 className="mt-4 text-xl font-medium text-foreground">{entry.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-forest-muted-foreground">{entry.detail}</p>
                      </article>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <footer className="mt-8 grid gap-4 border-t border-white/10 pt-7 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">下一步</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">{project.next}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">演示 / GitHub</p>
                {project.links.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {project.links.map((link) => (
                      <a className="text-sm text-foreground underline decoration-white/40 underline-offset-4 transition hover:decoration-white" href={link.href} key={link.href} rel="noreferrer" target="_blank">
                        {link.label} →
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-forest-muted-foreground">暂无公开演示或仓库（{project.visibility}）</p>
                )}
              </div>
            </footer>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [qrImageReady, setQrImageReady] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const qrCells = Array.from({ length: 29 * 29 }, (_, index) => {
    const x = index % 29;
    const y = Math.floor(index / 29);
    const finderOrigins = [
      [1, 1],
      [21, 1],
      [1, 21]
    ];

    for (const [originX, originY] of finderOrigins) {
      const localX = x - originX;
      const localY = y - originY;

      if (localX >= 0 && localX < 7 && localY >= 0 && localY < 7) {
        const outer = localX === 0 || localX === 6 || localY === 0 || localY === 6;
        const inner = localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4;
        return outer || inner;
      }

      if (localX >= -1 && localX < 8 && localY >= -1 && localY < 8) return false;
    }

    return (x * 7 + y * 11 + x * y + (x % 3) * 5 + (y % 4) * 3) % 9 < 4;
  });

  const requestClose = useCallback(() => {
    setIsClosing((closing) => (closing ? closing : true));
  }, []);

  useEffect(() => {
    if (!isClosing) return;

    const timer = window.setTimeout(onClose, 380);
    return () => window.clearTimeout(timer);
  }, [isClosing, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return (
    <div className={`contact-modal fixed inset-0 z-50 flex items-center justify-center px-5 py-8 ${isClosing ? "is-closing" : ""}`}>
      <button
        aria-label="关闭联系弹窗"
        className="contact-modal-backdrop absolute inset-0"
        onClick={requestClose}
        type="button"
      />
      <div
        aria-labelledby="contact-dialog-title"
        aria-modal="true"
        className="contact-dialog liquid-glass light-reactive relative z-10 w-full max-w-[540px] rounded-[34px] p-4 sm:p-6"
        role="dialog"
      >
        <button
          aria-label="关闭"
          className="contact-close absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center gap-0 rounded-full text-lg text-foreground"
          onClick={requestClose}
          type="button"
        >
          ×
        </button>

        <div className="contact-card rounded-[28px] px-6 py-8 text-center sm:px-10">
          <div className="flex items-center gap-5 text-left">
            <div className="contact-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-semibold">
              杨
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground" id="contact-dialog-title">
                WeChat
              </p>
              <p className="mt-1 text-2xl font-semibold">中国大陆</p>
            </div>
          </div>

          <div className="contact-qr-stage mx-auto mt-8">
            {qrImageReady ? (
              <img
                alt="微信二维码"
                className="contact-qr-image"
                onError={() => setQrImageReady(false)}
                src={assetUrl("images/wechat-contact.png")}
              />
            ) : (
              <div aria-label="微信二维码占位图" className="contact-qr-fallback" role="img">
                <div className="contact-qr-grid">
                  {qrCells.map((isDark, index) => (
                    <span className={`contact-qr-cell ${isDark ? "is-dark" : ""}`} key={`qr-cell-${index}`} />
                  ))}
                </div>
                <div className="contact-wechat-mark">微信</div>
              </div>
            )}
          </div>

          <p className="mt-7 text-lg font-medium text-muted-foreground">扫二维码，添加我为朋友。</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-black/10 px-3 py-1">17601252443</span>
            <span className="rounded-full bg-black/10 px-3 py-1">2279113571@qq.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type AppView = "admin" | "projects" | "site";

function getAppView(): AppView {
  if (typeof window === "undefined") return "site";
  if (window.location.hash === "#admin") return "admin";
  if (window.location.hash === "#projects") return "projects";
  return "site";
}

function App() {
  const [openCompany, setOpenCompany] = useState(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [appView, setAppView] = useState<AppView>(getAppView);
  const isAdminView = appView === "admin";
  const isProjectTimelineView = appView === "projects";

  useVisitorAnalytics(isAdminView);

  useEffect(() => {
    const updateView = () => setAppView(getAppView());

    window.addEventListener("hashchange", updateView);
    updateView();

    return () => window.removeEventListener("hashchange", updateView);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const frameId = window.requestAnimationFrame(() => {
      if (appView === "projects") {
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }

      if (appView !== "site") return;

      const targetId = window.location.hash.slice(1);
      if (!targetId || targetId === "home") {
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }

      document.getElementById(targetId)?.scrollIntoView({ block: "start", behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [appView]);

  useEffect(() => {
    if (!contactModalOpen) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [contactModalOpen]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <FloatingForest fixedSeason={isProjectTimelineView ? "spring" : undefined} />
      <DynamicLightRig />

      <nav className="fixed inset-x-0 top-0 z-20 mx-auto flex max-w-7xl flex-row items-center justify-between px-6 py-5 sm:px-8">
        <a
          className="light-reactive-text text-3xl tracking-tight text-foreground"
          href="#home"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Yang Yeqi<sup className="text-xs">®</sup>
        </a>

        {isProjectTimelineView ? (
          <a className="liquid-glass forest-control light-reactive hidden rounded-full px-6 py-3 text-sm text-foreground transition-transform hover:scale-[1.03] md:inline-flex" href="#codex">
            返回项目板
          </a>
        ) : (
          <div className="liquid-glass forest-control light-reactive hidden items-center gap-7 rounded-full px-6 py-3 md:flex">
            {navItems.map((item, index) => (
              <a
                className={`text-sm transition-colors hover:text-foreground ${
                  index === 0 ? "text-foreground" : "text-forest-muted-foreground"
                }`}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}

        <Button
          className="liquid-glass forest-control light-reactive rounded-full px-6 py-2.5 text-sm text-foreground transition-transform hover:scale-[1.03]"
          onClick={() => setContactModalOpen(true)}
          type="button"
          variant="ghost"
        >
          联系我
        </Button>
      </nav>

      {isAdminView ? (
        <AnalyticsDashboard />
      ) : isProjectTimelineView ? (
        <ProjectTimelinePage />
      ) : (
        <div className="site-flow relative z-10 flex flex-col">
      <section
        className="hero-contrast order-1 relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-[90px] pb-40 pt-36 text-center"
        id="home"
      >
        <p className="animate-fade-rise light-reactive-text text-sm font-medium uppercase tracking-[0.32em] text-forest-muted-foreground">
          Software Test Engineer / AI Workflow Builder
        </p>
        <h1
          className="animate-fade-rise light-reactive-text mt-6 max-w-6xl text-5xl font-light leading-[1.08] tracking-[0.02em] sm:text-6xl md:text-7xl"
          style={{
            fontFamily: "var(--font-cjk-display)"
          }}
        >
          <span className="block">把复杂流程</span>
          <em className="block not-italic text-forest-muted-foreground">测试到安静可靠。</em>
        </h1>
        <p className="animate-fade-rise-delay light-reactive-text mt-8 max-w-2xl text-base leading-relaxed text-forest-muted-foreground sm:text-lg">
          杨烨齐｜软件测试工程师 · Linux 环境搭建 / 接口 / 数据验证
        </p>
        <div className="animate-fade-rise-delay-2 mt-12 flex flex-wrap justify-center gap-4">
          <Button asChild className="liquid-glass forest-control light-reactive cursor-pointer rounded-full px-10 py-5 text-base text-foreground transition-transform hover:scale-[1.03]" variant="ghost">
            <a href="#projects">查看项目进度</a>
          </Button>
          <Button asChild className="liquid-glass forest-control light-reactive cursor-pointer rounded-full px-10 py-5 text-base text-foreground transition-transform hover:scale-[1.03]" variant="ghost">
            <a download="杨烨齐简历.docx" href={assetUrl("files/yang-yeqi-resume.docx")}>
              下载简历信息
            </a>
          </Button>
        </div>
      </section>

      <section className="order-2 relative z-10 px-6 py-28" id="codex">
        <SectionHeading
          copy="使用 Codex 进行项目细节、进度"
          copyClassName="text-base font-semibold text-forest-muted-foreground sm:text-lg"
          eyebrow="Codex Workbench"
          eyebrowClassName="text-base font-semibold text-forest-muted-foreground"
          title="项目进度板"
        />
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {codexProjects.map((project, index) => (
            <GlassPanel
              className={`codex-reveal-card ${
                index % 2 === 0 ? "codex-reveal-left" : "codex-reveal-right"
              } p-6`}
              key={project.title}
            >
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">当前阶段</p>
                  <p className="mt-2 text-sm text-foreground">{project.stage}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">更新时间</p>
                  <p className="mt-2 text-sm text-foreground">{project.updated}</p>
                </div>
              </div>
              <h3
                className="mt-8 text-4xl font-normal tracking-[-0.8px]"
                style={{ fontFamily: "var(--font-cjk-display)" }}
              >
                {project.title}
              </h3>
              <p className="mt-4 leading-relaxed text-white">
                {project.summary}
              </p>
              <div className="mt-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">已完成里程碑</p>
                <ul className="mt-3 grid gap-2 text-sm text-forest-muted-foreground">
                  {project.milestones.map((milestone) => (
                    <li className="flex gap-3" key={milestone}>
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                      <span>{milestone}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">下一步</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{project.next}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest-muted-foreground">演示 / GitHub</p>
                  {project.links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {project.links.map((link) => (
                        <a
                          className="text-sm text-foreground underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
                          href={link.href}
                          key={link.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {link.label} →
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-forest-muted-foreground">暂无公开演示或仓库（{project.visibility}）</p>
                  )}
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section className="order-3 relative z-10 px-6 py-28" id="skills">
        <SectionHeading
          copy="环境系统测试，后端系统维护，环境搭建，AI工具操作"
          copyClassName="text-base text-white sm:text-lg"
          eyebrow="Skills"
          eyebrowClassName="text-[17px] font-semibold text-white"
          title="测试能力与工具栈"
        />
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-4">
          {skillGroups.map((group) => (
            <GlassPanel className="p-5" key={group.title}>
              <h3 className="text-xl font-medium text-foreground">{group.title}</h3>
              <ul className="mt-5 space-y-3 text-sm text-white">
                {group.items.map((item) => (
                  <li className="flex gap-3" key={item}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section className="order-4 relative z-10 px-6 py-28" id="resume">
        <SectionHeading
          copy=""
          eyebrow="Resume"
          title="公司与项目经历"
        />
        <div className="mx-auto grid max-w-6xl gap-6">
          {resumeCompanies.map((company, companyIndex) => {
            const isOpen = openCompany === companyIndex;

            return (
            <GlassPanel className={`resume-company-panel ${isOpen ? "is-open" : ""} p-5`} key={company.company}>
              <button
                aria-expanded={isOpen}
                className="resume-company-toggle group grid w-full text-left"
                onClick={() => setOpenCompany(isOpen ? -1 : companyIndex)}
                type="button"
              >
                <div>
                  <p className="text-sm text-forest-muted-foreground">{company.period}</p>
                  <h3
                    className="company-title mt-3 text-3xl tracking-wide"
                    style={{
                      fontFamily:
                        "var(--font-body)",
                      fontWeight: 900
                    }}
                  >
                    {company.company}
                  </h3>
                  <p className="mt-2 text-sm text-foreground">{company.role}</p>
                </div>
                <div className="resume-company-summary self-center">
                  <p className="resume-company-summary-text text-sm uppercase tracking-[0.28em] text-forest-muted-foreground">Company Group</p>
                  <p className="resume-company-summary-text mt-2 text-base leading-relaxed text-forest-muted-foreground">
                    {company.projects.length} 个项目模块，点击展开查看项目职责和细节。
                  </p>
                </div>
                <span className="resume-toggle-button liquid-glass flex h-11 w-11 items-center justify-center rounded-full text-xl text-foreground transition-transform duration-300 group-hover:scale-105">
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              <div className={`resume-projects-grid ${isOpen ? "is-open" : ""}`}>
                <div className="resume-projects-inner grid gap-4">
                  {company.projects.map((project, projectIndex) => (
                    <article
                      className="resume-project-card rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                      key={project.title}
                      style={{ transitionDelay: `${projectIndex * 70}ms` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="resume-project-title text-[25px] font-semibold text-foreground">{project.title}</h4>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-forest-muted-foreground">
                          {project.time}
                        </span>
                      </div>
                      <p className="resume-project-summary mt-3 font-semibold leading-relaxed text-forest-muted-foreground">{project.summary}</p>
                      <ul className="resume-project-points mt-4 grid gap-2 text-sm text-forest-muted-foreground sm:grid-cols-2">
                        {project.points.map((point) => (
                          <li className="flex gap-3" key={point}>
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            </GlassPanel>
            );
          })}
        </div>
      </section>

      <section className="order-5 relative z-10 px-6 py-28" id="contact">
        <GlassPanel className="mx-auto max-w-6xl p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-forest-muted-foreground">Reach Me</p>
          <h2
            className="mt-5 text-5xl font-normal tracking-[-1.2px] sm:text-7xl"
            style={{ fontFamily: "var(--font-cjk-display)" }}
          >
            上海市普陀区 · 杨烨齐
          </h2>
          <p className="mt-6 text-forest-muted-foreground">17601252443 · 2279113571@qq.com</p>
        </GlassPanel>
      </section>
        </div>
      )}

      {contactModalOpen ? <ContactModal onClose={() => setContactModalOpen(false)} /> : null}
    </main>
  );
}

export default App;
