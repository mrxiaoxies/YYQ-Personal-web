# 操作文档

## 1. 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Git

## 2. 安装依赖

```powershell
npm install
```

## 3. 本地开发

```powershell
npm run dev
```

启动后访问终端中显示的本地地址。

## 4. 类型检查

```powershell
npm run typecheck
```

## 5. 生产构建

```powershell
npm run build
```

构建产物在 `dist/` 目录。`dist/` 是生成文件，不提交到 GitHub。

## 6. 本地预览构建结果

```powershell
npm run preview
```

## 7. 版本号管理

当前版本同时记录在两个位置：

- `package.json` 的 `version`
- `VERSION`

发版前请保持两处一致，并在 `CHANGELOG.md` 增加对应版本记录。

常用版本升级命令：

```powershell
npm run version:patch
npm run version:minor
npm run version:major
```

命令说明：

- `patch`：修复问题，例如 `0.1.0` 到 `0.1.1`
- `minor`：新增兼容功能，例如 `0.1.0` 到 `0.2.0`
- `major`：不兼容重大改动，例如 `0.1.0` 到 `1.0.0`

`npm version` 会自动更新 `package.json` 和 `package-lock.json`，并创建一个 Git tag。执行后还需要手动同步 `VERSION` 与 `CHANGELOG.md`。

## 8. Git 提交流程

```powershell
git status
git add .
git commit -m "chore: describe change"
```

提交信息建议使用：

- `feat:` 新功能
- `fix:` 问题修复
- `docs:` 文档变更
- `chore:` 构建、依赖、仓库维护
- `style:` 样式调整
- `refactor:` 代码重构

## 9. 上传 GitHub

首次上传：

```powershell
git init
git add .
git commit -m "chore: initial website release"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

后续更新：

```powershell
git add .
git commit -m "chore: update website"
git push
```

## 10. Codex Skill 工作流

本仓库内置维护工作流 skill：

```text
.codex/skills/yyq-personal-web-workflow/
```

在 Codex 中维护、发版或部署网站时，可直接要求：

```text
Use $yyq-personal-web-workflow to update, validate, publish, and deploy the YYQ personal website.
```

该 skill 会提醒执行以下流程：

- 检查当前 Git 改动，避免误提交无关文件
- 更新源码、静态资源、版本号和 `CHANGELOG.md`
- 更新本操作手册中的运行、发布或部署步骤
- 执行 `npm run typecheck` 和 `npm run build`
- 推送 GitHub 后再发布 `gh-pages` 生产分支

## 11. GitHub Pages 线上部署

当前线上地址：

```text
https://mrxiaoxies.github.io/YYQ-Personal-web/
```

发布前先确认本地构建通过：

```powershell
npm run build
```

当前生产站点使用远程 `gh-pages` 分支。推荐用临时 worktree 发布：

```powershell
git fetch origin gh-pages:refs/remotes/origin/gh-pages
git worktree add .deploy-gh-pages origin/gh-pages
```

将 `dist/` 内容复制到 `.deploy-gh-pages/`，提交并推送到 `gh-pages`：

```powershell
git -C .deploy-gh-pages add -A
git -C .deploy-gh-pages commit -m "deploy: release v0.1.5"
git -C .deploy-gh-pages push origin HEAD:gh-pages
git worktree remove .deploy-gh-pages
```

部署完成后验证首页和新增静态资源地址。例如：

```text
https://mrxiaoxies.github.io/YYQ-Personal-web/files/yang-yeqi-resume.pdf
```

## 12. Netlify 备用部署

本项目使用 `netlify.toml` 固定构建配置：

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify CLI 需要先完成登录和站点绑定。确认状态：

```powershell
npx netlify status
```

发布到 Netlify 生产环境：

```powershell
npx netlify deploy --prod
```

如果显示未登录，需要先完成 Netlify 登录，或配置 `NETLIFY_AUTH_TOKEN`。

## 13. 发布检查清单

- `npm run typecheck` 通过
- `npm run build` 通过
- `package.json`、`VERSION` 和 `CHANGELOG.md` 版本一致
- `git status` 中没有不应提交的文件
- 已推送到 GitHub 对应分支
- 已发布 `gh-pages` 并确认线上地址可访问
