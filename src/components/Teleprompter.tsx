import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, DotsSixVerticalIcon, FlipHorizontalIcon, PauseIcon, PlayIcon, XIcon } from '@phosphor-icons/react';
import { RECORDING_CONTROLS, TIME } from '../../shared';
import { t } from '../i18n';
import { IconButton } from './Controls';

export interface TeleprompterProps { script: string; recordingPaused: boolean; onClose: () => void; }

export function Teleprompter({ script, recordingPaused, onClose }: TeleprompterProps) {
  const copy = t.teleprompter;
  const viewport = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const [scrolling, setScrolling] = useState(true);
  const [finished, setFinished] = useState(false);
  const [speed, setSpeed] = useState<number>(RECORDING_CONTROLS.speed.default);
  const [fontSize, setFontSize] = useState<number>(RECORDING_CONTROLS.font.default);
  const [mirrored, setMirrored] = useState(false);
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number): void => {
      const element = viewport.current;
      if (element && scrolling && !recordingPaused && script.trim()) {
        const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
        scrollPosition.current = Math.min(maximum, scrollPosition.current + Math.min(now - previous, RECORDING_CONTROLS.interval) / TIME.milliseconds * speed);
        element.scrollTop = scrollPosition.current;
        if (maximum > 0 && scrollPosition.current >= maximum) { setScrolling(false); setFinished(true); }
      }
      previous = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, recordingPaused, speed, script]);
  return <section className="teleprompter" aria-label={copy.title}>
    <header className="prompter-heading"><span className="prompter-drag" title={copy.drag}><DotsSixVerticalIcon size={18} /><strong>{copy.title}</strong></span><IconButton icon={XIcon} label={copy.hide} onClick={onClose} size={17} /></header>
    <div className={`prompter-viewport${mirrored ? ' mirrored' : ''}`} ref={viewport} onWheel={() => { setScrolling(false); setFinished(false); }} onScroll={(event) => { if (Math.abs(scrollPosition.current - event.currentTarget.scrollTop) > 1) scrollPosition.current = event.currentTarget.scrollTop; }}>
      <div className="prompter-text" style={{ fontSize }}>{script || copy.empty}</div>
    </div>
    <footer className="prompter-toolbar"><div className="prompter-playback"><IconButton icon={ArrowCounterClockwiseIcon} label={copy.restart} onClick={() => { scrollPosition.current = 0; if (viewport.current) viewport.current.scrollTop = 0; setFinished(false); }} /><IconButton icon={scrolling && !recordingPaused ? PauseIcon : PlayIcon} label={scrolling ? copy.pause : copy.scroll} onClick={() => { setScrolling((current) => !current); setFinished(false); }} disabled={recordingPaused || !script.trim()} /><IconButton icon={FlipHorizontalIcon} label={copy.mirror} onClick={() => setMirrored((current) => !current)} active={mirrored} /></div>
      <label>{copy.speed}<input type="range" aria-label={copy.speed} min={RECORDING_CONTROLS.speed.minimum} max={RECORDING_CONTROLS.speed.maximum} value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))} /></label><label>{copy.font}<input type="range" aria-label={copy.font} min={RECORDING_CONTROLS.font.minimum} max={RECORDING_CONTROLS.font.maximum} value={fontSize} onChange={(event) => setFontSize(Number(event.currentTarget.value))} /></label>
    </footer>{finished && <p className="prompter-finished" role="status">{copy.finished}</p>}
  </section>;
}
