# YYQ 个人网站

这是一个基于 Vite、React、TypeScript 和 Tailwind CSS 的个人网站项目，用于展示个人介绍、Codex 项目进度、测试能力、工作履历和联系方式。站内“问问 YYQ”知识助手会对自然问题执行关键词与本地向量混合检索，再把经过证据门控的公开经历交给 Netlify AI Gateway，生成有来源的回答。Netlify 站点还提供单管理员后台，可维护六个公开栏目；内容保存在 Netlify Blobs 中，保存后立即发布。

## 项目状态

- 当前版本：`0.4.0`
- GitHub 仓库：`https://github.com/mrxiaoxies/YYQ-Personal-web`
- 版本记录：见 [CHANGELOG.md](./CHANGELOG.md)
- 操作文档：见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)
- Codex 工作流：见 [.codex/skills/web-skill](./.codex/skills/web-skill)，可用 `Use $web-skill ...` 或“使用 web skill ...”调用

## 本版更新

`0.4.0` 新增个人网站内容管理与安全的单管理员登录：

- `#admin` 管理界面可编辑首页、Codex、项目展示、技能、履历和联系六个栏目，保存即发布。
- 管理员账号、会话、动态内容和最近 20 个内容修订由 Netlify Blobs 保存，支持一次性初始化、密码恢复和历史恢复。
- GitHub Pages 继续作为只读公开镜像，从 Netlify 读取公开内容，并把管理员入口引导到 Netlify。

## 技术栈

- Vite 7
- React 19
- TypeScript
- Tailwind CSS
- lucide-react
- Netlify Functions / Blobs / AI Gateway
- OpenAI SDK
- Transformers.js / ONNX Runtime Web（WASM）
- BGE Small 中文向量模型

## 本地运行

```powershell
npm install
npm run dev
```

`npm install` 按 `package-lock.json` 安装固定版本的网页、Netlify CLI、Transformers.js 和 ONNX Runtime 依赖，服务于让不同电脑获得一致的构建与向量运行环境；它不会部署网站，也不会生成知识向量。

`npm run dev` 只启动 Vite，服务于页面样式和交互预览，不会启动 Netlify Functions，因而不能验证真实 Blobs、管理员安全 Cookie、账号初始化、恢复或发布链路。管理员完整验收必须使用 Netlify Draft Deploy。

首次安装、升级 Transformers/ONNX 依赖或重建 RAG 运行文件时执行：

```powershell
npm run rag:runtime:prepare
```

这条命令准备 Netlify Function 所需的 Transformers Web 与 ONNX Runtime WASM 文件，服务于让本地模型在 Windows 和 Netlify Linux 环境使用同一套 CPU/WASM 推理方式，并避免打包体积很大的原生 ONNX 依赖。

修改 `knowledge/index.json`、向量模型或知识文本格式后执行：

```powershell
npm run vectors:build
```

这条命令只读取公开知识与本地模型，生成 `knowledge/vector-index.json`，服务于让线上请求直接检索预计算文档向量，而不在每次提问时重复计算；它不调用外部 embedding 服务。

用真实本地模型验证宽松问法与安全拒答：

```powershell
npm run evaluate:rag
```

这条命令实际为细节问题、216 个自动生成的宽泛主题改写、未知能力和跨项目问题生成向量并运行混合检索。它分别输出细节召回、宽泛主题召回、未知能力误答数和项目隔离率，使用本机 CPU/WASM，不调用 AI Gateway 回答模型。

运行快速回归测试：

```powershell
npm test
```

这条命令验证关键词/混合检索、降级、安全策略、HTTP 契约和健康接口，服务于在提交前发现逻辑回归；测试使用固定或合成向量，不产生真实模型费用。

要同时运行网页、Functions 和已绑定站点的 AI Gateway 环境，使用：

```powershell
npm run dev:rag
```

`npm run dev:rag` 由 Netlify CLI 同时启动网页与 Functions，服务于串联“浏览器 → 安全检查 → 本地向量混合检索 → AI Gateway → 有来源回答”。它可用于本地接口联调，但真实 Blobs 与跨部署 Cookie 行为仍以 Draft Deploy 为最终验收环境。启动后另开终端执行：

```powershell
npm run verify:rag -- http://localhost:8888
```

`npm run verify:rag -- URL` 会检查健康接口、工作经验概括与从业跨度、宽泛工具概括、未知 Selenium 拒答和跨项目 Codex 拒答，服务于验证指定地址的完整 RAG 链路；两次真实概括会产生 Gateway 调用。若本地 CLI 返回 `mismatched_client_ip`，先运行 `npm run evaluate:rag` 单独确认本地向量，再使用 Draft Deploy URL 执行同一验证，不能把 Gateway 的本地凭据/IP问题误判成本地向量失败。完整的“指令用途、成功标志和失败处理”见 [操作文档](./docs/OPERATIONS.md#144-本地与部署后验收)。

## 本地向量检索原理

每条公开知识会整理成稳定文本：`标题`、中文 `类别`、`任职（公司 / 角色 / 时间）`、`主题`、`常见问法`、`公开事实`；每个宽泛主题也会由标题、说明、主题锚点和子条目摘要生成独立向量。文档本身不添加 query instruction；访客问题会加上 BGE 检索指令“为这个句子生成表示以用于检索相关文章：”。模型对 token 输出执行 mean pooling，再做 L2 normalize，得到 512 维向量。

详细问题先计算问题与条目向量的 cosine similarity，同时运行关键词检索，再用 RRF 合并排名。宽泛问题则把主题语义、主题词法、子知识支持和证据覆盖按固定权重相加，并用绝对门槛接受主题，不因两个相关主题分数接近而拒答。带银行、养老金、个人网站等具体项目锚点的问题不会进入宽泛聚合；未知技术、通用教程、跨项目事实和具体能力声明也必须先通过原有证据门控。若模型超时、WASM 不可用、向量无效或 schema v2 索引与知识不一致，服务端会安全降级到关键词检索，而不是编造回答。

## 构建与预览

```powershell
npm test
npm run typecheck
npm run build
npm run preview
```

构建产物会生成到 `dist/`，该目录不提交到 GitHub。

## 目录结构

```text
.
├── .codex/skills/      # Codex 工作流 skill
├── knowledge/          # 经审核的公开知识库
├── netlify/functions/  # 管理认证、动态内容、问答与统计服务端接口
├── public/             # 静态资源
├── shared/             # 前后端共享的站点内容 schema 与内置内容
├── src/                # React 源码
│   ├── components/     # 公开页面与 admin 管理组件
│   ├── lib/            # 内容读取、管理员 API 与通用工具
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
git commit -m "chore: release v0.4.0"
git push
```

提交前请确认 `npm test`、`npm run typecheck` 和 `npm run build` 通过。

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

GitHub Pages 只托管静态网页：公开页面会从 Netlify 获取已发布内容，读取失败时回退到仓库内置内容；打开 `#admin` 时不会请求管理员会话，而是显示前往 Netlify 管理界面的链接。

## Netlify、管理后台与知识助手

`netlify.toml` 已固定构建命令和发布目录：

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify CLI 登录并绑定站点后，先检查目标，再创建不影响正式网站的预览部署：

```powershell
npm run netlify:status
npm run deploy:preview
```

预览通过后才执行 `npx netlify deploy --prod` 更新正式站点。模型默认使用 `gpt-5.4-mini`，可通过服务端变量 `KNOWLEDGE_MODEL` 调整；前端在 GitHub Pages 运行时会自动连接 `yyq-web.netlify.app`，其他跨域前端可用 `VITE_KNOWLEDGE_API_BASE` 覆盖。

管理员账号、会话、站点动态内容与修订记录保存在 Netlify Blobs，不写入 Git，也不会随静态构建进入 `dist/`。后台保存会立即更新公开内容；每次保存或恢复都会形成修订链，最多保留最近 20 个修订。初始化与恢复的安全令牌生命周期、Draft Deploy 验收步骤和变量边界见 [操作文档](./docs/OPERATIONS.md#13-管理界面与动态内容运维)。

根据 Netlify AI Gateway 的注入行为，服务端优先读取总会注入且不会与自带 Provider 凭据冲突的 `NETLIFY_AI_GATEWAY_KEY` 与 `NETLIFY_AI_GATEWAY_BASE_URL`；只有这一对不可用时，才兼容成对的 `OPENAI_API_KEY` 与 `OPENAI_BASE_URL`。不要只配置半套变量，也不要把任何 Key、Token 或服务端 Base URL 放入 `VITE_` 变量，因为所有 `VITE_` 内容都会进入公开浏览器产物。

知识资料维护、接口契约、环境变量和部署验收步骤见 [docs/OPERATIONS.md](./docs/OPERATIONS.md)。资料收录边界见 [knowledge/README.md](./knowledge/README.md)。
