# 操作文档

## 1. 环境要求

- Node.js 24
- npm 10 或更高版本
- Git

## 2. 安装依赖

```powershell
npm install
```

用途：按照 `package-lock.json` 安装固定版本的前端依赖、Netlify CLI、Transformers.js 与 ONNX Runtime Web，服务于让开发机、测试环境和部署构建使用一致工具。它不会启动服务、生成知识向量或部署网站。

首次安装后，或升级 `@huggingface/transformers`、`onnxruntime-web` 时执行：

```powershell
npm run rag:runtime:prepare
```

用途：从已安装依赖中准备 Netlify Function 使用的 Transformers Web 模块和 ONNX Runtime WASM 文件，服务于让本地 BGE 模型使用跨 Windows/Linux 的 CPU/WASM 推理，并避免将 218 MB 级原生 ONNX 运行依赖打入 Function。脚本会校验来源结构和生成文件，依赖版本变化后必须重新执行并复测。

## 3. 本地开发

```powershell
npm run dev
```

启动后访问终端中显示的本地地址。

## 4. 测试与类型检查

```powershell
npm test
npm run evaluate:rag
npm run typecheck
```

- `npm test` 运行关键词检索、混合检索、降级、安全门控、问答接口和健康接口测试，服务于快速发现逻辑回归；使用固定/合成向量，不加载真实回答模型，也不产生 Gateway 费用。
- `npm run evaluate:rag` 用本地 `bge-small-zh-v1.5` 实际生成正例和反例问题向量，再执行混合检索，服务于验证自然口语召回和错误知识拒答；使用本机 CPU/WASM，不调用 AI Gateway，但会比单元测试慢。
- `npm run typecheck` 同时检查前端和 Netlify Functions，服务于在运行或部署前发现接口字段、trace 契约与类型不一致。

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

本仓库内置网站维护工作流 skill，名称为 `web-skill`：

```text
.codex/skills/web-skill/
```

在 Codex 中维护、发版或部署网站时，可直接要求：

```text
Use $web-skill to update, validate, publish, and deploy the YYQ personal website.
```

也可以用自然语言调用：

```text
使用 web skill 更新并发布我的个人网站。
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
git -C .deploy-gh-pages commit -m "deploy: release v0.3.0"
git -C .deploy-gh-pages push origin HEAD:gh-pages
git worktree remove .deploy-gh-pages
```

部署完成后验证首页和新增静态资源地址。例如：

```text
https://mrxiaoxies.github.io/YYQ-Personal-web/files/yang-yeqi-resume.pdf
```

## 12. Netlify 部署

本项目使用 `netlify.toml` 固定构建配置：

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

### 12.1 CLI 登录与站点绑定

项目把 `netlify-cli` 固定为开发依赖。首次拉取代码后执行：

```powershell
npm install
```

这条指令读取 `package-lock.json` 并安装已经锁定的工具版本，服务于“每台电脑使用同一套构建与部署工具”。它不会部署网站。

确认登录和站点绑定状态：

```powershell
npm run netlify:status
```

这条指令只读取当前 Netlify 用户、项目名和站点地址，服务于“防止把代码部署到错误站点”。成功时应显示 `Current project: yyq-web`。

如果显示 `Not logged in`，执行：

```powershell
npx netlify login
```

它会打开 Netlify 官方 OAuth 页面，服务于“让 CLI 获得部署权限”。不要把账号密码或个人访问令牌写入项目文件。

如果显示尚未绑定项目，执行：

```powershell
npx netlify link --name yyq-web
```

它只在本机创建 `.netlify/state.json`，服务于“告诉 CLI 后续开发和部署连接哪个站点”。`.netlify/` 已加入 `.gitignore`，不得提交。

### 12.2 预览部署与生产部署

先创建不会替换正式站点的预览部署：

```powershell
npm run deploy:preview
```

这条指令先运行生产构建，再上传为 Netlify Draft Deploy，服务于“在独立 URL 上验证真实 Function 和模型，不影响当前访客”。成功后 CLI 会返回 `Deploy URL`。

只有预览 URL 验收通过后，才发布到 Netlify 生产环境：

```powershell
npx netlify deploy --prod
```

`--prod` 会更新 `https://yyq-web.netlify.app`，服务于“让 GitHub Pages 和 Netlify 正式页面都能访问最新 `/api/ask`”。这是会改变线上状态的指令，不能用来代替预览测试。

个人经历助手使用 Netlify AI Gateway 调用模型。使用前先确认站点属于 Netlify credit-based plan，团队设置中没有关闭 AI Features。新站点至少完成一次生产部署后才会激活 AI Gateway；`yyq-web` 已有生产部署，后续预览部署可以直接使用 Gateway。

Netlify 在受支持的 Functions/Preview 等运行环境中会自动注入 Gateway 配置。本项目按以下顺序读取，而且每种方式都必须是完整的一对：

1. 优先使用 `NETLIFY_AI_GATEWAY_KEY` 与 `NETLIFY_AI_GATEWAY_BASE_URL`。Netlify 官方说明这两个专用变量总会注入到支持 AI Gateway 的运行环境，且不会与用户自带的 Provider 变量冲突。
2. 专用变量不可用时，兼容 `OPENAI_API_KEY` 与 `OPENAI_BASE_URL`。Netlify 通常也会为 OpenAI SDK 自动注入这一对，但如果用户在站点或团队层手动设置其中任意一个，Netlify 不会覆盖它，也不会自动补齐另一个。
3. 两组都不完整时，`/api/health` 返回 `503 gateway_not_configured`，避免把“只有 Key”或“只有 Base URL”误判为可用。

因此，使用 Netlify 托管 Gateway 时通常不需要手工填写四个变量。若明确使用自带 OpenAI 兼容凭据，只能在 Netlify 服务端环境中成对配置 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`。参考 [Netlify AI Gateway 官方说明](https://docs.netlify.com/build/ai-gateway/overview/)。

在 Netlify 的站点环境变量中可以配置：

```text
KNOWLEDGE_MODEL=gpt-5.4-mini
KNOWLEDGE_ALLOWED_ORIGINS=https://mrxiaoxies.github.io,https://your-domain.example
```

- `KNOWLEDGE_MODEL` 可不设置，默认使用 `gpt-5.4-mini`。
- `KNOWLEDGE_ALLOWED_ORIGINS` 是额外允许访问 `/api/ask` 的完整网页源，多个值用英文逗号分隔；只填写 `协议://域名[:端口]`，不填写路径。
- 模型凭据和其他服务端密钥只能配置为 Netlify 服务端环境变量，不得使用 `VITE_` 前缀。
- `.env.example` 只用注释列出服务端凭据名，不包含真实值。不要为了“让前端能读到”而创建 `VITE_OPENAI_API_KEY`、`VITE_NETLIFY_AI_GATEWAY_KEY` 或类似变量；`VITE_` 会被编译进公开网页。

## 13. 个人经历知识助手

### 13.1 维护公开知识库

`knowledge/index.json` 是 `/api/ask` 唯一允许使用的事实来源，访客不能通过网页修改它。更新资料时：

1. 只加入本人确认且已经公开的工作经历、项目和技术经验。
2. 不加入客户内部地址、账号、密钥、真实业务数据、未公开代码或私人联系方式。
3. 明确区分“已完成”“进行中”和“计划中”，不要把计划写成成果。
4. 保持 `id` 唯一稳定，补充准确的 `tags`、`aliases` 和 `content`，并将 `visibility` 设为 `public` 才能被公开接口加载。
5. 更新顶层 `version` 与 `updatedAt`，重新生成向量索引，然后运行真实向量评估、单元测试、类型检查和构建。

知识结构使用“主题索引 + 总览父条目 + 细节子条目”：工作项目、测试方法、接口数据环境和 AI 工作流仍各自维护事实；顶层 `topics` 只负责把宽泛问题连接到多条公开证据，不新增简历事实。每个主题的 `entryIds` 必须引用公开条目，`overviewEntryId` 决定总览来源优先级，`lexicalAnchors` 提供可维护的主题词法证据。新增真实能力仍应写入对应细节条目，再按需要更新总览和主题引用；不能只在主题说明里增加缺少来源的能力。

知识变更后的完整命令：

```powershell
npm run vectors:build
npm run evaluate:rag
npm test
npm run typecheck
npm run build
```

- `npm run vectors:build` 重新生成与当前知识版本匹配的 `knowledge/vector-index.json`，服务于避免线上使用旧文档向量。
- `npm run evaluate:rag` 使用真实本地模型跑自然问法正例和安全反例，服务于发现“能召回但召回错项目”或“向量把未知能力强行回答”的问题。
- `npm test` 运行快速可重复回归；`npm run typecheck` 核对前后端契约；`npm run build` 确认发布包可以生成。

字段与内容边界详见 [`knowledge/README.md`](../knowledge/README.md)。知识库内容随代码审查和重新部署发布，不接受访客写入。

#### 13.1.1 本地“问题/知识转向量”封装

本项目不通过外部 embedding API 生成向量。`netlify/functions/_shared/embedding.ts` 封装本地 `bge-small-zh-v1.5`，通过 Transformers.js 的 feature-extraction pipeline 和 ONNX Runtime Web/WASM 在 CPU 上推理。模型文件只从仓库的 `models/Xenova/bge-small-zh-v1.5` 读取，远程模型下载被关闭。

每条公开知识会按固定顺序构造成以下文本；空字段会省略，`visibility != public` 的条目不会进入文本或向量索引：

```text
标题：<title>
类别：<类别中文名>
任职：<company> / <role> / <period>
主题：<tag1>、<tag2>
常见问法：<alias1>；<alias2>
公开事实：<content>
```

字段各自服务的目的：

- `标题` 与 `类别` 提供项目/能力的主要语义锚点。
- `任职` 让公司、岗位和时间相关问法能落到正确经历。
- `主题` 提供稳定技术关键词；`常见问法`覆盖口语化别称，但不能堆入“项目、技术、经验”等过宽词。
- `公开事实` 是回答可使用的事实正文，必须保持公开、准确并区分已完成/进行中/计划中。

当前知识版本 `1.3.0` 含 16 条公开条目和 5 个主题。宽泛测试能力、工具技术、工作经验、AI 工作流和个人项目问法可进入主题聚合；若问题含银行客服、养老金、个人网站等具体项目锚点，检索器会排除宽泛聚合并使用对应项目条目。“哪些自动化测试框架”“哪些 CI 工具”这类具体能力声明仍必须由候选条目逐项证明。

问题和知识的向量化步骤：

1. 统一执行 Unicode NFKC、空白折叠与非空校验，服务于减少全角/半角和换行差异。
2. 文档文本直接进入模型，不添加 query instruction；访客问题前添加 `为这个句子生成表示以用于检索相关文章：`，这是 BGE 检索任务的 query instruction，服务于让“问题向量”更接近可回答它的知识文本。
3. 对 token 表示执行 mean pooling，把整句压缩为一个固定长度表示。
4. 执行 L2 normalize，使向量长度为 1，得到 512 维有限数值向量；索引生成器会检查维度、数量和非有限值。
5. 16 条文档向量和 5 个主题向量预先写入 schema v2 的 `knowledge/vector-index.json`；每次请求只计算问题向量，再分别与条目/主题向量比较，服务于减少线上重复计算。

混合检索不是“向量最高就直接回答”。详细问题同时运行关键词排名与向量排名，再通过 RRF（Reciprocal Rank Fusion）合并名次：关键词保留项目名、工具名等精确锚点，向量补足“返回怪怪的去哪找原因”这类没有照抄资料原词的自然表达。

宽泛问题使用主题加法评分：`0.45 × 主题语义 + 0.30 × 主题词法 + 0.15 × 子知识支持 + 0.10 × 证据覆盖`。混合主题绝对门槛为 `0.46`，纯词法降级门槛为 `0.38`；主题不使用首二名差值，因此“测试能力”和“工具技术”都相关时不会只因彼此接近而拒答。长主题锚点相对短重叠词获得更高词法分量，例如“测试工具”优先于单独的“测试”。这些常数只能在完整正反例语料同时通过时调整，不能为单个问法临时降门槛或堆 aliases。

无论详细还是宽泛检索，都先检查个人经历意图、未知英文技术、通用教程/代写、具体能力声明和跨项目事实拼接。主题聚合不会绕过这些门控。

若本地模型超时或不可用、问题向量无效，或向量索引的 schema/模型/维度/知识版本/条目/主题不匹配，混合层会返回 `lexical-fallback` 并使用关键词结果。降级服务于保证助手仍可回答有明确关键词的问题；它不会放宽证据门控，也不会把没有资料的问题交给回答模型猜测。

#### 13.1.2 “事实推导”规则

`netlify/functions/_shared/fact-derivation.ts` 在主题和公开证据通过检索后运行。规则可以计算时间、统计证据、按类别分组、关联问题中明确出现的实体、比较结构化阶段或形成跨条目摘要；每个结果必须包含 `ruleVersion`、`sourceEntryIds` 和主题 ID。

工作年限使用 `employmentPeriods` 中最早的公开起始月份到当前上海月份计算经过月数，不执行包含式“加一”，并只表述为“从业跨度”。如果没有结构化月份、月份在未来、存在多份冲突时间线或来源不属于当前主题，规则返回空结果。计算句由服务端加入回答，模型收到的结构化结论不能修改数值，也不能把跨度改写为“连续工作年限”。同样的规则边界适用于后续计数、比较和关联：无法用公开来源验证就不推导。

### 13.2 `/api/ask` 接口契约

请求使用 `POST /api/ask` 和 `Content-Type: application/json`：

```json
{
  "question": "你有哪些 Linux 环境搭建经验？",
  "conversation": [
    { "role": "user", "content": "介绍一下银行客服平台项目" },
    { "role": "assistant", "content": "……" }
  ]
}
```

- `question` 必填，最多 300 字。
- `conversation` 可选，最多携带最近 6 条消息，每条最多 1000 字；`role` 只能为 `user` 或 `assistant`。整个 JSON 请求体不能超过 32KB。
- 历史消息只用于理解“这个项目”等追问，回答事实仍以检索到的公开知识条目为准。

成功响应结构：

```json
{
  "answer": "……",
  "sources": [
    { "title": "银行客服大平台升级维护测试", "period": "2024.05" }
  ],
  "suggestions": ["这个项目用了哪些测试方法？"],
  "retrievalTrace": {
    "schemaVersion": 2,
    "decision": "answered",
    "mode": "hybrid",
    "model": "bge-small-zh-v1.5",
    "dimensions": 512,
    "topicTitle": "工作经验公开概括",
    "topicEvidenceCount": 6,
    "factDerivationTypes": ["duration", "count", "compare", "summarize"],
    "stages": [
      { "name": "policy", "status": "passed" },
      { "name": "embedding", "status": "completed", "durationMs": 36 },
      { "name": "lexical", "status": "completed", "durationMs": 2 },
      { "name": "semantic", "status": "completed", "durationMs": 1 },
      { "name": "fusion", "status": "completed", "durationMs": 1 },
      { "name": "fallback", "status": "skipped" },
      { "name": "grounding", "status": "completed", "durationMs": 820 }
    ],
    "candidates": [
      {
        "title": "银行客服大平台升级维护测试",
        "selected": true,
        "scores": { "lexical": 0.91, "semantic": 0.84, "fused": 0.96 }
      }
    ],
    "timings": { "retrievalMs": 40, "totalMs": 860 }
  }
}
```

`sources` 由服务端根据检索结果生成，最多返回 3 个公开来源，不采用模型自行编造的来源。回答模型使用严格 JSON Schema 返回最多 8 条结论，每条必须列出 1 至 6 个 `sourceEntryIds`；服务端只保留全部 ID 都属于本次已接受公开证据的结论，并去重、限长。模型写出的从业年数会在存在服务器时间推导时被删除，避免覆盖确定性计算。

纯无关问题检索无命中，或请求被规则识别为隐私、常见站外意图、提示词攻击时，接口会直接返回说明性回答且不调用向量模型或回答模型；问题包含有效经历主题、但证据缺少某个细节时，模型只能回答“公开资料没有说明”。参数无效、网络/CORS、请求过频或模型服务异常时，前端统一显示可读错误；跨域或 Netlify 边缘层可能隐藏具体 HTTP 状态，因此 403/429 的精确表现必须在线上验收。

前端在助手回答下显示“查看检索过程”。展开后可看到策略检查、问题向量化、关键词检索、语义检索、RRF 融合、降级和证据回答各步骤的状态/耗时，以及最多 3 个公开候选标题和归一化分数。schema v2 轨迹还可显示主题标题、聚合证据数量和事实推导类型（如时间计算、证据计数），但不显示推导值或规则输入。这是可验证的公开 trace，不是调试数据转储：服务端不会返回原始 512 维向量、内部接受阈值、候选知识正文、条目 ID、系统提示词、密钥、文件路径、异常 message 或 stack。被策略拦截或需要澄清时，trace 使用 `mode: "not-run"` 且候选为空。

`GET /api/health` 是不调用模型、不产生模型费用的健康检查：

- `200` 与 `status: "ready"` 表示 Function、知识索引和 AI Gateway 环境变量已经就绪。
- `503` 与 `gateway_not_configured` 表示 Function 能运行，但 Gateway 配置尚未注入。
- `retrieval` 会安全展示本地向量模型短名、512 维、知识版本、索引条目数和 `indexReady`；读取这些静态元数据不会加载 WASM 模型，也不会产生模型费用。
- 健康检查不能证明模型一定能回答，所以仍要用 `/api/ask` 完成一次真实问答验收。

### 13.3 前端环境变量

前端与 Netlify Function 同域时无需配置 API 地址，页面默认请求当前站点的 `/api/ask`。如需暂时关闭知识助手，可在构建环境中显式设置：

```text
VITE_KNOWLEDGE_API_ENABLED=false
```

GitHub Pages 仅托管静态文件，不能直接运行 Netlify Function。前端在运行时识别当前 `*.github.io` 地址，并自动使用：

```text
VITE_KNOWLEDGE_API_BASE=https://yyq-web.netlify.app
```

GitHub Pages 的源（当前为 `https://mrxiaoxies.github.io`）已经加入 Function 的允许列表。其他跨域前端可用 `VITE_KNOWLEDGE_API_BASE` 覆盖后端根地址；不要在末尾加入 `/api/ask`，前端会自动拼接接口路径。

所有 `VITE_` 变量都会写入公开的浏览器构建产物，只能放公开配置，绝不能放 OpenAI API Key、Netlify Token 或其他密钥。

### 13.4 本地与部署后验收

#### A. 初始化本地向量运行环境

新拉取仓库或依赖变化后按顺序执行：

```powershell
npm install
npm run rag:runtime:prepare
```

- `npm install`：按 lockfile 安装依赖，服务于获得确定版本的 Node 包；不启动、部署或生成向量。
- `npm run rag:runtime:prepare`：准备 Transformers Web 和 ONNX Runtime WASM Function 运行文件，服务于跨平台 CPU 推理；升级 Transformers/ONNX 后必须重跑。

当 `knowledge/index.json`、模型或知识文本格式变化时执行：

```powershell
npm run vectors:build
```

用途：校验本地模型与公开知识，把每条知识转换为固定格式文本，经 mean pooling 与 L2 normalize 生成 512 维文档向量，再原子写入 `knowledge/vector-index.json`。它服务于让线上请求读取预计算索引，不调用外部 embedding API。成功标志是终端完成 `[1/4]` 到 `[4/4]` 并打印索引路径；如果提示模型文件不完整、维度异常或知识版本不一致，应先修正来源，不能提交旧索引冒充成功。

生成索引后运行真实向量评估：

```powershell
npm run evaluate:rag
```

用途：用本地模型逐条向量化 21 条细节问题、216 条由主题/主语/句式组合生成的宽泛改写、未知具体能力和跨项目隔离反例。输出分别统计细节召回、宽泛主题召回、未知能力误答数和项目隔离率，服务于提前发现一整类问法，而不是等访客逐句报告；不调用 AI Gateway。通过门槛为细节全通过、宽泛召回至少 95%、未知具体能力误答 0、项目隔离 100%。当前校准结果为 21/21、216/216、0、100%。

#### B. 纯前端预览

```powershell
npm run dev
```

用途：只启动 Vite 网页，服务于检查页面布局与交互。它不启动 Netlify Function，所以不能用于验证真实 RAG；健康状态显示“暂不可用”属于预期。

#### C. 本地全链路 RAG

```powershell
npm run dev:rag
```

用途：由 Netlify CLI 同时启动 Vite 和 `netlify/functions`，并注入已绑定站点的 AI Gateway 环境，服务于本地验证“页面 → Function → 检索 → 模型 → 来源”。默认访问 CLI 输出的本地地址，通常为 `http://localhost:8888`。

另开一个终端执行：

```powershell
npm run verify:rag -- http://localhost:8888
```

用途：自动执行三步真实冒烟测试：

1. 请求 `/api/health`，验证 Function、知识索引和 Gateway 配置；
2. 提问“个人网站用了哪些技术？”，验证真实模型回答和服务端来源；
3. 提问天气问题，验证无关内容安全拒答且不返回伪造来源。

这条验证指令会产生一次真实模型调用；不要放入频繁运行的默认单元测试。

如果本地真实问答返回 `mismatched_client_ip`：

1. 先看错误发生位置。`/api/health` 可能仍然是 `ready`，Netlify CLI 日志会显示 Gateway 的 `mismatched_client_ip`；这表示本地 CLI 注入的临时 Gateway 凭据与实际请求出口 IP 不匹配。
2. 执行 `npm run evaluate:rag`。如果真实向量正反例通过，说明本地 BGE 模型、WASM、512 维索引、cosine 与 RRF 链路正常；`mismatched_client_ip` 出现在后续远程回答阶段，不能误判为“问题/知识转向量失败”。
3. 不要把临时 Gateway Key 复制进 `.env`，也不要创建 `VITE_*` 密钥绕过。创建 Draft Deploy，再用云端 URL 验证：

```powershell
npm run deploy:preview
npm run verify:rag -- https://<CLI 返回的 Deploy-URL>
```

Draft Function 在 Netlify 云端使用与 Gateway 匹配的运行身份，服务于验证真实回答，同时不更新正式站。如果 Draft URL 通过，本地失败可记录为 CLI Gateway 凭据/IP问题，而不是向量故障。

#### D. 部署前代码校验

```powershell
npm test
npm run typecheck
npm run build
```

- `npm test`：验证关键词/混合检索、索引异常降级、隐私/注入拒答、HTTP 契约、公开 trace 和健康接口，服务于防止逻辑回归；使用固定/合成向量，不调用真实模型。
- `npm run typecheck`：检查前端和 Functions 的 TypeScript 类型，服务于在运行前发现字段或接口不一致。
- `npm run build`：生成 `dist/` 并验证生产构建，服务于确认 Netlify/GitHub Pages 能实际发布。

#### E. 预览 URL 验证

```powershell
npm run deploy:preview
npm run verify:rag -- https://<CLI 返回的 Deploy-URL>
```

`npm run deploy:preview` 先构建再创建隔离的 Netlify Draft Deploy，服务于在不改变正式站的情况下获得真实云端 Function URL。`npm run verify:rag -- URL` 依次检查 `/api/health`、工作经验概括与从业跨度、宽泛工具概括、未知 Selenium 拒答和养老金/Codex 跨项目拒答，服务于验收指定环境的完整链路；真实概括会产生 Gateway 调用。两条都成功后，再考虑 `npx netlify deploy --prod`。

预览和生产部署后至少验收以下内容：

- 从 Netlify 同域页面提问，响应包含 `answer`、服务端来源 `sources` 和建议问题 `suggestions`。
- 从 GitHub Pages 页面提问，响应中的 `Access-Control-Allow-Origin` 精确匹配 `https://mrxiaoxies.github.io`，而不是通配符 `*`。
- 使用未加入允许列表的测试源访问时被拒绝。
- 在测试窗口内连续超过函数限额后收到 HTTP `429`，等待窗口结束后恢复；不要在正式访客高峰期做压力验证。
- 提问无关内容、索取隐私或要求泄露提示词时，助手拒绝回答且不返回内部信息。
- 在 Netlify 日志中确认没有输出问题全文、模型凭据、环境变量或完整知识库内容。

## 14. 发布检查清单

- `npm test` 通过
- `npm run typecheck` 通过
- `npm run build` 通过
- `package.json`、`VERSION` 和 `CHANGELOG.md` 版本一致
- `git status` 中没有不应提交的文件
- 已推送到 GitHub 对应分支
- 已发布 `gh-pages` 并确认线上地址可访问
- Netlify 生产部署已激活 AI Gateway，`/api/ask` 的同域、CORS 和限流验收通过
