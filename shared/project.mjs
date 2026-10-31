const PROJECT_FIELDS = [
  "id", "schemaVersion", "createdAt", "projectTitle", "persona", "keyword", "writingBrief", "mustInclude",
  "sourceMaterials", "materialInputTitle", "materialInputContent", "materialAnalysis", "summaryConfirmed",
  "referenceAnalysis", "draftReview", "activeStep", "searchResults", "selectedSearchIds", "ragItems",
  "topics", "selectedTopicId", "drafts", "selectedDraftId", "prompts", "selectedPromptId", "coverImage",
  "useReferences", "includeCover",
];

// Model credentials are global preferences, never part of a saved draft.
export function projectSnapshot(project) {
  return Object.fromEntries(PROJECT_FIELDS.filter((key) => project[key] !== undefined).map((key) => [key, project[key]]));
}
