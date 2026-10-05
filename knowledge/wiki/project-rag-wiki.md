# RAG 知识库与问答

个人网站已实现本地 BGE 混合检索、主题加权聚合和事实推导；新增 Wiki 来源编译、过期校验与多项目证据规划，v0.5.0 非生产问答验收通过。Wiki 为确定性编译，LLM 自动增量维护未实现；本地 Chroma 教学建库尚未验证。
当前阶段：RAG + Wiki 首版已验证，非生产预览。已记录里程碑：网站 RAG 检索、问答与验证流程建立；本地 ingest / search 教学脚本整理；Python 虚拟环境创建与激活验证；v0.5.0 Wiki 首版与真实问答验收；437 项测试与 Draft 7/7 验收通过（当次记录）。操作经验：知识文档整理与元数据设计；文本切分与重叠片段检查；Embedding 模型与归一化一致性；关键词与向量混合检索；Top-K 来源与回答依据检查；问答回归与接口验证；Wiki Markdown 与 manifest 编译；来源摘要与过期页面校验；多项目查询与双方来源检查；未知能力拒答及事实推导边界。待完成：继续验证多项目问题，后续设计经审核的 LLM 增量整理；本地 Chroma 建库单独验证。。公开范围：网站实践已公开；本地原型学习中。这些记录体现 Codex 辅助实践，不表示每项技术均精通。

## 原始证据

- knowledge/index.json#project-rag-wiki

## 相关页面

- [topic-personal-projects](topic-personal-projects.md)

来源摘要：15ceb1fdef6518a8860704dfff7a5bb5af5fe236a12143c2dc81a9f67bbb7c3e
