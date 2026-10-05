# 本地 Agent 工作流设计

梳理 Agent、Tool、Skill 与 RAG 的职责，设计连接云端任务和本地执行器的流程，让真实终端输出、步骤状态与操作结果可查看。
当前阶段：架构设计与学习阶段。已记录里程碑：完成组件职责和执行边界梳理；整理终端日志与进度事件设计。操作经验：Agent / Tool / Skill / RAG 职责梳理；本地 Runner 架构设计；终端输出与步骤事件设计；云端和本地执行边界分析；安装与外部操作确认流程设计。待完成：实现最小本地执行器，验证一条命令从发起到终端输出的完整链路。。公开范围：设计记录。这些记录体现 Codex 辅助实践，不表示每项技术均精通。

## 原始证据

- knowledge/index.json#project-local-agent

## 相关页面

- [topic-personal-projects](topic-personal-projects.md)

来源摘要：98aaffbd4314e740254b6ff8f048236aa1701416ab26b98d0e7245cb43ede93d
