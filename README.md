# YYQ 个人网站

这是一个基于 Vite、React、TypeScript 和 Tailwind CSS 的个人网站项目，用于展示个人介绍、Codex 项目进度、测试能力、工作履历和联系方式。

## 项目状态

- 当前版本：`0.1.7`
- GitHub 仓库：`https://github.com/mrxiaoxies/YYQ-Personal-web`
- 版本记录：见 [CHANGELOG.md](./CHANGELOG.md)
- 操作文档：见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)
- Codex 工作流：见 [.codex/skills/web-skill](./.codex/skills/web-skill)，可用 `Use $web-skill ...` 或“使用 web skill ...”调用

## 本版更新

`0.1.7` 主要增强四季视觉动效和首页内容结构：

- 新增春季花瓣、夏季绿叶、秋季落叶、冬季雪花掉落动效。
- 新增夏季萤火虫路径动画，滚动到夏季背景时自动显示。
- 调整首页区块顺序和 Codex 项目进度内容，补充访问统计后台进展。

## 技术栈

- Vite 7
- React 19
- TypeScript
- Tailwind CSS
- lucide-react

## 本地运行

```powershell
npm install
npm run dev
```

开发服务默认监听 `127.0.0.1`，终端会输出实际访问地址。

## 构建与预览

```powershell
npm run build
npm run preview
```

构建产物会生成到 `dist/`，该目录不提交到 GitHub。

## 目录结构

```text
.
├── .codex/skills/      # Codex 工作流 skill
├── public/             # 静态资源
├── src/                # React 源码
│   ├── components/     # UI 组件
│   ├── lib/            # 工具函数
│   ├── App.tsx         # 主页面
│   ├── index.css       # 全局样式
│   └── main.tsx        # 应用入口
├── docs/               # 操作与维护文档
├── CHANGELOG.md        # 版本记录
├── VERSION             # 当前版本号
├── netlify.toml        # Netlify 构建配置
└── package.json        # 依赖、脚本和 npm 版本号
```

## GitHub 发布

```powershell
git status
git add .
git commit -m "chore: release v0.1.7"
git push
```

提交前请确认 `npm run typecheck` 和 `npm run build` 通过。

## GitHub Pages 部署

线上地址：

```text
https://mrxiaoxies.github.io/YYQ-Personal-web/
```

生产站点由 `gh-pages` 分支发布。发布前先构建：

```powershell
npm run build
```

再将 `dist/` 内容提交并推送到 `gh-pages`。详细步骤见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)。

## Netlify 备用部署

`netlify.toml` 已固定构建命令和发布目录：

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify CLI 登录并绑定站点后可执行：

```powershell
npx netlify status
npx netlify deploy --prod
```
