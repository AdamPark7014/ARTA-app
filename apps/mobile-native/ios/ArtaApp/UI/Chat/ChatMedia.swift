import AVFoundation
import CoreTransferable
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct MediaError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Nombres y tipos de adjunto, igual que la tabla del API (`chat-attachments.ts`):
/// lo que el servidor no acepta se rechaza aquí antes de gastar datos subiéndolo.
enum AttachmentNames {
    static let maxBytes: Int64 = 100 * 1024 * 1024

    static let byExt: [String: String] = [
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif",
        "webp": "image/webp", "heic": "image/heic", "heif": "image/heif",
        "mp4": "video/mp4", "m4v": "video/mp4", "mov": "video/quicktime", "3gp": "video/3gpp", "webm": "video/webm",
        "m4a": "audio/mp4", "aac": "audio/aac", "mp3": "audio/mpeg", "ogg": "audio/ogg", "opus": "audio/ogg", "wav": "audio/wav",
        "pdf": "application/pdf", "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt": "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pages": "application/vnd.apple.pages", "numbers": "application/vnd.apple.numbers",
        "key": "application/vnd.apple.keynote", "zip": "application/zip", "csv": "text/csv", "txt": "text/plain",
    ]

    static func ext(_ name: String) -> String { (name as NSString).pathExtension.lowercased() }
    static func isAllowed(_ name: String) -> Bool { byExt[ext(name)] != nil }
    static func mime(for name: String) -> String? { byExt[ext(name)] }

    static func kind(_ mime: String) -> String {
        if mime.hasPrefix("image/") { return "image" }
        if mime.hasPrefix("video/") { return "video" }
        if mime.hasPrefix("audio/") { return "audio" }
        return "file"
    }
}

/// Archivo en disco listo para subir (se sube en streaming desde ahí).
struct PreparedUpload {
    let fileURL: URL
    let filename: String
    let mime: String
    let size: Int64
    /// Copia propia en temporales: se borra al terminar.
    let temporary: Bool

    var kind: String { AttachmentNames.kind(mime) }

    var label: String {
        switch kind {
        case "image": return "foto"
        case "video": return "video"
        case "audio": return filename.hasPrefix("nota-de-voz") ? "nota de voz" : "audio"
        default: return filename
        }
    }

    func dispose() {
        if temporary { try? FileManager.default.removeItem(at: fileURL) }
    }
}

/// Fotos a JPEG, videos a H.264/MP4 y documentos tal cual: así se ven y suenan
/// igual en iPhone, Android y en la web (HEVC/HEIC no los abre cualquiera).
enum MediaPrep {
    private static let imageMaxSide: CGFloat = 2560

    static func tempURL(_ name: String) -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("chat-upload", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(UUID().uuidString)-\(name)")
    }

    static func timestampName(_ prefix: String, ext: String) -> String {
        "\(prefix)-\(Int(Date().timeIntervalSince1970)).\(ext)"
    }

    /// Foto de la galería o de Archivos (HEIC, PNG, JPEG…). Los GIF se quedan como GIF.
    static func photo(data: Data, name: String? = nil) async throws -> PreparedUpload {
        if data.starts(with: Array("GIF8".utf8)) {
            let filename = name.flatMap { AttachmentNames.ext($0) == "gif" ? $0 : nil } ?? timestampName("foto", ext: "gif")
            return try write(data, filename: filename, mime: "image/gif")
        }
        guard let image = UIImage(data: data) else { throw MediaError("No se pudo leer la foto") }
        return try await photo(image: image, name: name)
    }

    static func photo(image: UIImage, name: String? = nil) async throws -> PreparedUpload {
        let scale = min(1, imageMaxSide / max(image.size.width, image.size.height))
        let target = scale < 1 ? CGSize(width: image.size.width * scale, height: image.size.height * scale) : image.size
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        guard let jpeg = rendered.jpegData(compressionQuality: 0.85) else { throw MediaError("No se pudo preparar la foto") }
        let base = name.map { ($0 as NSString).deletingPathExtension }.flatMap { $0.isEmpty ? nil : $0 }
        return try write(jpeg, filename: base.map { "\($0).jpg" } ?? timestampName("foto", ext: "jpg"), mime: "image/jpeg")
    }

    /// Video de la cámara o de Fotos. HEVC o .mov → H.264 MP4 (lo reproduce Android y cualquier navegador).
    static func video(at source: URL, name: String? = nil, ownsSource: Bool) async throws -> PreparedUpload {
        let asset = AVURLAsset(url: source)
        let isMP4 = ["mp4", "m4v"].contains(AttachmentNames.ext(source.lastPathComponent))
        var isH264 = false
        if let track = try await asset.loadTracks(withMediaType: .video).first {
            let formats = try await track.load(.formatDescriptions)
            isH264 = formats.allSatisfy { CMFormatDescriptionGetMediaSubType($0) == kCMVideoCodecType_H264 }
        }
        let size = (try? source.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        let base = name.map { ($0 as NSString).deletingPathExtension }.flatMap { $0.isEmpty ? nil : $0 } ?? "video-\(Int(Date().timeIntervalSince1970))"

        if isMP4 && isH264 && size <= AttachmentNames.maxBytes {
            return PreparedUpload(fileURL: source, filename: "\(base).mp4", mime: "video/mp4", size: size, temporary: ownsSource)
        }

        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else {
            throw MediaError("No se pudo preparar el video")
        }
        let out = tempURL("\(base).mp4")
        export.outputURL = out
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            export.exportAsynchronously { done.resume() }
        }
        if ownsSource { try? FileManager.default.removeItem(at: source) }
        guard export.status == .completed else {
            try? FileManager.default.removeItem(at: out)
            throw MediaError(export.error?.localizedDescription ?? "No se pudo convertir el video")
        }
        let outSize = (try? out.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        guard outSize <= AttachmentNames.maxBytes else {
            try? FileManager.default.removeItem(at: out)
            throw MediaError("El video pesa más de 100 MB. Recórtalo en Fotos y vuelve a intentar.")
        }
        return PreparedUpload(fileURL: out, filename: "\(base).mp4", mime: "video/mp4", size: outSize, temporary: true)
    }

    /// Documento elegido en Archivos (Word, Excel, PDF, audio…). Se copia dentro de la app
    /// mientras dura el permiso de acceso; fotos y videos pasan por su conversión.
    static func document(at url: URL) async throws -> PreparedUpload {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let name = url.lastPathComponent
        let type = UTType(filenameExtension: url.pathExtension)
        if type?.conforms(to: .image) == true && type?.conforms(to: .gif) != true {
            let data = try Data(contentsOf: url)
            return try await photo(data: data, name: name)
        }
        guard AttachmentNames.isAllowed(name) else { throw MediaError("«\(name)» no se puede compartir en el chat") }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        guard size <= AttachmentNames.maxBytes else { throw MediaError("«\(name)» pesa más de 100 MB") }
        let copy = tempURL(name)
        try FileManager.default.copyItem(at: url, to: copy)
        if type?.conforms(to: .movie) == true && AttachmentNames.ext(name) == "mov" {
            return try await video(at: copy, name: name, ownsSource: true)
        }
        return PreparedUpload(
            fileURL: copy,
            filename: name,
            mime: AttachmentNames.mime(for: name) ?? "application/octet-stream",
            size: size,
            temporary: true
        )
    }

    /// Nota de voz grabada en la app (m4a/AAC).
    static func voice(_ url: URL) -> PreparedUpload {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        return PreparedUpload(fileURL: url, filename: url.lastPathComponent, mime: "audio/mp4", size: size, temporary: true)
    }

    private static func write(_ data: Data, filename: String, mime: String) throws -> PreparedUpload {
        let url = tempURL(filename)
        try data.write(to: url)
        return PreparedUpload(fileURL: url, filename: filename, mime: mime, size: Int64(data.count), temporary: true)
    }
}

/// Video elegido en Fotos, copiado a temporales (el archivo que da el sistema caduca).
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = MediaPrep.tempURL(received.file.lastPathComponent)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

// MARK: - Notas de voz

/// Graba en AAC/m4a. El nombre `nota-de-voz-…` es lo que el API muestra como «🎤 Nota de voz».
@MainActor
final class VoiceRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var level: Float = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?

    func start() async throws {
        guard await AVAudioApplication.requestRecordPermission() else {
            throw MediaError("Activa el micrófono en Ajustes › ARTA para mandar notas de voz.")
        }
        ChatAudioPlayer.shared.stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(MediaPrep.timestampName("nota-de-voz", ext: "m4a"))
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let r = try AVAudioRecorder(url: url, settings: settings)
        r.isMeteringEnabled = true
        guard r.record() else { throw MediaError("No se pudo usar el micrófono") }
        recorder = r
        elapsed = 0
        isRecording = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard let r = recorder else { return }
        r.updateMeters()
        elapsed = r.currentTime
        level = max(0, min(1, (r.averagePower(forChannel: 0) + 50) / 50))
    }

    /// Archivo listo, o nil si fue un toque accidental (menos de 1 s).
    func stop() -> URL? {
        guard let r = recorder else { return nil }
        let duration = r.currentTime
        r.stop()
        finish()
        if duration < 1 {
            try? FileManager.default.removeItem(at: r.url)
            return nil
        }
        return r.url
    }

    func cancel() {
        guard let r = recorder else { return }
        r.stop()
        r.deleteRecording()
        finish()
    }

    private func finish() {
        timer?.invalidate()
        timer = nil
        recorder = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - Reproducción

enum RemoteMedia {
    /// Asset con la cookie de sesión (los adjuntos se piden al mismo host del API).
    static func asset(_ url: URL) -> AVURLAsset {
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        return AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: cookies])
    }

    final class Probe {
        let duration: Double
        let frame: UIImage?
        init(duration: Double, frame: UIImage?) {
            self.duration = duration
            self.frame = frame
        }
    }

    private static let cache = NSCache<NSString, Probe>()

    static func cached(_ path: String) -> Probe? { cache.object(forKey: path as NSString) }

    /// Duración y (en videos) primer cuadro, leyendo por rangos sin bajar el archivo entero.
    static func probe(_ path: String, frame wantFrame: Bool) async -> Probe? {
        if let hit = cached(path) { return hit }
        guard let url = ApiConfig.resolve(path) else { return nil }
        let media = Self.asset(url)
        let duration = (try? await media.load(.duration))?.seconds ?? 0
        var image: UIImage?
        if wantFrame {
            let generator = AVAssetImageGenerator(asset: media)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 480, height: 480)
            if let cg = try? await generator.image(at: .zero).image { image = UIImage(cgImage: cg) }
        }
        let probe = Probe(duration: duration.isFinite ? duration : 0, frame: image)
        cache.setObject(probe, forKey: path as NSString)
        return probe
    }
}

/// Un solo audio sonando a la vez en toda la app, como WhatsApp.
@MainActor
final class ChatAudioPlayer: ObservableObject {
    static let shared = ChatAudioPlayer()

    @Published private(set) var currentPath: String?
    @Published private(set) var isPlaying = false
    @Published private(set) var position: Double = 0
    @Published private(set) var duration: Double = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    func toggle(_ path: String) {
        if currentPath == path, let player {
            if isPlaying {
                player.pause()
                isPlaying = false
            } else {
                activateSession()
                player.play()
                isPlaying = true
            }
            return
        }
        stop()
        guard let url = ApiConfig.resolve(path) else { return }
        let item = AVPlayerItem(asset: RemoteMedia.asset(url))
        let p = AVPlayer(playerItem: item)
        timeObserver = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.2, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.position = time.seconds.isFinite ? time.seconds : 0
                if let d = self.player?.currentItem?.duration.seconds, d.isFinite, d > 0 { self.duration = d }
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.isPlaying = false
                self.position = 0
                self.player?.seek(to: .zero)
            }
        }
        player = p
        currentPath = path
        position = 0
        duration = 0
        activateSession()
        p.play()
        isPlaying = true
    }

    func seek(_ path: String, fraction: Double) {
        guard currentPath == path, let player, duration > 0 else { return }
        player.seek(to: CMTime(seconds: duration * min(1, max(0, fraction)), preferredTimescale: 600))
    }

    func stop() {
        if let timeObserver, let player { player.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        player?.pause()
        player = nil
        timeObserver = nil
        endObserver = nil
        currentPath = nil
        isPlaying = false
        position = 0
        duration = 0
    }

    /// Suena aunque el iPhone esté en silencio (lo pidió la persona al tocar ▶︎).
    private func activateSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}

// MARK: - Piezas de UIKit

/// Cámara del sistema: foto o video en la misma pantalla, como WhatsApp.
struct CameraPicker: UIViewControllerRepresentable {
    enum Result {
        case photo(UIImage)
        case video(URL)
    }

    /// nil = canceló. Quien la presenta la cierra al recibir la llamada.
    let onFinish: (Result?) -> Void

    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        controller.videoQuality = .typeHigh
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onFinish(.photo(image))
            } else if let url = info[.mediaURL] as? URL {
                // El sistema borra su copia al cerrar la cámara.
                let copy = MediaPrep.tempURL(url.lastPathComponent)
                parent.onFinish((try? FileManager.default.copyItem(at: url, to: copy)) != nil ? .video(copy) : nil)
            } else {
                parent.onFinish(nil)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onFinish(nil)
        }
    }
}

/// Hoja de «Compartir» del sistema: WhatsApp, Guardar en Archivos, Guardar en Fotos, Mail…
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
