import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { screen } from 'electron';
import type { NativePointer } from '../shared';
import { desktopCatalog } from './catalog';

interface RawPointer { x: number; y: number; timestamp: number; kind: 'move' | 'click'; button?: 'left' | 'right'; normalized: boolean; inside: boolean; }
const POINTER_START_TIMEOUT = 12_000;

function isRawPointer(value: unknown): value is RawPointer {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return typeof event.x === 'number' && typeof event.y === 'number' && typeof event.timestamp === 'number' && (event.kind === 'move' || event.kind === 'click');
}

export class PointerTracker {
  private process: ChildProcessWithoutNullStreams | null = null;

  async start(scriptPath: string, sourceId: string, displayId: string, callback: (sample: NativePointer) => void): Promise<void> {
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
        let x = event.x; let y = event.y; let inside = event.inside;
        if (!event.normalized) {
          const position = screen.screenToDipPoint({ x: Math.round(x), y: Math.round(y) });
          x = (position.x - display.bounds.x) / display.bounds.width;
          y = (position.y - display.bounds.y) / display.bounds.height;
          inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
        }
        callback({ x, y, inside, timestamp: event.timestamp, kind: event.kind, button: event.button });
      });
    });
  }

  stop(): void { this.process?.kill(); this.process = null; }
}
