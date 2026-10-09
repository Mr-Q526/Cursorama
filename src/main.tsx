import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import './styles/themes.css';
import { t } from './i18n';
import { RecordingSurfaceApp } from './components';

const element = document.getElementById('root');
document.title = t.editor.appName;
if (!element) throw new Error('ROOT_ELEMENT_MISSING');
const surface = window.location.hash.slice(2);
if (window.desktop && (surface === 'recording-dock' || surface === 'teleprompter')) {
  document.body.classList.add('recording-surface-body');
  createRoot(element).render(<RecordingSurfaceApp surface={surface} />);
} else createRoot(element).render(<App />);

export { App };
