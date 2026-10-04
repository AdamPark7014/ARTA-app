import SwiftUI

/// Qué abrir en el visor: todas las fotos de la conversación y desde cuál empezar.
struct GalleryRequest: Identifiable {
    let id = UUID()
    let urls: [URL]
    let start: Int
}

/// Fotos a pantalla completa: deslizar entre las fotos del canal, pellizcar para
/// acercar y arrastrar para recorrer, doble toque, y deslizar hacia abajo para cerrar.
struct ImageGallery: View {
    let urls: [URL]
    @State private var index: Int
    @State private var dragY: CGFloat = 0
    @State private var zoomed = false
    @State private var images: [Int: Image] = [:]
    @Environment(\.dismiss) private var dismiss

    init(request: GalleryRequest) {
        urls = request.urls
        _index = State(initialValue: min(max(0, request.start), max(0, request.urls.count - 1)))
    }

    var body: some View {
        ZStack {
            Color.black
                .opacity(1 - min(0.7, Double(abs(dragY)) / 400))
                .ignoresSafeArea()
            TabView(selection: $index) {
                ForEach(Array(urls.enumerated()), id: \.offset) { i, url in
                    ZoomableImage(
                        url: url,
                        active: i == index,
                        onZoom: { value in if i == index { zoomed = value } },
                        onLoaded: { images[i] = $0 }
                    )
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: urls.count > 1 ? .automatic : .never))
            .ignoresSafeArea()
            .offset(y: dragY)
            .simultaneousGesture(dismissDrag)
            topBar
                .opacity(dragY == 0 ? 1 : 0)
        }
        .onChange(of: index) { _, _ in zoomed = false }
        .statusBarHidden(true)
    }

    private var topBar: some View {
        VStack {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.black.opacity(0.45)))
                }
                .accessibilityLabel("Cerrar")
                Spacer()
                if urls.count > 1 {
                    Text("\(index + 1) de \(urls.count)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                }
                Spacer()
                if let image = images[index] {
                    ShareLink(item: image, preview: SharePreview("Foto", image: image)) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.black.opacity(0.45)))
                    }
                    .accessibilityLabel("Compartir")
                } else {
                    Color.clear.frame(width: 40, height: 40)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            Spacer()
        }
    }

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { value in
                guard !zoomed, abs(value.translation.height) > abs(value.translation.width) else { return }
                dragY = value.translation.height
            }
            .onEnded { value in
                guard !zoomed else { return }
                let fling = abs(value.predictedEndTranslation.height) > 300
                if abs(dragY) > 120 || (fling && dragY != 0) {
                    dismiss()
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { dragY = 0 }
                }
            }
    }
}

/// Una foto con zoom (1×–5×) y desplazamiento acotado a los bordes.
private struct ZoomableImage: View {
    let url: URL
    let active: Bool
    var onZoom: (Bool) -> Void
    var onLoaded: (Image) -> Void

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            AsyncImage(url: url) { phase in
                if let img = phase.image {
                    img.resizable()
                        .scaledToFit()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(magnify(geo.size))
                        // Sin zoom el arrastre se lo queda el TabView (cambiar de foto / cerrar).
                        .gesture(pan(geo.size), including: scale > 1 ? .all : .subviews)
                        .onTapGesture(count: 2) { toggleZoom(geo.size) }
                        .onAppear { onLoaded(img) }
                        .accessibilityLabel("Foto")
                } else if phase.error != nil {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(ArtaColor.muted)
                        .frame(width: geo.size.width, height: geo.size.height)
                } else {
                    ProgressView()
                        .tint(ArtaColor.gold)
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
        }
        .onChange(of: active) { _, isActive in
            if !isActive { reset() }
        }
    }

    private func clamp(_ value: CGSize, _ size: CGSize, scale s: CGFloat) -> CGSize {
        let maxX = max(0, size.width * (s - 1) / 2)
        let maxY = max(0, size.height * (s - 1) / 2)
        return CGSize(
            width: min(maxX, max(-maxX, value.width)),
            height: min(maxY, max(-maxY, value.height))
        )
    }

    private func magnify(_ size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = max(1, min(5, lastScale * value.magnification))
                offset = clamp(offset, size, scale: scale)
            }
            .onEnded { _ in
                if scale <= 1.01 {
                    withAnimation(.easeOut(duration: 0.2)) { reset() }
                } else {
                    lastScale = scale
                    lastOffset = offset
                    onZoom(true)
                }
            }
    }

    private func pan(_ size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let next = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
                offset = clamp(next, size, scale: scale)
            }
            .onEnded { _ in lastOffset = offset }
    }

    private func toggleZoom(_ size: CGSize) {
        withAnimation(.easeInOut(duration: 0.25)) {
            if scale > 1 {
                reset()
            } else {
                scale = 2.5
                lastScale = 2.5
                onZoom(true)
            }
        }
    }

    private func reset() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
        onZoom(false)
    }
}
