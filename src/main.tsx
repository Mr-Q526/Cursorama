import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import './styles/themes.css';
import { t } from './i18n';

const element = document.getElementById('root');
document.title = t.editor.appName;
if (!element) throw new Error('ROOT_ELEMENT_MISSING');
createRoot(element).render(<App />);

export { App };
