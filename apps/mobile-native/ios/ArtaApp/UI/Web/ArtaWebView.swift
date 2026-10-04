import Combine
import QuickLook
import SwiftUI
import UIKit
import WebKit

// MARK: - Sesión compartida con la vista web

extension ApiClient {
    /// Código de un solo uso (60 s) que la web cambia por cookies propias (`?_nxt=`).
    /// El API exige la cookie `arta_access` además del header CSRF.
    func webHandoffCode(path: String) async throws -> String {
        let host = (ApiConfig.origin.host ?? "").lowercased()
        let entity = host.hasPrefix("auditorio.") ? "EXPLANADA" : "ARTA"
        let res = try await send("POST", "auth/handoff", body: WebHandoffBody(entity: entity, path: path), as: WebHandoffResponse.self)
        return res.code
    }
}

private struct WebHandoffBody: Encodable {
    let entity: String
    let path: String
}

private struct WebHandoffResponse: Decodable {
    let code: String
}

/// Una sola sesión entre la app y la vista web (contrato de paridad §3).
///
/// Entrada: primero las cookies nativas se copian al almacén de WebKit y luego se
/// pide un acceso de un solo uso; la web lo consume en `lib/user-context.tsx` y
/// deja cookies frescas. Lo que la web cambia en sus cookies vuelve al almacén
/// nativo (`CookieSync`), y al cerrar sesión en la app se borran las de la vista web.
@MainActor
enum WebSession {
    static let handoffParam = "_nxt"
    static let messageName = "artaNative"

    /// Reemplaza el `Mobile/15E148` del agente de Safari: queda el agente del
    /// sistema + `ArtaApp/<versión> (…)`, que es lo que activa el modo app de la web.
    static let applicationName: String = {
        let device = UIDevice.current
        return "Mobile/15E148 ArtaApp/\(ApiConfig.appVersion) (iOS \(device.systemVersion); \(device.model))"
    }()

    private static var observing = false

    static func url(for path: String) -> URL {
        let clean = path.hasPrefix("/") ? path : "/" + path
        return URL(string: ApiConfig.origin.absoluteString + clean) ?? ApiConfig.origin
    }

    /// `path` con el acceso de un solo uso; sin él si el API no lo da (la vista
    /// web ya lleva las cookies copiadas, Safari pedirá entrar).
    static func signedURL(path: String) async -> URL {
        let plain = url(for: path)
        guard ApiClient.shared.hasSession(),
              let code = try? await ApiClient.shared.webHandoffCode(path: removingHandoff(from: path)),
              var comps = URLComponents(url: plain, resolvingAgainstBaseURL: false)
        else { return plain }
        comps.queryItems = (comps.queryItems ?? []).filter { $0.name != handoffParam } + [URLQueryItem(name: handoffParam, value: code)]
        return comps.url ?? plain
    }

    static func removingHandoff(from path: String) -> String {
        guard var comps = URLComponents(string: path), let items = comps.queryItems,
              items.contains(where: { $0.name == handoffParam })
        else { return path }
        let rest = items.filter { $0.name != handoffParam }
        comps.queryItems = rest.isEmpty ? nil : rest
        return comps.string ?? path
    }

    static func startCookieSync() {
        guard !observing else { return }
        observing = true
        WKWebsiteDataStore.default().httpCookieStore.add(CookieSync.shared)
    }

    /// Respaldo del acceso de un solo uso: la vista web arranca con la sesión nativa.
    static func copyNativeCookies() async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in HTTPCookieStorage.shared.cookies(for: ApiConfig.origin) ?? [] {
            await store.setCookieAsync(cookie)
        }
    }

    /// WebKit → almacén nativo. Sin sesión nativa no se copia nada: si no, un
    /// cierre de sesión a medias resucitaría la cookie desde la vista web.
    static func pullCookies() async {
        guard Session.shared.currentUser != nil else { return }
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookiesAsync()
        let jar = HTTPCookieStorage.shared
        let current = jar.cookies(for: ApiConfig.origin) ?? []
        for cookie in cookies where matchesOrigin(cookie) {
            let same = current.contains { $0.name == cookie.name && $0.path == cookie.path && $0.value == cookie.value }
            if !same { jar.setCookie(cookie) }
        }
    }

    /// Al cerrar sesión en la app.
    static func clearCookies() async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        let cookies = await store.allCookiesAsync()
        for cookie in cookies where matchesOrigin(cookie) {
            await store.deleteCookieAsync(cookie)
        }
    }

    static func matchesOrigin(_ cookie: HTTPCookie) -> Bool {
        guard let host = ApiConfig.origin.host?.lowercased() else { return false }
        let domain = cookie.domain.lowercased()
        let bare = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
        return host == bare || host.hasSuffix("." + bare)
    }

    static func isPanel(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == ApiConfig.origin.host?.lowercased()
    }

    /// Los enlaces de Next (`<Link>`) navegan sin recargar y WebKit no los ve en
    /// `decidePolicyFor`: este script los intercepta antes que React y manda a la
    /// app los que tienen pantalla nativa. Debe coincidir con `PanelLink.nativeTarget`.
    static var interceptScript: String {
        let tabs = PanelLink.nativeEventTabs.sorted().map { "'\($0)'" }.joined(separator: ",")
        return #"""
        (function () {
          if (window.__artaNativeLinks) { return; }
          window.__artaNativeLinks = true;
          var eventTabs = [\#(tabs)];
          function isNative(u) {
            if (u.origin !== window.location.origin) { return false; }
            var parts = u.pathname.split('/').filter(function (s) { return s.length > 0; });
            var q = u.searchParams;
            if (parts.length === 0) { return false; }
            if (parts[0] === 'chat' || parts[0] === 'dashboard') { return parts.length === 1; }
            if (parts[0] === 'tasks') { return parts.length === 1 || (parts.length === 2 && parts[1] !== 'new'); }
            if (parts[0] === 'events' && parts.length === 2 && parts[1] !== 'new') {
              var tab = q.get('tab');
              return q.has('task') || !tab || eventTabs.indexOf(tab) >= 0;
            }
            return false;
          }
          document.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0) { return; }
            var el = e.target;
            var a = el && el.closest ? el.closest('a[href]') : null;
            if (!a) { return; }
            var u;
            try { u = new URL(a.href, window.location.href); } catch (err) { return; }
            if (!isNative(u)) { return; }
            e.preventDefault();
            e.stopPropagation();
            window.webkit.messageHandlers.\#(messageName).postMessage(u.pathname + u.search);
          }, true);
        })();
        """#
    }
}

/// Avisa cuando la web cambia sus cookies (handoff, renovación) para copiarlas al
/// almacén nativo. Se registra una sola vez y vive toda la app.
final class CookieSync: NSObject, WKHTTPCookieStoreObserver {
    static let shared = CookieSync()

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { @MainActor in await WebSession.pullCookies() }
    }
}

private extension WKHTTPCookieStore {
    func setCookieAsync(_ cookie: HTTPCookie) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            setCookie(cookie) { done.resume() }
        }
    }

    func deleteCookieAsync(_ cookie: HTTPCookie) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            delete(cookie) { done.resume() }
        }
    }

    func allCookiesAsync() async -> [HTTPCookie] {
        await withCheckedContinuation { (done: CheckedContinuation<[HTTPCookie], Never>) in
            getAllCookies { done.resume(returning: $0) }
        }
    }
}

// MARK: - Vista

/// Módulo del panel web dentro de la app, con la misma sesión.
struct ArtaWebView: View {
    let path: String
    let title: String?

    @StateObject private var model: WebViewModel
    @Environment(\.dismiss) private var dismiss

    init(path: String, title: String?) {
        self.path = path
        self.title = title
        _model = StateObject(wrappedValue: WebViewModel(path: path))
    }

    private var displayTitle: String {
        if let title, !title.isEmpty { return title }
        if let page = model.pageTitle, !page.isEmpty { return page }
        return "ARTA"
    }

    private var dialogPresented: Binding<Bool> {
        Binding(
            get: { model.dialogMessage != nil },
            set: { if !$0 { model.finishDialog(false) } }
        )
    }

    var body: some View {
        WebViewContainer(webView: model.webView)
            .background(ArtaColor.bg)
            .overlay(alignment: .top) {
                if model.isLoading && model.progress < 1 {
                    ProgressView(value: model.progress)
                        .progressViewStyle(.linear)
                        .tint(ArtaColor.gold)
                }
            }
            .overlay {
                if let failure = model.failure {
                    failureView(failure)
                } else if model.isDownloading {
                    busyView("Abriendo archivo…")
                } else if model.isLoading && model.currentURL == nil {
                    busyView(nil)
                }
            }
            .navigationTitle(displayTitle)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: goBack) {
                        Image(systemName: "chevron.backward").fontWeight(.semibold)
                    }
                    .accessibilityLabel("Atrás")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { model.reload() } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Recargar")
                    Menu {
                        Button { model.openInSafari() } label: {
                            Label("Abrir en Safari", systemImage: "safari")
                        }
                        if let url = model.shareURL {
                            ShareLink(item: url) {
                                Label("Compartir enlace", systemImage: "square.and.arrow.up")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Más opciones")
                }
            }
            .quickLookPreview($model.previewURL)
            .alert("ARTA", isPresented: dialogPresented) {
                if model.dialogIsConfirm {
                    Button("Cancelar", role: .cancel) { model.finishDialog(false) }
                    Button("Aceptar") { model.finishDialog(true) }
                } else {
                    Button("Aceptar") { model.finishDialog(true) }
                }
            } message: {
                Text(model.dialogMessage ?? "")
            }
            .task { await model.start() }
    }

    /// Primero el historial de la vista web; al llegar a su inicio, la pantalla anterior.
    private func goBack() {
        if model.webView.canGoBack {
            model.webView.goBack()
        } else {
            dismiss()
        }
    }

    private func failureView(_ message: String) -> some View {
        VStack(spacing: 16) {
            EmptyState(icon: "wifi.exclamationmark", title: "No se pudo abrir", message: message)
                .frame(maxHeight: 280)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                model.reload()
            } label: {
                Text("Reintentar").font(.headline).padding(.horizontal, 24).padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(ArtaColor.gold)
            .foregroundStyle(ArtaColor.bg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ArtaColor.bg)
    }

    private func busyView(_ label: String?) -> some View {
        VStack(spacing: 12) {
            ProgressView().tint(ArtaColor.gold)
            if let label {
                Text(label).font(.subheadline).foregroundStyle(ArtaColor.muted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ArtaColor.bg.opacity(label == nil ? 1 : 0.85))
    }
}

private struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - Modelo

@MainActor
final class WebViewModel: NSObject, ObservableObject {
    @Published private(set) var progress: Double = 0
    @Published private(set) var isLoading = true
    @Published private(set) var isDownloading = false
    @Published private(set) var pageTitle: String?
    @Published private(set) var currentURL: URL?
    @Published private(set) var failure: String?
    @Published var previewURL: URL?
    @Published private(set) var dialogMessage: String?
    @Published private(set) var dialogIsConfirm = false

    let webView: WKWebView

    private let initialPath: String
    private var lastPanelPath: String
    private var started = false
    private var pendingOwnLoad = false
    private var retriedSession = false
    private var checkingSession = false
    private let dialogReply = DialogReply()
    private let refreshControl = UIRefreshControl()
    private var bag = Set<AnyCancellable>()

    init(path: String) {
        let clean = path.hasPrefix("/") ? path : "/" + path
        initialPath = clean
        lastPanelPath = clean

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.applicationNameForUserAgent = WebSession.applicationName
        config.allowsInlineMediaPlayback = true
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(
            source: WebSession.interceptScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)

        super.init()

        // El controlador retiene a su handler: con uno débil el modelo se libera al salir.
        controller.add(WeakScriptHandler(self), name: WebSession.messageName)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(ArtaColor.bg)
        webView.scrollView.backgroundColor = UIColor(ArtaColor.bg)
        #if DEBUG
        webView.isInspectable = true
        #endif
        refreshControl.tintColor = UIColor(ArtaColor.gold)
        refreshControl.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
        observeWebView()
    }

    var shareURL: URL? {
        guard let url = currentURL else { return nil }
        return WebSession.url(for: WebSession.removingHandoff(from: PanelLink.pathAndQuery(of: url)))
    }

    func start() async {
        guard !started else { return }
        started = true
        WebSession.startCookieSync()
        await load(path: initialPath)
    }

    func reload() {
        if failure != nil || webView.url == nil {
            Task { await load(path: lastPanelPath) }
        } else {
            webView.reload()
        }
    }

    func openInSafari() {
        let path = lastPanelPath
        Task {
            let url = await WebSession.signedURL(path: path)
            _ = await UIApplication.shared.open(url)
        }
    }

    func finishDialog(_ accepted: Bool) {
        dialogMessage = nil
        dialogReply.resolve(accepted)
    }

    /// Enlace del panel tocado dentro de la web (script `interceptScript`).
    func openNative(path: String) {
        if let target = PanelLink.nativeTarget(path: path) {
            AppRouter.shared.follow(target)
        } else {
            webView.load(URLRequest(url: WebSession.url(for: path)))
        }
    }

    private func load(path: String) async {
        failure = nil
        isLoading = true
        await WebSession.copyNativeCookies()
        let url = await WebSession.signedURL(path: path)
        pendingOwnLoad = true
        webView.load(URLRequest(url: url))
    }

    @objc private func pullToRefresh() {
        reload()
    }

    private func observeWebView() {
        webView.publisher(for: \.estimatedProgress)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.progress = value }
            .store(in: &bag)
        webView.publisher(for: \.isLoading)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.isLoading = value }
            .store(in: &bag)
        webView.publisher(for: \.title)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.pageTitle = value }
            .store(in: &bag)
        webView.publisher(for: \.url)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in self?.urlChanged(value) }
            .store(in: &bag)
    }

    /// También ve la navegación interna de Next (pushState), que no pasa por `decidePolicyFor`.
    private func urlChanged(_ url: URL?) {
        currentURL = url
        guard let url, WebSession.isPanel(url) else { return }
        if url.path.hasPrefix("/login") {
            handleSignedOutWeb()
            return
        }
        lastPanelPath = WebSession.removingHandoff(from: PanelLink.pathAndQuery(of: url))
    }

    /// La web cayó en `/login` o respondió 401. Si la sesión nativa también murió
    /// se cierra la app (una sola sesión); si sigue viva, solo faltó la de la vista
    /// web: un reintento con acceso nuevo y, si vuelve a fallar, error con «Reintentar».
    private func handleSignedOutWeb() {
        guard !checkingSession else { return }
        checkingSession = true
        webView.stopLoading()
        Task {
            defer { checkingSession = false }
            do {
                _ = try await ApiClient.shared.me()
                if retriedSession {
                    isLoading = false
                    failure = "No se pudo abrir tu sesión en esta vista."
                } else {
                    retriedSession = true
                    await load(path: lastPanelPath)
                }
            } catch let error as ApiError where error.isUnauthorized {
                if Session.shared.currentUser != nil { await Session.shared.logout() }
            } catch {
                isLoading = false
                failure = error.userMessage
            }
        }
    }

    private func openFile(_ url: URL, suggestedName: String?) {
        guard !isDownloading else { return }
        isDownloading = true
        Task {
            defer { isDownloading = false }
            await WebSession.pullCookies()
            do {
                previewURL = try await ApiClient.shared.download(url, suggestedName: suggestedName)
            } catch {
                _ = await UIApplication.shared.open(url)
            }
        }
    }

    private func handleFailure(_ error: Error) {
        refreshControl.endRefreshing()
        isLoading = false
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        // 102: carga interrumpida por una decisión nuestra (descarga, pantalla nativa).
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
        failure = ns.domain == NSURLErrorDomain ? "Sin conexión. Revisa tu internet." : ns.localizedDescription
    }
}

extension WebViewModel: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        switch scheme {
        case "http", "https":
            break
        case "about", "blob", "data", "javascript":
            decisionHandler(.allow)
            return
        case "arta":
            decisionHandler(.cancel)
            if let target = PanelLink.target(url: url) { AppRouter.shared.follow(target) }
            return
        default:
            // tel:, mailto:, mapas, WhatsApp…
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        // `target=_blank` y `window.open`: los resuelve `createWebViewWith`.
        guard let frame = navigationAction.targetFrame else {
            decisionHandler(.allow)
            return
        }
        guard frame.isMainFrame else {
            decisionHandler(.allow)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.cancel)
            openFile(url, suggestedName: nil)
            return
        }
        guard WebSession.isPanel(url) else {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        if url.path.hasPrefix("/login") {
            decisionHandler(.cancel)
            handleSignedOutWeb()
            return
        }
        let ownLoad = pendingOwnLoad
        pendingOwnLoad = false
        if !ownLoad, let target = PanelLink.nativeTarget(path: PanelLink.pathAndQuery(of: url)) {
            decisionHandler(.cancel)
            AppRouter.shared.follow(target)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard navigationResponse.isForMainFrame else {
            decisionHandler(.allow)
            return
        }
        let http = navigationResponse.response as? HTTPURLResponse
        if http?.statusCode == 401 {
            decisionHandler(.cancel)
            handleSignedOutWeb()
            return
        }
        let mime = navigationResponse.response.mimeType?.lowercased() ?? ""
        let disposition = http?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased() ?? ""
        let isFile = !navigationResponse.canShowMIMEType || disposition.hasPrefix("attachment") || mime == "application/pdf"
        if isFile, let url = navigationResponse.response.url {
            decisionHandler(.cancel)
            openFile(url, suggestedName: navigationResponse.response.suggestedFilename)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        isLoading = false
        failure = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

extension WebViewModel: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if WebSession.isPanel(url) {
            if let target = PanelLink.nativeTarget(path: PanelLink.pathAndQuery(of: url)) {
                AppRouter.shared.follow(target)
            } else {
                webView.load(navigationAction.request)
            }
        } else if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        finishDialog(false)
        dialogReply.alert = completionHandler
        dialogIsConfirm = false
        dialogMessage = message
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        finishDialog(false)
        dialogReply.confirm = completionHandler
        dialogIsConfirm = true
        dialogMessage = message
    }
}

/// Respuesta pendiente de `alert()` / `confirm()`. WebKit lanza una excepción si
/// un diálogo nunca recibe respuesta: al liberarse responde «cancelar».
private final class DialogReply {
    var alert: (() -> Void)?
    var confirm: ((Bool) -> Void)?

    func resolve(_ accepted: Bool) {
        let alert = self.alert
        let confirm = self.confirm
        self.alert = nil
        self.confirm = nil
        alert?()
        confirm?(accepted)
    }

    deinit {
        resolve(false)
    }
}

/// `WKUserContentController` retiene a su handler; este solo guarda una referencia débil.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WebViewModel?

    init(_ target: WebViewModel) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let path = message.body as? String, path.hasPrefix("/") else { return }
        let target = self.target
        Task { @MainActor in target?.openNative(path: path) }
    }
}
