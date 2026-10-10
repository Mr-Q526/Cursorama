/** 在隔离的 Cursorama 实例中通过真实界面操作采集宣传素材。 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { app, BrowserWindow, ipcMain } from 'electron';
import { registerWindowControls } from '../../electron/window';
import { APP_VERSION, initialUpdateState, IPC } from '../../shared';
import type { ProjectData } from '../../shared';
import { LocalLibrary } from '../../storage/library';
import { t } from '../../src/i18n';

export interface PromoCaptureReport { width: number; height: number; fps: number; files: string[]; errors: string[]; }
interface Target { selector?: string; label?: string; text?: string; }
interface Position { x: number; y: number; }

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, '.qa', 'promo');
const CAPTURE = { width: 1920, height: 1080, fps: 12, framesPerSecond: 1000, settle: 250, moveSteps: 16, moveDuration: 200, clickHold: 45, timeout: 15000, cursorX: 760, cursorY: 610 } as const;
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const quote = (value: unknown): string => JSON.stringify(value);
app.setPath('userData', path.join(OUTPUT, 'profile'));
app.on('window-all-closed', () => undefined);

app.whenReady().then(async () => {
  await mkdir(OUTPUT, { recursive: true });
  const library = new LocalLibrary(path.join(OUTPUT, 'library'), { legacyRoots: [] });
  ipcMain.handle(IPC.libraryList, () => library.list());
  ipcMain.handle(IPC.projectSave, (_event, data: ProjectData, bytes?: ArrayBuffer, id?: string) => library.saveProject(data, bytes, id));
  ipcMain.handle(IPC.libraryProject, (_event, id: string) => library.openProject(id));
  ipcMain.handle(IPC.libraryCover, (_event, id: string, video?: string) => library.cover(id, FFMPEG, video));
  ipcMain.handle(IPC.updateGet, () => initialUpdateState(APP_VERSION, false));
  const window = new BrowserWindow({ width: CAPTURE.width, height: CAPTURE.height, useContentSize: true, frame: false, show: false, title: 'Cursorama', webPreferences: { preload: path.join(ROOT, 'dist-electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  registerWindowControls(window);
  const errors: string[] = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const evaluate = <T>(source: string): Promise<T> => window.webContents.executeJavaScript(source, true) as Promise<T>;
  const targetSource = (target: Target): string => target.selector ? `document.querySelector(${quote(target.selector)})` : `Array.from(document.querySelectorAll('button')).find(element => ${target.label ? `element.getAttribute('aria-label') === ${quote(target.label)}` : `element.textContent.trim() === ${quote(target.text)}`})`;
  const bounds = async (target: Target): Promise<Position> => {
    return evaluate<Position>(`new Promise((resolve,reject)=>{ const deadline=performance.now()+${CAPTURE.timeout}; const poll=()=>{const element=${targetSource(target)};if(element && !element.disabled){element.scrollIntoView({block:'nearest'});const bounds=element.getBoundingClientRect();if(bounds.width && bounds.height){resolve({x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)});return;}}if(performance.now()>deadline)reject(new Error('PROMO_TARGET_MISSING:'+${quote(target)}));else setTimeout(poll,50);};poll();})`);
  };
  let pointer: Position = { x: CAPTURE.cursorX, y: CAPTURE.cursorY };
  const move = async (position: Position): Promise<void> => {
    const previous = pointer;
    for (let step = 1; step <= CAPTURE.moveSteps; step++) {
      const fraction = step / CAPTURE.moveSteps;
      const smooth = fraction * fraction * (3 - 2 * fraction);
      const x = Math.round(previous.x + (position.x - previous.x) * smooth);
      const y = Math.round(previous.y + (position.y - previous.y) * smooth);
      window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
      await delay(CAPTURE.moveDuration / CAPTURE.moveSteps);
    }
    pointer = position;
  };
  const click = async (target: Target): Promise<void> => {
    const position = await bounds(target); await move(position);
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position });
    await delay(CAPTURE.clickHold);
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position });
    await delay(CAPTURE.settle);
  };
  const seek = async (seconds: number): Promise<void> => {
    await evaluate(`(()=>{const progress=document.querySelector('.playback-progress');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(progress,${quote(String(seconds))});progress.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await delay(CAPTURE.settle);
  };
  const screenshot = async (name: string): Promise<void> => { await writeFile(path.join(OUTPUT, name), (await window.webContents.capturePage()).toPNG()); };
  const capture = async (name: string, seconds: number, actions: () => Promise<void>): Promise<void> => {
    const target = path.join(OUTPUT, `${name}.mp4`);
    const encoder = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(CAPTURE.fps), '-i', 'pipe:0', '-an', '-vf', `pad=${CAPTURE.width}:${CAPTURE.height}:0:0:color=0x101010`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', target], { windowsHide: true });
    let stderr = '';
    encoder.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    const complete = new Promise<void>((resolve, reject) => { encoder.once('error', reject); encoder.once('close', (code) => code === 0 ? resolve() : reject(new Error(`PROMO_ENCODER_FAILED:${code}:${stderr}`))); });
    const started = performance.now();
    const actionPromise = actions();
    for (let index = 0; index < seconds * CAPTURE.fps; index++) {
      const deadline = started + index * CAPTURE.framesPerSecond / CAPTURE.fps;
      await delay(Math.max(0, deadline - performance.now()));
      const png = (await window.webContents.capturePage()).toJPEG(94);
      if (!encoder.stdin.write(png)) await new Promise<void>((resolve) => encoder.stdin.once('drain', resolve));
    }
    await actionPromise;
    encoder.stdin.end(); await complete;
    console.info(`PROMO_CAPTURE_READY:${name}:${seconds}s`);
  };
  try {
    await window.loadFile(path.join(ROOT, 'dist', 'index.html'));
    window.showInactive();
    await delay(CAPTURE.settle);
    await evaluate(`(()=>{const cursor=document.createElement('div');cursor.id='promo-cursor';cursor.style.cssText='position:fixed;left:0;top:0;width:28px;height:34px;z-index:100000;pointer-events:none;filter:drop-shadow(0 2px 2px #0009);transform:translate(${CAPTURE.cursorX}px,${CAPTURE.cursorY}px)';cursor.innerHTML='<svg viewBox="0 0 28 34" width="28" height="34"><path d="M3 2L3 27L10 20L16 31L22 28L16 18L26 18Z" fill="white" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';document.body.appendChild(cursor);document.addEventListener('pointermove',event=>{cursor.style.transform='translate('+event.clientX+'px,'+event.clientY+'px)';},true);document.addEventListener('pointerdown',event=>{const ring=document.createElement('div');ring.style.cssText='position:fixed;left:'+(event.clientX-22)+'px;top:'+(event.clientY-22)+'px;width:44px;height:44px;border:2px solid #a5c4ff;border-radius:50%;z-index:99999;pointer-events:none';document.body.appendChild(ring);ring.animate([{transform:'scale(.4)',opacity:.85},{transform:'scale(1.25)',opacity:0}],{duration:460,easing:'ease-out'}).finished.then(()=>ring.remove());},true);})()`);
    await click({ selector: '[data-action="open-demo"]' });
    await click({ label: t.background.labels.bloom });
    await click({ text: t.editor.motion });
    await move({ x: 840, y: 550 });
    await delay(CAPTURE.settle);
    await evaluate(`document.querySelector('#promo-cursor').style.visibility='hidden'`);
    await delay(CAPTURE.settle);
    await screenshot('editor.png');
    await evaluate(`document.querySelector('#promo-cursor').style.visibility='visible'`);
    await capture('demo', 8, async () => {
      await delay(300); await click({ label: t.editor.play });
      await delay(1200); await click({ text: t.editor.focus });
      await delay(1200); await click({ text: t.editor.cinematic });
      await delay(1200); await click({ text: t.editor.orbit });
      await move({ x: 960, y: 660 });
    });
    if (await evaluate<boolean>(`Boolean(document.querySelector('button[aria-label=${quote(t.editor.pause)}]'))`)) await click({ label: t.editor.pause });
    await seek(3);
    await click({ text: t.editor.background });
    await capture('backgrounds', 8, async () => {
      await delay(300); await click({ label: t.background.labels.silk });
      await delay(850); await click({ label: t.background.labels.aurora });
      await delay(850); await click({ label: t.background.labels.dunes });
      await delay(850); await click({ selector: '[data-action="more-backgrounds"]' });
      await move({ x: 1270, y: 800 });
    });
    await click({ text: t.background.done });
    await seek(3);
    await click({ selector: '[data-action="open-audio"]' });
    await capture('editing', 6, async () => {
      await delay(250); await click({ selector: '[data-soundtrack-id="clear-morning"] .soundtrack-add' });
      await delay(350); await click({ label: t.editing.addSubtitle });
      await click({ selector: '.subtitle-editor' });
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
      await window.webContents.insertText('让每一步，都成为焦点。');
      await delay(700);
      await click({ text: t.editor.exportVideo });
      if (!await evaluate<boolean>(`Boolean(document.querySelector('.export-summary'))`)) {
        await delay(400); await click({ text: t.editor.exportVideo });
      }
      await evaluate(`new Promise((resolve,reject)=>{const started=performance.now();const poll=()=>{if(document.querySelector('.export-summary'))resolve(true);else if(performance.now()-started>5000)reject(new Error('PROMO_EXPORT_DIALOG_MISSING'));else setTimeout(poll,50)};poll()})`);
      await move({ x: 1150, y: 810 });
    });
    await screenshot('export.png');
    const report: PromoCaptureReport = { width: CAPTURE.width, height: CAPTURE.height, fps: 30, files: ['demo.mp4', 'backgrounds.mp4', 'editing.mp4', 'editor.png', 'export.png'], errors };
    await writeFile(path.join(OUTPUT, 'capture-report.json'), JSON.stringify(report, null, 2));
    window.destroy(); app.exit(0);
  } catch (error) { console.error('PROMO_CAPTURE_FAILED', error); await screenshot('capture-failure.png'); window.destroy(); app.exit(1); }
}).catch((error: unknown) => { console.error('PROMO_START_FAILED', error); app.exit(1); });
