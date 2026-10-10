/** 双 Cursorama 隔离窗口采集、真实鼠标轨迹与产品成片导出。 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { app, BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import { APP_VERSION, initialUpdateState, IPC } from '../../shared';
import type { CaptureOptions, ExportRequest, NativePointer, ProjectData } from '../../shared';
import { encodeVideo } from '../../storage/encoder';
import { LocalLibrary } from '../../storage/library';
import { t } from '../../src/i18n';
import type { RawCapture } from './capture-v2-renderer';

export interface V2CaptureReport { raw: Omit<RawCapture, 'bytes'>; exports: string[]; errors: string[]; }
interface Target { selector?: string; label?: string; text?: string; }
interface Position { x: number; y: number; width?: number; height?: number; }

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, '.qa', 'promo-v2');
const SETTINGS = { width: 1480, height: 960, fps: 30, duration: 16, studioDuration: 10, studioOutputDuration: 8, studioFps: 12, settle: 160, moveSteps: 12, moveDuration: 200, clickHold: 45, timeout: 15000, milliseconds: 1000 } as const;
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const quote = (value: unknown): string => JSON.stringify(value);
app.setPath('userData', path.join(OUTPUT, 'profile'));
app.on('window-all-closed', () => undefined);

app.whenReady().then(async () => {
  await mkdir(OUTPUT, { recursive: true });
  const library = new LocalLibrary(path.join(OUTPUT, 'library'), { legacyRoots: [] });
  const makeWindow = (name: string): BrowserWindow => new BrowserWindow({ width: SETTINGS.width, height: SETTINGS.height, useContentSize: true, frame: false, show: false, title: name, webPreferences: { preload: path.join(ROOT, 'dist-electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const source = makeWindow('Cursorama 原始操作');
  const editor = makeWindow('Cursorama 制作工作室');
  const windows = [source, editor];
  const errors: string[] = [];
  for (const window of windows) window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  let selectedId = '';
  let tracking = false;
  const trusted = (contents: Electron.WebContents): BrowserWindow => { const window = windows.find((candidate) => candidate.webContents === contents); if (!window) throw new Error('PROMO_V2_UNTRUSTED_WINDOW'); return window; };
  ipcMain.handle(IPC.windowGet, (event) => ({ maximized: trusted(event.sender).isMaximized() }));
  ipcMain.handle(IPC.windowMinimize, (event) => trusted(event.sender).minimize());
  ipcMain.handle(IPC.windowMaximize, (event) => { const window = trusted(event.sender); if (window.isMaximized()) window.unmaximize(); else window.maximize(); return { maximized: window.isMaximized() }; });
  ipcMain.handle(IPC.windowClose, (event) => trusted(event.sender).close());
  ipcMain.handle(IPC.libraryList, () => library.list());
  ipcMain.handle(IPC.projectSave, (_event, data: ProjectData, bytes?: ArrayBuffer, id?: string) => library.saveProject(data, bytes, id));
  ipcMain.handle(IPC.libraryProject, (_event, id: string) => library.openProject(id));
  ipcMain.handle(IPC.libraryCover, (_event, id: string, video?: string) => library.cover(id, FFMPEG, video));
  ipcMain.handle(IPC.updateGet, () => initialUpdateState(APP_VERSION, false));
  const sources = async () => {
    const ids = windows.map((window) => window.getMediaSourceId());
    const list = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: false });
    return list.filter((item) => ids.includes(item.id)).map((item) => ({ id: item.id, name: item.id === source.getMediaSourceId() ? 'Cursorama 原始操作' : 'Cursorama 制作工作室', kind: 'window', displayId: item.display_id, thumbnail: item.thumbnail.toDataURL() }));
  };
  ipcMain.handle(IPC.sources, sources);
  ipcMain.handle(IPC.select, (_event, options: CaptureOptions) => { selectedId = options.sourceId; });
  ipcMain.handle(IPC.pointerStart, () => { tracking = true; });
  ipcMain.handle(IPC.pointerStop, () => { tracking = false; });
  ipcMain.handle(IPC.recording, () => undefined);
  ipcMain.handle(IPC.recordingProgress, () => undefined);
  ipcMain.handle(IPC.export, async (event, request: ExportRequest) => {
    const window = trusted(event.sender);
    if (request.name.startsWith('result-')) {
      const target = path.join(OUTPUT, `${request.name}.mp4`);
      await encodeVideo(request, FFMPEG, target, (progress) => window.webContents.send(IPC.encodeProgress, progress));
      return { cancelled: false, path: target };
    }
    return library.exportVideo(request, (target) => encodeVideo(request, FFMPEG, target, (progress) => window.webContents.send(IPC.encodeProgress, progress)));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const list = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1, height: 1 } });
    const selected = list.find((item) => item.id === selectedId && item.id === source.getMediaSourceId());
    callback(selected ? { video: selected } : {});
  });
  const evaluate = <T>(window: BrowserWindow, code: string): Promise<T> => window.webContents.executeJavaScript(code, true) as Promise<T>;
  const targetSource = (target: Target): string => target.selector ? `document.querySelector(${quote(target.selector)})` : `Array.from(document.querySelectorAll('button')).find(element => ${target.label ? `element.getAttribute('aria-label') === ${quote(target.label)}` : `element.textContent.trim() === ${quote(target.text)}`})`;
  const bounds = (window: BrowserWindow, target: Target): Promise<Position> => evaluate<Position>(window, `new Promise((resolve,reject)=>{const started=performance.now();const poll=()=>{const element=${targetSource(target)};if(element&&!element.disabled){element.scrollIntoView({block:'nearest'});const rect=element.getBoundingClientRect();if(rect.width&&rect.height){resolve({x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2),width:rect.width,height:rect.height});return;}}if(performance.now()-started>${SETTINGS.timeout})reject(new Error('PROMO_V2_TARGET_MISSING:'+${quote(target)}));else setTimeout(poll,50);};poll();})`);
  const pointers = new Map<BrowserWindow, Position>(windows.map((window) => [window, { x: 460, y: 440 }]));
  const publish = (window: BrowserWindow, position: Position, kind: NativePointer['kind']): void => {
    if (window !== source || !tracking) return;
    const [width, height] = source.getContentSize();
    const sample: NativePointer = { x: position.x / width, y: position.y / height, timestamp: Date.now(), kind, inside: true, ...(kind === 'click' ? { button: 'left' } : {}), ...(position.width && position.height ? { focus: { x: position.x / width, y: position.y / height, width: position.width / width, height: position.height / height, source: 'control' } } : {}) };
    editor.webContents.send(IPC.pointer, sample);
  };
  const move = async (window: BrowserWindow, position: Position): Promise<void> => {
    const previous = pointers.get(window) ?? position;
    for (let step = 1; step <= SETTINGS.moveSteps; step++) {
      const fraction = step / SETTINGS.moveSteps; const smooth = fraction * fraction * (3 - 2 * fraction);
      const next = { x: Math.round(previous.x + (position.x - previous.x) * smooth), y: Math.round(previous.y + (position.y - previous.y) * smooth) };
      window.webContents.sendInputEvent({ type: 'mouseMove', ...next }); publish(window, next, 'move');
      await delay(SETTINGS.moveDuration / SETTINGS.moveSteps);
    }
    pointers.set(window, position);
  };
  const click = async (window: BrowserWindow, target: Target): Promise<void> => {
    let position = await bounds(window, target); await move(window, position);
    const settledPosition = await bounds(window, target);
    if (Math.abs(settledPosition.x - position.x) > 2 || Math.abs(settledPosition.y - position.y) > 2) {
      position = settledPosition; await move(window, position);
    }
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: position.x, y: position.y }); publish(window, position, 'click');
    await delay(SETTINGS.clickHold);
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: position.x, y: position.y });
    await delay(SETTINGS.settle);
  };
  const insert = async (window: BrowserWindow, text: string): Promise<void> => { await window.webContents.insertText(text); publish(window, pointers.get(window) ?? { x: 600, y: 600 }, 'typing'); await delay(SETTINGS.settle); };
  const screenshot = async (window: BrowserWindow, name: string): Promise<void> => { await writeFile(path.join(OUTPUT, name), (await window.webContents.capturePage()).toPNG()); };
  const addCursor = (window: BrowserWindow): Promise<void> => evaluate<void>(window, `(()=>{const cursor=document.createElement('div');cursor.id='promo-cursor';cursor.style.cssText='position:fixed;left:0;top:0;width:26px;height:32px;z-index:100000;pointer-events:none;filter:drop-shadow(0 2px 2px #0009);transform:translate(460px,440px)';cursor.innerHTML='<svg viewBox="0 0 28 34" width="26" height="32"><path d="M3 2L3 27L10 20L16 31L22 28L16 18L26 18Z" fill="white" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';document.body.appendChild(cursor);document.addEventListener('pointermove',event=>{cursor.style.transform='translate('+event.clientX+'px,'+event.clientY+'px)';},true);})()`);
  const captureStudio = async (actions: () => Promise<void>): Promise<void> => {
    const encoder = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(SETTINGS.studioFps), '-i', 'pipe:0', '-an', '-vf', `scale=1665:1080,pad=1920:1080:127:0:color=0x101010,setpts=${SETTINGS.studioOutputDuration / SETTINGS.studioDuration}*PTS`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(SETTINGS.studioOutputDuration), '-movflags', '+faststart', path.join(OUTPUT, 'studio-edit.mp4')], { windowsHide: true });
    let stderr = ''; encoder.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    const completed = new Promise<void>((resolve, reject) => { encoder.once('error', reject); encoder.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr))); });
    const started = performance.now(); const actionPromise = actions();
    for (let index = 0; index < SETTINGS.studioDuration * SETTINGS.studioFps; index++) {
      await delay(Math.max(0, started + index * SETTINGS.milliseconds / SETTINGS.studioFps - performance.now()));
      const frame = (await editor.webContents.capturePage()).toJPEG(94);
      if (!encoder.stdin.write(frame)) await new Promise<void>((resolve) => encoder.stdin.once('drain', resolve));
    }
    await actionPromise; encoder.stdin.end(); await completed;
  };
  try {
    await Promise.all(windows.map((window) => window.loadFile(path.join(ROOT, 'dist', 'index.html'))));
    editor.showInactive(); source.showInactive();
    await Promise.all(windows.map(addCursor));
    await evaluate(editor, await readFile(path.join(OUTPUT, 'renderer.js'), 'utf8'));
    const studioOnly = process.argv.includes('--studio-only');
    let rawReport: Omit<RawCapture, 'bytes'>;
    if (studioOnly) {
      const report = JSON.parse(await readFile(path.join(OUTPUT, 'capture-report.json'), 'utf8')) as V2CaptureReport;
      rawReport = report.raw;
      const saved = (await library.list()).projects[0];
      if (!saved) throw new Error('PROMO_V2_SAVED_PROJECT_MISSING');
      const archive = await readFile(saved.path);
      await evaluate(editor, `cursoramaPromoV2.restoreRecordedProject(${quote(Array.from(archive))})`);
    } else {
    source.moveTop();
    await delay(500);
    await evaluate(editor, `cursoramaPromoV2.begin(${quote(source.getMediaSourceId())})`);
    const started = performance.now();
    const at = async (seconds: number, action: () => Promise<void>): Promise<void> => { await delay(Math.max(0, started + seconds * SETTINGS.milliseconds - performance.now())); await action(); };
    await at(0.4, () => click(source, { selector: '[data-action="open-settings"]' }));
    await at(1.5, () => click(source, { selector: '.theme-option:has(input[aria-label="' + t.appearance.light + '"])' }));
    await at(2.8, () => click(source, { selector: '.theme-option:has(input[aria-label="' + t.appearance.dark + '"])' }));
    await at(4.0, () => click(source, { selector: '[data-settings-page="storage"]' }));
    await at(5.2, () => click(source, { text: t.settings.close }));
    await at(6.0, () => click(source, { label: t.editor.newRecording }));
    await at(7.0, () => click(source, { text: t.recording.window }));
    await at(8.0, () => click(source, { selector: '.source-option' }));
    await at(9.0, () => click(source, { selector: '.prompter-setup summary' }));
    await at(9.6, () => click(source, { selector: '.prompter-setup textarea' }));
    await at(10.2, () => insert(source, '先明确目标，'));
    await at(10.8, () => insert(source, '再让观众看清'));
    await at(11.4, () => insert(source, '每一步。'));
    await at(12.0, async () => { const position = await bounds(source, { selector: '.prompter-setup textarea' }); source.webContents.sendInputEvent({ type: 'mouseWheel', x: position.x, y: position.y, deltaY: 240, deltaX: 0 }); publish(source, position, 'scroll'); });
    await at(13.0, () => click(source, { label: t.editor.close }));
    await at(14.0, () => click(source, { selector: '[data-page="library"]' }));
    await at(15.0, () => click(source, { selector: '[data-page="workspace"]' }));
    await delay(Math.max(0, started + SETTINGS.duration * SETTINGS.milliseconds - performance.now()));
    const raw = await evaluate<RawCapture>(editor, 'cursoramaPromoV2.finish()');
    const { bytes: discarded, ...metadata } = raw; void discarded; rawReport = metadata;
    await writeFile(path.join(OUTPUT, 'source-raw.webm'), Uint8Array.from(raw.bytes));
    const rawRequest: ExportRequest = { bytes: Uint8Array.from(raw.bytes).buffer, mimeType: 'video/webm', format: 'mp4', name: 'source-raw', quality: 'high', duration: SETTINGS.duration, fps: SETTINGS.fps };
    await encodeVideo(rawRequest, FFMPEG, path.join(OUTPUT, 'source-raw.mp4'), () => undefined);
    console.info(`PROMO_V2_RAW_READY:${raw.duration}:${raw.samples}:${raw.clips}`);
    source.hide(); editor.moveTop();
    await evaluate(editor, 'cursoramaPromoV2.render("focus")'); console.info('PROMO_V2_FOCUS_READY');
    await evaluate(editor, 'cursoramaPromoV2.render("cinematic")'); console.info('PROMO_V2_CINEMATIC_READY');
    }
    source.hide(); editor.moveTop();
    await captureStudio(async () => {
      await delay(300); await evaluate(editor, 'cursoramaPromoV2.importRecordedProject()');
      await delay(700);
      await click(editor, { text: t.editor.motion });
      await click(editor, { text: t.editor.focus });
      await evaluate(editor, `(()=>{const input=document.querySelector('.playback-progress');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'2.7');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await delay(250); await click(editor, { text: t.editor.background });
      await click(editor, { label: t.background.labels.dunes });
      await click(editor, { selector: '[data-action="open-audio"]' });
      await click(editor, { selector: '[data-soundtrack-id="clear-morning"] .soundtrack-add' });
      await evaluate(editor, `new Promise((resolve,reject)=>{const started=performance.now();const poll=()=>{if(document.querySelector('.music-track .media-clip'))resolve(true);else if(performance.now()-started>15000)reject(new Error('PROMO_V2_MUSIC_NOT_INSERTED'));else setTimeout(poll,50)};poll()})`);
      await delay(500);
      await click(editor, { label: t.editing.addSubtitle });
      await click(editor, { selector: '.subtitle-editor' });
      editor.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
      editor.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
      await insert(editor, '每一步，都看得清楚。');
      await delay(200);
      await screenshot(editor, 'poster.png');
      await screenshot(editor, 'editor.png');
      await delay(650); await click(editor, { text: t.editor.exportVideo });
      if (!await evaluate<boolean>(editor, 'Boolean(document.querySelector(".export-summary"))')) { await delay(500); await click(editor, { text: t.editor.exportVideo }); }
      await move(editor, { x: 1120, y: 760 });
    });
    await screenshot(editor, 'export.png');
    await click(editor, { selector: '.modal-footer .primary-button' });
    await evaluate(editor, `new Promise((resolve,reject)=>{const started=performance.now();const poll=()=>{if(document.querySelector('.export-success'))resolve(true);else if(document.querySelector('.error-message'))reject(new Error(document.querySelector('.error-message').textContent));else if(performance.now()-started>120000)reject(new Error('PROMO_V2_UI_EXPORT_TIMEOUT'));else setTimeout(poll,100)};poll()})`);
    const projectId = await evaluate<string>(editor, `document.querySelector('.project-bar').dataset.projectId`);
    const exported = (await library.list()).projects.find((item) => item.id === projectId)?.videos.at(-1);
    if (!exported) throw new Error('PROMO_V2_FINISHED_EXPORT_MISSING');
    await copyFile(exported.path, path.join(OUTPUT, 'edited-result.mp4'));
    const report: V2CaptureReport = { raw: rawReport, exports: ['source-raw.mp4', 'result-focus.mp4', 'result-cinematic.mp4', 'studio-edit.mp4', 'edited-result.mp4'], errors };
    await writeFile(path.join(OUTPUT, 'capture-report.json'), JSON.stringify(report, null, 2));
    await screenshot(editor, 'export-complete.png');
    const poster = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2.7', '-i', path.join(OUTPUT, 'result-focus.mp4'), '-frames:v', '1', path.join(OUTPUT, 'poster.png')], { windowsHide: true });
    await new Promise<void>((resolve, reject) => { poster.once('error', reject); poster.once('close', (code) => code === 0 ? resolve() : reject(new Error('PROMO_V2_POSTER_FAILED'))); });
    for (const window of windows) window.destroy(); app.exit(0);
  } catch (error) { console.error('PROMO_V2_FAILED', error); await screenshot(editor, 'failure.png'); for (const window of windows) window.destroy(); app.exit(1); }
}).catch((error: unknown) => { console.error('PROMO_V2_START_FAILED', error); app.exit(1); });
