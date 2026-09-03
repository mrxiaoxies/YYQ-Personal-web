import { getStore, type GetStoreOptions, type Store } from "@netlify/blobs";

import { defaultSiteContent as builtinDefaultSiteContent } from "../../../shared/default-site-content.ts";
import {
  parseSiteContentDocument,
  parseSiteContentUpdate,
  type SiteContentDocument,
  type SiteContentUpdate
} from "../../../shared/site-content-schema.ts";
import type { PublicAdminUser } from "./admin-auth-service.ts";

export type RevisionSummary = {
  id: string;
  createdAt: string;
  actorEmail: string;
  sourceVersion: string;
  reason: "save" | "restore";
};

export interface SiteContentStore {
  getCurrent(): Promise<SiteContentDocument>;
  save(update: SiteContentUpdate, actor: PublicAdminUser): Promise<{ document: SiteContentDocument; revision: RevisionSummary }>;
  listRevisions(): Promise<RevisionSummary[]>;
  restore(revisionId: string, expectedVersion: string, actor: PublicAdminUser): Promise<SiteContentDocument>;
}

export type SiteContentStoreErrorCode = "content_conflict" | "invalid_content";

export class SiteContentStoreError extends Error {
  readonly code: SiteContentStoreErrorCode;

  constructor(code: SiteContentStoreErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SiteContentStoreError";
  }
}

type RevisionRecord = RevisionSummary & {
  snapshot: SiteContentDocument;
  targetVersion: string;
};

type CurrentSnapshot = {
  document: SiteContentDocument;
  etag: string | null;
  source: "blob" | "default";
};

type RevisionReadResult = {
  corruption: boolean;
  records: RevisionRecord[];
};

type CommittedChainResult = {
  chainNewestFirst: RevisionRecord[];
  complete: boolean;
};

type SiteContentBlobStoreFactory = (options: GetStoreOptions & { consistency: "strong"; name: string }) => Store;

type CreateBlobSiteContentStoreOptions = {
  createStore?: SiteContentBlobStoreFactory;
  defaultContent?: SiteContentDocument;
  now?: () => Date;
  randomUUID?: () => string;
};

const STORE_NAME = "yyq-site-content";
const CURRENT_KEY = "current";
const REVISION_PREFIX = "revisions/";
const RETAINED_REVISIONS = 20;
const DELETE_RETRIES = 3;
const REVISION_WRITE_RETRIES = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_ID_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const CONTENT_VERSION_PATTERN = /^content-(.+)$/i;
const SAFE_MAINTENANCE_ERROR_NAMES = new Set(["Error", "RangeError", "SyntaxError", "TypeError"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeMaintenanceErrorName(error: unknown): string {
  return error instanceof Error && SAFE_MAINTENANCE_ERROR_NAMES.has(error.name)
    ? error.name
    : "UnknownError";
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function requiredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function invalidContent(message: string): SiteContentStoreError {
  return new SiteContentStoreError("invalid_content", message);
}

function contentConflict(message: string): SiteContentStoreError {
  return new SiteContentStoreError("content_conflict", message);
}

function parseDocument(value: unknown, label: string): SiteContentDocument {
  try {
    return parseSiteContentDocument(value);
  } catch {
    throw invalidContent(`${label} is not valid site content.`);
  }
}

function parseUpdate(value: SiteContentUpdate): SiteContentUpdate {
  try {
    return parseSiteContentUpdate(value);
  } catch {
    throw invalidContent("Site content update is not valid.");
  }
}

function parseRevisionId(id: string): { timestamp: string; uuid: string } | null {
  const match = REVISION_ID_PATTERN.exec(id);
  if (match === null || !isIsoDate(match[1])) return null;
  return { timestamp: match[1], uuid: match[2] };
}

function assertRevisionId(id: string): { timestamp: string; uuid: string } {
  const parsed = parseRevisionId(id);
  if (parsed === null || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw contentConflict("Invalid site content revision ID.");
  }
  return parsed;
}

function revisionKey(id: string): string {
  assertRevisionId(id);
  return `${REVISION_PREFIX}${id}`;
}

function targetVersionForRevisionId(id: string): string {
  assertRevisionId(id);
  return `content-${id}`;
}

function revisionIdFromTargetVersion(version: string): string | null {
  const match = CONTENT_VERSION_PATTERN.exec(version);
  const id = match?.[1];
  return id !== undefined && parseRevisionId(id) !== null ? id : null;
}

function isCompatibleStoredVersion(version: string): boolean {
  // Existing non-content versions are opaque legacy chain tails; content versions must be canonical.
  return !/^content-/i.test(version) || revisionIdFromTargetVersion(version) !== null;
}

function parseRevisionRecord(value: unknown, key: string): RevisionRecord | null {
  if (!key.startsWith(REVISION_PREFIX)) return null;
  const idFromKey = key.slice(REVISION_PREFIX.length);
  const parsedId = parseRevisionId(idFromKey);
  if (parsedId === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["actorEmail", "createdAt", "id", "reason", "snapshot", "sourceVersion", "targetVersion"])) return null;
  if (
    value.id !== idFromKey ||
    value.createdAt !== parsedId.timestamp ||
    !requiredText(value.actorEmail, 320) ||
    !requiredText(value.sourceVersion, 200) ||
    !isCompatibleStoredVersion(value.sourceVersion) ||
    !requiredText(value.targetVersion, 200) ||
    value.targetVersion !== targetVersionForRevisionId(idFromKey) ||
    (value.reason !== "save" && value.reason !== "restore")
  ) {
    return null;
  }

  try {
    const snapshot = parseSiteContentDocument(value.snapshot);
    if (snapshot.version !== value.sourceVersion) return null;
    return {
      actorEmail: value.actorEmail,
      createdAt: value.createdAt,
      id: idFromKey,
      reason: value.reason,
      snapshot,
      sourceVersion: value.sourceVersion,
      targetVersion: value.targetVersion
    };
  } catch {
    return null;
  }
}

function toRevisionSummary(record: RevisionRecord): RevisionSummary {
  return {
    actorEmail: record.actorEmail,
    createdAt: record.createdAt,
    id: record.id,
    reason: record.reason,
    sourceVersion: record.sourceVersion
  };
}

function assertPublicActor(actor: PublicAdminUser): string {
  if (actor.role !== "admin" || !requiredText(actor.email, 320)) {
    throw invalidContent("Site content actor is not valid.");
  }
  return actor.email;
}

function createDocument(sections: SiteContentDocument["sections"], publishedAt: Date, version: string): SiteContentDocument {
  if (revisionIdFromTargetVersion(version) === null) {
    throw invalidContent("Generated site content version ID is not valid.");
  }
  return parseDocument(
    {
      schemaVersion: 1,
      version,
      updatedAt: publishedAt.toISOString(),
      sections
    },
    "Generated current site content"
  );
}

function createRevisionId(createdAt: Date, uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) {
    throw invalidContent("Generated site content revision ID is not valid.");
  }
  const id = `${createdAt.toISOString()}-${uuid}`;
  assertRevisionId(id);
  return id;
}

function createRevisionRecord(input: {
  actorEmail: string;
  id: string;
  reason: "save" | "restore";
  snapshot: SiteContentDocument;
}): RevisionRecord {
  const { timestamp: createdAt } = assertRevisionId(input.id);
  const snapshot = parseDocument(input.snapshot, "Site content revision snapshot");
  if (!isCompatibleStoredVersion(snapshot.version)) {
    throw invalidContent("Site content revision snapshot is not valid site content.");
  }
  const record: RevisionRecord = {
    actorEmail: input.actorEmail,
    createdAt,
    id: input.id,
    reason: input.reason,
    snapshot,
    sourceVersion: snapshot.version,
    targetVersion: targetVersionForRevisionId(input.id)
  };
  return record;
}

function committedChain(records: RevisionRecord[], currentVersion: string): CommittedChainResult {
  const byId = new Map(records.map((record) => [record.id, record]));
  const chain: RevisionRecord[] = [];
  const seenVersions = new Set<string>();
  let cursor = currentVersion;
  while (true) {
    if (seenVersions.has(cursor)) {
      return { chainNewestFirst: chain, complete: false };
    }
    seenVersions.add(cursor);
    if (!/^content-/i.test(cursor)) {
      return { chainNewestFirst: chain, complete: true };
    }
    const expectedRevisionId = revisionIdFromTargetVersion(cursor);
    if (expectedRevisionId === null) {
      return { chainNewestFirst: chain, complete: false };
    }
    const record = byId.get(expectedRevisionId);
    if (record === undefined || record.targetVersion !== cursor) {
      return { chainNewestFirst: chain, complete: false };
    }
    chain.push(record);
    const nextCursor = record.sourceVersion;
    if (seenVersions.has(nextCursor)) {
      return { chainNewestFirst: chain, complete: false };
    }
    if (chain.length === RETAINED_REVISIONS) {
      return { chainNewestFirst: chain, complete: true };
    }
    cursor = nextCursor;
  }
}

export function createBlobSiteContentStore(options: CreateBlobSiteContentStoreOptions = {}): SiteContentStore {
  const createStore = options.createStore ?? ((storeOptions) => getStore(storeOptions));
  const defaultContent = parseDocument(options.defaultContent ?? builtinDefaultSiteContent, "Default site content");
  const defaultContentIsCompatible = isCompatibleStoredVersion(defaultContent.version);
  const now = options.now ?? (() => new Date());
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const store = createStore({ consistency: "strong", name: STORE_NAME });

  function assertCompatibleDefaultContent(): void {
    if (!defaultContentIsCompatible) {
      throw invalidContent("Default site content is not valid site content.");
    }
  }

  async function readCurrent(): Promise<CurrentSnapshot> {
    assertCompatibleDefaultContent();
    const result = await store.getWithMetadata(CURRENT_KEY, { type: "json" });
    if (result === null) {
      return { document: parseDocument(defaultContent, "Default site content"), etag: null, source: "default" };
    }
    if (typeof result.etag !== "string" || result.etag.length === 0) {
      throw contentConflict("Current site content Blob is missing an ETag.");
    }
    const document = parseDocument(result.data, "Current site content Blob");
    if (!isCompatibleStoredVersion(document.version)) {
      throw invalidContent("Current site content Blob is not valid site content.");
    }
    return {
      document,
      etag: result.etag,
      source: "blob"
    };
  }

  async function writeCurrent(document: SiteContentDocument, current: CurrentSnapshot): Promise<void> {
    const writeOptions = current.source === "default" ? { onlyIfNew: true } : { onlyIfMatch: current.etag ?? "" };
    const result = await store.setJSON(CURRENT_KEY, document, writeOptions);
    if (!result.modified) {
      throw contentConflict("Site content was updated by another writer.");
    }
  }

  async function writeRevision(record: RevisionRecord): Promise<boolean> {
    const result = await store.setJSON(revisionKey(record.id), record, { onlyIfNew: true });
    return result.modified;
  }

  async function readAllRevisionRecords(): Promise<RevisionReadResult> {
    const records: RevisionRecord[] = [];
    let corruption = false;
    for await (const page of store.list({ paginate: true, prefix: REVISION_PREFIX })) {
      for (const blob of page.blobs) {
        const key = blob.key;
        if (typeof key !== "string" || !key.startsWith(REVISION_PREFIX)) continue;
        const idFromKey = key.slice(REVISION_PREFIX.length);
        if (parseRevisionId(idFromKey) === null) continue;
        const result = await store.getWithMetadata(key, { type: "json" });
        if (result === null) {
          corruption = true;
          continue;
        }
        const record = parseRevisionRecord(result.data, key);
        if (record === null) {
          corruption = true;
          continue;
        }
        records.push(record);
      }
    }
    return {
      corruption,
      records: records.sort((left, right) => left.id.localeCompare(right.id))
    };
  }

  async function deleteRevisionBestEffort(id: string): Promise<void> {
    const key = revisionKey(id);
    for (let attempt = 0; attempt < DELETE_RETRIES; attempt += 1) {
      try {
        await store.delete(key);
        return;
      } catch {
        // Cleanup is eventual; a later list or save will try canonical revision keys again.
      }
    }
  }

  async function cleanupRevisionRecords(
    records: RevisionRecord[],
    chainNewestFirst: RevisionRecord[],
    cleanupAllowed: boolean
  ): Promise<void> {
    if (!cleanupAllowed) return;
    const retainedIds = new Set(chainNewestFirst.slice(0, RETAINED_REVISIONS).map((record) => record.id));
    for (const record of records) {
      if (!retainedIds.has(record.id)) {
        await deleteRevisionBestEffort(record.id);
      }
    }
  }

  async function readCommittedChain(currentVersion: string): Promise<{
    allRecords: RevisionRecord[];
    chainNewestFirst: RevisionRecord[];
    cleanupAllowed: boolean;
  }> {
    const { corruption, records: allRecords } = await readAllRevisionRecords();
    const { chainNewestFirst, complete } = committedChain(allRecords, currentVersion);
    return {
      allRecords,
      chainNewestFirst,
      cleanupAllowed: !corruption && complete
    };
  }

  async function publish(input: {
    actor: PublicAdminUser;
    expectedVersion: string;
    reason: "save" | "restore";
    sections: SiteContentDocument["sections"];
  }): Promise<{ document: SiteContentDocument; revision: RevisionSummary }> {
    const actorEmail = assertPublicActor(input.actor);
    const current = await readCurrent();
    if (current.document.version !== input.expectedVersion) {
      throw contentConflict("Site content version does not match the current version.");
    }

    const publishedAt = now();
    let document: SiteContentDocument | null = null;
    let revision: RevisionRecord | null = null;
    for (let attempt = 0; attempt < REVISION_WRITE_RETRIES; attempt += 1) {
      const revisionId = createRevisionId(publishedAt, randomUUID());
      const candidateDocument = createDocument(input.sections, publishedAt, targetVersionForRevisionId(revisionId));
      const candidateRevision = createRevisionRecord({
        actorEmail,
        id: revisionId,
        reason: input.reason,
        snapshot: current.document
      });
      if (await writeRevision(candidateRevision)) {
        document = candidateDocument;
        revision = candidateRevision;
        break;
      }
    }
    if (document === null || revision === null) {
      throw contentConflict("Site content revision already exists.");
    }

    try {
      await writeCurrent(document, current);
    } catch (error) {
      if (error instanceof SiteContentStoreError && error.code === "content_conflict") {
        await deleteRevisionBestEffort(revision.id);
      }
      throw error;
    }
    try {
      const { allRecords, chainNewestFirst, cleanupAllowed } = await readCommittedChain(document.version);
      await cleanupRevisionRecords(allRecords, chainNewestFirst, cleanupAllowed);
    } catch (error) {
      console.warn("site_content_revision_maintenance_failed", {
        errorName: safeMaintenanceErrorName(error)
      });
    }
    return { document, revision: toRevisionSummary(revision) };
  }

  return {
    async getCurrent() {
      assertCompatibleDefaultContent();
      return (await readCurrent()).document;
    },

    async save(update, actor) {
      assertCompatibleDefaultContent();
      const parsedUpdate = parseUpdate(update);
      return publish({
        actor,
        expectedVersion: parsedUpdate.expectedVersion,
        reason: "save",
        sections: parsedUpdate.sections
      });
    },

    async listRevisions() {
      assertCompatibleDefaultContent();
      const current = await readCurrent();
      const { allRecords, chainNewestFirst, cleanupAllowed } = await readCommittedChain(current.document.version);
      await cleanupRevisionRecords(allRecords, chainNewestFirst, cleanupAllowed);
      return chainNewestFirst
        .slice(0, RETAINED_REVISIONS)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(toRevisionSummary);
    },

    async restore(revisionId, expectedVersion, actor) {
      assertCompatibleDefaultContent();
      assertRevisionId(revisionId);
      if (!requiredText(expectedVersion, 200)) {
        throw contentConflict("Expected site content version is not valid.");
      }
      const current = await readCurrent();
      if (current.document.version !== expectedVersion) {
        throw contentConflict("Site content version does not match the current version.");
      }
      const { allRecords, chainNewestFirst, cleanupAllowed } = await readCommittedChain(current.document.version);
      await cleanupRevisionRecords(allRecords, chainNewestFirst, cleanupAllowed);
      const revision = chainNewestFirst.find((candidate) => candidate.id === revisionId);
      if (revision === undefined) throw contentConflict("Site content revision does not exist.");
      const restored = await publish({
        actor,
        expectedVersion,
        reason: "restore",
        sections: revision.snapshot.sections
      });
      return restored.document;
    }
  };
}
