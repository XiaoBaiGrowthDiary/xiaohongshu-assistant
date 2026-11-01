import { useCallback, useEffect, useRef, useState } from "react";
import { deleteProject, listDeletedProjects, listProjects, loadProject, rememberedProjectId, rememberProject, restoreDeletedProject, saveProject } from "./workspaceStore.js";
import { deleteReference, restoreReference } from "../shared/references.mjs";
import { hasProjectContentChanges } from "../shared/project.mjs";
import { STORAGE_KEYS } from "../shared/legacyCompatibility.mjs";

function legacyValue(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.preferencesPrefix}:${key}`)); return typeof value === typeof fallback ? value : fallback; }
  catch { return fallback; }
}

function createProject(defaults, legacy = false) {
  return {
    id: crypto.randomUUID(), schemaVersion: 1, createdAt: new Date().toISOString(), projectTitle: "",
    persona: legacy ? legacyValue("persona", defaults.persona) : defaults.persona,
    keyword: legacy ? legacyValue("keyword", defaults.keyword) : "",
    writingBrief: legacy ? legacyValue("writingBrief", defaults.writingBrief) : "",
    mustInclude: "", sourceMaterials: [], materialInputTitle: "", materialInputContent: "",
    materialAnalysis: null, summaryConfirmed: false, referenceAnalysis: null, draftReview: null,
    activeStep: "input", searchResults: [], selectedSearchIds: [], ragItems: [], deletedReferences: [],
    topics: [], selectedTopicId: null, drafts: [], selectedDraftId: null,
    prompts: [], selectedPromptId: null, coverImage: null,
    useReferences: true, includeCover: false,
    accountSnapshot: null, accountMode: "continue",
  };
}

export function useWorkspace(defaults) {
  const defaultsRef = useRef(defaults);
  const [project, setProject] = useState(() => createProject(defaults, true));
  const [projects, setProjects] = useState([]);
  const [deletedProjects, setDeletedProjects] = useState([]);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [status, setStatus] = useState({ state: "loading", text: "正在恢复本地草稿…" });
  const latest = useRef(project);
  latest.current = project;
  const queue = useRef(Promise.resolve());
  const savedSnapshot = useRef(null);
  const coverUrl = useRef(null);
  const mounted = useRef(true);
  const autosaveTimer = useRef(null);
  const operationLocked = useRef(false);

  const restore = useCallback((record) => {
    if (coverUrl.current) URL.revokeObjectURL(coverUrl.current);
    coverUrl.current = null;
    const restored = { ...createProject(defaultsRef.current), ...record };
    if (restored.coverImage?.storageBlob instanceof Blob) {
      coverUrl.current = URL.createObjectURL(restored.coverImage.storageBlob);
      restored.coverImage = { ...restored.coverImage, src: coverUrl.current };
    }
    latest.current = restored;
    setProject(restored);
    savedSnapshot.current = restored;
    rememberProject(restored.id);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [index, deleted] = await Promise.all([listProjects(), listDeletedProjects()]);
        const remembered = rememberedProjectId();
        const activeId = index.some((item) => item.id === remembered) ? remembered : index[0]?.id;
        const record = activeId ? await loadProject(activeId) : null;
        if (cancelled) return;
        setProjects(index);
        setDeletedProjects(deleted);
        if (record) restore(record);
        else savedSnapshot.current = latest.current;
        setStatus({ state: record ? "saved" : "idle", text: record ? "已恢复本地草稿" : "编辑后自动保存到此浏览器" });
        setReady(true);
      } catch (error) {
        if (!cancelled) { savedSnapshot.current = latest.current; setStatus({ state: "error", text: error.message }); setReady(true); }
      }
    })();
    return () => { cancelled = true; mounted.current = false; if (coverUrl.current) URL.revokeObjectURL(coverUrl.current); };
  }, [restore]);

  const persist = useCallback((snapshot) => {
    const operation = queue.current.catch(() => {}).then(async () => {
      if (mounted.current) setStatus({ state: "saving", text: "正在保存…" });
      try {
        const { index, warning } = await saveProject(snapshot);
        if (latest.current.id === snapshot.id) savedSnapshot.current = snapshot;
        if (mounted.current) {
          setProjects((current) => [index, ...current.filter((item) => item.id !== index.id)]);
          if (latest.current === snapshot) setStatus({ state: warning ? "partial" : "saved", text: warning || `已保存 ${new Date(index.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` });
        }
        return { index, warning };
      } catch (error) {
        if (mounted.current) setStatus({ state: "error", text: error.message });
        throw error;
      }
    });
    queue.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    if (!ready || switching || !hasProjectContentChanges(project, savedSnapshot.current)) return;
    setStatus({ state: "dirty", text: "尚有未保存修改" });
    autosaveTimer.current = setTimeout(() => { persist(project).catch(() => {}); }, 700);
    return () => clearTimeout(autosaveTimer.current);
  }, [project, ready, switching, persist]);

  const field = (key) => [project[key], (value) => setProject((current) => operationLocked.current || current.id !== project.id ? current : { ...current, [key]: typeof value === "function" ? value(current[key]) : value })];
  const save = useCallback(() => operationLocked.current ? Promise.reject(new Error("草稿操作尚未完成，请稍候再保存。")) : persist(latest.current), [persist]);
  const saveBeforeLeaving = useCallback(async () => {
    await queue.current.catch(() => {});
    if (hasProjectContentChanges(latest.current, savedSnapshot.current)) await persist(latest.current);
  }, [persist]);

  const changeWorkspace = useCallback(async (operation) => {
    if (operationLocked.current) throw new Error("正在处理草稿，请稍候。");
    operationLocked.current = true;
    clearTimeout(autosaveTimer.current);
    setSwitching(true);
    try { return await operation(); }
    finally { operationLocked.current = false; setSwitching(false); }
  }, []);

  const open = useCallback((id) => changeWorkspace(async () => {
    await saveBeforeLeaving();
    const record = await loadProject(id);
    if (!record) throw new Error("这份草稿不存在，请刷新列表后重试。");
    restore(record);
    setStatus({ state: "saved", text: "已恢复所选草稿" });
  }), [changeWorkspace, saveBeforeLeaving, restore]);
  const create = useCallback((reuseMaterials = false) => changeWorkspace(async () => {
    await saveBeforeLeaving();
    const current = latest.current;
    const next = createProject({ ...defaultsRef.current, persona: current.persona });
    if (reuseMaterials) next.sourceMaterials = current.sourceMaterials.map((item) => ({ ...item }));
    restore(next);
    await persist(latest.current);
  }), [changeWorkspace, saveBeforeLeaving, restore, persist]);

  const remove = useCallback((id) => changeWorkspace(async () => {
    await saveBeforeLeaving();
    const index = await deleteProject(id);
    const remaining = projects.filter((item) => item.id !== id);
    setProjects((current) => current.filter((item) => item.id !== id));
    setDeletedProjects((current) => [index, ...current.filter((item) => item.id !== id)]);
    setLastDeleted(index);
    if (latest.current.id === id) {
      const next = remaining.length ? await loadProject(remaining[0].id) : null;
      restore(next || createProject({ ...defaultsRef.current, persona: latest.current.persona }));
      if (!next) rememberProject(null);
      setStatus({ state: "idle", text: next ? "已打开另一份草稿" : "草稿已删除，开始编辑即可新建" });
    }
    return index;
  }), [changeWorkspace, saveBeforeLeaving, projects, restore]);

  const recover = useCallback((id) => changeWorkspace(async () => {
    await saveBeforeLeaving();
    const hasCurrent = Boolean(await loadProject(latest.current.id));
    const index = await restoreDeletedProject(id);
    setDeletedProjects((current) => current.filter((item) => item.id !== id));
    setProjects((current) => [index, ...current.filter((item) => item.id !== id)]);
    setLastDeleted((current) => current?.id === id ? null : current);
    if (!hasCurrent) restore(await loadProject(id));
    setStatus({ state: "saved", text: "已恢复草稿" });
    return index;
  }), [changeWorkspace, saveBeforeLeaving, restore]);

  const changeReference = useCallback((id, recoverDeleted = false) => changeWorkspace(async () => {
    await queue.current.catch(() => {});
    const current = latest.current;
    const next = recoverDeleted ? restoreReference(current, id) : deleteReference(current, id);
    if (next === current) return;
    const result = await persist(next);
    restore(next);
    setStatus({ state: result.warning ? "partial" : "saved", text: result.warning || "参考变更已保存" });
    return result;
  }), [changeWorkspace, persist, restore]);

  return { project, projects, deletedProjects, lastDeleted, field, ready, switching, status, save, open, create, remove, recover, changeReference };
}
