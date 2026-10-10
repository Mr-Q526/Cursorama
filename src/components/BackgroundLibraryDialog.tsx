import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ImageIcon } from '@phosphor-icons/react';
import { BACKGROUNDS, WALLPAPER_IDS } from '../../shared';
import type { BackgroundId, BackgroundImageAsset } from '../../shared';
import { WALLPAPER_ASSETS, WALLPAPER_COLLECTIONS, isWallpaper } from '../engine/backgrounds';
import type { WallpaperCollectionId } from '../engine/backgrounds';
import { t } from '../i18n';
import { Modal } from './Controls';
import { CustomBackgroundControl } from './CustomBackgroundControl';

export interface BackgroundLibraryDialogProps {
  background: BackgroundId;
  onSelect: (background: BackgroundId) => void;
  onClose: () => void;
  backgroundImage?: BackgroundImageAsset;
  onBackgroundImage?: (image: BackgroundImageAsset) => void;
  onRemoveBackgroundImage?: () => void;
}
export type BackgroundLibraryCategory = 'all' | WallpaperCollectionId;

const CATEGORIES: readonly BackgroundLibraryCategory[] = ['all', 'windows', 'mac', 'minimal'];

export function BackgroundLibraryDialog({ background, onSelect, onClose, backgroundImage, onBackgroundImage, onRemoveBackgroundImage }: BackgroundLibraryDialogProps) {
  const [category, setCategory] = useState<BackgroundLibraryCategory>('all');
  const copy = t.background;
  const wallpapers = category === 'all' ? WALLPAPER_IDS : WALLPAPER_COLLECTIONS.find((collection) => collection.id === category)?.wallpapers ?? [];
  const wallpaper = isWallpaper(background);
  const custom = background === 'custom';
  const name = custom ? backgroundImage?.name ?? t.customBackground.title : wallpaper ? copy.labels[background] : t.editor[background];
  const collection = wallpaper ? WALLPAPER_COLLECTIONS.find((item) => item.wallpapers.includes(background))?.id : undefined;
  const description = custom ? t.customBackground.description : wallpaper ? copy.descriptions[background] : copy.neutralDescription;
  const modal = <Modal title={copy.libraryTitle} subtitle={copy.librarySubtitle} onClose={onClose} wide className="background-library-dialog">
    <div className="background-library-layout">
      <div className="background-library-browser">
        <div className="background-library-categories" role="group" aria-label={copy.browseCategory}>
          {CATEGORIES.map((id) => <button type="button" key={id} aria-pressed={category === id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>
            {copy[id]}<span>{id === 'all' ? WALLPAPER_IDS.length : WALLPAPER_COLLECTIONS.find((item) => item.id === id)?.wallpapers.length}</span>
          </button>)}
        </div>
        <div className="background-library-grid">
          {wallpapers.map((id) => <button type="button" key={id} data-wallpaper-id={id} className={`wallpaper-option background-library-option ${background === id ? 'selected' : ''}`} aria-label={copy.labels[id]} aria-pressed={background === id} onClick={() => onSelect(id)}>
            <span className="wallpaper-thumbnail"><img src={WALLPAPER_ASSETS[id].image} alt="" loading="lazy" />{background === id && <span className="wallpaper-check"><CheckIcon size={11} weight="bold" /></span>}</span>
            <strong>{copy.labels[id]}</strong><small>{copy.descriptions[id]}</small>
          </button>)}
        </div>
      </div>
      <aside className="background-library-selection" aria-label={copy.libraryPreview}>
        <p className="background-library-eyebrow">{copy.selected}</p>
        <div className="background-library-preview" style={{ background: `linear-gradient(135deg, ${BACKGROUNDS[background].join(',')})` }}>
          {wallpaper && <img src={WALLPAPER_ASSETS[background].image} alt={name} />}
          {custom && backgroundImage && <img src={backgroundImage.url} alt={name} />}
        </div>
        <div className="background-library-selection-details" aria-live="polite">
          <span className="background-library-collection">{custom ? t.customBackground.title : collection ? copy[collection] : copy.neutral}</span>
          <h3>{name}</h3><p>{description}</p>
        </div>
        {wallpaper && <p className="background-library-artwork"><ImageIcon size={15} />{copy.originalArtwork}</p>}
        <p className="background-library-applied" role="status"><CheckIcon size={15} />{copy.applied}</p>
        <CustomBackgroundControl image={backgroundImage} selected={custom} onImport={onBackgroundImage} onRemove={onRemoveBackgroundImage} onSelect={() => onSelect('custom')} compact />
      </aside>
    </div>
    <div className="background-library-footer"><p>{copy.blurHint}</p><button type="button" className="primary-button" onClick={onClose}>{copy.done}</button></div>
  </Modal>;
  return createPortal(modal, document.querySelector('.app-shell') ?? document.body);
}
