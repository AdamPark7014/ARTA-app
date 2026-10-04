import AVKit
import SwiftUI

/// Adjunto dentro de la burbuja: foto, video con miniatura, audio con reproductor o documento.
struct AttachmentContent: View {
    let attachment: ChatAttachment
    let mine: Bool
    var onImage: (URL) -> Void
    var onVideo: (URL) -> Void
    var onFile: (ChatAttachment) -> Void

    var body: some View {
        if attachment.isImage, let url = ApiConfig.resolve(attachment.url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    // Proporción original, sin recortar: horizontales anchas, verticales hasta 320 de alto.
                    image.resizable()
                        .scaledToFit()
                        .frame(maxWidth: 240, maxHeight: 320)
                case .failure:
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(ArtaColor.muted)
                        .frame(width: 220, height: 160)
                        .background(ArtaColor.surface2)
                default:
                    ProgressView()
                        .tint(ArtaColor.gold)
                        .frame(width: 220, height: 160)
                        .background(ArtaColor.surface2)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
            .onTapGesture { onImage(url) }
            .accessibilityLabel("Foto")
        } else if attachment.isVideo, let url = ApiConfig.resolve(attachment.url) {
            VideoThumb(attachment: attachment)
                .onTapGesture { onVideo(url) }
        } else if attachment.isAudio {
            AudioBubble(attachment: attachment, mine: mine)
        } else {
            DocumentRow(attachment: attachment)
                .onTapGesture { onFile(attachment) }
        }
    }
}

private struct VideoThumb: View {
    let attachment: ChatAttachment
    @State private var probe: RemoteMedia.Probe?

    var body: some View {
        ZStack {
            Color.black
            if let frame = probe?.frame {
                Image(uiImage: frame).resizable().scaledToFill()
            }
            Image(systemName: "play.fill")
                .font(.title)
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Circle().fill(Color.black.opacity(0.55)))
            VStack {
                Spacer()
                HStack {
                    let meta = [probe.flatMap { $0.duration > 0 ? clock($0.duration) : nil }, fileSize(attachment.size).isEmpty ? nil : fileSize(attachment.size)]
                        .compactMap { $0 }
                        .joined(separator: " · ")
                    if !meta.isEmpty {
                        Text(meta)
                            .font(.caption2)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.5)))
                    }
                    Spacer()
                }
                .padding(6)
            }
        }
        .frame(width: 240, height: 160)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(Rectangle())
        .task(id: attachment.url) {
            probe = RemoteMedia.cached(attachment.url)
            if probe == nil { probe = await RemoteMedia.probe(attachment.url, frame: true) }
        }
        .accessibilityLabel("Video")
    }
}

/// Nota de voz o audio: ▶︎/❚❚, barra para adelantar y tiempo, sin salir del chat.
private struct AudioBubble: View {
    let attachment: ChatAttachment
    let mine: Bool
    @ObservedObject private var player = ChatAudioPlayer.shared
    @State private var probedDuration: Double = 0
    @State private var scrub: Double?

    private var isCurrent: Bool { player.currentPath == attachment.url }
    private var total: Double { isCurrent && player.duration > 0 ? player.duration : probedDuration }
    private var progress: Double {
        guard isCurrent, total > 0 else { return 0 }
        return min(1, player.position / total)
    }

    var body: some View {
        HStack(spacing: 10) {
            Button { player.toggle(attachment.url) } label: {
                Image(systemName: isCurrent && player.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(attachment.isVoiceNote ? ArtaColor.bg : ArtaColor.text)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(attachment.isVoiceNote ? ArtaColor.gold : ArtaColor.surface2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isCurrent && player.isPlaying ? "Pausar" : "Reproducir")
            VStack(alignment: .leading, spacing: 2) {
                if !attachment.isVoiceNote {
                    Label(attachment.name ?? "Audio", systemImage: "headphones")
                        .font(.caption)
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(1)
                }
                Slider(
                    value: Binding(get: { scrub ?? progress }, set: { scrub = $0 }),
                    in: 0...1,
                    onEditingChanged: { editing in
                        guard !editing, let value = scrub else { return }
                        if !isCurrent { player.toggle(attachment.url) }
                        player.seek(attachment.url, fraction: value)
                        scrub = nil
                    }
                )
                .tint(mine ? ArtaColor.read : ArtaColor.gold)
                Text(clock(isCurrent && player.position > 0 ? player.position : total))
                    .font(.caption2)
                    .foregroundStyle(ArtaColor.muted)
                    .monospacedDigit()
            }
        }
        .frame(width: 240)
        .task(id: attachment.url) {
            if let d = await RemoteMedia.probe(attachment.url, frame: false)?.duration { probedDuration = d }
        }
    }
}

private struct DocumentRow: View {
    let attachment: ChatAttachment

    private var ext: String { AttachmentNames.ext(attachment.name ?? attachment.url) }

    private var icon: (String, Color) {
        switch ext {
        case "pdf": return ("doc.richtext.fill", Color(red: 0.90, green: 0.33, blue: 0.29))
        case "xls", "xlsx", "csv", "numbers": return ("tablecells.fill", Color(red: 0.25, green: 0.73, blue: 0.31))
        case "ppt", "pptx", "key": return ("rectangle.on.rectangle.angled.fill", Color(red: 0.94, green: 0.53, blue: 0.24))
        case "zip": return ("doc.zipper", ArtaColor.muted)
        default: return ("doc.text.fill", Color(red: 0.31, green: 0.62, blue: 0.97))
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon.0)
                .font(.title2)
                .foregroundStyle(icon.1)
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.name ?? "Archivo").font(.subheadline).foregroundStyle(ArtaColor.text).lineLimit(2)
                Text([ext.uppercased(), fileSize(attachment.size)].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2)
                    .foregroundStyle(ArtaColor.muted)
            }
        }
        .padding(10)
        .frame(minWidth: 200, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(ArtaColor.surface2))
        .contentShape(Rectangle())
        .accessibilityLabel("Documento \(attachment.name ?? "")")
    }
}

/// Video a pantalla completa con los controles del sistema (AirPlay, PiP, velocidad).
struct VideoScreen: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let player {
                    VideoPlayer(player: player).ignoresSafeArea()
                } else {
                    ProgressView().tint(ArtaColor.gold)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .onAppear {
            ChatAudioPlayer.shared.stop()
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try? AVAudioSession.sharedInstance().setActive(true)
            let p = AVPlayer(playerItem: AVPlayerItem(asset: RemoteMedia.asset(url)))
            player = p
            p.play()
        }
        .onDisappear { player?.pause() }
    }
}

/// Sustituye al campo de texto mientras se graba una nota de voz.
struct RecordingBar: View {
    @ObservedObject var recorder: VoiceRecorder
    var onCancel: () -> Void
    var onSend: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onCancel) {
                Image(systemName: "trash").font(.title3).foregroundStyle(ArtaColor.danger)
            }
            .accessibilityLabel("Descartar nota de voz")
            Circle().fill(ArtaColor.danger).frame(width: 10, height: 10)
            Text(clock(recorder.elapsed))
                .font(.headline)
                .monospacedDigit()
                .foregroundStyle(ArtaColor.text)
            ProgressView(value: Double(recorder.level))
                .tint(ArtaColor.gold)
            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)).foregroundStyle(ArtaColor.gold)
            }
            .accessibilityLabel("Enviar nota de voz")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(ArtaColor.bgElev)
    }
}

/// «Subiendo video (2 de 3) · 45 %» sobre el composer.
struct UploadBar: View {
    let progress: UploadProgress

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            let count = progress.total > 1 ? " (\(progress.index) de \(progress.total))" : ""
            let pct = progress.fraction.map { " · \(Int($0 * 100)) %" } ?? ""
            Text("Subiendo \(progress.label)\(count)\(pct)")
                .font(.caption)
                .foregroundStyle(ArtaColor.muted)
            if let f = progress.fraction {
                ProgressView(value: f).tint(ArtaColor.gold)
            } else {
                ProgressView().progressViewStyle(.linear).tint(ArtaColor.gold)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(ArtaColor.surface2)
    }
}

func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.isFinite ? seconds : 0))
    return String(format: "%d:%02d", s / 60, s % 60)
}
