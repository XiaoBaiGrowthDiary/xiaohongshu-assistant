import assert from "node:assert/strict";
import test from "node:test";
import { deleteReference, emptyDeletedReferences, purgeDeletedReference, restoreReference } from "./references.mjs";
import { buildCodexPrompt } from "../server/codex/prompts.mjs";

const reference = { id: "search-1", title: "参考文章", body: "DELETED_REFERENCE_TEXT：保留完整正文", source: "search_result/note-1", tags: ["徒步"] };
const other = { id: "search-2", title: "另一条参考", excerpt: "另一个摘要" };
const project = { persona: "体验分享", keyword: "徒步", ragItems: [reference, other], selectedSearchIds: [reference.id, other.id], searchResults: [reference, other], referenceAnalysis: { summary: "旧写法分析" }, deletedReferences: [] };

test("deleting a reference removes it from generation context and unchecks its search result", () => {
  const changed = deleteReference(project, reference.id);
  assert.deepEqual(changed.ragItems, [other]);
  assert.deepEqual(changed.selectedSearchIds, [other.id]);
  assert.equal(changed.referenceAnalysis, null);
  assert.equal(changed.deletedReferences[0].body, reference.body);
  assert.ok(!buildCodexPrompt({ ...changed, kind: "topics" }).includes("DELETED_REFERENCE_TEXT"));
  assert.equal(project.ragItems.length, 2);
  assert.equal(project.selectedSearchIds.length, 2);
});

test("restoring a reference preserves its text, source, order and checked state", () => {
  const deleted = deleteReference(project, reference.id);
  const restored = restoreReference(deleted, reference.id);
  assert.deepEqual(restored.ragItems, project.ragItems);
  assert.ok(restored.selectedSearchIds.includes(reference.id));
  assert.equal(restored.deletedReferences.length, 0);
  assert.equal(restored.referenceAnalysis, null);
});

test("restoring to a full reference list fails without losing the deleted item", () => {
  const deleted = deleteReference(project, reference.id);
  const full = { ...deleted, ragItems: Array.from({ length: 8 }, (_, index) => ({ id: `other-${index}`, title: "其他参考", excerpt: "摘要" })) };
  assert.throws(() => restoreReference(full, reference.id), /8/);
  assert.equal(full.ragItems.length, 8);
  assert.equal(full.deletedReferences[0].body, reference.body);
});

test("restoring a re-added search result recovers the archived body without duplicate references", () => {
  const deleted = deleteReference(project, reference.id);
  const reAdded = { ...deleted, ragItems: [...deleted.ragItems, { id: reference.id, title: reference.title, excerpt: "重新搜索的短摘要" }] };
  const restored = restoreReference(reAdded, reference.id);
  assert.equal(restored.ragItems.filter((item) => item.id === reference.id).length, 1);
  assert.equal(restored.ragItems.find((item) => item.id === reference.id).body, reference.body);
});

test("restoring references respects the total text budget and keeps archived content on failure", () => {
  const deleted = deleteReference(project, reference.id);
  const full = { ...deleted, ragItems: Array.from({ length: 4 }, (_, index) => ({ id: `large-${index}`, body: "字".repeat(6000) })) };
  assert.throws(() => restoreReference(full, reference.id), /24000/);
  assert.equal(full.deletedReferences.length, 1);
});

test("permanent reference removal only purges the requested archive and preserves active references and analysis", () => {
  const archived = { ...deleteReference(project, reference.id), deletedReferences: [{ ...reference, deletedAt: "now" }, { id: "archived-2", body: "另一条备份" }], referenceAnalysis: { summary: "当前有效分析" } };
  const purged = purgeDeletedReference(archived, reference.id);
  assert.deepEqual(purged.deletedReferences.map((item) => item.id), ["archived-2"]);
  assert.equal(purged.ragItems, archived.ragItems);
  assert.equal(purged.referenceAnalysis, archived.referenceAnalysis);
  assert.equal(purgeDeletedReference(purged, "missing"), purged);
  assert.equal(restoreReference(purged, reference.id), purged);
  const empty = emptyDeletedReferences(purged);
  assert.deepEqual(empty.deletedReferences, []);
  assert.equal(empty.ragItems, archived.ragItems);
  assert.equal(empty.searchResults, archived.searchResults);
  assert.equal(archived.deletedReferences.length, 2);
});
