# SDD ledger — plan: docs/superpowers/plans/2026-10-05-rag-wiki.md

Ruling: 在当前工作区的 codex/rag-wiki 分支执行，不复制现有未提交后台改动到新 worktree；用户批准在当前任务顺序实施。代价是需要以文件差异严格区分改动，不自动提交。

Pre-flight: Task 1 的校验页面供 Task 2 使用；Task 2 的已接受证据供 Task 3 使用；模型适配器必须传入新增 wikiContext。原始门控与 Wiki 组织说明不互相替代。

Ruling: Windows 环境使用显式 Node 24 PATH 和手工进度文件；技能 Bash 辅助脚本不适配当前 PowerShell。保留测试与审查记录，不自动提交或清理未提交文件。

Task 1: complete — 3 个 schema 测试通过；21 页生成与 wiki:check 通过。
Task 2: complete — 3 个导航/查询测试通过；真实 BGE Linux 项目关联通过。
Task 3: complete — 比较双方来源与缺失学习日期验证通过；ask 适配器 18 项测试通过。
Task 4: complete — 427 项原有测试与 10 项 Wiki 测试通过；原有真实 BGE 细节 21/21、宽泛 216/216、未知误答 0、项目隔离 100%；真实 Wiki 5/5；构建通过。

Ruling: 具体未知能力的负例允许 blocked-before-retrieval 或 insufficient-evidence，两者均必须不调用模型、来源为空；私人信息规则可能先拦截。代价：不强制单一拒答原因。

Ruling: 首版学习开始日期问题统一拒答，因为当前来源没有明确学习开始字段；未来加入日期事实时需扩展该规则。代价：不能仅补内容就自动启用学习日期回答。

Final review: fresh read-only reviewer identified two Important issues.
Final: fixed 比较模型只输出一侧仍成功 — wiki-answer 单侧来源测试 RED→GREEN。
Final: fixed 来源转私有后旧生成页残留 — compile-wiki 实际临时目录生成测试 RED→GREEN；只删除旧 manifest 路径安全且内容匹配的生成文件。
Final: minor (deferred): 技能关联首版识别 Linux/Postman/MySQL/Codex，其他公开技能仍可走原始检索；后续从明确标签动态识别。

Draft: https://6ac2e5c4c5639b275c7c6b60--yyq-web.netlify.app
线上 verify:rag 7/7 通过（包含真实模型项目比较、双方来源和 Wiki 页面参与检查）。正式站没有部署，源码没有提交或推送。
保留 codex/rag-wiki 分支、未提交改动和本进度记录作为交付；不删除任何源码或既有用户文件。
