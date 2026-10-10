import { useState } from 'react';
import { ArrowRightIcon, CheckIcon, ImagesIcon } from '@phosphor-icons/react';
import { BACKGROUNDS, BACKGROUND_LIMITS, NEUTRAL_BACKGROUND_IDS, WALLPAPER_IDS } from '../../shared';
import type { BackgroundImageAsset, VisualSettings } from '../../shared';
import { WALLPAPER_ASSETS, isWallpaper } from '../engine/backgrounds';
import { formatPercent, formatPixels, t } from '../i18n';
import { Segmented, Slider } from './Controls';
import { BackgroundLibraryDialog } from './BackgroundLibraryDialog';
import { CustomBackgroundControl } from './CustomBackgroundControl';

export interface BackgroundPickerProps {
  settings: VisualSettings;
  onSettings: (settings: Partial<VisualSettings>) => void;
  backgroundImage?: BackgroundImageAsset;
  onBackgroundImage?: (image: BackgroundImageAsset) => void;
  onRemoveBackgroundImage?: () => void;
}
export type BackgroundCategory = 'wallpapers' | 'neutral';
const QUICK_WALLPAPER_COUNT = 12;

export function BackgroundPicker({ settings, onSettings, backgroundImage, onBackgroundImage, onRemoveBackgroundImage }: BackgroundPickerProps) {
  const [category, setCategory] = useState<BackgroundCategory>('wallpapers');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const copy = t.background;
  const selectedName = settings.background === 'custom' ? backgroundImage?.name ?? t.customBackground.title : isWallpaper(settings.background) ? copy.labels[settings.background] : t.editor[settings.background];
  const shortcuts = [...WALLPAPER_IDS.slice(0, QUICK_WALLPAPER_COUNT)];
  if (isWallpaper(settings.background) && !shortcuts.includes(settings.background)) shortcuts[shortcuts.length - 1] = settings.background;
  return <>
    <div className="control-section wallpaper-section">
      <Segmented label={copy.category} value={category} onChange={setCategory} options={[{ value: 'wallpapers', label: copy.wallpapers }, { value: 'neutral', label: copy.neutral }]} />
      {category === 'wallpapers' ? <div className="wallpaper-grid studio-wallpapers">{shortcuts.map((id) => <button type="button" className={`wallpaper-option ${settings.background === id ? 'selected' : ''}`} title={`${copy.labels[id]} · ${copy.descriptions[id]}`} aria-label={copy.labels[id]} aria-pressed={settings.background === id} key={id} onClick={() => onSettings({ background: id })}><span className="wallpaper-thumbnail"><img src={WALLPAPER_ASSETS[id].image} alt={copy.labels[id]} loading="lazy" />{settings.background === id && <span className="wallpaper-check"><CheckIcon size={10} weight="bold" /></span>}</span></button>)}</div> : <div className="background-grid neutral-grid">{NEUTRAL_BACKGROUND_IDS.map((id) => <button type="button" className={`background-swatch ${settings.background === id ? 'selected' : ''}`} key={id} aria-label={t.editor[id]} aria-pressed={settings.background === id} title={t.editor[id]} onClick={() => onSettings({ background: id })} style={{ background: `linear-gradient(135deg, ${BACKGROUNDS[id].join(',')})` }}><span>{t.editor[id]}</span>{settings.background === id && <span className="swatch-check"><CheckIcon size={11} weight="bold" /></span>}</button>)}</div>}
      <button type="button" className="background-more-button" data-action="more-backgrounds" onClick={() => setLibraryOpen(true)}><ImagesIcon size={17} /><span>{copy.more}</span><span className="background-more-count">{Object.keys(WALLPAPER_ASSETS).length}</span><ArrowRightIcon size={14} /></button>
      <p className="background-selected"><span>{copy.selected}</span><strong>{selectedName}</strong></p>
    </div>
    <div className="control-section"><CustomBackgroundControl image={backgroundImage} selected={settings.background === 'custom'} onImport={onBackgroundImage} onRemove={onRemoveBackgroundImage} onSelect={() => onSettings({ background: 'custom' })} compact /></div>
    {(isWallpaper(settings.background) || settings.background === 'custom') && <div className="control-section slider-stack"><Slider label={copy.blur} value={settings.backgroundBlur ?? 0} min={0} max={BACKGROUND_LIMITS.blur} display={formatPixels(settings.backgroundBlur ?? 0)} onChange={(backgroundBlur) => onSettings({ backgroundBlur })} /><Slider label={copy.dim} value={settings.backgroundDim ?? 0} min={0} max={BACKGROUND_LIMITS.dim} display={formatPercent(settings.backgroundDim ?? 0)} onChange={(backgroundDim) => onSettings({ backgroundDim })} /><p className="field-hint">{copy.blurHint}</p></div>}
    {libraryOpen && <BackgroundLibraryDialog background={settings.background} backgroundImage={backgroundImage} onBackgroundImage={onBackgroundImage} onRemoveBackgroundImage={onRemoveBackgroundImage} onSelect={(background) => onSettings({ background })} onClose={() => setLibraryOpen(false)} />}
  </>;
}
