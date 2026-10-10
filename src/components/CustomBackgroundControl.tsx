import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ImageIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { BACKGROUND_IMAGE_ACCEPT } from '../../shared';
import type { BackgroundImageAsset } from '../../shared';
import { importBackgroundImage } from '../engine/background-image';
import { t } from '../i18n';

export interface CustomBackgroundControlProps {
  image?: BackgroundImageAsset;
  selected: boolean;
  onImport?: (image: BackgroundImageAsset) => void;
  onRemove?: () => void;
  onSelect: () => void;
  compact?: boolean;
}

function imageError(error: unknown): string {
  const copy = t.customBackground;
  if (error instanceof Error) {
    if (error.message === 'BACKGROUND_IMAGE_TOO_LARGE') return copy.tooLarge;
    if (error.message === 'BACKGROUND_IMAGE_FORMAT') return copy.unsupported;
    if (error.message === 'BACKGROUND_IMAGE_DIMENSIONS') return copy.invalidDimensions;
  }
  return copy.failed;
}

export function CustomBackgroundControl({ image, selected, onImport, onRemove, onSelect, compact = false }: CustomBackgroundControlProps) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const latest = useRef(onImport);
  latest.current = onImport;
  const copy = t.customBackground;
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current?.abort(); }; }, []);
  const choose = async (file: File): Promise<void> => {
    setImporting(true); setMessage('');
    const controller = new AbortController();
    pending.current = controller;
    let asset: BackgroundImageAsset | undefined;
    try {
      asset = await importBackgroundImage(file, controller.signal);
      if (!alive.current || !latest.current) { URL.revokeObjectURL(asset.url); return; }
      latest.current(asset);
    } catch (error: unknown) {
      if (asset) URL.revokeObjectURL(asset.url);
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('CUSTOM_BACKGROUND_IMPORT_FAILED', error);
      if (alive.current) setMessage(imageError(error));
    } finally { if (pending.current === controller) pending.current = null; if (alive.current) setImporting(false); }
  };
  return <section className={`custom-background-control${compact ? ' compact' : ''}`} aria-label={copy.title}>
    <p className="custom-background-heading"><ImageIcon size={16} />{copy.title}</p>
    <input ref={input} className="visually-hidden" data-action="custom-background-input" type="file" accept={BACKGROUND_IMAGE_ACCEPT} tabIndex={-1} aria-label={copy.import} disabled={importing || !onImport} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void choose(file); }} />
    {image ? <div className="custom-background-current">
      <button type="button" className={`custom-background-card${selected ? ' selected' : ''}`} aria-label={copy.apply} aria-pressed={selected} onClick={onSelect} disabled={importing}>
        <span className="custom-background-thumbnail"><img src={image.url} alt="" />{selected && <span className="wallpaper-check"><CheckIcon size={11} weight="bold" /></span>}</span>
        <span className="custom-background-image-label"><strong title={image.name}>{image.name}</strong><small>{image.width} × {image.height}</small></span>
      </button>
      <div className="custom-background-actions"><button type="button" className="text-button" onClick={() => input.current?.click()} disabled={importing || !onImport}><UploadSimpleIcon size={15} />{importing ? copy.importing : copy.replace}</button>{onRemove && <button type="button" className="icon-button" aria-label={copy.remove} title={copy.remove} onClick={onRemove} disabled={importing}><XIcon size={16} /></button>}</div>
    </div> : <button type="button" className="custom-background-upload" data-action="import-background-image" onClick={() => input.current?.click()} disabled={importing || !onImport}><UploadSimpleIcon size={18} /><strong>{importing ? copy.importing : copy.import}</strong><small>{copy.formats}</small></button>}
    <p className="custom-background-note">{copy.savedWithProject}</p>
    {message && <p className="error-message" role="alert">{message}</p>}
  </section>;
}
