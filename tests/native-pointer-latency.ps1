param([string]$TrackerPath = (Join-Path $PSScriptRoot '..\native\pointer-tracker.ps1'))
$ErrorActionPreference = 'Stop'
$definition = [IO.File]::ReadAllText($TrackerPath)
$sourceStart = $definition.IndexOf('using System;')
$sourceEnd = $definition.IndexOf("'@", $sourceStart)
$nativeSource = $definition.Substring($sourceStart, $sourceEnd - $sourceStart)
$probeSource = @'
public static class PointerLatencyProbe
{
    private const int MouseHook = 14;
    private const uint MouseMove = 0x0200;
    private const uint MoveInput = 0x0001;
    private const uint QuitMessage = 0x0012;
    private const uint Marker = 0x43555241;
    private const int TimeoutMilliseconds = 3000;
    private const int SampleCount = 48;
    private const int OutputStallMilliseconds = 150;
    private const int DelayVariants = 7;
    private static readonly AutoResetEvent Delivered = new AutoResetEvent(false);
    private static readonly ManualResetEvent ObserverReady = new ManualResetEvent(false);
    private static readonly HookCallback Observer = Observe;
    private static long sent;
    private static double latency;
    private static uint observerThread;
    private static Exception failure;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseData { public Point Position; public uint Data; public uint Flags; public uint Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { public int X; public int Y; public uint Data; public uint Flags; public uint Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Explicit, Size = 32)]
    private struct InputData { [FieldOffset(0)] public MouseInput Mouse; }
    [StructLayout(LayoutKind.Explicit, Size = 40)]
    private struct Input { [FieldOffset(0)] public uint Type; [FieldOffset(8)] public InputData Data; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr Parameter; public IntPtr Data; public uint Time; public Point Position; public uint Private; }
    private delegate IntPtr HookCallback(int code, IntPtr parameter, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int hook, HookCallback callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr parameter, IntPtr data);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint minimum, uint maximum);
    [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr parameter, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] private static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

    private sealed class CaptureOutput : System.IO.TextWriter
    {
        public readonly ManualResetEvent Ready = new ManualResetEvent(false);
        public readonly ManualResetEvent Blocked = new ManualResetEvent(false);
        public readonly ManualResetEvent Released = new ManualResetEvent(false);
        public override System.Text.Encoding Encoding { get { return System.Text.Encoding.UTF8; } }
        public override void WriteLine(string value)
        {
            if (value == "READY") { Ready.Set(); return; }
            if (Blocked.WaitOne(0)) return;
            Blocked.Set();
            // 模拟 Electron 忙碌、标准输出管道暂时无法消费数据。
            Released.WaitOne(TimeoutMilliseconds);
        }
    }

    private static IntPtr Observe(int code, IntPtr parameter, IntPtr data)
    {
        if (code >= 0 && parameter.ToInt64() == MouseMove)
        {
            var mouse = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
            if (mouse.Extra.ToUInt64() == Marker)
            {
                latency = (Stopwatch.GetTimestamp() - Interlocked.Read(ref sent)) * 1000.0 / Stopwatch.Frequency;
                Delivered.Set();
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, parameter, data);
    }

    private static void ObserveInput()
    {
        observerThread = GetCurrentThreadId();
        IntPtr hook = SetWindowsHookEx(MouseHook, Observer, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { failure = new Win32Exception(Marshal.GetLastWin32Error()); ObserverReady.Set(); return; }
        try
        {
            ObserverReady.Set();
            Message message;
            while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { }
        }
        finally { UnhookWindowsHookEx(hook); }
    }

    private static double Measure()
    {
        Delivered.Reset();
        var input = new Input { Data = new InputData { Mouse = new MouseInput { X = 1, Flags = MoveInput, Extra = new UIntPtr(Marker) } } };
        Interlocked.Exchange(ref sent, Stopwatch.GetTimestamp());
        // 一像素往返，不点击、不滚动。
        var restore = new Input { Data = new InputData { Mouse = new MouseInput { X = -1, Flags = MoveInput } } };
        if (SendInput(2, new[] { input, restore }, Marshal.SizeOf(typeof(Input))) != 2) throw new Win32Exception(Marshal.GetLastWin32Error());
        if (!Delivered.WaitOne(TimeoutMilliseconds)) throw new TimeoutException("POINTER_INPUT_TIMEOUT");
        return latency;
    }

    private static double[] MeasureSeries()
    {
        var result = new double[SampleCount];
        for (int index = 0; index < result.Length; index++)
        {
            Thread.Sleep(index % DelayVariants + 1);
            result[index] = Measure();
        }
        Array.Sort(result);
        return result;
    }

    private static void StopTracker(Thread tracker)
    {
        if (tracker == null || !tracker.IsAlive) return;
        tracker.Interrupt();
        if (!tracker.Join(TimeoutMilliseconds)) throw new TimeoutException("POINTER_TRACKER_STOP_TIMEOUT");
    }

    public static string Run()
    {
        var observer = new Thread(ObserveInput) { IsBackground = true };
        observer.Start();
        if (!ObserverReady.WaitOne(TimeoutMilliseconds)) throw new TimeoutException("POINTER_OBSERVER_TIMEOUT");
        if (failure != null) throw failure;
        var output = new CaptureOutput();
        var originalOutput = Console.Out;
        Thread tracker = null;
        try
        {
            var baseline = MeasureSeries();
            Console.SetOut(output);
            tracker = new Thread(() =>
            {
                try { CursoramaPointer.Run(0); }
                catch (ThreadInterruptedException) { output.Released.Set(); }
                catch (Exception error) { failure = error; output.Ready.Set(); }
            }) { IsBackground = true };
            tracker.Start();
            if (!output.Ready.WaitOne(TimeoutMilliseconds)) throw new TimeoutException("POINTER_TRACKER_TIMEOUT");
            if (failure != null) throw failure;
            if (!output.Blocked.WaitOne(TimeoutMilliseconds)) throw new TimeoutException("POINTER_OUTPUT_NOT_EXERCISED");
            var release = new Thread(() => { Thread.Sleep(OutputStallMilliseconds); output.Released.Set(); }) { IsBackground = true };
            release.Start();
            double blocked = Measure();
            release.Join();
            var active = MeasureSeries();
            if (failure != null) throw failure;
            StopTracker(tracker);
            double stopped = Measure();
            int median = SampleCount / 2;
            int percentile = (int)(SampleCount * 0.95);
            return string.Format(CultureInfo.InvariantCulture,
                "{{\"baselineMedianMs\":{0:F3},\"baselineP95Ms\":{1:F3},\"trackingMedianMs\":{2:F3},\"trackingP95Ms\":{3:F3},\"blockedOutputLatencyMs\":{4:F3},\"stoppedLatencyMs\":{5:F3}",
                new object[] { baseline[median], baseline[percentile], active[median], active[percentile], blocked, stopped }) + "}";
        }
        finally
        {
            output.Released.Set();
            StopTracker(tracker);
            Console.SetOut(originalOutput);
            PostThreadMessage(observerThread, QuitMessage, UIntPtr.Zero, IntPtr.Zero);
            observer.Join(TimeoutMilliseconds);
        }
    }
}
'@
$frameworkDirectory = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
Add-Type -AssemblyName Accessibility, UIAutomationClient, UIAutomationTypes, WindowsBase
$assemblies = @('System.dll', 'System.Core.dll', [Accessibility.IAccessible].Assembly.Location, (Join-Path $frameworkDirectory 'WPF\UIAutomationClient.dll'), (Join-Path $frameworkDirectory 'WPF\UIAutomationTypes.dll'), (Join-Path $frameworkDirectory 'WPF\WindowsBase.dll'))
Add-Type -TypeDefinition ($nativeSource + $probeSource) -Language CSharp -ReferencedAssemblies $assemblies
[PointerLatencyProbe]::Run()
