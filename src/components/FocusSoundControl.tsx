import { CaretDownIcon, CheckIcon, CircleIcon, CircleNotchIcon, PauseIcon, PlayIcon, SparkleIcon, WaveformIcon, WindIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { FocusSoundId, FocusSoundSettings } from '../../shared';
import { FOCUS_SOUND_ASSETS, FOCUS_SOUND_IDS, loadFocusSoundBuffer } from '../focus-sounds';
import { formatPercent } from '../i18n';
import { focusSoundsCatalog as copy } from '../i18n/focus-sounds';
import { Slider, Toggle } from './Controls';

export interface FocusSoundControlProps {
  setting: FocusSoundSettings;
  onChange: (setting: FocusSoundSettings) => void;
  onPreviewStart?: () => void;
  disabled?: boolean;
}
const PERCENT = 100;
const ICONS = { 'soft-tap': CircleIcon, 'air-sweep': WindIcon, 'glass-chime': SparkleIcon, 'gentle-pop': WaveformIcon } as const;

export function FocusSoundControl({ setting, onChange, onPreviewStart, disabled = false }: FocusSoundControlProps) {
  const [active, setActive] = useState<FocusSoundId>();
  const [loading, setLoading] = useState<FocusSoundId>();
  const [failed, setFailed] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeRef = useRef<FocusSoundId | undefined>(undefined);
  const pendingRef = useRef<FocusSoundId | undefined>(undefined);
  const settingRef = useRef(setting); settingRef.current = setting;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const stop = (): void => {
    requestRef.current++;
    abortRef.current?.abort(); abortRef.current = null;
    const source = sourceRef.current;
    if (source) { source.onended = null; source.stop(); source.disconnect(); sourceRef.current = null; }
    activeRef.current = undefined; pendingRef.current = undefined;
    setActive(undefined); setLoading(undefined);
  };

  useEffect(() => () => {
    requestRef.current++;
    abortRef.current?.abort();
    const source = sourceRef.current;
    if (source) { source.onended = null; source.stop(); source.disconnect(); }
    sourceRef.current = null; activeRef.current = undefined; pendingRef.current = undefined;
    gainRef.current?.disconnect(); gainRef.current = null;
    const context = contextRef.current; contextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch((error: unknown) => console.error('FOCUS_SOUND_CONTEXT_RELEASE_FAILED', error));
  }, []);

  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = Math.max(0, Math.min(1, setting.volume)); }, [setting.volume]);
  useEffect(() => { if (disabled) stop(); }, [disabled]);

  const preview = async (id: FocusSoundId): Promise<void> => {
    if (disabledRef.current) return;
    if (activeRef.current === id || pendingRef.current === id) { stop(); return; }
    stop(); onPreviewStart?.(); setFailed(false); pendingRef.current = id; setLoading(id);
    const request = requestRef.current;
    const controller = new AbortController(); abortRef.current = controller;
    let source: AudioBufferSourceNode | undefined;
    try {
      let context = contextRef.current;
      if (!context || context.state === 'closed') {
        context = new AudioContext(); contextRef.current = context;
        const gain = context.createGain(); gain.connect(context.destination); gainRef.current = gain;
      }
      await context.resume();
      const buffer = await loadFocusSoundBuffer(context, id, controller.signal);
      if (request !== requestRef.current || controller.signal.aborted || disabledRef.current) return;
      const gain = gainRef.current;
      if (!gain) throw new Error('FOCUS_SOUND_GAIN_MISSING');
      gain.gain.value = Math.max(0, Math.min(1, settingRef.current.volume));
      source = context.createBufferSource(); source.buffer = buffer; source.connect(gain);
      const playingSource = source;
      source.onended = (): void => {
        playingSource.disconnect();
        if (sourceRef.current !== playingSource) return;
        sourceRef.current = null; activeRef.current = undefined; setActive(undefined);
      };
      source.start(); sourceRef.current = source; activeRef.current = id; setActive(id);
    } catch (error: unknown) {
      if (source && sourceRef.current !== source) source.disconnect();
      if (request !== requestRef.current || controller.signal.aborted) return;
      console.error('FOCUS_SOUND_PREVIEW_FAILED', error); stop(); setFailed(true);
    } finally { if (request === requestRef.current) { abortRef.current = null; pendingRef.current = undefined; setLoading(undefined); } }
  };

  const selected = (id: FocusSoundId): void => { stop(); setFailed(false); onChange({ ...setting, id }); };
  const toggle = (enabled: boolean): void => { stop(); setFailed(false); onChange({ ...setting, enabled }); };
  const selectionKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('[role="radio"]')) return;
    const index = FOCUS_SOUND_IDS.indexOf(setting.id);
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? FOCUS_SOUND_IDS.length - 1 : (index + (forward ? 1 : -1) + FOCUS_SOUND_IDS.length) % FOCUS_SOUND_IDS.length;
    selected(FOCUS_SOUND_IDS[next]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return <details className="focus-sound-control" aria-label={copy.title}>
    <summary><span>{copy.title}</span><small>{setting.enabled ? `${copy.sounds[setting.id].title} · ${formatPercent(setting.volume * PERCENT)}` : copy.disabledSummary}</small><CaretDownIcon size={13} /></summary>
    <div className="focus-sound-body">
    <Toggle label={copy.enabled} checked={setting.enabled} description={copy.hint} onChange={toggle} />
    <div className="focus-sound-options" role="radiogroup" aria-label={copy.selection} onKeyDown={selectionKey}>
      {FOCUS_SOUND_IDS.map((id) => {
        const sound = FOCUS_SOUND_ASSETS[id];
        const item = copy.sounds[id];
        const Glyph = ICONS[id];
        const current = setting.id === id;
        const playing = active === id;
        const pending = loading === id;
        return <div key={id} className={`focus-sound-option${current ? ' selected' : ''}${playing ? ' playing' : ''}`} data-focus-sound-id={id}>
          <button type="button" className="focus-sound-select" role="radio" aria-checked={current} tabIndex={current ? 0 : -1} onClick={() => selected(id)}><span className="focus-sound-glyph"><Glyph size={17} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span>{current && <CheckIcon className="focus-sound-check" size={12} weight="bold" />}</button>
          <button type="button" className="focus-sound-preview" disabled={disabled} title={`${playing || pending ? copy.stop : copy.preview} · ${item.title}`} aria-label={`${playing || pending ? copy.stop : copy.preview} · ${item.title}`} aria-pressed={playing} onClick={() => void preview(id)}>{pending ? <CircleNotchIcon className="focus-sound-loading" size={15} /> : playing ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}</button>
          <span className="focus-sound-duration">{sound.duration.toFixed(2)} {copy.durationUnit}</span>
        </div>;
      })}
    </div>
    <div className="slider-stack"><Slider label={copy.volume} value={setting.volume * PERCENT} min={0} max={PERCENT} display={formatPercent(setting.volume * PERCENT)} onChange={(volume) => onChange({ ...setting, volume: volume / PERCENT })} /></div>
    <p className="field-hint">{setting.enabled ? copy.coexist : copy.disabled}</p>
    {loading && <p className="field-hint" role="status">{copy.loading}</p>}
    {failed && <p className="focus-sound-error" role="alert">{copy.failed}</p>}
    </div>
  </details>;
}
