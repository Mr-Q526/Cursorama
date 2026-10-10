import { t } from '../src/i18n';
import { backgroundImageFixture } from './background-image-qa';

export interface BackgroundUIReport { upload: boolean; preview: boolean; switching: boolean; dialog: boolean; removed: boolean; }

const BACKGROUND_UI = { poll: 40, timeout: 6000, paint: 180, samplePosition: 0.03, tolerance: 8, expected: [36, 84, 123], name: '工程背景验证.png' } as const;

async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + BACKGROUND_UI.timeout;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error('QA_BACKGROUND_UI_TIMEOUT');
    await new Promise<void>((resolve) => setTimeout(resolve, BACKGROUND_UI.poll));
  }
}

export async function runCustomBackgroundUIQA(): Promise<BackgroundUIReport> {
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('.inspector-tabs button')).find((button) => button.textContent === t.editor.background);
  tab?.click();
  await until(() => Boolean(document.querySelector('.inspector [data-action="custom-background-input"]')));
  const input = document.querySelector<HTMLInputElement>('.inspector [data-action="custom-background-input"]');
  if (!input || input.disabled) throw new Error('QA_BACKGROUND_UPLOAD_MISSING');
  const fixture = backgroundImageFixture();
  const blob = await new Promise<Blob>((resolve, reject) => fixture.toBlob((value) => value ? resolve(value) : reject(new Error('QA_BACKGROUND_UI_FIXTURE')), 'image/png'));
  const files = new DataTransfer(); files.items.add(new File([blob], BACKGROUND_UI.name, { type: 'image/png' }));
  input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => {
    const image = document.querySelector<HTMLImageElement>('.inspector .custom-background-card.selected img');
    return Boolean(image?.complete && image.naturalWidth === fixture.width);
  });
  await until(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.preview-stage canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return false;
    const pixel = context.getImageData(Math.floor(canvas.width * BACKGROUND_UI.samplePosition), Math.floor(canvas.height * BACKGROUND_UI.samplePosition), 1, 1).data;
    return BACKGROUND_UI.expected.every((channel, index) => Math.abs(pixel[index] - channel) <= BACKGROUND_UI.tolerance);
  });
  const wallpaper = document.querySelector<HTMLButtonElement>(`.inspector [aria-label="${t.background.labels.bloom}"]`);
  wallpaper?.click();
  await until(() => Boolean(document.querySelector('.inspector .custom-background-card:not(.selected)')));
  document.querySelector<HTMLButtonElement>('.inspector .custom-background-card')?.click();
  await until(() => Boolean(document.querySelector('.inspector .custom-background-card.selected')));
  document.querySelector<HTMLButtonElement>('[data-action="more-backgrounds"]')?.click();
  await until(() => Boolean(document.querySelector('.background-library-dialog [data-action="custom-background-input"]')));
  const close = Array.from(document.querySelectorAll<HTMLButtonElement>('.background-library-dialog button')).find((button) => button.textContent === t.background.done);
  close?.click();
  await until(() => !document.querySelector('.background-library-dialog'));
  document.querySelector<HTMLButtonElement>(`.inspector [aria-label="${t.customBackground.remove}"]`)?.click();
  await until(() => !document.querySelector('.inspector .custom-background-card') && Boolean(document.querySelector('.inspector [data-action="import-background-image"]')));
  return { upload: true, preview: true, switching: true, dialog: true, removed: true };
}
