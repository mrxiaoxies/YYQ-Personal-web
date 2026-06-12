const codexProjects = [
  {
    title: "个人网站",
    status: "正在搭建",
    progress: 72,
    summary: "像素森林风格的个人主页，用来集中展示 Codex 项目、开发进度和简历项目。",
    tags: ["Pixel UI", "Static Site", "Resume"],
    detail: [
      "已建立主页结构、项目进度板、技能区和按公司分类的履历区。",
      "第一版采用纯静态文件，方便直接打开，也方便后续迁移到 GitHub Pages 或 Netlify。",
      "下一步可以补充真实项目截图、独立详情页、访问统计和移动端动效。"
    ]
  },
  {
    title: "微信 AI 好友",
    status: "框架重启后推进",
    progress: 64,
    summary: "PC 桌面微信方向的 AI 好友项目，保留消息读取、AI 回复、手动/自动发送控制边界。",
    tags: ["FastAPI", "Desktop WeChat", "AI Workflow"],
    detail: [
      "已整理到 D 盘自包含项目空间，保留启动脚本、后端服务和桌面访问层。",
      "当前方向是 Windows 通知优先、剪贴板确认辅助、OCR 作为 fallback。",
      "重点保留 contact、body、message_time、source、raw_text 等结构化字段，方便后续接入 AI 对话。"
    ]
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
        detail: [
          "使用 Postman 按文档测试银行接口，进行造数、查数和接口验证。",
          "使用 Notepad++ 制作人行埋数文件，配合业务场景编辑测试数据。",
          "使用 Mobaxterm 联调跳板机、跑批数据，并通过 Linux 指令排查问题。",
          "查看日志并根据日志内容定位问题原因，协调测试进度和人员安排。"
        ]
      },
      {
        title: "数据披露双数据源 + 锁账",
        time: "2025.06",
        summary: "验证报表生成取值方向、双数据源联动逻辑和锁账相关数据条件。",
        detail: [
          "测试功能报表生成时的取值方向和判断逻辑。",
          "通过 MySQL 造数满足当表条件数据，验证单表与多表逻辑。",
          "覆盖多表联动取值为多、单逻辑等核心场景。"
        ]
      },
      {
        title: "养老金系统管理",
        time: "2026.02",
        summary: "验证养老金账户、护照、状态、个税计算以及上传到报表生成的完整流程。",
        detail: [
          "覆盖上传、签发、下载、报表生成流程，并核对金额字段。",
          "结合数据库表逻辑与前端控制台字段进行配合测试。",
          "围绕业务状态流转和账户数据进行流程验证。"
        ]
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
        detail: [
          "在 Linux 系统中为客户提供环境搭建与配置修改。",
          "安装 jtop、stress 等工具进行信息监控和压力测试。",
          "编写脚本优化功能测试步骤和执行效率。",
          "使用 lsusb 检查外接设备兼容性，排查驱动和环境问题。",
          "与设计协作反馈产品结构问题，参与硬件测试与采购优化建议。"
        ]
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
        summary: "测试广告机功能、APK 问题、硬件增减影响、压力测试、直播流推送与指令识别。",
        detail: [
          "使用 Mobaxterm 连接机器主板串口，通过指令进行测试。",
          "使用 Notepad++ 修改广告机分辨率和显示关系，验证展示效果。",
          "使用公司自制格式化软件捕捉直播流、视频和图片资源码。",
          "在 Windows 上使用 VMware Workstation 搭建 Linux 测试环境。",
          "接触 LR 性能测试和 Python 环境搭建。"
        ]
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
        detail: [
          "在 Excel 中使用测试方法设计测试用例。",
          "参与用例评审，优化和校准表格信息。",
          "执行测试用例，寻找 bug，追踪处理并提交记录。",
          "判断问题属于前端还是后端，并验证多人违规负载场景。"
        ]
      },
      {
        title: "设备外壳氩弧焊",
        time: "2019.12",
        summary: "根据图纸设计参与设备外壳钣金焊接和硬件结构测试。",
        detail: [
          "参与项目外壳设计修改，提出结构合理化建议。",
          "参与设备硬件测试，覆盖密封性、温度和结构问题。"
        ]
      }
    ]
  }
];

const codexRoot = document.querySelector("#codexProjects");
const timelineRoot = document.querySelector("#resumeTimeline");
const dialog = document.querySelector("#detailDialog");
const closeDialog = document.querySelector("#closeDialog");
const dialogType = document.querySelector("#dialogType");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogMeta = document.querySelector("#dialogMeta");
const dialogBody = document.querySelector("#dialogBody");
const worldCanvas = document.querySelector("#dynamicWorld");
const worldContext = worldCanvas.getContext("2d");
const leafCanvas = document.querySelector("#leafField");
const leafContext = leafCanvas.getContext("2d");
const mouse = {
  x: -9999,
  y: -9999,
  active: false,
  influenceX: 0,
  influenceY: 0
};

function makeChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function openDetail(item, type, meta) {
  dialogType.textContent = type;
  dialogTitle.textContent = item.title;
  dialogMeta.textContent = meta;
  dialogBody.innerHTML = "";

  if (item.summary) {
    const summary = document.createElement("p");
    summary.textContent = item.summary;
    dialogBody.append(summary);
  }

  const list = document.createElement("ul");
  item.detail.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  });
  dialogBody.append(list);
  dialog.showModal();
}

function renderCodexProjects() {
  codexProjects.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.style.setProperty("--stagger", index);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看 ${project.title} 详情`);
    card.innerHTML = `
      <div>
        <div class="status-row">
          <span class="chip">${project.status}</span>
          <span class="chip">${project.progress}%</span>
        </div>
        <h3>${project.title}</h3>
        <p>${project.summary}</p>
      </div>
      <div class="progress" aria-label="完成度 ${project.progress}%">
        <span data-progress="${project.progress}"></span>
      </div>
      <div class="tags"></div>
    `;

    const tags = card.querySelector(".tags");
    project.tags.forEach((tag) => tags.append(makeChip(tag)));
    card.addEventListener("click", () =>
      openDetail(project, "Codex 项目", `${project.status} · 完成度 ${project.progress}%`)
    );
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
    card.addEventListener("pointermove", moveCardLight);
    card.addEventListener("pointermove", tiltCard);
    card.addEventListener("pointerleave", resetTilt);
    codexRoot.append(card);
  });
}

function renderResume() {
  resumeCompanies.forEach((company) => {
    const block = document.createElement("article");
    block.className = "company";
    block.innerHTML = `
      <div class="company-label">
        <h3>${company.company}</h3>
        <p>${company.role}</p>
        <p>${company.period}</p>
      </div>
      <div class="work-list"></div>
    `;

    const list = block.querySelector(".work-list");
    block.querySelector(".company-label").style.setProperty("--stagger", 0);
    company.projects.forEach((project, projectIndex) => {
      const card = document.createElement("article");
      card.className = "work-card";
      card.style.setProperty("--stagger", projectIndex + 1);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `查看 ${project.title} 详情`);
      card.innerHTML = `
        <span class="chip">${project.time}</span>
        <h3>${project.title}</h3>
        <p>${project.summary}</p>
      `;
      card.addEventListener("click", () =>
        openDetail(project, company.company, `${company.role} · ${project.time}`)
      );
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          card.click();
        }
      });
      card.addEventListener("pointermove", moveCardLight);
      card.addEventListener("pointermove", tiltCard);
      card.addEventListener("pointerleave", resetTilt);
      list.append(card);
    });

    timelineRoot.append(block);
  });
}

closeDialog.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  const bounds = dialog.getBoundingClientRect();
  const outside =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;
  if (outside) dialog.close();
});

renderCodexProjects();
renderResume();

function moveCardLight(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
}

function tiltCard(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  event.currentTarget.style.setProperty("--tilt-y", `${x * 5}deg`);
  event.currentTarget.style.setProperty("--tilt-x", `${y * -5}deg`);
  event.currentTarget.style.setProperty("--lift", "-4px");
}

function resetTilt(event) {
  event.currentTarget.style.setProperty("--tilt-y", "0deg");
  event.currentTarget.style.setProperty("--tilt-x", "0deg");
  event.currentTarget.style.setProperty("--lift", "0px");
}

function setupPageMotion() {
  document.querySelectorAll(".skill-list li").forEach((item, index) => {
    item.style.setProperty("--stagger", index);
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target
          .querySelectorAll(".progress span[data-progress]")
          .forEach((bar) => {
            bar.style.width = `${bar.dataset.progress}%`;
          });
      });
    },
    { threshold: 0.16 }
  );

  document.querySelectorAll(".reveal, .company").forEach((section) => {
    revealObserver.observe(section);
  });

  const sections = Array.from(document.querySelectorAll("main section[id]"));
  const navLinks = Array.from(document.querySelectorAll(".nav-links a"));

  function updateActiveNav() {
    const current = sections.reduce((best, section) => {
      const distance = Math.abs(section.getBoundingClientRect().top - 120);
      return !best || distance < best.distance ? { id: section.id, distance } : best;
    }, null);
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${current?.id}`);
    });
  }

  window.addEventListener(
    "scroll",
    () => {
      document.documentElement.style.setProperty("--scroll", `${window.scrollY}`);
      updateActiveNav();
    },
    { passive: true }
  );
  updateActiveNav();

  window.addEventListener("pointermove", (event) => {
    document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
    document.documentElement.style.setProperty("--cursor-active", "1");
  });
  window.addEventListener("pointerleave", () => {
    document.documentElement.style.setProperty("--cursor-active", "0");
  });
}

function setupDynamicWorld() {
  const fireflies = [];
  const fogBands = [];
  const layers = [
    { color: "#091711", base: 0.42, treeCount: 22, speed: 0.12, height: 0.42 },
    { color: "#0f2a1e", base: 0.53, treeCount: 28, speed: 0.2, height: 0.5 },
    { color: "#18452d", base: 0.67, treeCount: 32, speed: 0.32, height: 0.58 }
  ];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let time = 0;

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    worldCanvas.width = Math.floor(width * pixelRatio);
    worldCanvas.height = Math.floor(height * pixelRatio);
    worldCanvas.style.width = `${width}px`;
    worldCanvas.style.height = `${height}px`;
    worldContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function seedWorld() {
    fireflies.length = 0;
    fogBands.length = 0;
    const fireflyCount = window.matchMedia("(max-width: 700px)").matches ? 26 : 48;
    for (let index = 0; index < fireflyCount; index += 1) {
      fireflies.push({
        x: Math.random(),
        y: 0.08 + Math.random() * 0.72,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        size: 1 + Math.random() * 2
      });
    }
    for (let index = 0; index < 7; index += 1) {
      fogBands.push({
        y: 0.34 + index * 0.075,
        x: Math.random() * width,
        width: 150 + Math.random() * 230,
        speed: 0.08 + Math.random() * 0.16,
        alpha: 0.035 + Math.random() * 0.055
      });
    }
  }

  function drawPixelTree(x, ground, treeHeight, color, sway) {
    const trunkWidth = Math.max(3, Math.floor(treeHeight * 0.055));
    const crownWidth = Math.floor(treeHeight * 0.36);
    const trunkX = Math.round(x + sway);
    worldContext.fillStyle = "#5e4229";
    worldContext.fillRect(trunkX - trunkWidth / 2, ground - treeHeight * 0.32, trunkWidth, treeHeight * 0.32);
    worldContext.fillStyle = color;
    for (let row = 0; row < 5; row += 1) {
      const rowWidth = crownWidth * (1 - row * 0.12);
      const rowHeight = Math.floor(treeHeight * 0.12);
      const y = ground - treeHeight * 0.3 - row * rowHeight * 0.74;
      worldContext.fillRect(
        Math.round(trunkX - rowWidth / 2),
        Math.round(y),
        Math.round(rowWidth),
        rowHeight
      );
    }
  }

  function drawLayer(layer, layerIndex) {
    const ground = height * layer.base;
    const parallax = mouse.influenceX * layer.speed * 14;
    const spacing = width / layer.treeCount;
    for (let index = -2; index < layer.treeCount + 2; index += 1) {
      const wave = Math.sin(index * 12.989 + layerIndex * 8.2) * 0.5 + 0.5;
      const x = index * spacing + wave * spacing * 0.5 + parallax;
      const treeHeight = height * (layer.height * (0.42 + wave * 0.44));
      const sway = Math.sin(time * 0.0012 + index) * (1 + layerIndex) + mouse.influenceX * (2 + layerIndex);
      drawPixelTree(x, ground + wave * 24, treeHeight, layer.color, sway);
    }
  }

  function drawFog() {
    worldContext.fillStyle = "rgba(221, 255, 230, 0.05)";
    fogBands.forEach((fog) => {
      fog.x += fog.speed + mouse.influenceX * 0.22;
      if (fog.x > width + fog.width) fog.x = -fog.width;
      const y = fog.y * height + Math.sin(time * 0.0008 + fog.y * 12) * 14;
      const gradient = worldContext.createLinearGradient(fog.x, y, fog.x + fog.width, y);
      gradient.addColorStop(0, "rgba(221,255,230,0)");
      gradient.addColorStop(0.5, `rgba(221,255,230,${fog.alpha})`);
      gradient.addColorStop(1, "rgba(221,255,230,0)");
      worldContext.fillStyle = gradient;
      worldContext.fillRect(fog.x, y, fog.width, 26);
    });
  }

  function drawFireflies() {
    fireflies.forEach((dot) => {
      const pulse = Math.sin(time * 0.002 * dot.speed + dot.phase) * 0.5 + 0.5;
      const x = dot.x * width + Math.sin(time * 0.0006 + dot.phase) * 22 + mouse.influenceX * 18;
      const y = dot.y * height + Math.cos(time * 0.0007 + dot.phase) * 18 + mouse.influenceY * 12;
      worldContext.fillStyle = `rgba(182, 255, 192, ${0.18 + pulse * 0.46})`;
      worldContext.fillRect(Math.round(x), Math.round(y), dot.size, dot.size);
      if (pulse > 0.75) {
        worldContext.fillStyle = `rgba(182, 255, 192, ${0.08 + pulse * 0.12})`;
        worldContext.fillRect(Math.round(x - 3), Math.round(y - 3), dot.size + 6, dot.size + 6);
      }
    });
  }

  function drawWorld(now = 0) {
    time = now;
    mouse.influenceX += ((mouse.x / Math.max(width, 1) - 0.5) - mouse.influenceX) * 0.035;
    mouse.influenceY += ((mouse.y / Math.max(height, 1) - 0.5) - mouse.influenceY) * 0.035;

    const glowX = mouse.active ? mouse.x : width * 0.72;
    const glowY = mouse.active ? mouse.y : height * 0.24;
    const sky = worldContext.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#06100d");
    sky.addColorStop(0.36, "#10251d");
    sky.addColorStop(0.74, "#24472f");
    sky.addColorStop(1, "#e8d7ad");
    worldContext.fillStyle = sky;
    worldContext.fillRect(0, 0, width, height);

    const glow = worldContext.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.48);
    glow.addColorStop(0, "rgba(125, 230, 175, 0.22)");
    glow.addColorStop(0.3, "rgba(71, 165, 162, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    worldContext.fillStyle = glow;
    worldContext.fillRect(0, 0, width, height);

    layers.forEach(drawLayer);
    drawFog();
    drawFireflies();

    worldContext.fillStyle = "rgba(255, 248, 231, 0.03)";
    for (let y = 0; y < height; y += 6) {
      worldContext.fillRect(0, y, width, 1);
    }

    requestAnimationFrame(drawWorld);
  }

  resize();
  seedWorld();
  window.addEventListener("resize", () => {
    resize();
    seedWorld();
  });
  requestAnimationFrame(drawWorld);
}

function setupLeafField() {
  const palette = ["#d4a646", "#c7523f", "#8eb36a", "#4d9a70", "#f3dfae"];
  const leaves = [];
  const leafCount = window.matchMedia("(max-width: 700px)").matches ? 34 : 64;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  function resetLeaf(leaf, startAbove = false) {
    leaf.x = Math.random() * width;
    leaf.y = startAbove ? -Math.random() * height : Math.random() * height;
    leaf.vx = (Math.random() - 0.5) * 0.35;
    leaf.vy = 0.18 + Math.random() * 0.42;
    leaf.size = 3 + Math.floor(Math.random() * 3) * 2;
    leaf.spin = Math.random() * Math.PI * 2;
    leaf.spinSpeed = (Math.random() - 0.5) * 0.04;
    leaf.color = palette[Math.floor(Math.random() * palette.length)];
    leaf.drift = Math.random() * Math.PI * 2;
  }

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    leafCanvas.width = Math.floor(width * pixelRatio);
    leafCanvas.height = Math.floor(height * pixelRatio);
    leafCanvas.style.width = `${width}px`;
    leafCanvas.style.height = `${height}px`;
    leafContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function drawLeaf(leaf) {
    leafContext.save();
    leafContext.translate(Math.round(leaf.x), Math.round(leaf.y));
    leafContext.rotate(leaf.spin);
    leafContext.fillStyle = leaf.color;
    leafContext.fillRect(-leaf.size / 2, -leaf.size / 2, leaf.size, Math.max(2, leaf.size - 1));
    leafContext.fillRect(-leaf.size / 2 + 1, -leaf.size / 2 - 1, Math.max(2, leaf.size - 2), 1);
    leafContext.fillStyle = "rgba(38, 51, 33, 0.34)";
    leafContext.fillRect(-0.5, -leaf.size / 2, 1, leaf.size + 2);
    leafContext.restore();
  }

  function animate() {
    leafContext.clearRect(0, 0, width, height);
    leaves.forEach((leaf) => {
      leaf.drift += 0.012;
      leaf.spin += leaf.spinSpeed;
      leaf.vx += Math.sin(leaf.drift) * 0.006;

      if (mouse.active) {
        const dx = leaf.x - mouse.x;
        const dy = leaf.y - mouse.y;
        const distance = Math.hypot(dx, dy);
        const pushRadius = 138;
        if (distance < pushRadius && distance > 0.1) {
          const force = (1 - distance / pushRadius) * 1.9;
          leaf.vx += (dx / distance) * force;
          leaf.vy += (dy / distance) * force;
          leaf.spin += force * 0.09;
        }
      }

      leaf.vx *= 0.972;
      leaf.vy = leaf.vy * 0.982 + 0.018;
      leaf.x += leaf.vx;
      leaf.y += leaf.vy;

      if (leaf.x < -24) leaf.x = width + 24;
      if (leaf.x > width + 24) leaf.x = -24;
      if (leaf.y > height + 28) resetLeaf(leaf, true);

      drawLeaf(leaf);
    });

    requestAnimationFrame(animate);
  }

  resize();
  for (let index = 0; index < leafCount; index += 1) {
    const leaf = {};
    resetLeaf(leaf);
    leaves.push(leaf);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.active = true;
    document.documentElement.style.setProperty("--mouse-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--mouse-y", `${event.clientY}px`);
  });
  window.addEventListener("pointerleave", () => {
    mouse.active = false;
  });
  animate();
}

setupPageMotion();
setupDynamicWorld();
setupLeafField();
