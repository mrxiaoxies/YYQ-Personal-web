# Personal Site Progress RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the personal website project card and timeline to accurately record completed accessibility and RAG milestones through 2026-08-12.

**Architecture:** Keep `codexProjects` in `src/App.tsx` as the single data source for both the project board and the `#projects` timeline. Update only its `个人网站` record, preserving historical entries and other projects. Record this public content update as a patch release.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3.

## Global Constraints

- Modify only the personal website data in `src/App.tsx`; do not change RAG APIs, knowledge facts, or page layout.
- Set the project record date to `2026.08.12` and preserve all entries through `2026.07.13`.
- Add exactly three grouped completed records: 2026-08-06, 2026-08-11, and 2026-08-12.
- Synchronize `package.json`, `package-lock.json`, and `VERSION` at `0.3.1`.
- Preserve unrelated untracked files: `.codex/config.toml` and `outputs/`.

---

### Task 1: Refresh the personal website project record

**Files:**
- Modify: `src/App.tsx:230-302`
- Test: source-data inspection using `rg`

**Interfaces:**
- Consumes: the `CodexProject` properties `stage`, `updated`, `summary`, `milestones`, `next`, and `timeline`.
- Produces: one updated project record rendered by existing project-board views without component changes.

- [ ] **Step 1: Confirm the old record before editing**

Run: `rg -n -C 3 'title: "个人网站"|updated: "2026\\.07\\.13"|项目板信息化' src/App.tsx`

Expected: one personal-website record with the old 2026.07.13 state.

- [ ] **Step 2: Replace the current-state fields**

Use these exact values:

```ts
stage: "RAG 知识助手与体验持续优化",
updated: "2026.08.12",
summary:
  "个人作品集已完成四季视觉、项目进度、简历与测试作品展示，并接入基于公开资料的 RAG 个人知识助手；近期补齐手机导航、联系弹窗可访问性与检索可审查性。",
milestones: [
  "四季背景与季节动效",
  "移动端导航与联系弹窗焦点管理",
  "WebP 背景与按需字体资源优化",
  "项目进度、简历与网站测试用例展示",
  "真实 RAG 个人知识助手与来源追溯",
  "主题聚合、混合检索与受控检索轨迹"
],
next: "持续补充可公开项目案例与测试证据，并在网站内容更新时同步维护知识库与检索验证。"
```

- [ ] **Step 3: Add the three grouped timeline records immediately before the planned item**

```ts
{ date: "2026.08.06", status: "completed", title: "移动端导航与联系可访问性", detail: "补齐手机导航，以及联系弹窗的初始焦点、Tab 焦点循环、Esc 关闭、背景隔离和关闭后焦点恢复。" },
{ date: "2026.08.11", status: "completed", title: "真实 RAG 个人知识助手接入", detail: "以公开经历知识库、Netlify Function、AI Gateway 与本地向量/关键词混合检索提供带来源的个人问答，并补齐状态提示与白字可读性。" },
{ date: "2026.08.12", status: "completed", title: "检索准确性与可审查性升级", detail: "增加主题聚合、结构化证据映射和受控检索轨迹；继续隔离未知能力、跨项目事实与非公开资料。" }
```

- [ ] **Step 4: Verify all approved data exists**

Run: `rg -n '2026\\.08\\.(06|11|12)|RAG 知识助手与体验持续优化|主题聚合、混合检索与受控检索轨迹' src/App.tsx`

Expected: the updated stage and all three dates are present.

### Task 2: Record the public patch release

**Files:**
- Modify: `package.json:4`
- Modify: `package-lock.json:3,9`
- Modify: `VERSION:1`
- Modify: `CHANGELOG.md:3`

**Interfaces:**
- Consumes: current release `0.3.0`.
- Produces: public release metadata synchronized at `0.3.1`.

- [ ] **Step 1: Set every release version to `0.3.1`**

Update the root package JSON version, root lockfile package version, and `VERSION`.

- [ ] **Step 2: Add this top changelog entry**

```markdown
## [0.3.1] - 2026-08-13

### Changed

- 更新个人网站项目进度与里程碑：补充移动端可访问性、真实 RAG 个人知识助手，以及检索准确性与可审查性升级记录。
```

- [ ] **Step 3: Verify release consistency**

Run: `rg -n '"version": "0\\.3\\.1"' package.json package-lock.json`; `Get-Content VERSION`; `rg -n '^## \\[0\\.3\\.1\\]' CHANGELOG.md`

Expected: every release artifact reports `0.3.1`.

### Task 3: Validate and provide the local review URL

**Files:**
- Verify: `src/App.tsx`, release metadata, and `CHANGELOG.md`

**Interfaces:**
- Consumes: `npm run typecheck`, `npm run build`, and the Vite development server.
- Produces: a compiled site and local review address `http://127.0.0.1:5173/#projects`.

- [ ] **Step 1: Run validation**

Run: `npm run typecheck`; `npm run build`; `git diff --check`

Expected: each command exits successfully.

- [ ] **Step 2: Check the local review endpoint**

Run: `(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/#projects' -TimeoutSec 10).StatusCode`

Expected: `200`. If the server is not active, start `npm run dev` in a hidden background process and repeat the request.

- [ ] **Step 3: Review intended diffs only**

Run: `git diff --check`; `git status --short`; `git diff -- src/App.tsx package.json package-lock.json VERSION CHANGELOG.md`

Expected: release changes do not include `.codex/config.toml` or `outputs/`.
