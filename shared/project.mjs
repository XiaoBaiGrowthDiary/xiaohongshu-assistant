const PROJECT_FIELDS = [
  "id", "schemaVersion", "createdAt", "projectTitle", "persona", "keyword", "writingBrief", "mustInclude",
  "sourceMaterials", "materialInputTitle", "materialInputContent", "materialAnalysis", "summaryConfirmed",
  "referenceAnalysis", "draftReview", "activeStep", "searchResults", "selectedSearchIds", "ragItems", "deletedReferences",
  "topics", "selectedTopicId", "drafts", "selectedDraftId", "prompts", "selectedPromptId", "coverImage",
  "useReferences", "includeCover",
  "accountSnapshot", "accountMode",
];

// Model credentials are global preferences, never part of a saved draft.
export function projectSnapshot(project) {
  return Object.fromEntries(PROJECT_FIELDS.filter((key) => project[key] !== undefined).map((key) => [key, project[key]]));
}

export function hasProjectContentChanges(current, saved) {
  return !saved || PROJECT_FIELDS.some((key) => key !== "activeStep" && current[key] !== saved[key]);
}
