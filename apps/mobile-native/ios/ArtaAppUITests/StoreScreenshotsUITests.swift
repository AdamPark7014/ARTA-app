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
/// Las capturas de tienda son de Arta (tema claro). Después, para revisar el tema oscuro, el
/// chip de Inicio cambia a Auditorio (la cuenta demo es híbrida) y se adjuntan capturas de
/// revisión `auditorio-*` (sin prefijo `NN-`: van a `debug/` del artefacto de logs, no a la tienda).
/// («06-eventos» es el hub del primer evento de la semana que lista Inicio: la app no
/// tiene lista nativa de eventos en la navegación).
/// Para revisar cortes también se adjuntan (a `debug/`, nunca a la tienda): `arta-*` (detalle
/// de tarea, hojas, finales de pantalla contra la barra de pestañas, Más, info del canal),
/// `auditorio-*`, `xxl-*` (relanzando con letra grande, Dynamic Type XXL) y `login-*`
/// (relanzando sin modo demo).
///
/// Identificadores que pone la app:
///   tab-inicio  tab-chats  tab-tareas  tab-avisos  tab-mas          (HomeView)
///   chat-event-<id> / chat-row-<id>                                 (ChatListView)
///   inicio-approvals  inicio-approvals-card  inicio-event-<id>      (InicioView)
///   inicio-new-task                                                 (InicioView)
///   task-row-<id>  tasks-filter-<filtro>                            (TasksView)
///   approval-order-<id>                                             (ApprovalsView)
///   inicio-entity-chip  entity-notice                               (ActiveEntity)
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
    private var revisiones: [String] = []

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

        // 8. Más pantallas de Arta para revisar cortes (no son capturas de tienda: van a debug/).
        recorrerArtaExtra()

        // 9. Tema oscuro: Auditorio (revisión visual, no son capturas de tienda).
        recorrerAuditorio()

        adjuntarResumen()
        XCTAssertFalse(capturadas.isEmpty, "No se pudo hacer ni una sola captura")

        // 10. Relanzando la app: letra grande (Dynamic Type XXL) y la pantalla de entrada.
        recorrerLetraGrande()
        capturarLogin()
        adjuntarResumen()
    }

    private func adjuntarResumen() {
        let listaCapturadas = capturadas.joined(separator: ", ")
        let listaOmitidas = omitidas.map { "  - \($0)" }.joined(separator: "\n")
        adjuntarTexto(
            "resumen",
            "Capturadas (\(capturadas.count)): \(listaCapturadas)\nRevisión: \(revisiones.joined(separator: ", "))\nOmitidas (\(omitidas.count)):\n\(listaOmitidas)\n"
        )
    }

    // MARK: - Revisión de Arta (cortes, hojas y finales de pantalla)

    private func recorrerArtaExtra() {
        // Tareas: la fila de filtros desplazada al final y el detalle de una tarea.
        if irAPestana(.tareas) {
            pausa(1.0)
            // Arrastre por coordenadas a la altura de los chips: un `swipe` sobre un chip que
            // queda fuera de la pantalla aborta la prueba («visible frame is empty»).
            let filtro = porPrefijo("tasks-filter-")
            if buscar([filtro], timeout: 5) != nil, filtro.isHittable {
                let y = filtro.frame.midY
                let ancho = app.frame.width
                arrastrar(desde: CGPoint(x: ancho * 0.85, y: y), hasta: CGPoint(x: ancho * 0.1, y: y))
                pausa(0.8)
                revisar("arta-08-tareas-filtros-al-final")
                arrastrar(desde: CGPoint(x: ancho * 0.1, y: y), hasta: CGPoint(x: ancho * 0.9, y: y))
                pausa(0.5)
            }
            if abrir([porPrefijo("task-row-")], desde: "Tareas") {
                pausa(1.5)
                revisar("arta-09-tarea")
                deslizarArriba(2)
                revisar("arta-10-tarea-abajo")
                volver(a: "Tareas", pestana: .tareas)
            } else {
                omitir("revisión: no se abrió ninguna tarea")
            }
        }

        if irAPestana(.inicio) {
            asegurarRaiz(.inicio, titulo: "Inicio")
            // El final de Inicio contra la barra de pestañas.
            deslizarArriba(4)
            revisar("arta-11-inicio-abajo")
            subirAlInicio(porId("inicio-entity-chip"))

            // Hoja de nueva tarea.
            if tocarSiExiste([porId("inicio-new-task")], timeout: 6) {
                pausa(1.5)
                revisar("arta-12-nueva-tarea")
                cerrarHoja(["Cancelar"])
            }

            // Aprobaciones y el detalle de la orden de compra.
            asegurarRaiz(.inicio, titulo: "Inicio")
            if abrir([porId("inicio-approvals"), porId("inicio-approvals-card")], desde: "Inicio") {
                pausa(1.2)
                if tocarSiExiste([porPrefijo("approval-order-")], timeout: 6) {
                    pausa(1.8)
                    revisar("arta-13-orden-de-compra")
                    deslizarArriba(2)
                    revisar("arta-14-orden-de-compra-abajo")
                    cerrarHoja(["Cerrar"])
                }
                volver(a: "Inicio", pestana: .inicio)
            }

            // Evento: el final de la ficha y su pestaña de tareas.
            asegurarRaiz(.inicio, titulo: "Inicio")
            if abrir([porPrefijo("inicio-event-")], desde: "Inicio") {
                pausa(1.5)
                deslizarArriba(4)
                revisar("arta-15-evento-abajo")
                for _ in 0..<4 { app.swipeDown(); pausa(0.4) }
                let tareasDelEvento = app.segmentedControls.buttons["Tareas"]
                if tareasDelEvento.exists {
                    tocar(tareasDelEvento)
                    pausa(1.0)
                    revisar("arta-16-evento-tareas")
                }
                volver(a: "Inicio", pestana: .inicio)
            }
        }

        // Más: arriba y el final de la lista.
        if tocarSiExiste([app.tabBars.buttons.matching(identifier: "tab-mas").firstMatch, porId("tab-mas")], timeout: 6) {
            pausa(1.0)
            revisar("arta-17-mas")
            deslizarArriba(4)
            revisar("arta-18-mas-abajo")
        }

        // Chats: información del canal del evento (desde el título de la conversación).
        if irAPestana(.chats) {
            pausa(0.8)
            let tituloChats = tituloActual()
            if abrir([porPrefijo("chat-event-")], desde: tituloChats) {
                pausa(1.5)
                let cabecera = app.navigationBars.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Noche de Boleros")).firstMatch
                if tocarSiExiste([cabecera], timeout: 4) {
                    pausa(1.5)
                    revisar("arta-19-canal-info")
                }
                volver(a: tituloChats, pestana: .chats)
                volver(a: tituloChats, pestana: .chats)
            }
        }
    }

    // MARK: - Letra grande y entrada (relanzan la app)

    /// Dynamic Type XXL: lo que antes se cortaba con «…» debe acomodarse en más renglones.
    private func recorrerLetraGrande() {
        app.terminate()
        app.launchArguments = [
            "-ArtaDemo", "YES",
            "-AppleLanguages", "(es-MX)",
            "-AppleLocale", "es_MX",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXL"
        ]
        app.launch()
        guard buscar(elementosDePestana(.inicio), timeout: 40) != nil else {
            omitir("letra grande: la app no llegó a las pestañas")
            return
        }
        _ = buscar([app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Hola")).firstMatch], timeout: 20)
        pausa(1.5)
        revisar("xxl-01-inicio")
        deslizarArriba(3)
        revisar("xxl-02-inicio-medio")
        if irAPestana(.tareas) {
            pausa(1.5)
            revisar("xxl-03-tareas")
        }
        if irAPestana(.chats) {
            pausa(1.2)
            revisar("xxl-04-chats")
        }
        if irAPestana(.avisos) {
            pausa(1.2)
            revisar("xxl-05-avisos")
        }
    }

    /// Sin modo demo y sin sesión guardada, la app abre en la pantalla de entrada.
    private func capturarLogin() {
        app.terminate()
        app.launchArguments = ["-ArtaDemo", "NO", "-AppleLanguages", "(es-MX)", "-AppleLocale", "es_MX"]
        app.launchEnvironment = ["TZ": "America/Mexico_City"]
        app.launch()
        if buscar([porId("login-email")], timeout: 30) != nil {
            pausa(1.0)
            revisar("login-01-entrada")
        } else {
            omitir("login: no apareció la pantalla de entrada")
            adjuntarJerarquia("dbg-sin-login")
        }
    }

    /// Captura de revisión (sin prefijo `NN-`: el flujo la deja en debug/, no en la tienda).
    private func revisar(_ nombre: String) {
        despejarAlertas()
        esperarSinCarga()
        adjuntarCapturaDebug(nombre)
        revisiones.append(nombre)
    }

    /// Arrastre entre dos puntos de la pantalla (no depende de que un elemento siga visible).
    private func arrastrar(desde: CGPoint, hasta: CGPoint) {
        let origen = app.coordinate(withNormalizedOffset: .zero)
        let inicio = origen.withOffset(CGVector(dx: desde.x, dy: desde.y))
        let fin = origen.withOffset(CGVector(dx: hasta.x, dy: hasta.y))
        inicio.press(forDuration: 0.05, thenDragTo: fin)
    }

    private func deslizarArriba(_ veces: Int) {
        for _ in 0..<veces {
            app.swipeUp()
            pausa(0.5)
        }
        pausa(0.6)
    }

    /// Cierra una hoja con su botón («Cancelar», «Cerrar») o, si no aparece, deslizándola hacia abajo.
    private func cerrarHoja(_ botones: [String]) {
        for nombre in botones {
            let boton = app.buttons[nombre]
            if boton.exists && boton.isHittable {
                boton.tap()
                pausa(1.0)
                return
            }
        }
        let inicio = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15))
        let fin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95))
        inicio.press(forDuration: 0.05, thenDragTo: fin)
        pausa(1.0)
    }

    // MARK: - Auditorio (tema oscuro)

    private func recorrerAuditorio() {
        guard irAPestana(.inicio) else {
            omitir("auditorio: no se encontró la pestaña Inicio")
            return
        }
        asegurarRaiz(.inicio, titulo: "Inicio")
        let chip = porId("inicio-entity-chip")
        guard buscar([chip], timeout: 8) != nil else {
            omitir("auditorio: no apareció el chip de entidad en Inicio")
            adjuntarJerarquia("dbg-sin-chip")
            return
        }
        // Inicio quedó desplazado hacia abajo (aprobaciones, eventos): el chip está arriba.
        subirAlInicio(chip)
        if chip.isHittable {
            chip.tap()
        } else {
            // Atajo de la app: doble toque en la pestaña Inicio.
            app.tabBars.buttons.matching(identifier: Pestana.inicio.id).firstMatch.doubleTap()
        }
        // El aviso «Ahora en Auditorio» dura 1,6 s.
        pausa(0.5)
        adjuntarCapturaDebug("auditorio-00-aviso")
        guard esperarEntidad("Auditorio", chip: chip) else {
            omitir("auditorio: el cambio de entidad no ocurrió")
            adjuntarJerarquia("dbg-sin-cambio")
            return
        }
        _ = buscar([app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Hola")).firstMatch], timeout: 20)
        pausa(2.0)
        esperarSinCarga()
        adjuntarCapturaDebug("auditorio-01-inicio")
        adjuntarJerarquia("dbg-auditorio-inicio")

        if irAPestana(.chats) {
            _ = buscar([porPrefijo("chat-event-"), porPrefijo("chat-row-"), app.cells.firstMatch], timeout: 15)
            pausa(1.0)
            esperarSinCarga()
            adjuntarCapturaDebug("auditorio-02-chats")
            let tituloChats = tituloActual()
            if abrir([porPrefijo("chat-event-"), porPrefijo("chat-row-"), app.cells.firstMatch], desde: tituloChats) {
                pausa(1.5)
                esperarSinCarga()
                adjuntarCapturaDebug("auditorio-03-chat")
                volver(a: tituloChats, pestana: .chats)
            }
        }
        if irAPestana(.tareas) {
            pausa(1.5)
            esperarSinCarga()
            adjuntarCapturaDebug("auditorio-04-tareas")
        }
        if irAPestana(.avisos) {
            pausa(1.0)
            esperarSinCarga()
            adjuntarCapturaDebug("auditorio-05-avisos")
        }
        if tocarSiExiste([app.tabBars.buttons.matching(identifier: "tab-mas").firstMatch, porId("tab-mas")], timeout: 6) {
            pausa(1.0)
            adjuntarCapturaDebug("auditorio-06-mas")
            deslizarArriba(4)
            revisar("auditorio-07-mas-abajo")
        }
        if irAPestana(.tareas) {
            pausa(1.0)
            if abrir([porPrefijo("task-row-")], desde: "Tareas") {
                pausa(1.5)
                revisar("auditorio-08-tarea")
                volver(a: "Tareas", pestana: .tareas)
            }
        }
        if irAPestana(.inicio) {
            asegurarRaiz(.inicio, titulo: "Inicio")
            deslizarArriba(4)
            revisar("auditorio-09-inicio-abajo")
            subirAlInicio(chip)
            if abrir([porId("inicio-approvals"), porId("inicio-approvals-card")], desde: "Inicio") {
                pausa(1.5)
                revisar("auditorio-10-aprobaciones")
                volver(a: "Inicio", pestana: .inicio)
            }
        }

        // De regreso a Arta, como estaba.
        if irAPestana(.inicio) {
            asegurarRaiz(.inicio, titulo: "Inicio")
            if buscar([chip], timeout: 6) != nil {
                subirAlInicio(chip)
                if chip.isHittable { chip.tap() }
                pausa(2.0)
            }
        }
    }

    /// Desliza hacia abajo (el contenido sube) hasta que el elemento de arriba se pueda tocar.
    private func subirAlInicio(_ elemento: XCUIElement) {
        var intentos = 0
        while elemento.exists && !elemento.isHittable && intentos < 5 {
            app.swipeDown()
            pausa(0.6)
            intentos += 1
        }
    }

    /// El chip de Inicio dice la marca de la entidad activa («Auditorio Explanada»).
    private func esperarEntidad(_ nombre: String, chip: XCUIElement) -> Bool {
        let limite = Date().addingTimeInterval(10)
        while Date() < limite {
            if chip.exists && chip.label.contains(nombre) { return true }
            pausa(0.4)
        }
        return false
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
