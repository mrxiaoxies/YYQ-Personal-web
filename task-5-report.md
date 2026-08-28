# Task 5 Report: Versioned Site Content Store

## Scope

- Implemented only the versioned Blob-backed site content store.
- Did not implement HTTP/API/UI/analytics/deploy.
- Did not push or create a derived task.

## RED

- Added `netlify/functions/_shared/site-content-store.test.ts`.
- First focused run failed as expected because `site-content-store.ts` was missing:
  - `ERR_MODULE_NOT_FOUND`

## GREEN

- Added `netlify/functions/_shared/site-content-store.ts`.
- Registered the focused test in `package.json` under `test:rag`.
- Store behavior covered:
  - `getCurrent()` returns the built-in fallback without writing Blob data.
  - First save uses `onlyIfNew`.
  - Existing save uses `onlyIfMatch`.
  - Stale and concurrent stale writes fail with `content_conflict`.
  - Revisions store the complete replaced snapshot.
  - Restore publishes a new current version and stores the replaced current snapshot as a restore revision.
  - Revision IDs are canonical, lexically sortable, and path-injection resistant.
  - Revision listing accepts only strict canonical records.
  - Retention keeps the newest 20 canonical revision keys and deletion failures do not break a successful current write.
  - Generated `version` and `updatedAt` include a UUID to avoid same-millisecond collisions.
  - Revision actor data stores only `actorEmail`.
  - Stored current parse failures fail closed, and current without an ETag fails as `content_conflict`.

## Verification

- `node --test netlify/functions/_shared/site-content-store.test.ts`
  - PASS: 9/9
- `npm test`
  - PASS: 306/306
- `npm run typecheck:functions`
  - PASS

## Notes

- `apply_patch` intermittently failed with a Windows sandbox helper error after creating files, so small fixed-text edits were applied with PowerShell commands using explicit paths.
