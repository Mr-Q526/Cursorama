import { CheckIcon, CircleIcon, DownloadSimpleIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { timelineDuration, type Project } from '../../shared';
import { formatTime, t } from '../i18n';

export interface StudioToolbarProps {
  project: Project; projectId?: string; dirty: boolean; saving: boolean; busy: boolean;
  onName: (name: string) => void; onSave: () => void; onExport: () => void; onCloseDemo: () => void;
}

const PROJECT_NAME_LIMIT = 120;

export function StudioToolbar({ project, projectId, dirty, saving, busy, onName, onSave, onExport, onCloseDemo }: StudioToolbarProps) {
  const copy = t.editor;
  return <div className="project-bar" data-project-id={projectId}>
    <div className="project-title"><input aria-label={t.appearance.projectName} className="project-name" value={project.name} maxLength={PROJECT_NAME_LIMIT} onChange={(event) => onName(event.currentTarget.value)} /><span className="studio-source-info">{project.width} × {project.height}<span>·</span>{formatTime(timelineDuration(project))}</span></div>
    <div className="project-tools"><span className="save-status" role="status">{dirty || saving ? <CircleIcon size={6} weight="fill" /> : <CheckIcon size={12} />}{saving ? t.library.saving : dirty ? copy.unsaved : t.library.saved}</span>
      {project.sourceType === 'demo' && <button type="button" className="text-button" data-action="close-demo" disabled={busy} onClick={onCloseDemo}>{t.library.closeDemo}</button>}
      <button className="text-button studio-save" type="button" title={copy.saveProject} onClick={onSave} disabled={busy}><FloppyDiskIcon size={16} />{copy.saveProject}</button>
      <button type="button" className="primary-button project-export" onClick={onExport} disabled={busy}><DownloadSimpleIcon size={15} />{copy.exportVideo}</button>
    </div>
  </div>;
}
