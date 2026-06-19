# YYQ Personal Website Maintenance Reference

## Repository Map

- `src/App.tsx`: main page content, section structure, resume data, contact modal, and static asset references.
- `src/index.css`: global styles, typography, responsive behavior, glass panels, and seasonal background effects.
- `public/`: static assets copied directly by Vite. Use this for images, fonts, downloadable files, and mobile backgrounds.
- `docs/OPERATIONS.md`: operator manual for local work, GitHub publishing, and production deployment.
- `CHANGELOG.md`: user-facing release history.
- `VERSION`, `package.json`, and `package-lock.json`: keep versions synchronized before a release.
- `netlify.toml`: production build settings for Netlify.

## Asset Rules

- Reference assets from React with `assetUrl("path/from/public")`.
- Put downloadable files under `public/files/`.
- Put contact and visual assets under `public/images/`.
- Do not commit generated `dist/`, `node_modules/`, local backups, `.env`, or secrets.

## Local Validation

Run these checks before publishing:

```powershell
npm run typecheck
npm run build
```

Use `npm run dev` for local development and `npm run preview` to inspect the production build.

## Version And Changelog

For public behavior changes:

1. Bump `package.json`.
2. Bump the top-level package versions in `package-lock.json`.
3. Update `VERSION`.
4. Add a dated `CHANGELOG.md` entry with `Added`, `Changed`, or `Fixed` sections.

Use patch versions for small content, asset, documentation, and workflow releases.

## GitHub Publish Checklist

1. Inspect changes with `git status --short --branch` and `git diff --stat`.
2. Stage only intended files.
3. Commit with a concise conventional message, for example `chore: release v0.1.5`.
4. Push to `origin main` unless a feature branch or PR flow is requested.

## Netlify Deployment Checklist

1. Confirm `netlify.toml` still uses `npm run build` and `dist`.
2. Run `npm run build` locally.
3. Check auth/link state with `npx netlify status`.
4. Deploy production with `npx netlify deploy --prod`.
5. Report the production URL and any deploy log URL from the CLI output.
