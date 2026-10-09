import { rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export type RenameOperation = (source: string, target: string) => Promise<void>;
const REPLACE_RETRY = { attempts: 5, delay: 60 } as const;
const TRANSIENT_LOCKS = new Set(['EPERM', 'EACCES', 'EBUSY']);

export async function atomicReplace(source: string, target: string, replace: RenameOperation = rename): Promise<void> {
  for (let attempt = 0; attempt < REPLACE_RETRY.attempts; attempt++) {
    try { await replace(source, target); return; }
    catch (error) {
      if (process.platform !== 'win32' || !TRANSIENT_LOCKS.has((error as NodeJS.ErrnoException).code ?? '') || attempt === REPLACE_RETRY.attempts - 1) throw error;
      await setTimeout(REPLACE_RETRY.delay * (attempt + 1));
    }
  }
}
