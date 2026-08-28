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

function createFakeBlobStore(options: { deleteFailures?: number } = {}) {
  const blobs = new Map<string, FakeBlob>();
  const writes: FakeWrite[] = [];
  const deletes: string[] = [];
  let etagVersion = 0;
  let remainingDeleteFailures = options.deleteFailures ?? 0;

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

function createHarness(options: { deleteFailures?: number } = {}) {
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
    randomUUID: createUuidSequence()
  });

  return { clock, fake, requestedStore: () => requestedStore, store };
}

function mutateHomeTitle(document: SiteContentDocument, title: string) {
  const sections = clone(document.sections);
  sections.home.titleLines = [title];
  return sections;
}

async function expectContentConflict(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof SiteContentStoreError);
    assert.equal(error.code, "content_conflict");
    return true;
  });
}

test("getCurrent returns the built-in fallback without writing Blob data", async () => {
  const { fake, requestedStore, store } = createHarness();

  const current = await store.getCurrent();

  assert.deepEqual(current, defaultSiteContent);
  assert.deepEqual(requestedStore(), { consistency: "strong", name: "yyq-site-content" });
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.deletes, []);
});

test("first save uses onlyIfNew, creates a revision for the replaced fallback, and stores only the actor email", async () => {
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
  assert.match(saved.document.updatedAt, /^2026-08-26T10:00:00\.000Z-[0-9a-f-]{36}$/);
  assert.equal(saved.revision.sourceVersion, defaultSiteContent.version);
  assert.equal(saved.revision.actorEmail, ACTOR.email);

  const currentWrite = fake.writes.find((write) => write.key === "current");
  assert.deepEqual(currentWrite?.options, { onlyIfNew: true });
  const revisionWrite = fake.writes.find((write) => write.key.startsWith("revisions/"));
  assert.ok(revisionWrite);
  assert.equal(JSON.stringify(revisionWrite.value).includes(ACTOR.id), false);
  assert.deepEqual((revisionWrite.value as { snapshot: SiteContentDocument }).snapshot, defaultSiteContent);
  assert.deepEqual(await store.listRevisions(), [saved.revision]);
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
    { onlyIfMatch: "etag-1" }
  ]);
  const revisionWrites = fake.writes.filter((write) => write.key.startsWith("revisions/"));
  assert.deepEqual((revisionWrites[1].value as { snapshot: SiteContentDocument }).snapshot, first.document);
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

test("restore validates revision ids and publishes the revision snapshot as a new version", async () => {
  const { store } = createHarness();
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
});

test("listRevisions returns only strictly valid canonical revision records in lexical order", async () => {
  const { fake, store } = createHarness();
  const validOld: RevisionSummary = {
    actorEmail: ACTOR.email,
    createdAt: "2026-08-26T09:00:00.000Z",
    id: "2026-08-26T09:00:00.000Z-00000000-0000-4000-8000-000000000101",
    reason: "save",
    sourceVersion: "old"
  };
  const validNew: RevisionSummary = {
    actorEmail: ACTOR.email,
    createdAt: "2026-08-26T10:00:00.000Z",
    id: "2026-08-26T10:00:00.000Z-00000000-0000-4000-8000-000000000102",
    reason: "restore",
    sourceVersion: "new"
  };
  fake.put(`revisions/${validNew.id}`, { ...validNew, snapshot: defaultSiteContent });
  fake.put("revisions/2026-08-26T10:30:00.000Z-00000000-0000-4000-8000-000000000103", { ...validNew, extra: true, snapshot: defaultSiteContent });
  fake.put(`revisions/${validOld.id}`, { ...validOld, snapshot: defaultSiteContent });
  fake.put("revisions/not-a-canonical-id", { ...validOld, id: "not-a-canonical-id", snapshot: defaultSiteContent });
  fake.put("revision-backups/2026-08-26T11:00:00.000Z-00000000-0000-4000-8000-000000000104", { ...validOld, snapshot: defaultSiteContent });

  assert.deepEqual(await store.listRevisions(), [validOld, validNew]);
});

test("retention keeps exactly the newest 20 revision keys and ignores delete failures after current is saved", async () => {
  const { clock, fake, store } = createHarness({ deleteFailures: 1 });
  let expectedVersion = defaultSiteContent.version;

  for (let index = 0; index < 22; index += 1) {
    const saved = await store.save(
      { expectedVersion, sections: mutateHomeTitle(defaultSiteContent, `title ${index}`) },
      ACTOR
    );
    expectedVersion = saved.document.version;
    clock.advance(1);
  }

  assert.equal((await store.getCurrent()).sections.home.titleLines[0], "title 21");
  assert.ok(fake.deletes.every((key) => key.startsWith("revisions/")));
  assert.equal(fake.deletes.length, 3);
  assert.equal((await store.listRevisions()).length, 20);

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
