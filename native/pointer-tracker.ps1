param([long]$WindowHandle = 0)
$ErrorActionPreference = 'Stop'
$nativeSource = @'
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class CursoramaPointer
{
    private const int PollIntervalMilliseconds = 16;
    private const int LeftButton = 0x01;
    private const int RightButton = 0x02;
    private const int ExtendedFrameBounds = 9;
    private const short ButtonDownMask = unchecked((short)0x8000);
    private static readonly CultureInfo NumberCulture = CultureInfo.InvariantCulture;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);

    private static void Emit(Point point, long handle, string kind, string button)
    {
        double x = point.X;
        double y = point.Y;
        bool normalized = handle != 0;
        bool inside = true;
        if (normalized)
        {
            var window = new IntPtr(handle);
            Rect bounds;
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
        long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string buttonField = button == null ? "" : ",\"button\":\"" + button + "\"";
        Console.WriteLine("{\"x\":" + x.ToString("F6", NumberCulture) + ",\"y\":" + y.ToString("F6", NumberCulture) +
            ",\"timestamp\":" + timestamp + ",\"kind\":\"" + kind + "\",\"normalized\":" +
            normalized.ToString().ToLowerInvariant() + ",\"inside\":" + inside.ToString().ToLowerInvariant() + buttonField + "}");
    }

    public static void Run(long handle)
    {
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        bool previousLeft = (GetAsyncKeyState(LeftButton) & ButtonDownMask) != 0;
        bool previousRight = (GetAsyncKeyState(RightButton) & ButtonDownMask) != 0;
        Point previousPoint = new Point { X = int.MinValue, Y = int.MinValue };
        Console.WriteLine("READY");
        while (true)
        {
            Point point;
            if (GetCursorPos(out point))
            {
                bool left = (GetAsyncKeyState(LeftButton) & ButtonDownMask) != 0;
                bool right = (GetAsyncKeyState(RightButton) & ButtonDownMask) != 0;
                if (point.X != previousPoint.X || point.Y != previousPoint.Y) Emit(point, handle, "move", null);
                if (left && !previousLeft) Emit(point, handle, "click", "left");
                if (right && !previousRight) Emit(point, handle, "click", "right");
                previousPoint = point;
                previousLeft = left;
                previousRight = right;
            }
            Thread.Sleep(PollIntervalMilliseconds);
        }
    }
}
'@
Add-Type -TypeDefinition $nativeSource -Language CSharp
[CursoramaPointer]::Run($WindowHandle)
