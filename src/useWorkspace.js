import { useCallback, useEffect, useRef, useState } from "react";
import { listProjects, loadProject, rememberedProjectId, rememberProject, saveProject } from "./workspaceStore.js";

function legacyValue(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(`mint-atelier-v2:${key}`)); return typeof value === typeof fallback ? value : fallback; }
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
    activeStep: "input", searchResults: [], selectedSearchIds: [], ragItems: [],
    topics: [], selectedTopicId: null, drafts: [], selectedDraftId: null,
    prompts: [], selectedPromptId: null, coverImage: null,
    useReferences: true, includeCover: false,
  };
}

export function useWorkspace(defaults) {
  const defaultsRef = useRef(defaults);
  const [project, setProject] = useState(() => createProject(defaults, true));
  const [projects, setProjects] = useState([]);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [status, setStatus] = useState({ state: "loading", text: "正在恢复本地草稿…" });
  const latest = useRef(project);
  latest.current = project;
  const queue = useRef(Promise.resolve());
  const savedSnapshot = useRef(null);
  const coverUrl = useRef(null);
  const mounted = useRef(true);

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
        const index = await listProjects();
        const activeId = rememberedProjectId() || index[0]?.id;
        const record = activeId ? await loadProject(activeId) : null;
        if (cancelled) return;
        setProjects(index);
        if (record) restore(record);
        setStatus({ state: record ? "saved" : "idle", text: record ? "已恢复本地草稿" : "编辑后自动保存到此浏览器" });
        setReady(true);
      } catch (error) {
        if (!cancelled) { setStatus({ state: "error", text: error.message }); setReady(true); }
      }
    })();
    return () => { cancelled = true; mounted.current = false; if (coverUrl.current) URL.revokeObjectURL(coverUrl.current); };
  }, [restore]);

  const persist = useCallback((snapshot) => {
    const operation = queue.current.catch(() => {}).then(async () => {
      if (mounted.current) setStatus({ state: "saving", text: "正在保存…" });
      try {
        const { index, warning } = await saveProject(snapshot);
        savedSnapshot.current = snapshot;
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
    if (!ready || project === savedSnapshot.current) return;
    setStatus({ state: "dirty", text: "尚有未保存修改" });
    const timer = setTimeout(() => { persist(project).catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [project, ready, persist]);

  const field = (key) => [project[key], (value) => setProject((current) => current.id !== project.id ? current : { ...current, [key]: typeof value === "function" ? value(current[key]) : value })];
  const save = useCallback(() => persist(latest.current), [persist]);
  const open = useCallback(async (id) => {
    setSwitching(true);
    try {
      await save();
      const record = await loadProject(id);
      if (!record) throw new Error("这份草稿不存在，请刷新列表后重试。");
      restore(record);
      setStatus({ state: "saved", text: "已恢复所选草稿" });
    } finally { setSwitching(false); }
  }, [save, restore]);
  const create = useCallback(async (reuseMaterials = false) => {
    setSwitching(true);
    try {
      await save();
      const current = latest.current;
      const next = createProject({ ...defaultsRef.current, persona: current.persona });
      if (reuseMaterials) next.sourceMaterials = current.sourceMaterials.map((item) => ({ ...item }));
      restore(next);
      await persist(next);
    } finally { setSwitching(false); }
  }, [save, restore, persist]);

  return { project, projects, field, ready, switching, status, save, open, create };
}
