// Historical identifiers stay stable so a brand change never hides existing
// browser data or generated cover files. They are not display names.
export const STORAGE_KEYS = Object.freeze({
  preferencesPrefix: "mint-atelier-v2",
  workspaceDatabase: "mint-atelier-workspace-v1",
  activeProject: "mint-atelier-v3:active-project",
  accountDatabase: "mint-atelier-accounts-v1",
  coverCacheDirectory: "xhs-g4-generated-covers",
});
// Detect a still-running pre-rename instance and ask for a clean restart.
export const LEGACY_APP_TITLE = "薄荷工坊 / Mint Atelier";
