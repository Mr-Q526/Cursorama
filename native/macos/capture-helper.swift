import AppKit
import CoreGraphics
import CoreImage
import ScreenCaptureKit

func output(_ value: Any) {
    do {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    } catch {
        fail("SERIALIZATION_FAILED: \(error)")
    }
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func windowBounds(_ id: CGWindowID) -> CGRect? {
    guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let entry = list.first,
          let bounds = entry[kCGWindowBounds as String] as? [String: Any] else { return nil }
    return CGRect(dictionaryRepresentation: bounds as CFDictionary)
}

// Quartz and Electron on macOS both use logical points with a top-left origin.
final class Tracker {
    let window: CGWindowID?
    let displayBounds: CGRect
    var bounds: CGRect?
    var tap: CFMachPort?
    var lastPoint: CGPoint?
    var timer: Timer?
    var geometryTimer: Timer?

    init(window: CGWindowID?, display: CGDirectDisplayID) {
        self.window = window
        self.displayBounds = CGDisplayBounds(display)
        self.bounds = window.map { windowBounds($0) } ?? displayBounds
    }

    func publish(_ point: CGPoint, kind: String, button: String? = nil) {
        guard let rect = bounds, rect.width > 0, rect.height > 0 else { return }
        let x = (point.x - rect.minX) / rect.width
        let y = (point.y - rect.minY) / rect.height
        var event: [String: Any] = ["x": x, "y": y, "screenX": point.x, "screenY": point.y,
            "timestamp": Date().timeIntervalSince1970 * 1000, "kind": kind,
            "normalized": true, "inside": x >= 0 && x <= 1 && y >= 0 && y <= 1]
        if let button = button { event["button"] = button }
        output(event)
    }

    func start() {
        guard bounds != nil else { fail("WINDOW_UNAVAILABLE") }
        guard CGPreflightListenEventAccess() || CGRequestListenEventAccess() else { fail("INPUT_MONITORING_PERMISSION_REQUIRED") }
        let types: [CGEventType] = [.leftMouseDown, .rightMouseDown, .scrollWheel, .leftMouseDragged, .rightMouseDragged]
        let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << $1.rawValue) }
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
            eventsOfInterest: mask, callback: { _, type, event, context in
                guard let context = context else { return Unmanaged.passUnretained(event) }
                let tracker = Unmanaged<Tracker>.fromOpaque(context).takeUnretainedValue()
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                    if let tap = tracker.tap { CGEvent.tapEnable(tap: tap, enable: true) }
                } else {
                    let kind = type == .scrollWheel ? "scroll" : (type == .leftMouseDragged || type == .rightMouseDragged ? "drag" : "click")
                    tracker.publish(event.location, kind: kind, button: type == .leftMouseDown ? "left" : (type == .rightMouseDown ? "right" : nil))
                }
                return Unmanaged.passUnretained(event)
            }, userInfo: Unmanaged.passUnretained(self).toOpaque())
        guard let tap = tap, let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            fail("INPUT_MONITORING_PERMISSION_REQUIRED")
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        FileHandle.standardOutput.write(Data("READY\n".utf8))
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            guard let self = self, let point = CGEvent(source: nil)?.location else { return }
            if point != self.lastPoint { self.lastPoint = point; self.publish(point, kind: "move") }
        }
        geometryTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self = self, let id = self.window else { return }
            self.bounds = windowBounds(id)
        }
        // The parent closes stdin when it exits; avoid leaving an event tap behind.
        FileHandle.standardInput.readabilityHandler = { handle in
            if handle.availableData.isEmpty { exit(0) }
        }
        RunLoop.main.run()
        timer?.invalidate(); geometryTimer?.invalidate()
        CFMachPortInvalidate(tap)
    }
}

// Completion and timeout race through one gate so a slow window never blocks the list.
// The lock protects the continuation across the screenshot and timeout callbacks.
final class ThumbnailResult: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<String?, Never>?
    init(_ continuation: CheckedContinuation<String?, Never>) { self.continuation = continuation }
    func finish(_ image: String?) {
        lock.lock(); let pending = continuation; continuation = nil; lock.unlock()
        pending?.resume(returning: image)
    }
}

@available(macOS 12.3, *)
final class WindowThumbnailStream: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private var stream: SCStream?
    private let result: ThumbnailResult
    init(_ result: ThumbnailResult) { self.result = result }
    func start(_ filter: SCContentFilter, _ configuration: SCStreamConfiguration) {
        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        self.stream = stream
        do { try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "cursorama.thumbnail")) }
        catch { finish(nil); return }
        stream.startCapture { [self] error in if error != nil { finish(nil) } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { [self] in finish(nil) }
    }
    private func finish(_ image: String?) {
        // Output, delegate and timer callbacks may finish at the same time.
        objc_sync_enter(self)
        let active = stream; stream = nil
        objc_sync_exit(self)
        guard let active = active else { return }
        active.stopCapture { _ in }
        result.finish(image)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { finish(nil) }
    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue,
              let pixel = CMSampleBufferGetImageBuffer(buffer) else { return }
        let frame = CIImage(cvPixelBuffer: pixel)
        guard let image = CIContext().createCGImage(frame, from: frame.extent),
              let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { finish(nil); return }
        finish("data:image/png;base64," + png.base64EncodedString())
    }
}

@available(macOS 14.0, *)
func thumbnail(_ window: SCWindow) async -> String? {
    let configuration = SCStreamConfiguration()
    let ratio = window.frame.width / max(1, window.frame.height)
    configuration.width = max(1, min(320, Int(200 * ratio)))
    configuration.height = max(1, min(200, Int(320 / max(0.001, ratio))))
    configuration.showsCursor = false
    configuration.ignoreShadowsSingleWindow = true
    let screenshot: String? = await withCheckedContinuation { continuation in
        let result = ThumbnailResult(continuation)
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.2) { result.finish(nil) }
        SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: configuration) { image, error in
            guard error == nil, let image = image else { result.finish(nil); return }
            let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
            result.finish(png.map { "data:image/png;base64," + $0.base64EncodedString() })
        }
    }
    if let screenshot = screenshot { return screenshot }
    return await withCheckedContinuation { continuation in
        let capture = WindowThumbnailStream(ThumbnailResult(continuation))
        capture.start(SCContentFilter(desktopIndependentWindow: window), configuration)
    }
}

func applicationIcon(_ pid: pid_t) -> String? {
    guard let icon = NSRunningApplication(processIdentifier: pid)?.icon else { return nil }
    var rect = CGRect(x: 0, y: 0, width: 64, height: 64)
    guard let image = icon.cgImage(forProposedRect: &rect, context: nil, hints: nil),
          let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { return nil }
    return "data:image/png;base64," + png.base64EncodedString()
}

let arguments = CommandLine.arguments
if arguments.count > 1 && arguments[1] == "status" {
    output(["inputMonitoring": CGPreflightListenEventAccess(), "screenCapture": CGPreflightScreenCaptureAccess()])
} else if arguments.count > 1 && arguments[1] == "list" {
    // AppKit must initialize the WindowServer connection before decoding app icons.
    NSApplication.shared.setActivationPolicy(.prohibited)
    if #available(macOS 12.3, *) {
        Task {
            do {
                // Fullscreen windows live in another Space and aren't on the current screen.
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
                let windows = content.windows.filter { window in
                    window.windowLayer == 0 && window.frame.width > 1 && window.frame.height > 1 &&
                    window.owningApplication != nil && !(window.title ?? "").isEmpty
                }
                let previewIds = Set(arguments.dropFirst(2).filter { $0.hasPrefix("window:") })
                var previews: [CGWindowID: String] = [:]
                if #available(macOS 14.0, *), !previewIds.isEmpty {
                    let requested = windows.filter { previewIds.contains("window:\($0.windowID):0") }
                    // Bound concurrent captures to avoid a large list exhausting ScreenCaptureKit.
                    let previewDeadline = Date().addingTimeInterval(7)
                    for offset in stride(from: 0, to: requested.count, by: 4) {
                        if Date() > previewDeadline { break }
                        let batch = requested[offset..<min(offset + 4, requested.count)]
                        await withTaskGroup(of: (CGWindowID, String?).self) { group in
                            for window in batch { group.addTask { (window.windowID, await thumbnail(window)) } }
                            for await (id, image) in group { if let image = image { previews[id] = image } }
                        }
                    }
                }
                let entries: [[String: Any]] = windows.compactMap { window in
                    guard let owner = window.owningApplication, let title = window.title else { return nil }
                    var entry: [String: Any] = ["id": "window:\(window.windowID):0", "name": "\(owner.applicationName) — \(title)", "pid": owner.processID]
                    if let image = previews[window.windowID] { entry["thumbnail"] = image }
                    if previewIds.contains("window:\(window.windowID):0"), let icon = applicationIcon(owner.processID) { entry["appIcon"] = icon }
                    return entry
                }
                output(entries); exit(0)
            } catch { fail("WINDOW_ENUMERATION_FAILED: \(error)") }
        }
        dispatchMain()
    } else { fail("MACOS_12_3_REQUIRED") }
} else if arguments.count == 4 && arguments[1] == "track" {
    let source = arguments[2].split(separator: ":")
    let window = source.first == "window" ? source.dropFirst().first.flatMap { UInt32($0) } : nil
    let display = UInt32(arguments[3]) ?? CGMainDisplayID()
    let tracker = Tracker(window: window, display: display)
    tracker.start()
} else { fail("INVALID_ARGUMENTS") }
