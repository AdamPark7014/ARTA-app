import XCTest

/// Capturas de la ficha de App Store con el simulador de iPhone (6.9").
///
/// La app arranca en MODO DEMO (`-ArtaDemo YES`, solo existe en Debug): entra sin
/// login como la cuenta de las fixtures y sirve las respuestas grabadas del API
/// sin red (`ArtaApp/Demo`). La barra de estado (9:41, batería llena) la fija
/// `simctl status_bar` desde `.github/workflows/ios-screenshots.yml`.
///
/// Recorrido y nombres de los adjuntos (`NN-nombre`, lifetime `.keepAlways`):
///   01-inicio  02-chats  03-chat-evento  04-tareas  05-aprobaciones  06-eventos  07-avisos
/// («06-eventos» es el hub del primer evento de la semana que lista Inicio: la app no
/// tiene lista nativa de eventos en la navegación).
///
/// Identificadores que pone la app:
///   tab-inicio  tab-chats  tab-tareas  tab-avisos  tab-mas          (HomeView)
///   chat-event-<id> / chat-row-<id>                                 (ChatListView)
///   inicio-approvals  inicio-approvals-card  inicio-event-<id>      (InicioView)
///
/// Todo es TOLERANTE: si una pantalla no aparece se anota como omitida, se adjunta el
/// árbol de accesibilidad (`dbg-*`) y el test sigue con las demás. Solo falla si la
/// app no llega a las pestañas o si no salió ni una captura.
///
/// Además de los adjuntos, si existe `ARTA_SHOT_DIR` (el flujo la pasa como
/// `TEST_RUNNER_ARTA_SHOT_DIR`) cada PNG se escribe también ahí: red de seguridad
/// por si `xcresulttool` cambia de formato.
@MainActor
final class StoreScreenshotsUITests: XCTestCase {

    // MARK: - Estado

    private var app: XCUIApplication!
    private var monitorDeAlertas: NSObjectProtocol?
    private var capturadas: [String] = []
    private var omitidas: [String] = []

    /// Botones que aceptan una alerta del sistema (no se espera ninguna: el demo no pide permisos).
    private static let botonesPermitir = [
        "Permitir",
        "Permitir al usar la app",
        "Permitir una vez",
        "Aceptar",
        "OK",
        "Allow",
        "Allow While Using App",
        "Allow Once"
    ]

    /// Una pestaña del `TabView`: identificador que pone la app y etiqueta visible.
    private struct Pestana {
        let id: String
        let etiqueta: String

        static let inicio = Pestana(id: "tab-inicio", etiqueta: "Inicio")
        static let chats = Pestana(id: "tab-chats", etiqueta: "Chats")
        static let tareas = Pestana(id: "tab-tareas", etiqueta: "Tareas")
        static let avisos = Pestana(id: "tab-avisos", etiqueta: "Avisos")
    }

    // MARK: - Ciclo de vida

    override func setUpWithError() throws {
        try super.setUpWithError()
        // Una pantalla que falla no debe tumbar las demás.
        continueAfterFailure = true
        XCUIDevice.shared.orientation = .portrait

        monitorDeAlertas = addUIInterruptionMonitor(withDescription: "Alertas del sistema") { [weak self] alerta in
            self?.pulsarPermitir(en: alerta) ?? false
        }

        app = XCUIApplication()
        app.launchArguments = [
            "-ArtaDemo", "YES",
            "-AppleLanguages", "(es-MX)",
            "-AppleLocale", "es_MX"
        ]
        // Equivale a `-ArtaDemo YES`.
        app.launchEnvironment["ARTA_DEMO"] = "1"
        // Hora de México: el runner corre en UTC y «vence hoy» / los eventos de la semana
        // se calculan con el calendario local.
        app.launchEnvironment["TZ"] = "America/Mexico_City"
        app.launch()
    }

    // MARK: - Test

    func testCapturasDeTienda() throws {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "La app no llegó a primer plano")
        despejarAlertas()

        // Con el demo activo, la app salta el login y muestra las pestañas.
        guard buscar(elementosDePestana(.inicio), timeout: 40) != nil else {
            if porId("login-email").exists {
                adjuntarJerarquia("dbg-login")
                adjuntarCapturaDebug("dbg-login")
                XCTFail("Se ve el login: el modo demo no se activó (¿compilación Debug? ¿-ArtaDemo YES?)")
            } else {
                adjuntarJerarquia("dbg-sin-pestanas")
                adjuntarCapturaDebug("dbg-sin-pestanas")
                XCTFail("No aparece la barra de pestañas")
            }
            return
        }

        // 1. Inicio: saludo, accesos, lo que vence hoy, aprobaciones y eventos de la semana.
        _ = buscar([porId("inicio-new-task"), app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Hola")).firstMatch], timeout: 20)
        pausa(1.5)
        capturar(1, "inicio")
        adjuntarJerarquia("dbg-inicio")

        // 2 y 3. Chats y el canal del evento.
        if irAPestana(.chats) {
            if buscar([porPrefijo("chat-event-"), porPrefijo("chat-row-"), app.cells.firstMatch], timeout: 15) == nil {
                omitir("chats: la lista no mostró conversaciones a tiempo")
            }
            pausa(1.0)
            capturar(2, "chats")
            adjuntarJerarquia("dbg-chats")

            let tituloChats = tituloActual()
            let canalDelEvento = [
                porPrefijo("chat-event-"),
                app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Trío Luna de Plata")).firstMatch,
                app.cells.matching(NSPredicate(format: "label CONTAINS %@", "Trío Luna de Plata")).firstMatch,
                porPrefijo("chat-row-"),
                app.cells.firstMatch
            ]
            if abrir(canalDelEvento, desde: tituloChats) {
                // Mensajes cargados: la conversación ya no muestra indicador.
                pausa(1.5)
                capturar(3, "chat-evento")
                volver(a: tituloChats, pestana: .chats)
            } else {
                omitir("chat-evento: no se pudo abrir el canal del evento ni otro canal")
                adjuntarJerarquia("dbg-sin-canal")
            }
        } else {
            omitir("chats / chat-evento: no se encontró la pestaña Chats")
        }

        // 4. Tareas.
        if irAPestana(.tareas) {
            pausa(1.5)
            capturar(4, "tareas")
        } else {
            omitir("tareas: no se encontró la pestaña")
        }

        // 5 y 6. Desde Inicio: Aprobaciones y el hub del evento.
        if irAPestana(.inicio) {
            asegurarRaiz(.inicio, titulo: "Inicio")
            let aprobaciones = [
                porId("inicio-approvals"),
                porId("inicio-approvals-card"),
                app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Aprobaciones")).firstMatch
            ]
            if abrir(aprobaciones, desde: "Inicio") {
                pausa(1.5)
                capturar(5, "aprobaciones")
                volver(a: "Inicio", pestana: .inicio)
            } else {
                omitir("aprobaciones: no se encontró el acceso en Inicio")
                adjuntarJerarquia("dbg-sin-aprobaciones")
            }

            asegurarRaiz(.inicio, titulo: "Inicio")
            if abrir([porPrefijo("inicio-event-")], desde: "Inicio") {
                pausa(1.5)
                capturar(6, "eventos")
                volver(a: "Inicio", pestana: .inicio)
            } else {
                omitir("eventos: Inicio no listó ningún evento de la semana")
                adjuntarJerarquia("dbg-sin-eventos")
            }
        } else {
            omitir("aprobaciones / eventos: no se encontró la pestaña Inicio")
        }

        // 7. Avisos.
        if irAPestana(.avisos) {
            _ = buscar([app.cells.firstMatch, app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "anticipo")).firstMatch], timeout: 10)
            pausa(1.0)
            capturar(7, "avisos")
        } else {
            omitir("avisos: no se encontró la pestaña")
        }

        let listaCapturadas = capturadas.joined(separator: ", ")
        let listaOmitidas = omitidas.map { "  - \($0)" }.joined(separator: "\n")
        adjuntarTexto(
            "resumen",
            "Capturadas (\(capturadas.count)): \(listaCapturadas)\nOmitidas (\(omitidas.count)):\n\(listaOmitidas)\n"
        )
        XCTAssertFalse(capturadas.isEmpty, "No se pudo hacer ni una sola captura")
    }

    // MARK: - Captura

    /// Captura de pantalla completa `NN-nombre`, adjunta al resultado.
    private func capturar(_ numero: Int, _ nombre: String) {
        despejarAlertas()
        esperarSinCarga()
        let prefijo = numero < 10 ? "0\(numero)" : "\(numero)"
        let etiqueta = "\(prefijo)-\(nombre)"
        let pantalla = XCUIScreen.main.screenshot()

        let adjunto = XCTAttachment(screenshot: pantalla)
        adjunto.name = etiqueta
        adjunto.lifetime = .keepAlways
        add(adjunto)
        guardarEnDisco(pantalla, etiqueta)
        capturadas.append(etiqueta)
    }

    /// Captura para depurar (no es de tienda: el flujo no la confunde con las `NN-`).
    private func adjuntarCapturaDebug(_ nombre: String) {
        let adjunto = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
    }

    /// Copia el PNG a `ARTA_SHOT_DIR` si existe. Un fallo aquí no rompe nada.
    private func guardarEnDisco(_ pantalla: XCUIScreenshot, _ etiqueta: String) {
        guard let ruta = ProcessInfo.processInfo.environment["ARTA_SHOT_DIR"], !ruta.isEmpty else { return }
        let carpeta = URL(fileURLWithPath: ruta, isDirectory: true)
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        try? pantalla.pngRepresentation.write(to: carpeta.appendingPathComponent("\(etiqueta).png"))
    }

    private func omitir(_ motivo: String) {
        omitidas.append(motivo)
    }

    private func adjuntarTexto(_ nombre: String, _ texto: String) {
        let adjunto = XCTAttachment(string: texto)
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
    }

    /// Árbol de accesibilidad de la pantalla actual: dice qué identificadores existen.
    private func adjuntarJerarquia(_ nombre: String) {
        adjuntarTexto(nombre, app.debugDescription)
    }

    // MARK: - Elementos

    private func porId(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func porPrefijo(_ prefijo: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefijo)).firstMatch
    }

    /// Por identificador (lo pone la app) y, como plan B, por la etiqueta visible.
    private func elementosDePestana(_ pestana: Pestana) -> [XCUIElement] {
        [
            app.tabBars.buttons.matching(identifier: pestana.id).firstMatch,
            app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", pestana.etiqueta)).firstMatch,
            porId(pestana.id)
        ]
    }

    /// Título de la barra de navegación visible ("" si no hay): sirve para saber si
    /// un toque navegó de verdad.
    private func tituloActual() -> String {
        let barra = app.navigationBars.firstMatch
        return barra.exists ? barra.identifier : ""
    }

    // MARK: - Navegación

    private func irAPestana(_ pestana: Pestana) -> Bool {
        tocarSiExiste(elementosDePestana(pestana), timeout: 8)
    }

    /// Si la pila de la pestaña quedó con algo encima, tocar la pestaña activa vuelve a su raíz.
    private func asegurarRaiz(_ pestana: Pestana, titulo: String) {
        if tituloActual() == titulo { return }
        _ = irAPestana(pestana)
        pausa(0.8)
    }

    /// Toca el primer candidato que exista y devuelve `true` solo si la pantalla cambió.
    private func abrir(_ candidatos: [XCUIElement], desde titulo: String) -> Bool {
        guard tocarSiExiste(candidatos, timeout: 10) else { return false }
        let limite = Date().addingTimeInterval(6)
        while Date() < limite {
            if tituloActual() != titulo { return true }
            pausa(0.3)
        }
        return false
    }

    /// Vuelve a la pantalla raíz: botón «atrás» de la barra, deslizar desde el borde
    /// o, al final, tocar otra vez la pestaña (la app vuelve a la raíz).
    private func volver(a tituloRaiz: String, pestana: Pestana) {
        for intento in 0..<4 {
            if tituloActual() == tituloRaiz { return }
            despejarAlertas()
            switch intento {
            case 0, 2:
                // El «atrás» del sistema; si no se reconoce, el primer botón de la barra.
                let barra = app.navigationBars.firstMatch
                let candidatos = [
                    barra.buttons.matching(identifier: "BackButton").firstMatch,
                    barra.buttons.matching(NSPredicate(format: "label == %@", tituloRaiz)).firstMatch,
                    barra.buttons.firstMatch
                ]
                if let atras = buscar(candidatos, timeout: 1) { tocar(atras) }
            case 1:
                deslizarAtras()
            default:
                _ = irAPestana(pestana)
            }
            pausa(0.8)
        }
    }

    private func deslizarAtras() {
        let inicio = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let fin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
        inicio.press(forDuration: 0.05, thenDragTo: fin)
    }

    // MARK: - Búsqueda y toques tolerantes

    /// Primer elemento que exista; consulta cada 0,25 s hasta agotar el tiempo.
    private func buscar(_ candidatos: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for candidato in candidatos where candidato.exists {
                return candidato
            }
            pausa(0.25)
        } while Date() < limite
        return nil
    }

    /// Toca el primer candidato que exista. `false` (sin fallar el test) si ninguno aparece.
    @discardableResult
    private func tocarSiExiste(_ candidatos: [XCUIElement], timeout: TimeInterval = 6) -> Bool {
        despejarAlertas()
        guard let elemento = buscar(candidatos, timeout: timeout) else { return false }
        tocar(elemento)
        pausa(0.8)
        return true
    }

    /// `tap()` falla si el elemento no es «hittable»: primero se desplaza la pantalla
    /// hacia él y, si aun así no lo es, se toca por coordenada.
    private func tocar(_ elemento: XCUIElement) {
        var intentos = 0
        while elemento.exists && !elemento.isHittable && intentos < 4 {
            app.swipeUp()
            pausa(0.5)
            intentos += 1
        }
        if elemento.isHittable {
            elemento.tap()
        } else {
            elemento.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    /// Espera (poco) a que no quede ningún indicador de carga.
    private func esperarSinCarga(_ segundos: TimeInterval = 5) {
        let limite = Date().addingTimeInterval(segundos)
        while Date() < limite {
            if app.activityIndicators.count == 0 { return }
            pausa(0.3)
        }
    }

    private func pausa(_ segundos: TimeInterval) {
        Thread.sleep(forTimeInterval: segundos)
    }

    // MARK: - Alertas

    /// Alertas del sistema (SpringBoard) y de la propia app («Algo falló» → «Entendido»).
    private func despejarAlertas() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<3 {
            let alerta = springboard.alerts.firstMatch
            guard alerta.exists, pulsarPermitir(en: alerta) else { break }
            pausa(0.6)
        }
        let propia = app.alerts.firstMatch
        if propia.exists {
            let entendido = propia.buttons["Entendido"]
            if entendido.exists {
                entendido.tap()
            } else if propia.buttons.firstMatch.exists {
                propia.buttons.firstMatch.tap()
            }
            pausa(0.5)
        }
    }

    private func pulsarPermitir(en alerta: XCUIElement) -> Bool {
        for nombre in Self.botonesPermitir {
            let boton = alerta.buttons[nombre]
            if boton.exists {
                boton.tap()
                return true
            }
        }
        let cualquiera = alerta.buttons.firstMatch
        if cualquiera.exists {
            cualquiera.tap()
            return true
        }
        return false
    }
}
