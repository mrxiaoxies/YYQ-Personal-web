# YYQ 个人网站

这是一个基于 Vite、React、TypeScript 和 Tailwind CSS 的个人网站项目，用于展示个人介绍、Codex 项目进度、测试能力、工作履历和联系方式。

## 项目状态

- 当前版本：`0.1.5`
- GitHub 仓库：`https://github.com/mrxiaoxies/YYQ-Personal-web`
- 版本记录：见 [CHANGELOG.md](./CHANGELOG.md)
- 操作文档：见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)
- Codex 工作流：见 [.codex/skills/yyq-personal-web-workflow](./.codex/skills/yyq-personal-web-workflow)

## 本版更新

`0.1.5` 主要补齐站点维护工作流和发布说明：

- 新增 Codex 维护工作流 skill，规范更新、校验、GitHub 发布和 Netlify 部署步骤。
- 首页“下载简历信息”按钮改为下载 `public/files/yang-yeqi-resume.pdf`。
- 操作文档新增 skill 使用说明和 Netlify 生产部署流程。

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
git commit -m "chore: release v0.1.5"
git push
```

提交前请确认 `npm run typecheck` 和 `npm run build` 通过。

## Netlify 部署

`netlify.toml` 已固定构建命令和发布目录：

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

生产部署：

```powershell
npx netlify status
npx netlify deploy --prod
```
