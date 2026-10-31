import assert from "node:assert/strict";
import test from "node:test";

// A small IndexedDB protocol fixture tests transaction completion/abort and reloads.
// It never reads the user's browser storage.
function storageFixture(t) {
  const databases = new Map();
  const preferences = new Map();
  let abortNextWrite = false;
  const previous = Object.fromEntries(["indexedDB", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value), removeItem: (key) => preferences.delete(key) } });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const stores = databases.get(name);
        request.result = {
          createObjectStore(store) { stores.set(store, new Map()); },
          close() {},
          transaction(_names, mode) {
            const pending = [];
            let reads = 0;
            let finished = false;
            const complete = () => queueMicrotask(() => {
              if (finished || reads) return;
              finished = true;
              if (mode === "readwrite" && abortNextWrite) { abortNextWrite = false; transaction.onabort?.(); return; }
              pending.forEach((write) => write()); transaction.oncomplete?.();
            });
            const readRequest = (value) => {
              const request = {};
              reads++;
              queueMicrotask(() => {
                if (finished) return;
                request.result = structuredClone(value());
                try { request.onsuccess?.(); }
                finally { reads--; complete(); }
              });
              return request;
            };
            const transaction = {
              abort() { if (!finished) { finished = true; queueMicrotask(() => transaction.onabort?.()); } },
              objectStore(store) {
                return {
                  put(record) { pending.push(() => stores.get(store).set(record.id, structuredClone(record))); },
                  get(key) { return readRequest(() => stores.get(store).get(key)); },
                  getAll() { return readRequest(() => [...stores.get(store).values()]); },
                };
              },
            };
            complete();
            return transaction;
          },
        };
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  } });
  t.after(() => {
    for (const key of ["indexedDB", "localStorage"]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  return { abortNext() { abortNextWrite = true; } };
}

const project = {
  id: "project-1", projectTitle: "徒步草稿", keyword: "周末徒步", persona: "体验分享", writingBrief: "保留真实信息", mustInclude: "花费36元",
  sourceMaterials: [{ id: "source-1", title: "真实记录", content: "原文".repeat(600) + "最后：交通花费36元" }],
  materialInputContent: "尚未加入的新素材", ragItems: [{ id: "reference-1", body: "补充的热门正文" }],
  topics: [{ id: "topic-1", title: "费用清单" }], selectedTopicId: "topic-1",
  drafts: [{ id: "draft-1", title: "标题", body: "已编辑的正文" }], selectedDraftId: "draft-1", prompts: [], coverImage: null,
};

test("complete draft records and active project survive a fresh store module while metadata excludes source bodies", async (t) => {
  storageFixture(t);
  const first = await import(`./workspaceStore.js?first=${Date.now()}`);
  await first.saveProject({ ...project, modelConfig: { apiKey: "do-not-store" } });
  const freshPage = await import(`./workspaceStore.js?reload=${Date.now()}`);
  assert.equal(freshPage.rememberedProjectId(), project.id);
  const restored = await freshPage.loadProject(project.id);
  assert.equal(restored.sourceMaterials[0].content, project.sourceMaterials[0].content);
  assert.equal(restored.materialInputContent, project.materialInputContent);
  assert.equal(restored.ragItems[0].body, "补充的热门正文");
  assert.equal(restored.selectedDraftId, "draft-1");
  assert.equal(restored.drafts[0].body, "已编辑的正文");
  assert.equal(restored.modelConfig, undefined);
  const index = await freshPage.listProjects();
  assert.equal(index[0].materialCount, 1); assert.equal(index[0].draftCount, 1);
  assert.ok(!JSON.stringify(index).includes("交通花费"));
});

test("aborted storage transactions report failure and preserve the previous draft", async (t) => {
  const fixture = storageFixture(t);
  const store = await import(`./workspaceStore.js?abort=${Date.now()}`);
  await store.saveProject(project);
  fixture.abortNext();
  await assert.rejects(store.saveProject({ ...project, drafts: [{ id: "draft-1", body: "不应覆盖" }] }), /保存失败/);
  assert.equal((await store.loadProject(project.id)).drafts[0].body, "已编辑的正文");
});

test("generated cover bytes are stored with the draft instead of relying only on a temporary URL", async (t) => {
  storageFixture(t);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  t.mock.method(globalThis, "fetch", async () => new Response(png, { headers: { "content-type": "image/png" } }));
  const store = await import(`./workspaceStore.js?cover=${Date.now()}`);
  await store.saveProject({ ...project, coverImage: { src: "/generated/covers/cover-123-abc.png" } });
  const restored = await store.loadProject(project.id);
  assert.ok(restored.coverImage.storageBlob instanceof Blob);
  assert.deepEqual(new Uint8Array(await restored.coverImage.storageBlob.arrayBuffer()), png);
});

test("cover download failure still saves text and returns an explicit partial-save warning", async (t) => {
  storageFixture(t);
  t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  const store = await import(`./workspaceStore.js?partial=${Date.now()}`);
  const result = await store.saveProject({ ...project, coverImage: { src: "/generated/covers/cover-404-abc.png" } });
  assert.match(result.warning, /封面图片未能备份/);
  assert.equal((await store.loadProject(project.id)).drafts[0].body, "已编辑的正文");
});

test("deleted drafts stay hidden after a reload and recover their complete source and cover data", async (t) => {
  storageFixture(t);
  const store = await import(`./workspaceStore.js?delete=${Date.now()}`);
  const blob = new Blob(["cover backup"], { type: "image/png" });
  await store.saveProject({ ...project, coverImage: { src: "blob:fixture", storageBlob: blob } });
  await store.deleteProject(project.id);
  assert.equal((await store.listProjects()).length, 0);
  assert.equal(await store.loadProject(project.id), undefined);
  assert.equal(store.rememberedProjectId(), null);
  const reload = await import(`./workspaceStore.js?deleted-reload=${Date.now()}`);
  assert.equal((await reload.listProjects()).length, 0);
  assert.equal((await reload.listDeletedProjects())[0].id, project.id);
  await reload.restoreDeletedProject(project.id);
  const restored = await reload.loadProject(project.id);
  assert.equal(restored.sourceMaterials[0].content, project.sourceMaterials[0].content);
  assert.equal(restored.drafts[0].body, project.drafts[0].body);
  assert.equal(await restored.coverImage.storageBlob.text(), "cover backup");
  assert.equal((await reload.listDeletedProjects()).length, 0);
});

test("late autosaves cannot resurrect a deleted project or overwrite its recoverable contents", async (t) => {
  storageFixture(t);
  const store = await import(`./workspaceStore.js?tombstone=${Date.now()}`);
  await store.saveProject(project);
  await store.deleteProject(project.id);
  await assert.rejects(store.saveProject({ ...project, drafts: [{ id: "draft-1", body: "stale autosave" }] }), /已删除/);
  assert.equal((await store.listProjects()).length, 0);
  assert.equal((await store.listDeletedProjects()).length, 1);
  await store.restoreDeletedProject(project.id);
  assert.equal((await store.loadProject(project.id)).drafts[0].body, project.drafts[0].body);
});

test("deleting another draft leaves the current draft and active project selection intact", async (t) => {
  storageFixture(t);
  const store = await import(`./workspaceStore.js?inactive=${Date.now()}`);
  await store.saveProject(project);
  await store.saveProject({ ...project, id: "current-project" });
  await store.deleteProject(project.id);
  assert.equal(store.rememberedProjectId(), "current-project");
  assert.equal((await store.listProjects())[0].id, "current-project");
  assert.equal((await store.loadProject("current-project")).drafts[0].body, project.drafts[0].body);
});

test("failed delete and restore transactions preserve the prior active or deleted state", async (t) => {
  const fixture = storageFixture(t);
  const store = await import(`./workspaceStore.js?delete-abort=${Date.now()}`);
  await store.saveProject(project);
  fixture.abortNext();
  await assert.rejects(store.deleteProject(project.id), /删除草稿失败/);
  assert.equal((await store.listProjects()).length, 1);
  assert.equal((await store.listDeletedProjects()).length, 0);
  await store.deleteProject(project.id);
  fixture.abortNext();
  await assert.rejects(store.restoreDeletedProject(project.id), /恢复草稿失败/);
  assert.equal((await store.listProjects()).length, 0);
  assert.equal((await store.listDeletedProjects()).length, 1);
});

test("deleted reference text is saved with its project for restoration after reload", async (t) => {
  storageFixture(t);
  const store = await import(`./workspaceStore.js?deleted-reference=${Date.now()}`);
  const deletedReferences = [{ id: "reference-1", title: "参考原文", body: "保留完整正文与来源", source: "manual", deletedAt: new Date().toISOString(), originalPosition: 0 }];
  await store.saveProject({ ...project, ragItems: [], selectedSearchIds: [], deletedReferences });
  const reload = await import(`./workspaceStore.js?reference-reload=${Date.now()}`);
  const restored = await reload.loadProject(project.id);
  assert.deepEqual(restored.ragItems, []);
  assert.deepEqual(restored.selectedSearchIds, []);
  assert.deepEqual(restored.deletedReferences, deletedReferences);
});
