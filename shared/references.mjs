import { contextError } from "./workflow.mjs";

export function deleteReference(project, id) {
  const position = project.ragItems.findIndex((item) => item.id === id);
  if (position < 0) return project;
  return {
    ...project,
    ragItems: project.ragItems.filter((item) => item.id !== id),
    selectedSearchIds: (project.selectedSearchIds || []).filter((selected) => selected !== id),
    referenceAnalysis: null,
    deletedReferences: [
      { ...project.ragItems[position], deletedAt: new Date().toISOString(), originalPosition: position },
      ...(project.deletedReferences || []).filter((item) => item.id !== id),
    ],
  };
}

export function restoreReference(project, id) {
  const deleted = (project.deletedReferences || []).find((item) => item.id === id);
  if (!deleted) return project;
  const { deletedAt, originalPosition, ...reference } = deleted;
  const ragItems = project.ragItems.filter((item) => item.id !== id);
  ragItems.splice(Math.min(originalPosition ?? ragItems.length, ragItems.length), 0, reference);
  const problem = contextError({ ragItems });
  if (problem) throw new Error(`恢复失败：${problem}`);
  const selectedSearchIds = new Set(project.selectedSearchIds || []);
  if (project.searchResults?.some((item) => item.id === id)) selectedSearchIds.add(id);
  return {
    ...project,
    ragItems,
    selectedSearchIds: [...selectedSearchIds],
    referenceAnalysis: null,
    deletedReferences: project.deletedReferences.filter((item) => item.id !== id),
  };
}
