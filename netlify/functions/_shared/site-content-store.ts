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
};

type CurrentSnapshot = {
  document: SiteContentDocument;
  etag: string | null;
  source: "blob" | "default";
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  } catch (error) {
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

function assertRevisionId(id: string) {
  if (!REVISION_ID_PATTERN.test(id) || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw contentConflict("Invalid site content revision ID.");
  }
}

function revisionKey(id: string): string {
  assertRevisionId(id);
  return `${REVISION_PREFIX}${id}`;
}

function parseRevisionRecord(value: unknown, key: string): RevisionRecord | null {
  if (!key.startsWith(REVISION_PREFIX)) return null;
  const idFromKey = key.slice(REVISION_PREFIX.length);
  if (!REVISION_ID_PATTERN.test(idFromKey)) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["actorEmail", "createdAt", "id", "reason", "snapshot", "sourceVersion"])) return null;
  if (
    value.id !== idFromKey ||
    !isIsoDate(value.createdAt) ||
    !requiredText(value.actorEmail, 320) ||
    !requiredText(value.sourceVersion, 200) ||
    (value.reason !== "save" && value.reason !== "restore")
  ) {
    return null;
  }

  try {
    return {
      actorEmail: value.actorEmail,
      createdAt: value.createdAt,
      id: idFromKey,
      reason: value.reason,
      snapshot: parseSiteContentDocument(value.snapshot),
      sourceVersion: value.sourceVersion
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

function createDocument(sections: SiteContentDocument["sections"], now: Date, uuid: string): SiteContentDocument {
  if (!UUID_PATTERN.test(uuid)) {
    throw invalidContent("Generated site content version ID is not valid.");
  }
  const uniqueTimestamp = `${now.toISOString()}-${uuid}`;
  return parseDocument(
    {
      schemaVersion: 1,
      version: `content-${uniqueTimestamp}`,
      updatedAt: uniqueTimestamp,
      sections
    },
    "Generated current site content"
  );
}

function createRevisionRecord(input: {
  actorEmail: string;
  createdAt: Date;
  idUuid: string;
  reason: "save" | "restore";
  snapshot: SiteContentDocument;
}): RevisionRecord {
  if (!UUID_PATTERN.test(input.idUuid)) {
    throw invalidContent("Generated site content revision ID is not valid.");
  }
  const createdAt = input.createdAt.toISOString();
  const record: RevisionRecord = {
    actorEmail: input.actorEmail,
    createdAt,
    id: `${createdAt}-${input.idUuid}`,
    reason: input.reason,
    snapshot: parseDocument(input.snapshot, "Site content revision snapshot"),
    sourceVersion: input.snapshot.version
  };
  assertRevisionId(record.id);
  return record;
}

export function createBlobSiteContentStore(options: CreateBlobSiteContentStoreOptions = {}): SiteContentStore {
  const createStore = options.createStore ?? ((storeOptions) => getStore(storeOptions));
  const defaultContent = parseDocument(options.defaultContent ?? builtinDefaultSiteContent, "Default site content");
  const now = options.now ?? (() => new Date());
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const store = createStore({ consistency: "strong", name: STORE_NAME });

  async function readCurrent(): Promise<CurrentSnapshot> {
    const result = await store.getWithMetadata(CURRENT_KEY, { type: "json" });
    if (result === null) {
      return { document: parseDocument(defaultContent, "Default site content"), etag: null, source: "default" };
    }
    if (typeof result.etag !== "string" || result.etag.length === 0) {
      throw contentConflict("Current site content Blob is missing an ETag.");
    }
    return {
      document: parseDocument(result.data, "Current site content Blob"),
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

  async function writeRevision(record: RevisionRecord): Promise<void> {
    const result = await store.setJSON(revisionKey(record.id), record, { onlyIfNew: true });
    if (!result.modified) {
      throw contentConflict("Site content revision already exists.");
    }
  }

  async function readRevision(revisionId: string): Promise<RevisionRecord> {
    const key = revisionKey(revisionId);
    const result = await store.getWithMetadata(key, { type: "json" });
    if (result === null) throw contentConflict("Site content revision does not exist.");
    const record = parseRevisionRecord(result.data, key);
    if (record === null) throw invalidContent("Site content revision Blob is not valid.");
    return record;
  }

  async function listRevisionRecords(): Promise<RevisionRecord[]> {
    const records: RevisionRecord[] = [];
    for await (const page of store.list({ paginate: true, prefix: REVISION_PREFIX })) {
      for (const blob of page.blobs) {
        const key = blob.key;
        if (typeof key !== "string" || !key.startsWith(REVISION_PREFIX)) continue;
        const result = await store.getWithMetadata(key, { type: "json" });
        if (result === null) continue;
        const record = parseRevisionRecord(result.data, key);
        if (record !== null) records.push(record);
      }
    }
    return records.sort((left, right) => left.id.localeCompare(right.id));
  }

  async function enforceRetention(): Promise<void> {
    const records = await listRevisionRecords();
    const expired = records.slice(0, Math.max(0, records.length - RETAINED_REVISIONS));
    for (const record of expired) {
      try {
        await store.delete(revisionKey(record.id));
      } catch {
        // Retention cleanup must not roll back a successful current write.
      }
    }
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
    const document = createDocument(input.sections, publishedAt, randomUUID());
    const revision = createRevisionRecord({
      actorEmail,
      createdAt: publishedAt,
      idUuid: randomUUID(),
      reason: input.reason,
      snapshot: current.document
    });

    await writeCurrent(document, current);
    await writeRevision(revision);
    await enforceRetention();
    return { document, revision: toRevisionSummary(revision) };
  }

  return {
    async getCurrent() {
      return (await readCurrent()).document;
    },

    async save(update, actor) {
      const parsedUpdate = parseUpdate(update);
      return publish({
        actor,
        expectedVersion: parsedUpdate.expectedVersion,
        reason: "save",
        sections: parsedUpdate.sections
      });
    },

    async listRevisions() {
      return (await listRevisionRecords()).map(toRevisionSummary);
    },

    async restore(revisionId, expectedVersion, actor) {
      assertRevisionId(revisionId);
      if (!requiredText(expectedVersion, 200)) {
        throw contentConflict("Expected site content version is not valid.");
      }
      const revision = await readRevision(revisionId);
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
