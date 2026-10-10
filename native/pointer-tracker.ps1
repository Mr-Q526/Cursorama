param([long]$WindowHandle = 0)
$ErrorActionPreference = 'Stop'
$nativeSource = @'
using System;
using System.Diagnostics;
using System.ComponentModel;
using System.Collections.Concurrent;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using Accessibility;

public static class CursoramaPointer
{
    private const int PollIntervalMilliseconds = 16;
    private const int LeftButton = 0x01;
    private const int RightButton = 0x02;
    private const int ExtendedFrameBounds = 9;
    private const int KeyboardHook = 13;
    private const int MouseHook = 14;
    private const int KeyDown = 0x0100;
    private const int SystemKeyDown = 0x0104;
    private const int MouseWheel = 0x020A;
    private const int HorizontalMouseWheel = 0x020E;
    private const int LeftButtonDown = 0x0201;
    private const int RightButtonDown = 0x0204;
    private const uint CaretObject = 0xFFFFFFF8;
    private const int InvisibleOrOffscreen = 0x18000;
    private const int SelfChild = 0;
    private const uint RemoveMessage = 0x0001;
    private const uint RootWindow = 2;
    private const int ActivityIntervalMilliseconds = 140;
    private const int FocusQueryIntervalMilliseconds = 240;
    private const int FocusCacheLifetimeMilliseconds = 1000;
    private const int FocusQueryIdleMilliseconds = 3000;
    private const double SmallControlWidthRatio = 0.6;
    private const double SmallControlHeightRatio = 0.2;
    private const short ButtonDownMask = unchecked((short)0x8000);
    private static readonly CultureInfo NumberCulture = CultureInfo.InvariantCulture;
    private static readonly Stopwatch Clock = Stopwatch.StartNew();
    private static readonly HookCallback KeyboardCallback = OnKeyboard;
    private static readonly HookCallback MouseCallback = OnMouse;
    private static readonly ConcurrentQueue<ClickInfo> Clicks = new ConcurrentQueue<ClickInfo>();
    private static int keyboardActivity;
    private static int scrollActivity;
    private static long lastKeyboard = -FocusQueryIdleMilliseconds;
    private static FocusInfo cachedFocus;
    private static volatile bool running;
    private enum EditingKey : uint
    {
        Backspace = 0x08, Tab = 0x09, Enter = 0x0D, Space = 0x20, PageUp = 0x21, Down = 0x28,
        Delete = 0x2E, DigitStart = 0x30, LetterEnd = 0x5A, NumpadStart = 0x60, NumpadEnd = 0x6F,
        PunctuationStart = 0xBA, PunctuationEnd = 0xE2, InputMethod = 0xE5, UnicodePacket = 0xE7
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct GuiThreadInfo
    {
        public int Size; public uint Flags; public IntPtr Active; public IntPtr Focus; public IntPtr Capture;
        public IntPtr MenuOwner; public IntPtr MoveSize; public IntPtr Caret; public Rect CaretRect;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardData { public uint Key; public uint Scan; public uint Flags; public uint Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseData { public Point Position; public uint Data; public uint Flags; public uint Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr Window; public uint Id; public UIntPtr Parameter; public IntPtr Data; public uint Time; public Point Position; public uint Private; }
    private sealed class FocusInfo
    {
        public Rect Bounds; public IntPtr Window; public string Source; public long Time;
    }
    private sealed class ClickInfo { public Point Position; public string Button; }
    private delegate IntPtr HookCallback(int code, IntPtr parameter, IntPtr data);

    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiThreadInfo info);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int hook, HookCallback callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr parameter, IntPtr data);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, IntPtr window, uint minimum, uint maximum, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] private static extern IntPtr GetModuleHandle(string name);
    [DllImport("oleacc.dll")] private static extern int AccessibleObjectFromWindow(IntPtr window, uint objectId, ref Guid identifier, [MarshalAs(UnmanagedType.Interface)] out IAccessible accessible);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);

    private static IntPtr OnKeyboard(int code, IntPtr parameter, IntPtr data)
    {
        if (code >= 0 && (parameter.ToInt32() == KeyDown || parameter.ToInt32() == SystemKeyDown))
        {
            uint key = ((KeyboardData)Marshal.PtrToStructure(data, typeof(KeyboardData))).Key;
            // 只保留操作发生的信号，不传输或保存按键、文字、密码。
            if ((key >= (uint)EditingKey.DigitStart && key <= (uint)EditingKey.LetterEnd) || (key >= (uint)EditingKey.NumpadStart && key <= (uint)EditingKey.NumpadEnd) ||
                (key >= (uint)EditingKey.PunctuationStart && key <= (uint)EditingKey.PunctuationEnd) || key == (uint)EditingKey.Backspace || key == (uint)EditingKey.Tab || key == (uint)EditingKey.Enter ||
                key == (uint)EditingKey.Space || (key >= (uint)EditingKey.PageUp && key <= (uint)EditingKey.Down) || key == (uint)EditingKey.Delete || key == (uint)EditingKey.InputMethod || key == (uint)EditingKey.UnicodePacket)
            {
                Interlocked.Exchange(ref lastKeyboard, Clock.ElapsedMilliseconds);
                Interlocked.Exchange(ref keyboardActivity, 1);
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, parameter, data);
    }

    private static IntPtr OnMouse(int code, IntPtr parameter, IntPtr data)
    {
        if (code >= 0 && (parameter.ToInt32() == MouseWheel || parameter.ToInt32() == HorizontalMouseWheel))
            Interlocked.Exchange(ref scrollActivity, 1);
        if (code >= 0 && (parameter.ToInt32() == LeftButtonDown || parameter.ToInt32() == RightButtonDown))
            Clicks.Enqueue(new ClickInfo { Position = ((MouseData)Marshal.PtrToStructure(data, typeof(MouseData))).Position, Button = parameter.ToInt32() == LeftButtonDown ? "left" : "right" });
        return CallNextHookEx(IntPtr.Zero, code, parameter, data);
    }

    private static bool RecordedForeground(long handle, IntPtr foreground)
    {
        return foreground != IntPtr.Zero && (handle == 0 || GetAncestor(foreground, RootWindow) == GetAncestor(new IntPtr(handle), RootWindow));
    }

    private static FocusInfo NativeCaret(IntPtr foreground)
    {
        uint process;
        uint thread = GetWindowThreadProcessId(foreground, out process);
        var info = new GuiThreadInfo { Size = Marshal.SizeOf(typeof(GuiThreadInfo)) };
        if (!GetGUIThreadInfo(thread, ref info) || info.Caret == IntPtr.Zero) return null;
        var start = new Point { X = info.CaretRect.Left, Y = info.CaretRect.Top };
        var end = new Point { X = info.CaretRect.Right, Y = info.CaretRect.Bottom };
        if (!ClientToScreen(info.Caret, ref start) || !ClientToScreen(info.Caret, ref end) || end.Y <= start.Y) return null;
        return new FocusInfo { Bounds = new Rect { Left = start.X, Top = start.Y, Right = end.X, Bottom = end.Y }, Window = foreground, Source = "caret", Time = Clock.ElapsedMilliseconds };
    }

    private static FocusInfo AccessibleFocus(IntPtr foreground)
    {
        var element = AutomationElement.FocusedElement;
        return ElementFocus(foreground, element);
    }

    private static FocusInfo ElementFocus(IntPtr foreground, AutomationElement element)
    {
        if (element == null) return null;
        var current = element.Current;
        uint process;
        GetWindowThreadProcessId(foreground, out process);
        if (current.ProcessId != process) return null;
        object value;
        bool editable = current.ControlType == ControlType.Edit ||
            (element.TryGetCurrentPattern(ValuePattern.Pattern, out value) && !((ValuePattern)value).Current.IsReadOnly);
        var rectangle = current.BoundingRectangle;
        Rect windowBounds;
        if (editable && !rectangle.IsEmpty && GetWindowRect(foreground, out windowBounds) &&
            rectangle.Width <= (windowBounds.Right - windowBounds.Left) * SmallControlWidthRatio &&
            rectangle.Height <= (windowBounds.Bottom - windowBounds.Top) * SmallControlHeightRatio)
            return new FocusInfo { Bounds = new Rect { Left = (int)rectangle.Left, Top = (int)rectangle.Top, Right = (int)rectangle.Right, Bottom = (int)rectangle.Bottom }, Window = foreground, Source = "control", Time = Clock.ElapsedMilliseconds };
        object text;
        if (!element.TryGetCurrentPattern(TextPattern.Pattern, out text)) return null;
        var ranges = ((TextPattern)text).GetSelection();
        if (ranges.Length != 1) return null;
        var rectangles = ranges[0].GetBoundingRectangles();
        if (rectangles.Length != 1 || rectangles[0].IsEmpty) return null;
        rectangle = rectangles[0];
        return new FocusInfo { Bounds = new Rect { Left = (int)rectangle.Left, Top = (int)rectangle.Top, Right = (int)rectangle.Right, Bottom = (int)rectangle.Bottom }, Window = foreground, Source = "caret", Time = Clock.ElapsedMilliseconds };
    }

    private static FocusInfo LegacyCaret(IntPtr foreground)
    {
        uint process;
        var thread = GetWindowThreadProcessId(foreground, out process);
        var info = new GuiThreadInfo { Size = Marshal.SizeOf(typeof(GuiThreadInfo)) };
        if (!GetGUIThreadInfo(thread, ref info)) return null;
        var identifier = typeof(IAccessible).GUID;
        IAccessible accessible;
        if (AccessibleObjectFromWindow(info.Focus != IntPtr.Zero ? info.Focus : foreground, CaretObject, ref identifier, out accessible) != 0 || accessible == null) return null;
        try
        {
            if ((Convert.ToInt32(accessible.get_accState(SelfChild)) & InvisibleOrOffscreen) != 0) return null;
            int left; int top; int width; int height;
            accessible.accLocation(out left, out top, out width, out height, SelfChild);
            if (height <= 0) return null;
            return new FocusInfo { Bounds = new Rect { Left = left, Top = top, Right = left + width, Bottom = top + height }, Window = foreground, Source = "caret", Time = Clock.ElapsedMilliseconds };
        }
        finally { Marshal.ReleaseComObject(accessible); }
    }

    private static void QueryFocus(long handle)
    {
        while (running)
        {
            if (Clock.ElapsedMilliseconds - Interlocked.Read(ref lastKeyboard) < FocusQueryIdleMilliseconds)
            {
                IntPtr foreground = GetForegroundWindow();
                if (RecordedForeground(handle, foreground))
                {
                    try { Interlocked.Exchange(ref cachedFocus, AccessibleFocus(foreground) ?? LegacyCaret(foreground)); }
                    catch (Exception error) { Trace.TraceWarning("FOCUS_QUERY_UNAVAILABLE: {0}", error.GetType().Name); Interlocked.Exchange(ref cachedFocus, null); }
                }
                else Interlocked.Exchange(ref cachedFocus, null);
            }
            Thread.Sleep(FocusQueryIntervalMilliseconds);
        }
    }

    private static FocusInfo ActiveFocus(long handle)
    {
        IntPtr foreground = GetForegroundWindow();
        if (!RecordedForeground(handle, foreground)) return null;
        var accessible = Interlocked.CompareExchange(ref cachedFocus, null, null);
        if (accessible != null && accessible.Window == foreground && Clock.ElapsedMilliseconds - accessible.Time <= FocusCacheLifetimeMilliseconds) return accessible;
        return NativeCaret(foreground);
    }

    private static void Emit(Point point, long handle, string kind, string button, FocusInfo focus = null)
    {
        double x = point.X;
        double y = point.Y;
        bool normalized = handle != 0;
        bool inside = true;
        Rect bounds = new Rect();
        if (normalized)
        {
            var window = new IntPtr(handle);
            if (!IsWindow(window)) return;
            if (DwmGetWindowAttribute(window, ExtendedFrameBounds, out bounds, Marshal.SizeOf(typeof(Rect))) != 0)
                if (!GetWindowRect(window, out bounds)) return;
            int width = bounds.Right - bounds.Left;
            int height = bounds.Bottom - bounds.Top;
            if (width <= 0 || height <= 0) return;
            x = (point.X - bounds.Left) / (double)width;
            y = (point.Y - bounds.Top) / (double)height;
            inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
        }
        string focusField = "";
        if (focus != null)
        {
            double focusX = (focus.Bounds.Left + focus.Bounds.Right) / 2.0;
            double focusY = (focus.Bounds.Top + focus.Bounds.Bottom) / 2.0;
            double width = focus.Bounds.Right - focus.Bounds.Left;
            double height = focus.Bounds.Bottom - focus.Bounds.Top;
            if (normalized)
            {
                focusX = (focusX - bounds.Left) / (bounds.Right - bounds.Left);
                focusY = (focusY - bounds.Top) / (bounds.Bottom - bounds.Top);
                width /= bounds.Right - bounds.Left;
                height /= bounds.Bottom - bounds.Top;
                inside = focusX >= 0 && focusX <= 1 && focusY >= 0 && focusY <= 1;
            }
            focusField = ",\"focus\":{\"x\":" + focusX.ToString("F6", NumberCulture) + ",\"y\":" + focusY.ToString("F6", NumberCulture) +
                ",\"width\":" + width.ToString("F6", NumberCulture) + ",\"height\":" + height.ToString("F6", NumberCulture) + ",\"source\":\"" + focus.Source + "\"}";
        }
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string buttonField = button == null ? "" : ",\"button\":\"" + button + "\"";
        Console.WriteLine("{\"x\":" + x.ToString("F6", NumberCulture) + ",\"y\":" + y.ToString("F6", NumberCulture) +
            ",\"screenX\":" + point.X + ",\"screenY\":" + point.Y + ",\"timestamp\":" + timestamp + ",\"kind\":\"" + kind + "\",\"normalized\":" +
            normalized.ToString().ToLowerInvariant() + ",\"inside\":" + inside.ToString().ToLowerInvariant() + buttonField + focusField + "}");
    }

    public static void Run(long handle)
    {
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        IntPtr keyboardHook = SetWindowsHookEx(KeyboardHook, KeyboardCallback, GetModuleHandle(null), 0);
        IntPtr mouseHook = SetWindowsHookEx(MouseHook, MouseCallback, GetModuleHandle(null), 0);
        if (keyboardHook == IntPtr.Zero || mouseHook == IntPtr.Zero)
        {
            int error = Marshal.GetLastWin32Error();
            if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
            if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
            throw new Win32Exception(error);
        }
        running = true;
        var focusThread = new Thread(() => QueryFocus(handle)) { IsBackground = true };
        focusThread.SetApartmentState(ApartmentState.MTA); focusThread.Start();
        bool previousLeft = (GetAsyncKeyState(LeftButton) & ButtonDownMask) != 0;
        Point previousPoint = new Point { X = int.MinValue, Y = int.MinValue };
        long previousTyping = -ActivityIntervalMilliseconds;
        long previousDrag = -ActivityIntervalMilliseconds;
        Console.WriteLine("READY");
        try
        {
            while (true)
            {
                Message message;
                while (PeekMessage(out message, IntPtr.Zero, 0, 0, RemoveMessage)) { TranslateMessage(ref message); DispatchMessage(ref message); }
                Point point;
                if (GetCursorPos(out point))
                {
                    long now = Clock.ElapsedMilliseconds;
                    bool left = (GetAsyncKeyState(LeftButton) & ButtonDownMask) != 0;
                    bool moved = point.X != previousPoint.X || point.Y != previousPoint.Y;
                    if (moved) Emit(point, handle, "move", null);
                    ClickInfo click;
                    while (Clicks.TryDequeue(out click)) Emit(click.Position, handle, "click", click.Button);
                    if (left && previousLeft && moved && now - previousDrag >= ActivityIntervalMilliseconds) { Emit(point, handle, "drag", "left"); previousDrag = now; }
                    if (Interlocked.Exchange(ref scrollActivity, 0) != 0) Emit(point, handle, "scroll", null);
                    if (now - previousTyping >= ActivityIntervalMilliseconds && Interlocked.Exchange(ref keyboardActivity, 0) != 0 && RecordedForeground(handle, GetForegroundWindow()))
                    {
                        Emit(point, handle, "typing", null, ActiveFocus(handle)); previousTyping = now;
                    }
                    previousPoint = point; previousLeft = left;
                }
                Thread.Sleep(PollIntervalMilliseconds);
            }
        }
        finally { running = false; UnhookWindowsHookEx(keyboardHook); UnhookWindowsHookEx(mouseHook); }
    }
}
'@
$frameworkDirectory = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
Add-Type -AssemblyName Accessibility, UIAutomationClient, UIAutomationTypes, WindowsBase
$automationAssemblies = @('System.dll', 'System.Core.dll', [Accessibility.IAccessible].Assembly.Location, (Join-Path $frameworkDirectory 'WPF\UIAutomationClient.dll'), (Join-Path $frameworkDirectory 'WPF\UIAutomationTypes.dll'), (Join-Path $frameworkDirectory 'WPF\WindowsBase.dll'))
Add-Type -TypeDefinition $nativeSource -Language CSharp -ReferencedAssemblies $automationAssemblies
[CursoramaPointer]::Run($WindowHandle)
