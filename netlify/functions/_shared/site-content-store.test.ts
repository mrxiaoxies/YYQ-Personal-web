import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultSiteContent } from "../../../shared/default-site-content.ts";
import type { SiteContentDocument } from "../../../shared/site-content-schema.ts";
import type { PublicAdminUser } from "./admin-auth-service.ts";
import {
  createBlobSiteContentStore,
  SiteContentStoreError,
  type RevisionSummary
} from "./site-content-store.ts";

type FakeBlob = {
  data: unknown;
  etag: string;
};

type FakeSetOptions = {
  onlyIfMatch?: string;
  onlyIfNew?: boolean;
};

type FakeWrite = {
  key: string;
  options?: FakeSetOptions;
  value: unknown;
};

type InternalRevisionRecord = RevisionSummary & {
  snapshot: SiteContentDocument;
  targetVersion: string;
};

const ACTOR: PublicAdminUser = {
  email: "admin@example.com",
  id: "private-admin-id",
  role: "admin"
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createClock(initial = "2026-08-26T10:00:00.000Z") {
  let currentMs = new Date(initial).getTime();
  return {
    advance(milliseconds: number) {
      currentMs += milliseconds;
    },
    now: () => new Date(currentMs)
  };
}

function createUuidSequence() {
  let index = 0;
  return () => {
    index += 1;
    return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  };
}

function createFakeBlobStore(options: {
  currentWriteConflicts?: number;
  deleteFailures?: number;
  revisionWriteFailures?: number;
  randomUUID?: () => string;
} = {}) {
  const blobs = new Map<string, FakeBlob>();
  const writes: FakeWrite[] = [];
  const deletes: string[] = [];
  let etagVersion = 0;
  let remainingCurrentWriteConflicts = options.currentWriteConflicts ?? 0;
  let remainingDeleteFailures = options.deleteFailures ?? 0;
  let remainingRevisionWriteFailures = options.revisionWriteFailures ?? 0;

  const store = {
    async delete(key: string) {
      deletes.push(key);
      if (remainingDeleteFailures > 0) {
        remainingDeleteFailures -= 1;
        throw new Error("simulated revision delete failure");
      }
      blobs.delete(key);
    },
    async getWithMetadata(key: string) {
      const blob = blobs.get(key);
      return blob === undefined ? null : { data: clone(blob.data), etag: blob.etag, metadata: {} };
    },
    list(listOptions: { paginate?: boolean; prefix?: string }) {
      return {
        async *[Symbol.asyncIterator]() {
          const keys = [...blobs.keys()].filter((key) => key.startsWith(listOptions.prefix ?? ""));
          yield {
            blobs: keys.map((key) => ({ etag: blobs.get(key)?.etag, key })),
            directories: []
          };
        }
      };
    },
    async setJSON(key: string, value: unknown, setOptions?: FakeSetOptions) {
      writes.push({ key, options: setOptions, value: clone(value) });
      if (key.startsWith("revisions/") && remainingRevisionWriteFailures > 0) {
        remainingRevisionWriteFailures -= 1;
        throw new Error("simulated revision write failure");
      }
      if (key === "current" && remainingCurrentWriteConflicts > 0) {
        remainingCurrentWriteConflicts -= 1;
        return { modified: false };
      }
      const current = blobs.get(key);
      if (setOptions?.onlyIfNew === true && current !== undefined) return { modified: false };
      if (typeof setOptions?.onlyIfMatch === "string" && current?.etag !== setOptions.onlyIfMatch) {
        return { modified: false };
      }

      etagVersion += 1;
      const etag = `etag-${etagVersion}`;
      blobs.set(key, { data: clone(value), etag });
      return { etag, modified: true };
    }
  };

  return {
    blobs,
    deletes,
    store,
    writes,
    put(key: string, data: unknown, etag = "seed-etag") {
      blobs.set(key, { data: clone(data), etag });
    },
    setMissingEtag(key: string) {
      const blob = blobs.get(key);
      if (blob) {
        (blob as { etag?: string }).etag = undefined;
      }
    }
  };
}

function createHarness(options: {
  currentWriteConflicts?: number;
  deleteFailures?: number;
  revisionWriteFailures?: number;
  randomUUID?: () => string;
} = {}) {
  const clock = createClock();
  const fake = createFakeBlobStore(options);
  let requestedStore: unknown;
  const store = createBlobSiteContentStore({
    createStore: (storeOptions) => {
      requestedStore = storeOptions;
      return fake.store as never;
    },
    defaultContent: defaultSiteContent,
    now: clock.now,
    randomUUID: options.randomUUID ?? createUuidSequence()
  });

  return { clock, fake, requestedStore: () => requestedStore, store };
}

function mutateHomeTitle(document: SiteContentDocument, title: string) {
  const sections = clone(document.sections);
  sections.home.titleLines = [title];
  return sections;
}

function withDocumentVersion(document: SiteContentDocument, version: string, updatedAt = "2026-08-26T09:00:00.000Z"): SiteContentDocument {
  return {
    ...clone(document),
    updatedAt,
    version
  };
}

function targetVersionFor(id: string): string {
  return `content-${id}`;
}

function committedRevision(input: {
  actorEmail?: string;
  createdAt: string;
  id: string;
  reason?: "save" | "restore";
  snapshot: SiteContentDocument;
  targetVersion: string;
}): InternalRevisionRecord {
  return {
    actorEmail: input.actorEmail ?? ACTOR.email,
    createdAt: input.createdAt,
    id: input.id,
    reason: input.reason ?? "save",
    snapshot: clone(input.snapshot),
    sourceVersion: input.snapshot.version,
    targetVersion: input.targetVersion
  };
}

function publicSummary(record: InternalRevisionRecord): RevisionSummary {
  return {
    actorEmail: record.actorEmail,
    createdAt: record.createdAt,
    id: record.id,
    reason: record.reason,
    sourceVersion: record.sourceVersion
  };
}

function revisionWrites(fake: ReturnType<typeof createFakeBlobStore>): Array<FakeWrite & { value: InternalRevisionRecord }> {
  return fake.writes.filter((write): write is FakeWrite & { value: InternalRevisionRecord } => write.key.startsWith("revisions/"));
}

async function expectContentConflict(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof SiteContentStoreError);
    assert.equal(error.code, "content_conflict");
    return true;
  });
}

async function expectInvalidContent(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof SiteContentStoreError);
    assert.equal(error.code, "invalid_content");
    return true;
  });
}

const INVALID_REVISION_IDS = [
  "2026-99-99T99:99:99.999Z-00000000-0000-4000-8000-000000000301",
  "2026-13-01T00:00:00.000Z-00000000-0000-4000-8000-000000000302",
  "2026-04-31T00:00:00.000Z-00000000-0000-4000-8000-000000000303",
  "2026-01-01T24:00:00.000Z-00000000-0000-4000-8000-000000000304",
  "2026-02-29T00:00:00.000Z-00000000-0000-4000-8000-000000000305"
] as const;

const INVALID_HISTORICAL_CONTENT_VERSIONS = [
  {
    label: "invalid timestamp",
    version: "content-2026-99-99T99:99:99.999Z-00000000-0000-4000-8000-000000000601"
  },
  {
    label: "invalid UUID",
    version: "content-2026-08-26T09:00:00.000Z-00000000-0000-0000-0000-000000000602"
  }
] as const;

function seedHistoricalSourceChain(fake: ReturnType<typeof createFakeBlobStore>, sourceVersion: string) {
  const historyId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000603";
  const headId = "2026-08-26T11:00:00.000Z-00000000-0000-4000-8000-000000000604";
  const historicalSource = withDocumentVersion(defaultSiteContent, sourceVersion, "2026-08-26T09:00:00.000Z");
  const historicalTarget = withDocumentVersion(defaultSiteContent, targetVersionFor(historyId), "2026-08-26T10:00:00.000Z");
  const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(headId), "2026-08-26T11:00:00.000Z");
  const history = committedRevision({
    createdAt: "2026-08-26T10:00:00.000Z",
    id: historyId,
    snapshot: historicalSource,
    targetVersion: historicalTarget.version
  });
  const head = committedRevision({
    createdAt: "2026-08-26T11:00:00.000Z",
    id: headId,
    snapshot: historicalTarget,
    targetVersion: currentDocument.version
  });
  fake.put("current", currentDocument, "current-etag");
  fake.put(`revisions/${history.id}`, history);
  fake.put(`revisions/${head.id}`, head);
  return { currentDocument, head, history };
}

test("getCurrent returns the built-in fallback without writing Blob data", async () => {
  const { fake, requestedStore, store } = createHarness();

  const current = await store.getCurrent();

  assert.deepEqual(current, defaultSiteContent);
  assert.deepEqual(requestedStore(), { consistency: "strong", name: "yyq-site-content" });
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.deletes, []);
});

test("first save writes the revision ahead of current and stores only the actor email", async () => {
  const { fake, store } = createHarness();
  const saved = await store.save(
    {
      expectedVersion: defaultSiteContent.version,
      sections: mutateHomeTitle(defaultSiteContent, "first published title")
    },
    ACTOR
  );

  assert.equal(saved.document.sections.home.titleLines[0], "first published title");
  assert.notEqual(saved.document.version, defaultSiteContent.version);
  assert.match(saved.document.version, /^content-2026-08-26T10:00:00\.000Z-[0-9a-f-]{36}$/);
  assert.equal(saved.document.updatedAt, "2026-08-26T10:00:00.000Z");
  assert.equal(saved.revision.sourceVersion, defaultSiteContent.version);
  assert.equal(saved.document.version, targetVersionFor(saved.revision.id));
  assert.equal(saved.revision.actorEmail, ACTOR.email);

  assert.deepEqual(fake.writes.map((write) => write.key.startsWith("revisions/") ? "revision" : write.key), ["revision", "current"]);
  const [revisionWrite] = revisionWrites(fake);
  assert.deepEqual(revisionWrite.options, { onlyIfNew: true });
  assert.equal(revisionWrite.value.id, saved.revision.id);
  assert.equal(revisionWrite.value.targetVersion, saved.document.version);
  assert.equal(saved.document.version, targetVersionFor(revisionWrite.value.id));
  assert.equal(JSON.stringify(revisionWrite.value).includes(ACTOR.id), false);
  assert.deepEqual(revisionWrite.value.snapshot, defaultSiteContent);
  const currentWrite = fake.writes.find((write) => write.key === "current");
  assert.deepEqual(currentWrite?.options, { onlyIfNew: true });
  assert.deepEqual(await store.listRevisions(), [saved.revision]);
});

test("same-millisecond saves keep updatedAt semantic and use UUIDs to avoid version collisions", async () => {
  const { store } = createHarness();
  const first = await store.save(
    { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "first") },
    ACTOR
  );
  const second = await store.save(
    { expectedVersion: first.document.version, sections: mutateHomeTitle(first.document, "second") },
    ACTOR
  );

  assert.equal(first.document.updatedAt, "2026-08-26T10:00:00.000Z");
  assert.equal(second.document.updatedAt, "2026-08-26T10:00:00.000Z");
  assert.notEqual(first.document.version, second.document.version);
});

test("existing save uses onlyIfMatch and creates a revision for the replaced current snapshot", async () => {
  const { fake, store } = createHarness();
  const first = await store.save(
    { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "first") },
    ACTOR
  );
  const second = await store.save(
    { expectedVersion: first.document.version, sections: mutateHomeTitle(first.document, "second") },
    ACTOR
  );

  assert.equal(second.document.sections.home.titleLines[0], "second");
  const currentWrites = fake.writes.filter((write) => write.key === "current");
  assert.deepEqual(currentWrites.map((write) => write.options), [
    { onlyIfNew: true },
    { onlyIfMatch: "etag-2" }
  ]);
  const revisions = revisionWrites(fake);
  assert.deepEqual(revisions[1].value.snapshot, first.document);
  assert.equal(revisions[1].value.targetVersion, second.document.version);
});

test("revision write failure leaves current unchanged", async () => {
  const { fake, store } = createHarness({ revisionWriteFailures: 1 });

  await assert.rejects(
    () => store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "lost revision") },
      ACTOR
    ),
    /simulated revision write failure/
  );

  assert.equal((await store.getCurrent()).version, defaultSiteContent.version);
  assert.equal(fake.writes.some((write) => write.key === "current"), false);
});

test("stale writes return content_conflict and do not write a new revision", async () => {
  const { fake, store } = createHarness();
  await store.save(
    { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "first") },
    ACTOR
  );
  const writesBeforeConflict = fake.writes.length;

  await expectContentConflict(() =>
    store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "stale") },
      ACTOR
    )
  );

  assert.equal(fake.writes.length, writesBeforeConflict);
  assert.equal((await store.getCurrent()).sections.home.titleLines[0], "first");
});

test("current CAS failure deletes the write-ahead ghost and hides it from public revision APIs", async () => {
  const { fake, store } = createHarness({ currentWriteConflicts: 1 });

  await expectContentConflict(() =>
    store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "ghost") },
      ACTOR
    )
  );

  const [ghostWrite] = revisionWrites(fake);
  assert.ok(ghostWrite);
  assert.deepEqual(fake.deletes, [ghostWrite.key]);
  assert.equal(fake.blobs.has(ghostWrite.key), false);
  assert.deepEqual(await store.listRevisions(), []);
  await expectContentConflict(() => store.restore(ghostWrite.value.id, defaultSiteContent.version, ACTOR));
});

test("ghost delete failure still keeps ghost revisions out of list and restore", async () => {
  const { fake, store } = createHarness({ currentWriteConflicts: 1, deleteFailures: 10 });

  await expectContentConflict(() =>
    store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "undeleted ghost") },
      ACTOR
    )
  );

  const [ghostWrite] = revisionWrites(fake);
  assert.ok(fake.blobs.has(ghostWrite.key));
  assert.equal(fake.deletes.filter((key) => key === ghostWrite.key).length, 3);
  assert.deepEqual(await store.listRevisions(), []);
  await expectContentConflict(() => store.restore(ghostWrite.value.id, defaultSiteContent.version, ACTOR));
});

test("concurrent writers with the same expected version leave one success and stale conflicts", async () => {
  const { store } = createHarness();

  const results = await Promise.allSettled(
    ["one", "two", "three"].map((title) =>
      store.save(
        { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, title) },
        ACTOR
      )
    )
  );

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.equal(rejected.length, 2);
  for (const result of rejected) {
    assert.ok(result.reason instanceof SiteContentStoreError);
    assert.equal(result.reason.code, "content_conflict");
  }
  assert.equal((await store.listRevisions()).length, 1);
});

test("restore validates revision ids and publishes the revision snapshot as a new version in the committed chain", async () => {
  const { fake, store } = createHarness();
  const first = await store.save(
    { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "first") },
    ACTOR
  );
  const second = await store.save(
    { expectedVersion: first.document.version, sections: mutateHomeTitle(first.document, "second") },
    ACTOR
  );

  await expectContentConflict(() => store.restore("../escape", second.document.version, ACTOR));
  const restored = await store.restore(first.revision.id, second.document.version, ACTOR);

  assert.deepEqual(restored.sections, defaultSiteContent.sections);
  assert.notEqual(restored.version, first.revision.sourceVersion);
  assert.notEqual(restored.version, second.document.version);
  const revisions = await store.listRevisions();
  assert.equal(revisions.length, 3);
  assert.equal(revisions.at(-1)?.reason, "restore");
  assert.equal(revisions.at(-1)?.sourceVersion, second.document.version);
  const internalRevisions = revisionWrites(fake).map((write) => write.value);
  assert.deepEqual(internalRevisions.map((record) => [record.sourceVersion, record.targetVersion]), [
    [defaultSiteContent.version, first.document.version],
    [first.document.version, second.document.version],
    [second.document.version, restored.version]
  ]);
  assert.equal("targetVersion" in revisions.at(-1)!, false);
});

test("listRevisions returns only strict canonical records that are reachable from current", async () => {
  const { fake, store } = createHarness();
  const validOldId = "2026-08-26T09:00:00.000Z-00000000-0000-4000-8000-000000000101";
  const validNewId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000102";
  const oldDocument = withDocumentVersion(defaultSiteContent, "old-version", "2026-08-26T08:00:00.000Z");
  const middleDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(validOldId), "2026-08-26T09:00:00.000Z");
  const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(validNewId), "2026-08-26T10:00:00.000Z");
  const validOld = committedRevision({
    createdAt: "2026-08-26T09:00:00.000Z",
    id: validOldId,
    snapshot: oldDocument,
    targetVersion: middleDocument.version
  });
  const validNew = committedRevision({
    createdAt: "2026-08-26T10:00:00.000Z",
    id: validNewId,
    reason: "restore",
    snapshot: middleDocument,
    targetVersion: currentDocument.version
  });
  const ghost = committedRevision({
    createdAt: "2026-08-26T10:30:00.000Z",
    id: "2026-08-26T10:30:00.000Z-00000000-0000-4000-8000-000000000103",
    snapshot: currentDocument,
    targetVersion: targetVersionFor("2026-08-26T10:30:00.000Z-00000000-0000-4000-8000-000000000103")
  });
  fake.put("current", currentDocument, "current-etag");
  fake.put(`revisions/${validNew.id}`, validNew);
  fake.put("revisions/2026-08-26T10:45:00.000Z-00000000-0000-4000-8000-000000000104", { ...validNew, extra: true });
  fake.put(`revisions/${validOld.id}`, validOld);
  fake.put(`revisions/${ghost.id}`, ghost);
  fake.put("revisions/not-a-canonical-id", { ...validOld, id: "not-a-canonical-id" });
  fake.put("revision-backups/2026-08-26T11:00:00.000Z-00000000-0000-4000-8000-000000000105", validOld);

  assert.deepEqual(await store.listRevisions(), [publicSummary(validOld), publicSummary(validNew)]);
  await expectContentConflict(() => store.restore(ghost.id, currentDocument.version, ACTOR));
});

test("listRevisions excludes chain edges with impossible or normalized revision timestamps", async () => {
  const headId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000401";

  for (const invalidId of INVALID_REVISION_IDS) {
    const { fake, store } = createHarness();
    const invalidSource = withDocumentVersion(defaultSiteContent, targetVersionFor(invalidId), "2026-08-26T09:00:00.000Z");
    const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(headId), "2026-08-26T10:00:00.000Z");
    const head = committedRevision({
      createdAt: "2026-08-26T10:00:00.000Z",
      id: headId,
      snapshot: invalidSource,
      targetVersion: currentDocument.version
    });
    const invalid = committedRevision({
      createdAt: "2026-08-26T09:00:00.000Z",
      id: invalidId,
      snapshot: defaultSiteContent,
      targetVersion: invalidSource.version
    });
    fake.put("current", currentDocument, "current-etag");
    fake.put(`revisions/${head.id}`, head);
    fake.put(`revisions/${invalid.id}`, invalid);

    assert.deepEqual(await store.listRevisions(), [], invalidId);
  }
});

test("current content versions with impossible or normalized ISO timestamps fail closed", async () => {
  for (const invalidId of INVALID_REVISION_IDS) {
    const { fake, store } = createHarness();
    fake.put("current", withDocumentVersion(defaultSiteContent, targetVersionFor(invalidId)), "current-etag");

    await expectInvalidContent(() => store.getCurrent());
    await expectInvalidContent(() => store.listRevisions());
  }
});

test("revision createdAt must equal the canonical ISO timestamp encoded in its id", async () => {
  const { fake, store } = createHarness();
  const id = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000402";
  const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(id), "2026-08-26T10:00:00.000Z");
  const mismatched = committedRevision({
    createdAt: "2026-08-26T10:00:01.000Z",
    id,
    snapshot: defaultSiteContent,
    targetVersion: currentDocument.version
  });
  fake.put("current", currentDocument, "current-etag");
  fake.put(`revisions/${id}`, mismatched);

  assert.deepEqual(await store.listRevisions(), []);
});

test("canonical leap-day revision ids and content versions remain valid", async () => {
  const { fake, store } = createHarness();
  const id = "2024-02-29T23:59:59.999Z-00000000-0000-4000-8000-000000000403";
  const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(id), "2024-02-29T23:59:59.999Z");
  const leapDay = committedRevision({
    createdAt: "2024-02-29T23:59:59.999Z",
    id,
    snapshot: defaultSiteContent,
    targetVersion: currentDocument.version
  });
  fake.put("current", currentDocument, "current-etag");
  fake.put(`revisions/${id}`, leapDay);

  assert.deepEqual(await store.listRevisions(), [publicSummary(leapDay)]);
});

for (const scenario of INVALID_HISTORICAL_CONTENT_VERSIONS) {
  test(`historical source content version is excluded from list and cannot delete the legal head (${scenario.label})`, async () => {
    const { fake, store } = createHarness();
    const { head } = seedHistoricalSourceChain(fake, scenario.version);

    assert.deepEqual(await store.listRevisions(), [publicSummary(head)]);
    assert.equal(fake.blobs.has(`revisions/${head.id}`), true);
    assert.equal(fake.deletes.includes(`revisions/${head.id}`), false);
  });

  test(`restore rejects a revision with a non-canonical historical source content version (${scenario.label})`, async () => {
    const { fake, store } = createHarness();
    const { currentDocument, history } = seedHistoricalSourceChain(fake, scenario.version);

    await expectContentConflict(() => store.restore(history.id, currentDocument.version, ACTOR));
    assert.equal((await store.getCurrent()).version, currentDocument.version);
  });
}

test("save rejects a fallback snapshot with a non-canonical source content version before Blob writes", async () => {
  const fake = createFakeBlobStore();
  const clock = createClock();
  const invalidDefault = withDocumentVersion(defaultSiteContent, INVALID_HISTORICAL_CONTENT_VERSIONS[0].version);
  const store = createBlobSiteContentStore({
    createStore: () => fake.store as never,
    defaultContent: invalidDefault,
    now: clock.now,
    randomUUID: createUuidSequence()
  });

  await expectInvalidContent(() =>
    store.save(
      { expectedVersion: invalidDefault.version, sections: mutateHomeTitle(invalidDefault, "must not write") },
      ACTOR
    )
  );
  assert.deepEqual(fake.writes, []);
});

test("builtin and opaque non-content source versions remain compatible chain tails", async () => {
  for (const sourceVersion of [defaultSiteContent.version, "legacy-import-v1"] as const) {
    const { fake, store } = createHarness();
    const { head, history } = seedHistoricalSourceChain(fake, sourceVersion);

    assert.deepEqual(await store.listRevisions(), [publicSummary(history), publicSummary(head)]);
  }
});

test("duplicate targetVersion ghost cannot replace or delete the canonical committed edge", async () => {
  const { fake, store } = createHarness();
  const legalId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000201";
  const ghostId = "2026-08-26T10:30:00.000Z-00000000-0000-4000-8000-000000000202";
  const sourceDocument = withDocumentVersion(defaultSiteContent, "source-version", "2026-08-26T09:00:00.000Z");
  const currentDocument = withDocumentVersion(defaultSiteContent, targetVersionFor(legalId), "2026-08-26T10:00:00.000Z");
  const legal = committedRevision({
    createdAt: "2026-08-26T10:00:00.000Z",
    id: legalId,
    snapshot: sourceDocument,
    targetVersion: currentDocument.version
  });
  const ghost = committedRevision({
    createdAt: "2026-08-26T10:30:00.000Z",
    id: ghostId,
    snapshot: sourceDocument,
    targetVersion: currentDocument.version
  });
  fake.put("current", currentDocument, "current-etag");
  fake.put(`revisions/${ghost.id}`, ghost);
  fake.put(`revisions/${legal.id}`, legal);

  assert.deepEqual(await store.listRevisions(), [publicSummary(legal)]);
  await expectContentConflict(() => store.restore(ghost.id, currentDocument.version, ACTOR));
  assert.equal(fake.deletes.includes(`revisions/${legal.id}`), false);
});

test("revision key collision retries with a new revision id before publishing current", async () => {
  const { fake, store } = createHarness();
  const collidingId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000001";
  const retriedId = "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000002";
  const existing = committedRevision({
    createdAt: "2026-08-26T10:00:00.000Z",
    id: collidingId,
    snapshot: defaultSiteContent,
    targetVersion: targetVersionFor(collidingId)
  });
  fake.put(`revisions/${collidingId}`, existing, "existing-revision-etag");

  const saved = await store.save(
    { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "retried") },
    ACTOR
  );

  assert.equal(saved.revision.id, retriedId);
  assert.equal(saved.document.version, targetVersionFor(retriedId));
  assert.deepEqual(fake.writes.map((write) => write.key.startsWith("revisions/") ? write.key : "current"), [
    `revisions/${collidingId}`,
    `revisions/${retriedId}`,
    "current"
  ]);
  assert.equal((fake.writes.find((write) => write.key === "current")?.value as SiteContentDocument).version, targetVersionFor(retriedId));
});

test("revision key collision exhaustion never publishes current", async () => {
  const collidingUuid = "00000000-0000-4000-8000-000000000001";
  const collidingId = `2026-08-26T10:00:00.000Z-${collidingUuid}`;
  const { fake, store } = createHarness({ randomUUID: () => collidingUuid });
  const existing = committedRevision({
    createdAt: "2026-08-26T10:00:00.000Z",
    id: collidingId,
    snapshot: defaultSiteContent,
    targetVersion: targetVersionFor(collidingId)
  });
  fake.put(`revisions/${collidingId}`, existing, "existing-revision-etag");

  await expectContentConflict(() =>
    store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "cannot publish") },
      ACTOR
    )
  );

  assert.equal((await store.getCurrent()).version, defaultSiteContent.version);
  assert.equal(fake.writes.some((write) => write.key === "current"), false);
  assert.deepEqual(fake.blobs.get(`revisions/${collidingId}`)?.data, existing);
});
test("public retention returns newest 20 committed revisions while physical cleanup is best effort", async () => {
  const { clock, fake, store } = createHarness({ deleteFailures: 100 });
  let expectedVersion = defaultSiteContent.version;

  for (let index = 0; index < 22; index += 1) {
    const saved = await store.save(
      { expectedVersion, sections: mutateHomeTitle(defaultSiteContent, `title ${index}`) },
      ACTOR
    );
    expectedVersion = saved.document.version;
    clock.advance(1);
  }

  const publicRevisions = await store.listRevisions();
  assert.equal((await store.getCurrent()).sections.home.titleLines[0], "title 21");
  assert.ok(fake.deletes.every((key) => key.startsWith("revisions/")));
  assert.equal(publicRevisions.length, 20);
  assert.ok([...fake.blobs.keys()].filter((key) => key.startsWith("revisions/")).length > 20);
});

test("schema parse failures and current blobs without etags fail closed", async () => {
  const { fake, store } = createHarness();
  fake.put("current", { active: true }, "bad-current-etag");
  await assert.rejects(() => store.getCurrent(), (error: unknown) => {
    assert.ok(error instanceof SiteContentStoreError);
    assert.equal(error.code, "invalid_content");
    return true;
  });

  fake.put("current", defaultSiteContent, "good-current-etag");
  fake.setMissingEtag("current");
  await expectContentConflict(() =>
    store.save(
      { expectedVersion: defaultSiteContent.version, sections: mutateHomeTitle(defaultSiteContent, "cannot save") },
      ACTOR
    )
  );
});
