/** 独立的宣传片渲染窗口，不加载用户工程或修改用户应用设置。 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const SIZE = { width: 1920, height: 1080 };
const rendererRoot = process.env.CURSORAMA_PROMO_RENDER_WORKSPACE ? path.resolve(process.env.CURSORAMA_PROMO_RENDER_WORKSPACE) : path.resolve(__dirname, '../../.qa/promo');
app.setPath('userData', path.join(rendererRoot, 'render-profile'));
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ ...SIZE, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  await window.loadFile(path.join(rendererRoot, 'render.html'));
}).catch((error) => { console.error('PROMO_RENDER_WINDOW_FAILED', error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
