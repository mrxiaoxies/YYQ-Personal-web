import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

const navItems = [
  { label: "Home", href: "#home" },
  { label: "Codex", href: "#codex" },
  { label: "Skills", href: "#skills" },
  { label: "Resume", href: "#resume" },
  { label: "Reach Me", href: "#contact" }
];

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const seasonBackgrounds = [
  {
    key: "spring",
    label: "Spring",
    image: assetUrl("images/seasons/spring.png"),
    mobileImage: assetUrl("images/seasons/mobile/spring.jpg")
  },
  {
    key: "summer",
    label: "Summer",
    image: assetUrl("images/seasons/summer.png"),
    mobileImage: assetUrl("images/seasons/mobile/summer.jpg")
  },
  {
    key: "autumn",
    label: "Autumn",
    image: assetUrl("images/seasons/autumn.png"),
    mobileImage: assetUrl("images/seasons/mobile/autumn.jpg")
  },
  {
    key: "winter",
    label: "Winter",
    image: assetUrl("images/seasons/winter.png"),
    mobileImage: assetUrl("images/seasons/mobile/winter.jpg")
  }
];

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

const codexProjects = [
  {
    title: "个人网站",
    status: "React 重构中",
    progress: 82,
    summary: "已完成四季滚动背景、液态玻璃面板、项目进度与简历模块，并持续优化移动端体验。",
    points: ["Vite + React + TypeScript", "Tailwind CSS + shadcn/ui", "动态背景与玻璃面板"]
  },
  {
    title: "微信 AI 好友",
    status: "框架重启后推进",
    progress: 64,
    summary: "PC 桌面微信方向的 AI 好友项目，保留消息读取、AI 回复、手动/自动发送控制边界。",
    points: ["FastAPI 后端", "桌面微信工作流", "结构化消息字段"]
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

function FloatingForest() {
  const isCompactVisual = useMediaQuery("(max-width: 767px)");
  const layerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const particleCount = isCompactVisual ? 12 : 34;
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

  useEffect(() => {
    let frameId = 0;

    const updateSeasonLayers = () => {
      const scrollTop = window.scrollY;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const scrollProgress = Math.min(1, Math.max(0, scrollTop / maxScroll));

      seasonBackgrounds.forEach((_, index) => {
        const layer = layerRefs.current[index];
        if (!layer) return;

        const seasonPosition = index / Math.max(seasonBackgrounds.length - 1, 1);
        const distance = Math.abs(scrollProgress - seasonPosition);
        const opacity = Math.max(0, 1 - distance * 3.35);

        layer.style.opacity = opacity.toFixed(3);
      });

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
  }, [isCompactVisual]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {seasonBackgrounds.map((season, index) => (
          <div
            aria-hidden="true"
            className={`season-background season-background-${season.key} absolute inset-0`}
            key={season.key}
            ref={(node) => {
              layerRefs.current[index] = node;
            }}
            style={
              {
                backgroundImage: `url("${isCompactVisual ? season.mobileImage : season.image}")`,
                opacity: index === 0 ? 1 : 0
              } as CSSProperties
            }
          />
      ))}
      <div className="forest-depth absolute inset-0" />
      <div className="forest-light absolute inset-0" />
      <div className="forest-mist absolute inset-0" />
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
  eyebrowClassName = "text-sm font-medium text-muted-foreground",
  copyClassName = "text-base text-muted-foreground sm:text-lg"
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
              <p className="mt-1 text-2xl font-semibold text-foreground">中国大陆</p>
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

function App() {
  const [openCompany, setOpenCompany] = useState(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);

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
      <FloatingForest />
      <DynamicLightRig />

      <nav className="fixed inset-x-0 top-0 z-20 mx-auto flex max-w-7xl flex-row items-center justify-between px-6 py-5 sm:px-8">
        <a
          className="light-reactive-text text-3xl tracking-tight text-foreground"
          href="#home"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Yang Yeqi<sup className="text-xs">®</sup>
        </a>

        <div className="liquid-glass light-reactive hidden items-center gap-7 rounded-full px-6 py-3 md:flex">
          {navItems.map((item, index) => (
            <a
              className={`text-sm transition-colors hover:text-foreground ${
                index === 0 ? "text-foreground" : "text-muted-foreground"
              }`}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </a>
          ))}
        </div>

        <Button
          className="liquid-glass light-reactive rounded-full px-6 py-2.5 text-sm text-foreground transition-transform hover:scale-[1.03]"
          onClick={() => setContactModalOpen(true)}
          type="button"
        >
          联系我
        </Button>
      </nav>

      <section
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-[90px] pb-40 pt-36 text-center"
        id="home"
      >
        <p className="animate-fade-rise light-reactive-text text-sm font-medium uppercase tracking-[0.32em] text-muted-foreground">
          Software Test Engineer / AI Workflow Builder
        </p>
        <h1
          className="animate-fade-rise light-reactive-text mt-6 max-w-6xl text-5xl font-light leading-[1.08] tracking-[0.02em] sm:text-6xl md:text-7xl"
          style={{
            fontFamily: "var(--font-cjk-display)"
          }}
        >
          <span className="block">把复杂流程</span>
          <em className="block not-italic text-muted-foreground">测试到安静可靠。</em>
        </h1>
        <p className="animate-fade-rise-delay light-reactive-text mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          关注银行业务测试、接口与数据验证、Linux 环境搭建、灰盒测试和 AI 工具探索。
          这个网站用动态森林和玻璃界面展示我的 Codex 项目进度与真实工作履历。
        </p>
        <div className="animate-fade-rise-delay-2 mt-12 flex flex-wrap justify-center gap-4">
          <Button className="liquid-glass light-reactive cursor-pointer rounded-full px-10 py-5 text-base text-foreground transition-transform hover:scale-[1.03]">
            查看项目进度
          </Button>
          <Button asChild className="liquid-glass light-reactive cursor-pointer rounded-full px-10 py-5 text-base text-foreground transition-transform hover:scale-[1.03]">
            <a download="杨烨齐简历.docx" href={assetUrl("files/yang-yeqi-resume.docx")}>
              下载简历信息
            </a>
          </Button>
        </div>
      </section>

      <section className="relative z-10 px-6 py-28" id="codex">
        <SectionHeading
          copy="使用 Codex 进行项目细节、进度"
          copyClassName="text-base font-semibold text-[#212121] sm:text-lg"
          eyebrow="Codex Workbench"
          eyebrowClassName="text-base font-semibold text-muted-foreground"
          title="项目进度板"
        />
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {codexProjects.map((project, index) => (
            <GlassPanel
              className={`codex-reveal-card ${
                index === 0 ? "codex-reveal-left" : "codex-reveal-right"
              } p-6`}
              key={project.title}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground">
                  {project.status}
                </span>
                <span className="text-sm text-foreground">{project.progress}%</span>
              </div>
              <h3
                className="mt-8 text-4xl font-normal tracking-[-0.8px]"
                style={{ fontFamily: "var(--font-cjk-display)" }}
              >
                {project.title}
              </h3>
              <p className={`mt-4 leading-relaxed ${index === 1 ? "text-[#fffafa]" : "text-white"}`}>
                {project.summary}
              </p>
              <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/70" style={{ width: `${project.progress}%` }} />
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {project.points.map((point) => (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white" key={point}>
                    {point}
                  </span>
                ))}
              </div>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section className="relative z-10 px-6 py-28" id="skills">
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

      <section className="relative z-10 px-6 py-28" id="resume">
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
                  <p className="text-sm text-muted-foreground">{company.period}</p>
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
                  <p className="resume-company-summary-text text-sm uppercase tracking-[0.28em] text-muted-foreground">Company Group</p>
                  <p className="resume-company-summary-text mt-2 text-base leading-relaxed text-muted-foreground">
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
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-muted-foreground">
                          {project.time}
                        </span>
                      </div>
                      <p className="resume-project-summary mt-3 font-semibold leading-relaxed text-[#3b3a3a]">{project.summary}</p>
                      <ul className="resume-project-points mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
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

      <section className="relative z-10 px-6 py-28" id="contact">
        <GlassPanel className="mx-auto max-w-6xl p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Reach Me</p>
          <h2
            className="mt-5 text-5xl font-normal tracking-[-1.2px] sm:text-7xl"
            style={{ fontFamily: "var(--font-cjk-display)" }}
          >
            上海市普陀区 · 杨烨齐
          </h2>
          <p className="mt-6 text-muted-foreground">17601252443 · 2279113571@qq.com</p>
        </GlassPanel>
      </section>

      {contactModalOpen ? <ContactModal onClose={() => setContactModalOpen(false)} /> : null}
    </main>
  );
}

export default App;
