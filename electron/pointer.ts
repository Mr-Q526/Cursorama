import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { screen } from 'electron';
import type { FocusRegion, NativePointer, PointerKind } from '../shared';
import { desktopCatalog } from './catalog';

interface RawPointer { x: number; y: number; screenX: number; screenY: number; timestamp: number; kind: PointerKind; button?: 'left' | 'right'; focus?: FocusRegion; normalized: boolean; inside: boolean; }
const POINTER_START_TIMEOUT = 12_000;

function isRawPointer(value: unknown): value is RawPointer {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  const finite = (number: unknown): number is number => typeof number === 'number' && Number.isFinite(number);
  const focus = event.focus as Record<string, unknown> | undefined;
  return finite(event.x) && finite(event.y) && finite(event.screenX) && finite(event.screenY) && finite(event.timestamp) &&
    ['move', 'click', 'typing', 'scroll', 'drag'].includes(String(event.kind)) && typeof event.normalized === 'boolean' && typeof event.inside === 'boolean' &&
    (event.button === undefined || event.button === 'left' || event.button === 'right') &&
    (focus === undefined || (typeof focus === 'object' && focus !== null && finite(focus.x) && finite(focus.y) && finite(focus.width) && finite(focus.height) && focus.width >= 0 && focus.height >= 0 && (focus.source === 'caret' || focus.source === 'control')));
}

export class PointerTracker {
  private process: ChildProcessWithoutNullStreams | null = null;

  async start(scriptPath: string, sourceId: string, displayId: string, callback: (sample: NativePointer) => void, ignorePoint?: (position: Electron.Point) => boolean): Promise<void> {
    this.stop();
    if (process.platform !== 'win32') throw new Error(desktopCatalog.unsupportedPlatform);
    const handle = sourceId.startsWith('window:') ? sourceId.split(':')[1] : '0';
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-WindowHandle', handle], { windowsHide: true, stdio: 'pipe' });
    this.process = child;
    const lines = createInterface({ input: child.stdout });
    let diagnostic = '';
    child.stderr.on('data', (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
    const display = screen.getAllDisplays().find((candidate) => candidate.id.toString() === displayId) ?? screen.getPrimaryDisplay();
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const timeout = setTimeout(() => { this.stop(); reject(new Error(desktopCatalog.pointerError)); }, POINTER_START_TIMEOUT);
      const fail = (error: Error): void => { clearTimeout(timeout); if (!ready) reject(error); else console.error(error); };
      child.once('error', fail);
      child.once('exit', (code) => { if (!ready) fail(new Error(`${desktopCatalog.pointerError} ${diagnostic} (${code})`)); });
      lines.on('line', (line) => {
        if (line === 'READY') { ready = true; clearTimeout(timeout); resolve(); return; }
        let event: unknown;
        try { event = JSON.parse(line) as unknown; } catch (error) { console.warn('POINTER_PARSE_FAILED', error); return; }
        if (!isRawPointer(event)) return;
        const screenPoint = screen.screenToDipPoint({ x: Math.round(event.screenX), y: Math.round(event.screenY) });
        if ((event.kind !== 'typing' || !event.focus) && ignorePoint?.(screenPoint)) return;
        let x = event.x; let y = event.y; let inside = event.inside; let focus = event.focus;
        if (!event.normalized) {
          const position = screen.screenToDipPoint({ x: Math.round(x), y: Math.round(y) });
          x = (position.x - display.bounds.x) / display.bounds.width;
          y = (position.y - display.bounds.y) / display.bounds.height;
          inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
          if (focus) {
            const topLeft = screen.screenToDipPoint({ x: Math.round(focus.x - focus.width / 2), y: Math.round(focus.y - focus.height / 2) });
            const bottomRight = screen.screenToDipPoint({ x: Math.round(focus.x + focus.width / 2), y: Math.round(focus.y + focus.height / 2) });
            const focusPoint = { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 };
            if (ignorePoint?.(focusPoint)) return;
            focus = { ...focus, x: (focusPoint.x - display.bounds.x) / display.bounds.width, y: (focusPoint.y - display.bounds.y) / display.bounds.height, width: (bottomRight.x - topLeft.x) / display.bounds.width, height: (bottomRight.y - topLeft.y) / display.bounds.height };
            inside = focus.x >= 0 && focus.x <= 1 && focus.y >= 0 && focus.y <= 1;
          }
        }
        if (focus && (focus.x < 0 || focus.x > 1 || focus.y < 0 || focus.y > 1)) return;
        if (focus) focus = { ...focus, width: Math.min(1, focus.width), height: Math.min(1, focus.height) };
        callback({ x, y, inside, timestamp: event.timestamp, kind: event.kind, button: event.button, ...(focus ? { focus } : {}) });
      });
    });
  }

  stop(): void { this.process?.kill(); this.process = null; }
}
