import { useState } from "react";
import { useConfirmation } from "./useConfirmation.jsx";

export function ProjectLibrary({ projects, deletedProjects, currentId, lastDeleted, busy, canSave, onNew, onSave, onOpen, onDelete, onRestore, onPurge, onEmptyDeleted }) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirm, confirmation] = useConfirmation();
  const purge = async (project) => { if (await confirm(`永久删除草稿「${project.title}」？该草稿的素材、生成结果和本地封面备份将被清除，无法恢复。其他草稿和账号档案会保留。`)) onPurge(project.id); };
  const empty = async () => { if (await confirm(`清空最近删除中的 ${deletedProjects.length} 份草稿？这些草稿的素材、生成结果和本地封面备份将被清除，无法恢复。正在使用的草稿和账号档案会保留。`)) onEmptyDeleted(); };
  return (
    <section className="project-list" aria-label="草稿项目管理">
      {confirmation}
      <header>
        <h3>草稿项目</h3>
        <div className="project-actions">
          <button type="button" disabled={busy} onClick={onNew}>新建</button>
          <button type="button" disabled={!canSave} onClick={onSave}>保存</button>
        </div>
      </header>
      {projects.length ? projects.map((project) => (
        <div className={`project-row${project.id === currentId ? " active" : ""}`} key={project.id}>
          <button className="project" type="button" disabled={busy} onClick={() => onOpen(project.id)} aria-label={`打开草稿：${project.title}`} aria-current={project.id === currentId ? "page" : undefined} title={project.title}>
            <span className={`soft-icon ${project.id === currentId ? "mint" : "pink"}`}>稿</span>
            <span><strong>{project.title}</strong><small>{project.materialCount} 条素材 · {project.draftCount} 篇文案</small></span>
          </button>
          <button className="delete-button project-delete" type="button" disabled={busy} onClick={() => onDelete(project.id)} aria-label={`删除草稿：${project.title}`} title="删除草稿，可在最近删除中恢复">删除</button>
        </div>
      )) : <p className="help-text project-empty">暂无草稿，开始编辑或点击新建。</p>}
      {lastDeleted ? <div className="delete-feedback" role="status"><span>已删除「{lastDeleted.title}」</span><button className="restore-button" type="button" disabled={busy} onClick={() => onRestore(lastDeleted.id)}>撤销删除</button></div> : null}
      {deletedProjects.length ? <>
        <button className="text-button deleted-toggle" type="button" aria-expanded={showDeleted} aria-controls="deleted-project-list" onClick={() => setShowDeleted((current) => !current)}>最近删除（{deletedProjects.length}）</button>
        {showDeleted ? <div className="deleted-project-list" id="deleted-project-list"><button type="button" className="text-button trash-empty" disabled={busy || !canSave} onClick={empty}>清空最近删除</button>{deletedProjects.map((project) => <div className="deleted-item" key={project.id}><span title={project.title}>{project.title}</span><div className="deleted-item-actions"><button className="restore-button" type="button" disabled={busy} onClick={() => onRestore(project.id)} aria-label={`恢复草稿：${project.title}`}>恢复</button><button className="delete-button purge-button" type="button" disabled={busy || !canSave} onClick={() => purge(project)} aria-label={`永久删除草稿：${project.title}`}>永久删除</button></div></div>)}</div> : null}
      </> : null}
    </section>
  );
}
