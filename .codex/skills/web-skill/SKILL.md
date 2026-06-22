---
name: web-skill
description: Maintain, validate, publish, and deploy the YYQ personal website repository. Use when the user says "web skill", invokes $web-skill, updates this Vite React TypeScript personal site, changes resume/contact/assets/content, bumps the site version, updates operations documentation, pushes to GitHub, or deploys the live GitHub Pages or Netlify site.
---

# Web Skill

## Overview

Use this skill to keep changes to the YYQ personal website consistent from local edits through production deployment. Call it with `Use $web-skill ...` or by saying "use web skill" when working on this website.

This skill captures the expected checks, version bookkeeping, documentation updates, GitHub push, GitHub Pages deployment, and optional Netlify deployment sequence for this repository.

## First Checks

Start by reading the repository state:

```powershell
git status --short --branch
git diff --stat
npm run typecheck
```

Do not overwrite existing user changes. If unrelated edits are present, inspect them and stage only the files that belong to the current release.

## Site Maintenance Workflow

1. Update source/content in `src/`, static files in `public/`, and documentation in `docs/` as needed.
2. Keep assets referenced through `assetUrl()` in `src/App.tsx` so Vite base paths work after deployment.
3. If the public behavior changes, bump `package.json`, `package-lock.json`, and `VERSION` to the same version.
4. Add a matching entry to `CHANGELOG.md`.
5. Update `docs/OPERATIONS.md` when commands, release steps, deployment steps, or skill usage changes.
6. Run `npm run typecheck` and `npm run build`.
7. Review `git diff` and commit with a terse conventional message.

## Publishing

Use the repository remote `https://github.com/mrxiaoxies/YYQ-Personal-web.git`.

```powershell
git add <intended-files>
git commit -m "chore: release vX.Y.Z"
git push
```

Use explicit file paths when there are mixed changes. Do not commit `dist/`, `node_modules/`, local backups, or secrets.

## Deployment

Deploy the live site through GitHub Pages by updating the remote `gh-pages` branch with the contents of `dist/`. Build locally first:

```powershell
npm run build
```

Use a temporary worktree for the Pages branch, replace its contents with `dist/`, commit, and push `HEAD:gh-pages`. Verify `https://mrxiaoxies.github.io/YYQ-Personal-web/` after the push.

Netlify is also configured, but it requires a linked/authenticated Netlify CLI session. The repository uses:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

When Netlify auth is available, use:

```powershell
npx netlify status
npx netlify deploy --prod
```

If Netlify is not linked or authenticated, link/login first and continue only after `npx netlify status` succeeds.

## Reference

Read `references/site-maintenance.md` when you need the repository map, release checklist, asset rules, or deployment notes in more detail.
