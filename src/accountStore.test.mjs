import assert from "node:assert/strict";
import test from "node:test";
import { loadAccount, saveAccount } from "./accountStore.js";
import { deleteAccountVersion } from "../shared/account.mjs";

function storage(t) {
  const stores = new Map(); let initialized = false, abortWrite = false;
  const prior = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { createObjectStore() {}, close() {}, transaction(_store, mode) {
        const pending = [];
        const tx = { objectStore() { return {
          get(key) { const read = {}; queueMicrotask(() => { read.result = structuredClone(stores.get(key)); read.onsuccess?.(); }); return read; },
          put(value, key) { pending.push(() => stores.set(key, structuredClone(value))); },
        }; } };
        queueMicrotask(() => queueMicrotask(() => {
          if (mode === "readwrite" && abortWrite) { abortWrite = false; tx.onabort?.(); return; }
          pending.forEach((write) => write()); tx.oncomplete?.();
        }));
        return tx;
      } };
      if (!initialized) { initialized = true; request.onupgradeneeded?.(); }
      request.onsuccess?.();
    });
    return request;
  } } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, "indexedDB", prior); else delete globalThis.indexedDB; });
  return { failNext() { abortWrite = true; } };
}
const account = (userId) => ({ profile: { userId, nickname: "小白的成长日记", avatarUrl: "https://sns-avatar-qc.xhscdn.com/avatar/a.jpg" }, goal: "我的目标", facts: "我的身份", samples: [{ noteId: "note", body: "全文末尾🌿", originalBody: "全文末尾🌿", enabled: true }], versions: [{ number: 1, analysis: { summary: "正式档案" } }], candidate: { analysis: { summary: "待确认" } } });
test("account library restores complete originals and versions without storing model credentials", async (t) => {
  storage(t);
  const record = account("account-one");
  await saveAccount({ ...record, modelConfig: { apiKey: "never-store" }, apiKey: "never-store" });
  const fresh = await import(`./accountStore.js?reload=${Date.now()}`);
  const restored = await fresh.loadAccount();
  assert.deepEqual(restored, record);
  assert.doesNotMatch(JSON.stringify(restored), /never-store/);
});
test("switching accounts preserves both libraries and failed confirmations leave the old version intact", async (t) => {
  const fixture = storage(t);
  const first = account("account-one"), second = account("account-two");
  await saveAccount(first); await saveAccount(second);
  assert.deepEqual(await loadAccount("account-one"), first);
  assert.deepEqual(await loadAccount(), second);
  fixture.failNext();
  await assert.rejects(saveAccount({ ...second, versions: [...second.versions, { number: 2 }] }), /保存失败/);
  assert.deepEqual(await loadAccount(), second);
  assert.deepEqual(await loadAccount("account-two"), second);
});

test("version deletion persists its number high-water mark and a failed transaction preserves both account copies", async (t) => {
  const fixture = storage(t);
  const source = { ...account("account-one"), candidate: null, versions: [1, 2, 3].map(number => ({ number, versionId: `v${number}`, goal: `g${number}`, facts: `f${number}` })) };
  await saveAccount(source);
  const deleted = deleteAccountVersion(source, "v3");
  fixture.failNext();
  await assert.rejects(saveAccount(deleted), /保存失败/);
  assert.deepEqual(await loadAccount(), source);
  assert.deepEqual(await loadAccount("account-one"), source);
  await saveAccount(deleted);
  assert.deepEqual(await loadAccount(), deleted);
  assert.equal((await loadAccount("account-one")).versionHighWater, 3);
});
