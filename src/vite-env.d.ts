import type { DesktopBridge } from '../shared';

declare global {
  interface Window { desktop?: DesktopBridge; }
}

export {};
