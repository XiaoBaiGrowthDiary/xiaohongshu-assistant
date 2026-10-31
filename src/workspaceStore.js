import { projectSnapshot } from "../shared/project.mjs";

const DATABASE = "mint-atelier-workspace-v1";
const ACTIVE_KEY = "mint-atelier-v3:active-project";
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
      request.onblocked = () => { databasePromise = undefined; reject(new Error("草稿库正在更新，请关闭其他薄荷工坊页面后重试。")); };
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
    let deleted = false;
    existing.onsuccess = () => {
      if (existing.result?.deletedAt) {
        deleted = true;
        transaction.abort();
        return;
      }
      transaction.objectStore("projects").put(record);
      transaction.objectStore("index").put(index);
    };
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(new Error(deleted ? "这份草稿已删除，请先从「最近删除」恢复后再保存。" : "保存失败：浏览器存储空间不足或不可用。当前内容仍保留在页面，请先复制或导出。"));
  });
  rememberProject(project.id);
  return { index, warning };
}
