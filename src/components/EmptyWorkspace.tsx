import { ArrowUpRightIcon, FileArrowUpIcon, FolderOpenIcon, RecordIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { t } from '../i18n';

export interface EmptyWorkspaceProps { onRecord: () => void; onImport: () => void; onOpen: () => void; disabled: boolean; }

export function EmptyWorkspace({ onRecord, onImport, onOpen, disabled }: EmptyWorkspaceProps) {
  const copy = t.library;
  return <main className="empty-workspace"><div className="empty-workspace-content"><span className="empty-workspace-art"><VideoCameraIcon size={48} weight="thin" /></span><span className="workspace-eyebrow">{t.editor.studio}</span><h1>{copy.emptyTitle}</h1><p>{copy.emptyDescription}</p><div className="empty-workspace-actions"><button type="button" className="primary-button" onClick={onRecord} disabled={disabled}><RecordIcon size={18} weight="fill" />{t.editor.newRecording}</button><button type="button" className="soft-button" onClick={onImport} disabled={disabled}><FileArrowUpIcon size={18} />{t.editor.importVideo}</button></div><button className="text-button" type="button" onClick={onOpen} disabled={disabled}><FolderOpenIcon size={16} />{copy.openExternal}<ArrowUpRightIcon size={14} /></button><div className="empty-workspace-note"><span className="status-dot" />{copy.localHint}<span> · </span>{copy.autoSave}</div></div></main>;
}
