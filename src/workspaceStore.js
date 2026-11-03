import { projectSnapshot } from "../shared/project.mjs";
import { STORAGE_KEYS } from "../shared/legacyCompatibility.mjs";

const DATABASE = STORAGE_KEYS.workspaceDatabase;
const ACTIVE_KEY = STORAGE_KEYS.activeProject;
let databasePromise;
const coverBackups = new Map();

function database() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", { keyPath: "id" });
        request.result.createObjectStore("index", { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); databasePromise = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { databasePromise = undefined; reject(new Error("无法打开本地草稿库，请检查浏览器存储权限。")); };
      request.onblocked = () => { databasePromise = undefined; reject(new Error("草稿库正在更新，请关闭其他小红书创作站页面后重试。")); };
    });
  }
  return databasePromise;
}

async function read(store, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = key === undefined ? transaction.objectStore(store).getAll() : transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("读取草稿失败，请重试。"));
  });
}

export function rememberedProjectId() {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function rememberProject(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* IndexedDB still stores the project. */ }
}

export async function listProjects() {
  return (await read("index")).filter((item) => !item.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listDeletedProjects() {
  return (await read("index")).filter((item) => item.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function loadProject(id) {
  const record = await read("projects", id);
  return record?.deletedAt ? undefined : record;
}

function projectIndex(record) {
  return {
    id: record.id,
    title: record.projectTitle.trim() || record.keyword.trim() || "未命名草稿",
    updatedAt: record.updatedAt,
    materialCount: record.sourceMaterials.length,
    draftCount: record.drafts.length,
    ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
  };
}

async function changeDeletedState(id, deleted) {
  const db = await database();
  const index = await new Promise((resolve, reject) => {
    const transaction = db.transaction(["projects", "index"], "readwrite");
    const request = transaction.objectStore("projects").get(id);
    let result;
    let failure;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error("未找到这份草稿，请刷新列表后重试。");
        if (request.result.purgedAt) throw new Error("这份草稿已永久删除，无法恢复或再次删除。");
        const record = { ...request.result };
        if (deleted) record.deletedAt ||= new Date().toISOString();
        else delete record.deletedAt;
        result = projectIndex(record);
        transaction.objectStore("projects").put(record);
        transaction.objectStore("index").put(result);
      } catch (error) {
        failure = error;
        try { transaction.abort(); } catch { reject(error); }
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || new Error(`${deleted ? "删除" : "恢复"}草稿失败，原内容未被更改，请重试。`));
  });
  if (deleted && rememberedProjectId() === id) rememberProject(null);
  return index;
}

export function deleteProject(id) {
  return changeDeletedState(id, true);
}

export function restoreDeletedProject(id) {
  return changeDeletedState(id, false);
}

async function purgeProjects(id) {
  const db = await database();
  const ids = await new Promise((resolve, reject) => {
    const transaction = db.transaction(["projects", "index"], "readwrite");
    const store = transaction.objectStore("projects");
    const request = id === undefined ? store.getAll() : store.get(id);
    let result = [], failure;
    request.onsuccess = () => {
      try {
        const records = id === undefined ? request.result.filter((record) => record.deletedAt && !record.purgedAt) : [request.result];
        if (id !== undefined && (!records[0]?.deletedAt || records[0].purgedAt)) throw new Error("这份草稿不在最近删除中，请刷新列表后重试。");
        const now = new Date().toISOString();
        for (const record of records) {
          // Retain only an ID tombstone to block late saves, including from older tabs.
          // All content, generated results and local cover Blobs are removed.
          store.put({ id: record.id, deletedAt: record.deletedAt, purgedAt: now });
          transaction.objectStore("index").delete(record.id);
          result.push(record.id);
        }
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || new Error("永久删除失败，原内容未被更改，请重试。"));
  });
  if (ids.length) coverBackups.clear();
  if (ids.includes(rememberedProjectId())) rememberProject(null);
  return ids;
}

export function purgeDeletedProject(id) {
  if (typeof id !== "string" || !id) return Promise.reject(new Error("请选择最近删除中的草稿。"));
  return purgeProjects(id);
}
export function emptyDeletedProjects() { return purgeProjects(); }

async function backupCover(image) {
  if (!image?.src || image.storageBlob instanceof Blob) return image;
  if (!/^\/generated\/covers\/[\w.-]+\.png$/.test(image.src)) return image;
  if (!coverBackups.has(image.src)) {
    coverBackups.set(image.src, (async () => {
      const response = await fetch(image.src);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error("封面备份失败");
      return response.blob();
    })());
    if (coverBackups.size > 12) coverBackups.delete(coverBackups.keys().next().value);
  }
  try { return { ...image, storageBlob: await coverBackups.get(image.src) }; }
  catch (error) { coverBackups.delete(image.src); throw error; }
}

export async function saveProject(project) {
  let coverImage = project.coverImage;
  let warning = "";
  try { coverImage = await backupCover(coverImage); }
  catch { warning = "文字与流程已保存，封面图片未能备份，请重新点击保存。"; }
  const record = { ...projectSnapshot(project), coverImage, schemaVersion: 1, updatedAt: new Date().toISOString() };
  const index = projectIndex(record);
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(["projects", "index"], "readwrite");
    const existing = transaction.objectStore("projects").get(record.id);
    let deleted = false, purged = false;
    existing.onsuccess = () => {
      if (existing.result?.deletedAt) {
        deleted = true;
        purged = Boolean(existing.result.purgedAt);
        transaction.abort();
        return;
      }
      transaction.objectStore("projects").put(record);
      transaction.objectStore("index").put(index);
    };
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(new Error(purged ? "这份草稿已永久删除，无法再次保存。请新建草稿。" : deleted ? "这份草稿已删除，请先从「最近删除」恢复后再保存。" : "保存失败：浏览器存储空间不足或不可用。当前内容仍保留在页面，请先复制或导出。"));
  });
  rememberProject(project.id);
  return { index, warning };
}
