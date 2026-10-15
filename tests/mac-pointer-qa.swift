import AppKit
import CoreGraphics

// Only inject input into the explicitly selected Cursorama smoke-test window.
let args = CommandLine.arguments
guard args.count == 3, let id = UInt32(args[1]), let pid = Int32(args[2]),
      NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
      let window = windows.first(where: { ($0[kCGWindowNumber as String] as? UInt32) == id }),
      (window[kCGWindowOwnerPID as String] as? Int32) == pid,
      let dictionary = window[kCGWindowBounds as String] as? [String: Any],
      let bounds = CGRect(dictionaryRepresentation: dictionary as CFDictionary) else {
    fputs("QA_TARGET_NOT_FOREGROUND\n", stderr); exit(1)
}
let point = CGPoint(x: bounds.midX, y: bounds.midY)
guard let top = windows.first(where: { item in
    guard (item[kCGWindowLayer as String] as? Int) == 0,
          let info = item[kCGWindowBounds as String] as? [String: Any],
          let rect = CGRect(dictionaryRepresentation: info as CFDictionary) else { return false }
    return rect.contains(point)
}), (top[kCGWindowNumber as String] as? UInt32) == id else {
    fputs("QA_TARGET_OCCLUDED\n", stderr); exit(1)
}
let original = CGEvent(source: nil)?.location
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
Thread.sleep(forTimeInterval: 0.15)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
Thread.sleep(forTimeInterval: 0.15)
if let original = original {
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: original, mouseButton: .left)?.post(tap: .cghidEventTap)
}
