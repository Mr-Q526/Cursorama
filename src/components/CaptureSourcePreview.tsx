import { useState } from 'react';
import { MonitorIcon } from '@phosphor-icons/react';
import type { CaptureSource } from '../../shared';
import { t } from '../i18n';

export function CaptureSourcePreview({ source }: { source: CaptureSource }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const thumbnail = source.thumbnail && !failed.has(source.thumbnail) ? source.thumbnail : undefined;
  const icon = source.appIcon && !failed.has(source.appIcon) ? source.appIcon : undefined;
  const image = thumbnail ?? icon;
  return <div className={`source-thumbnail${thumbnail ? '' : ' source-thumbnail-fallback'}`} aria-hidden="true">
    {image ? <img src={image} alt="" onError={() => setFailed((previous) => new Set([...previous, image]))} /> : <MonitorIcon size={32} weight="thin" />}
    {!thumbnail && <span>{t.recording.thumbnailUnavailable}</span>}
  </div>;
}
