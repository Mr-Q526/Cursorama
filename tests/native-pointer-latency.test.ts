import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

export interface PointerLatencyReport {
  baselineMedianMs: number;
  baselineP95Ms: number;
  trackingMedianMs: number;
  trackingP95Ms: number;
  blockedOutputLatencyMs: number;
  stoppedLatencyMs: number;
}

const QA = { timeout: 30_000, medianBudget: 4, p95Budget: 8, blockedOutputBudget: 50 } as const;
const run = promisify(execFile);

describe.runIf(process.platform === 'win32' && process.arch === 'x64')('原生鼠标输入延迟回归', () => {
  it('启用追踪和输出阻塞时，全局输入仍能及时传递', async () => {
    const { stdout } = await run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.resolve('tests/native-pointer-latency.ps1'),
    ], { windowsHide: true, timeout: QA.timeout });
    const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith('{"baselineMedianMs"'));
    expect(line).toBeDefined();
    const report = JSON.parse(line ?? '{}') as PointerLatencyReport;
    expect(report.trackingMedianMs).toBeLessThan(report.baselineMedianMs + QA.medianBudget);
    expect(report.trackingP95Ms).toBeLessThan(report.baselineP95Ms + QA.p95Budget);
    expect(report.blockedOutputLatencyMs).toBeLessThan(QA.blockedOutputBudget);
    expect(report.stoppedLatencyMs).toBeLessThan(report.baselineP95Ms + QA.p95Budget);
  }, QA.timeout);
});
