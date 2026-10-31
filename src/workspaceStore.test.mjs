import assert from "node:assert/strict";
import test from "node:test";

// A small IndexedDB protocol fixture tests transaction completion/abort and reloads.
// It never reads the user's browser storage.
function storageFixture(t) {
  const databases = new Map();
  const preferences = new Map();
  let abortNextWrite = false;
  const previous = Object.fromEntries(["indexedDB", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) } });
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
            const transaction = {
              objectStore(store) {
                return {
                  put(record) { pending.push(() => stores.get(store).set(record.id, structuredClone(record))); },
                  get(key) { const result = {}; queueMicrotask(() => { result.result = structuredClone(stores.get(store).get(key)); result.onsuccess?.(); }); return result; },
                  getAll() { const result = {}; queueMicrotask(() => { result.result = structuredClone([...stores.get(store).values()]); result.onsuccess?.(); }); return result; },
                };
              },
            };
            queueMicrotask(() => {
              if (mode === "readwrite" && abortNextWrite) { abortNextWrite = false; transaction.onabort?.(); return; }
              pending.forEach((write) => write()); transaction.oncomplete?.();
            });
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
