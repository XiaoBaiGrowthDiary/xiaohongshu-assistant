import { STORAGE_KEYS } from "../shared/legacyCompatibility.mjs";
const DATABASE = STORAGE_KEYS.accountDatabase;
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("accounts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开账号档案库，请检查浏览器存储权限。"));
    request.onblocked = () => reject(new Error("账号档案库被其他页面占用，请关闭旧页面后重试。"));
  });
}
export async function loadAccount(userId = "primary") {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("accounts", "readonly");
      const request = transaction.objectStore("accounts").get(userId);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result || null);
      transaction.onabort = transaction.onerror = () => reject(new Error("读取账号档案失败，请刷新后重试。"));
    });
  } finally { db.close(); }
}
export async function saveAccount(record) {
  const db = await database();
  // The account library never stores model configuration or credentials.
  const fields = ["profile", "goal", "facts", "samples", "candidate", "versions", "nextCursor", "hasMore", "pages", "syncedAt"];
  const snapshot = Object.fromEntries(fields.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("accounts", "readwrite");
      transaction.objectStore("accounts").put(snapshot, "primary");
      transaction.objectStore("accounts").put(snapshot, record.profile.userId);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error("账号档案保存失败，正式版本未更新，请重试。"));
    });
  } finally { db.close(); }
}
