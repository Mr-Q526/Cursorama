import { spawn } from 'node:child_process';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { NativePointer } from '../shared';

export interface NativeFocusReport { focusedControl: boolean; inputActivity: boolean; normalized: boolean; noInputContent: boolean; }
const FOCUS_QA = { timeout: 15_000, minimumControlWidth: 0.02, activityKey: 0x41, keyDown: 0x0100 } as const;

export async function runNativeFocusQA(window: BrowserWindow, root: string, sourceId: string): Promise<NativeFocusReport> {
  const inputName = await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('.project-name'); input.focus(); return input.getAttribute('aria-label'); })()`, true) as string;
  const handle = sourceId.split(':')[1];
  if (!/^\d+$/.test(handle)) throw new Error('QA_FOCUS_WINDOW_HANDLE');
  const tracker = path.join(root, 'native', 'pointer-tracker.ps1').replaceAll("'", "''");
  const name = inputName.replaceAll("'", "''");
  const script = `
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    $definition = [IO.File]::ReadAllText('${tracker}')
    $run = $definition.LastIndexOf('[CursoramaPointer]::Run')
    Invoke-Expression $definition.Substring(0, $run)
    $flags = [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Static
    $type = [CursoramaPointer]
    $null = $type.GetMethod('SetProcessDpiAwarenessContext', $flags).Invoke($null, @([IntPtr]::new(-4)))
    $foreground = [IntPtr]::new(${handle})
    $windowRoot = [System.Windows.Automation.AutomationElement]::FromHandle($foreground)
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '${name}')
    $inputElement = $windowRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    $focus = $type.GetMethod('ElementFocus', $flags).Invoke($null, @($foreground, $inputElement))
    if (-not $focus) { throw 'QA_FOCUS_CONTROL_UNAVAILABLE' }
    $keyType = $type.GetNestedType('KeyboardData', [Reflection.BindingFlags]::NonPublic)
    $key = [Activator]::CreateInstance($keyType)
    $keyType.GetField('Key').SetValue($key, [uint32]${FOCUS_QA.activityKey})
    $memory = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($key))
    try {
      [Runtime.InteropServices.Marshal]::StructureToPtr($key, $memory, $false)
      $null = $type.GetMethod('OnKeyboard', $flags).Invoke($null, @([int]0, [IntPtr]::new(${FOCUS_QA.keyDown}), $memory))
      if ($type.GetField('keyboardActivity', $flags).GetValue($null) -ne 1) { throw 'QA_FOCUS_ACTIVITY' }
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($memory) }
    $bounds = $focus.GetType().GetField('Bounds').GetValue($focus)
    $pointType = $type.GetNestedType('Point', [Reflection.BindingFlags]::NonPublic)
    $point = [Activator]::CreateInstance($pointType)
    $pointType.GetField('X').SetValue($point, [int](($bounds.Left + $bounds.Right) / 2))
    $pointType.GetField('Y').SetValue($point, [int](($bounds.Top + $bounds.Bottom) / 2))
    $null = $type.GetMethod('Emit', $flags).Invoke($null, @($point, [long]${handle}, 'typing', $null, $focus))
  `;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    let result = ''; let diagnostic = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('QA_NATIVE_FOCUS_TIMEOUT')); }, FOCUS_QA.timeout);
    child.stdout.on('data', (chunk: Buffer) => { result += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { diagnostic += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); if (code === 0) resolve(result); else reject(new Error(`QA_NATIVE_FOCUS_FAILED:${diagnostic}`)); });
  });
  const protocol = output.split(/\r?\n/).find((line) => line.startsWith('{'));
  if (!protocol) throw new Error('QA_NATIVE_FOCUS_PROTOCOL');
  const event = JSON.parse(protocol) as NativePointer;
  if (event.kind !== 'typing' || !event.inside || event.focus?.source !== 'control' || event.focus.x < 0 || event.focus.x > 1 || event.focus.y < 0 || event.focus.y > 1 || event.focus.width < FOCUS_QA.minimumControlWidth || event.focus.width > 1) throw new Error('QA_NATIVE_FOCUS_REGION');
  if (Object.keys(event).some((key) => /key|text|password/i.test(key))) throw new Error('QA_NATIVE_FOCUS_CONTENT');
  return { focusedControl: true, inputActivity: true, normalized: true, noInputContent: true };
}
