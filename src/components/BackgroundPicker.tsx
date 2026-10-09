import { useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react';
import { BACKGROUNDS, BACKGROUND_LIMITS, NEUTRAL_BACKGROUND_IDS } from '../../shared';
import type { VisualSettings, WallpaperId } from '../../shared';
import { WALLPAPER_ASSETS, isWallpaper } from '../engine/backgrounds';
import { formatPercent, formatPixels, t } from '../i18n';
import { Segmented, Slider } from './Controls';

export interface BackgroundPickerProps { settings: VisualSettings; onSettings: (settings: Partial<VisualSettings>) => void; }
export type BackgroundCategory = 'wallpapers' | 'neutral';
const COLLECTIONS: ReadonlyArray<{ id: 'windows' | 'mac'; wallpapers: readonly WallpaperId[] }> = [
  { id: 'windows', wallpapers: ['bloom', 'silk'] },
  { id: 'mac', wallpapers: ['aurora', 'dunes'] },
];

export function BackgroundPicker({ settings, onSettings }: BackgroundPickerProps) {
  const [category, setCategory] = useState<BackgroundCategory>('wallpapers');
  const copy = t.background;
  const selectedName = isWallpaper(settings.background) ? copy.labels[settings.background] : t.editor[settings.background];
  return <>
    <div className="control-section wallpaper-section">
      <Segmented label={copy.category} value={category} onChange={setCategory} options={[{ value: 'wallpapers', label: copy.wallpapers }, { value: 'neutral', label: copy.neutral }]} />
      {category === 'wallpapers' ? <div className="wallpaper-collections">{COLLECTIONS.map((collection) => <div key={collection.id}><p className="section-caption">{copy[collection.id]}</p><div className="wallpaper-grid">{collection.wallpapers.map((id) => <button type="button" className={`wallpaper-option ${settings.background === id ? 'selected' : ''}`} aria-label={copy.labels[id]} aria-pressed={settings.background === id} key={id} onClick={() => onSettings({ background: id })}><span className="wallpaper-thumbnail"><img src={WALLPAPER_ASSETS[id].image} alt={copy.labels[id]} loading="lazy" />{settings.background === id && <span className="wallpaper-check"><CheckIcon size={11} weight="bold" /></span>}</span><strong>{copy.labels[id]}</strong><small>{copy.descriptions[id]}</small></button>)}</div></div>)}</div> : <div className="background-grid neutral-grid">{NEUTRAL_BACKGROUND_IDS.map((id) => <button type="button" className={`background-swatch ${settings.background === id ? 'selected' : ''}`} key={id} aria-label={t.editor[id]} aria-pressed={settings.background === id} title={t.editor[id]} onClick={() => onSettings({ background: id })} style={{ background: `linear-gradient(135deg, ${BACKGROUNDS[id].join(',')})` }}><span>{t.editor[id]}</span>{settings.background === id && <span className="swatch-check"><CheckIcon size={11} weight="bold" /></span>}</button>)}</div>}
      <p className="background-selected"><span>{copy.selected}</span><strong>{selectedName}</strong></p><p className="field-hint wallpaper-note">{copy.hint}</p>
    </div>
    {isWallpaper(settings.background) && <div className="control-section slider-stack"><Slider label={copy.blur} value={settings.backgroundBlur ?? 0} min={0} max={BACKGROUND_LIMITS.blur} display={formatPixels(settings.backgroundBlur ?? 0)} onChange={(backgroundBlur) => onSettings({ backgroundBlur })} /><Slider label={copy.dim} value={settings.backgroundDim ?? 0} min={0} max={BACKGROUND_LIMITS.dim} display={formatPercent(settings.backgroundDim ?? 0)} onChange={(backgroundDim) => onSettings({ backgroundDim })} /><p className="field-hint">{copy.blurHint}</p></div>}
  </>;
}
