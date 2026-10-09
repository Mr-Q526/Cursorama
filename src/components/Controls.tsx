import type { Icon, IconProps } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { t } from '../i18n';

export interface IconButtonProps {
  icon: Icon; label: string; onClick?: () => void; active?: boolean;
  disabled?: boolean; className?: string; size?: number;
}
export function IconButton({ icon: Glyph, label, onClick, active, disabled, className = '', size = 20 }: IconButtonProps) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}><Glyph size={size} weight="regular" /></button>;
}

export interface ToggleProps { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; }
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return <label className="toggle-row"><span><span className="control-label">{label}</span>{description && <small>{description}</small>}</span><button type="button" role="switch" aria-label={label} aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></label>;
}

export interface SliderProps { label: string; value: number; min: number; max: number; step?: number; display: string; onChange: (value: number) => void; }
export function Slider({ label, value, min, max, step = 1, display, onChange }: SliderProps) {
  return <label className="slider-control"><span className="slider-label"><span>{label}</span><output>{display}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} style={{ '--range-fill': `${(value - min) / (max - min) * 100}%` } as CSSProperties} /></label>;
}

export interface ModalProps { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; closeDisabled?: boolean; className?: string; }
const FOCUSABLE_CONTROLS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
export function Modal({ title, subtitle, children, onClose, wide = false, closeDisabled = false, className = '' }: ModalProps) {
  const root = useRef<HTMLElement>(null);
  const callbacks = useRef({ onClose, closeDisabled });
  callbacks.current = { onClose, closeDisabled };
  useEffect(() => {
    const panel = root.current;
    const previous = document.activeElement;
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .library-sidebar')).map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    const controls = (): HTMLElement[] => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROLS) ?? []).filter((element) => element.getClientRects().length > 0);
    (controls()[0] ?? panel)?.focus();
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !callbacks.current.closeDisabled) { event.preventDefault(); event.stopPropagation(); callbacks.current.onClose(); }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0] ?? panel;
      const last = elements[elements.length - 1] ?? panel;
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !panel?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      background.forEach(({ element, inert }) => { element.inert = inert; });
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}><section ref={root} tabIndex={-1} className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton icon={XIcon} label={t.editor.close} onClick={onClose} disabled={closeDisabled} /></div>{children}</section></div>;
}

export interface SegmentedProps<T extends string> { label: string; options: ReadonlyArray<{ value: T; label: string; icon?: Icon }>; value: T; onChange: (value: T) => void; }
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => { const Glyph = option.icon; return <button type="button" key={option.value} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}>{Glyph && <Glyph size={17} />}{option.label}</button>; })}</div>;
}

export function StatusIcon(props: IconProps) { return <CheckIcon {...props} weight="bold" />; }
