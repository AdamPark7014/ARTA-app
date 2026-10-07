import XCTest

/// Video para App Review: el recorrido típico de ARTA en el simulador de iPhone,
/// CONTRA PRODUCCIÓN (`ARTA_API_BASE_URL` del proyecto, https://arta.artaproducciones.com/api)
/// con la cuenta de revisión de las tiendas (organización aislada «ARTA Demo · Revisión de
/// tiendas», ver docs/store/CUENTA-REVISION.md). Lo graba `.github/workflows/ios-review-video.yml`
/// con `simctl io recordVideo`.
///
/// A diferencia de `StoreScreenshotsUITests`, la app arranca SIN `-ArtaDemo`: login real.
/// Credenciales: el flujo las pasa como `TEST_RUNNER_REVIEW_EMAIL` / `TEST_RUNNER_REVIEW_PASSWORD`
/// y XCTest las deja en el entorno del runner como `REVIEW_EMAIL` / `REVIEW_PASSWORD`.
/// Nunca se imprimen, ni se anotan, ni se adjuntan (y el flujo además las tacha de los logs).
///
/// Recorrido, con pausas para que el video se pueda seguir:
///   pantalla de inicio de iOS → abrir ARTA → login → permiso de avisos → Inicio →
///   Aprobaciones → Tareas → primera tarea → Chats → canal «Trío Luna de Plata · Noche de
///   Boleros» → enviar «Listo, reviso el rider hoy.» → reportar un mensaje de Mateo →
///   bloquear a Mateo → Más › Usuarios bloqueados → Desbloquear → Más › Eliminar mi cuenta
///   (la web se abre en Safari y se vuelve) → Cerrar sesión.
///
/// Identificadores y etiquetas de la app en los que se apoya:
///   login-email  login-password  login-submit  login-code                 (LoginView)
///   tab-inicio  tab-chats  tab-tareas  tab-mas                            (HomeView)
///   inicio-approvals  inicio-approvals-card                               (InicioView)
///   chat-event-<id> / chat-row-<id>                                       (ChatListView)
///   botón «Enviar» del composer (etiqueta de accesibilidad)               (ConversationView)
///   msg-action-report «Reportar» · msg-action-block «Bloquear a …»        (MessageActionsSheet)
///   report-reason-ofensivo · report-submit «Enviar reporte»               (ReportMessageSheet)
///   diálogo «¿Bloquear a …?» → «Bloquear»                                 (ConversationView)
///   more-blocked-users · blocked-unblock-<id> «Desbloquear»               (MoreView, BlockedUsersView)
///   more-delete-account → «Continuar en la web» · «Cerrar sesión» ×2      (MoreView)
/// Cada búsqueda tiene además un plan B por etiqueta visible.
///
/// TOLERANTE: si un paso no encuentra su pantalla o su botón se anota como OMITIDO (pasos.txt
/// y adjunto «resumen»), se adjunta el árbol de accesibilidad (`dbg-*`) y se sigue. Solo falla
/// si no se pudo iniciar sesión (sin login el video no sirve).
///
/// Señales con el flujo, en la carpeta `ARTA_REVIEW_OUT` (vía `TEST_RUNNER_ARTA_REVIEW_OUT`):
///   listo-para-grabar  la prueba ya está en la pantalla de inicio de iOS: que empiece a grabar
///   grabando           el flujo ya graba (si no llega en 30 s, la prueba sigue igual)
///   fin                la prueba terminó: el flujo corta el video antes de que XCTest cierre la app
///   pasos.txt          «mm:ss  paso», contado desde que empezó la grabación (capítulos del video)
@MainActor
final class ReviewVideoUITests: XCTestCase {

    // MARK: - Datos del recorrido (apps/api/prisma/seed-store-reviewer.ts)

    private enum Dato {
        static let canalDelEvento = "Trío Luna de Plata"
        static let eventoDelCanal = "Noche de Boleros"
        static let mensajeNuevo = "Listo, reviso el rider hoy."
        static let trozoDelMensajeNuevo = "reviso el rider"
        static let autor = "Mateo Ríos Calderón"
        static let autorCorto = "Mateo Ríos"
        /// Trozos del mensaje de Mateo en el canal del evento:
        /// «Ya tengo la cotización de audio; la subí como orden de compra para autorización.»
        static let trozosDelMensajeDeMateo = ["orden de compra para", "cotización de audio"]
        static let motivoDelReporte = "Contenido ofensivo o inapropiado"
        static let idMotivoDelReporte = "report-reason-ofensivo"
        /// Tarea que se abre en el video (vence hoy, de la cuenta demo).
        static let tareaDelVideo = "Confirmar el rider"
    }

    /// Una pestaña del `TabView`: identificador que pone la app, etiqueta visible y título de su raíz.
    private struct Pestana {
        let id: String
        let etiqueta: String
        let titulo: String

        static let inicio = Pestana(id: "tab-inicio", etiqueta: "Inicio", titulo: "Inicio")
        static let chats = Pestana(id: "tab-chats", etiqueta: "Chats", titulo: "Chats")
        static let tareas = Pestana(id: "tab-tareas", etiqueta: "Tareas", titulo: "Tareas")
        static let mas = Pestana(id: "tab-mas", etiqueta: "Más", titulo: "Más")
    }

    /// Botones que contestan una alerta del sistema (permiso de avisos y similares), en orden.
    private static let botonesDeAlertaDelSistema = [
        "Permitir",
        "Allow",
        "Permitir al usar la app",
        "Allow While Using App",
        "Permitir una vez",
        "Allow Once",
        "Ahora no",
        "Not Now",
        "Aceptar",
        "OK"
    ]

    /// Botones inofensivos para cerrar una alerta de la propia app.
    private static let botonesDeAlertaPropia = ["Entendido", "OK", "Aceptar", "Listo", "Cerrar", "Cancelar"]

    /// Botones de barra que cierran una hoja.
    private static let botonesDeCierre = ["Cancelar", "Cerrar", "Listo", "OK", "Cancel", "Done"]

    // MARK: - Estado

    private var app: XCUIApplication!
    private var monitorDeAlertas: NSObjectProtocol?
    /// Cero de los tiempos de pasos.txt: se reinicia cuando el flujo avisa que ya graba.
    private var ceroDelVideo = Date()
    private var pasos: [String] = []
    /// testZDiagnosticoArrastre escribe aparte para no pisar los capítulos del video.
    private var archivoDePasos = "pasos.txt"
    private var omitidos: [String] = []
    /// Ya no estamos en el login: a partir de aquí se pueden adjuntar árboles de accesibilidad
    /// (en el login el árbol trae el correo escrito en el campo).
    private var fueraDelLogin = false

    // MARK: - Ciclo de vida

    override func setUpWithError() throws {
        try super.setUpWithError()
        // Un paso que falla no debe tumbar el resto del video.
        continueAfterFailure = true
        XCUIDevice.shared.orientation = .portrait

        // Permiso de avisos (y cualquier otra alerta del sistema): XCTest llama a este monitor
        // cuando una alerta tapa la app en el siguiente toque.
        monitorDeAlertas = addUIInterruptionMonitor(withDescription: "Alertas del sistema") { [weak self] alerta in
            self?.contestarAlertaDelSistema(alerta) ?? false
        }

        app = XCUIApplication()
        // SIN `-ArtaDemo`: la app habla con el API real de producción.
        app.launchArguments = [
            "-AppleLanguages", "(es-MX)",
            "-AppleLocale", "es_MX"
        ]
        // Hora de México: el runner corre en UTC y «vence hoy» se calcula con el calendario local.
        app.launchEnvironment["TZ"] = "America/Mexico_City"
    }

    // MARK: - Recorrido

    func testVideoParaRevision() throws {
        ceroDelVideo = Date()
        anotar("Prueba iniciada")

        // El video empieza en la pantalla de inicio de iOS y la app se abre desde ahí.
        XCUIDevice.shared.press(.home)
        pausa(1.0)
        esperarGrabacion()
        pausa(2.0)
        app.launch()
        if !app.wait(for: .runningForeground, timeout: 30) {
            omitir("arranque: la app no llegó a primer plano en 30 s")
        }
        anotar("ARTA abierta")
        pausa(1.5)

        guard iniciarSesion() else {
            XCTFail("No se pudo iniciar sesión con la cuenta de revisión; el motivo está en pasos.txt")
            terminar()
            return
        }
        fueraDelLogin = true

        responderPermisoDeAvisos()
        recorrerInicio()
        recorrerAprobaciones()
        recorrerTareas()
        recorrerChatDelEvento()
        recorrerUsuariosBloqueados()
        mostrarEliminarCuenta()
        cerrarSesion()
        terminar()
    }

    /// Fuera del video (corre después y no se graba): ¿arrastrar la conversación con el teclado
    /// abierto cuelga la app? En la corrida 37508712069 el hilo principal dejó de contestar justo
    /// tras ese arrastre. El flujo toma `sample` del proceso si los pasos se quedan quietos.
    func testZDiagnosticoArrastre() throws {
        archivoDePasos = "diagnostico.txt"
        ceroDelVideo = Date()
        app.launch()
        guard iniciarSesion() else {
            XCTFail("Diagnóstico: no se pudo iniciar sesión")
            return
        }
        fueraDelLogin = true
        responderPermisoDeAvisos()
        guard irAPestana(.chats) else { return omitir("diagnóstico: sin pestaña Chats") }
        asegurarRaiz(.chats)
        esperarSinCarga(10)
        guard let canal = buscarDesplazando(candidatosDelCanal(), pasos: 4, espera: 3) else {
            return omitir("diagnóstico: no se encontró el canal")
        }
        tocar(canal)
        guard let campo = buscar(candidatosDelComposer(), timeout: 15) else {
            return omitir("diagnóstico: no se abrió la conversación")
        }
        esperarSinCarga(8)
        pausa(1.5)

        // A: teclado abierto, sin escribir nada.
        tocar(campo)
        pausa(1.5)
        anotar("A: teclado abierto (\(app.keyboards.firstMatch.exists ? "sí" : "no")), arrastre")
        arrastrarConversacionHaciaElTeclado()
        pausa(3.0)
        guard appResponde("A tras el arrastre") else { return }
        anotar("A: teclado tras el arrastre: \(app.keyboards.firstMatch.exists ? "sigue arriba" : "se ocultó")")

        // B: como en el video: escribir, enviar y arrastrar.
        if let campo = buscar(candidatosDelComposer(), timeout: 3) {
            tocar(campo)
            pausa(1.0)
            campo.typeText("Recibido.")
            pausa(1.0)
            if let enviar = buscar([porId("chat-send"), botonExacto("Enviar")], timeout: 4) {
                tocar(enviar)
                pausa(3.0)
                anotar("B: mensaje enviado, arrastre")
                arrastrarConversacionHaciaElTeclado()
                pausa(3.0)
                guard appResponde("B tras el arrastre") else { return }
                anotar("B: teclado tras el arrastre: \(app.keyboards.firstMatch.exists ? "sigue arriba" : "se ocultó")")
            }
        }

        // C: arrastre lento con el dedo (deslizar la lista hacia abajo, sin teclado de por medio).
        app.scrollViews.firstMatch.swipeDown(velocity: .slow)
        pausa(3.0)
        _ = appResponde("C tras deslizar la lista")
    }

    // MARK: - Pasos

    /// Escribe correo y contraseña de la cuenta de revisión y entra. `false` si no se pudo.
    private func iniciarSesion() -> Bool {
        let entorno = ProcessInfo.processInfo.environment
        let correo = (entorno["REVIEW_EMAIL"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let clave = entorno["REVIEW_PASSWORD"] ?? ""

        let campoCorreo = porId("login-email")
        let pestanas = elementosDePestana(.inicio)

        guard buscar([campoCorreo] + pestanas, timeout: 45) != nil else {
            omitir("login: no apareció ni el login ni las pestañas en 45 s · textos: \(textosVisibles())")
            return false
        }
        if !campoCorreo.exists, buscar(pestanas, timeout: 0) != nil {
            anotar("Ya había una sesión abierta: se salta el login")
            return true
        }
        guard !correo.isEmpty, !clave.isEmpty else {
            omitir("login: faltan REVIEW_EMAIL / REVIEW_PASSWORD (TEST_RUNNER_REVIEW_EMAIL / TEST_RUNNER_REVIEW_PASSWORD)")
            return false
        }

        anotar("Login")
        pausa(1.5)
        tocar(campoCorreo)
        pausa(0.6)
        campoCorreo.typeText(correo)
        pausa(0.8)

        guard let campoClave = buscar([porId("login-password"), app.secureTextFields.firstMatch], timeout: 5) else {
            omitir("login: no apareció el campo de contraseña (login-password)")
            return false
        }
        tocar(campoClave)
        pausa(0.6)
        campoClave.typeText(clave)
        // Sin pausa aquí: así el último carácter de la contraseña no se queda a la vista.
        let entrar = buscar([porId("login-submit"), botonExacto("Entrar")], timeout: 2)
        if let entrar, entrar.isEnabled, entrar.isHittable {
            entrar.tap()
        } else {
            // `.onSubmit` del campo de contraseña también entra.
            campoClave.typeText("\n")
        }

        let limite = Date().addingTimeInterval(45)
        while Date() < limite {
            if buscar(pestanas, timeout: 0) != nil {
                anotar("Sesión iniciada")
                return true
            }
            if porId("login-code").exists {
                omitir("login: la cuenta pidió código de verificación (2FA); la cuenta de revisión debe tenerlo apagado")
                return false
            }
            pausa(0.5)
        }
        // Solo textos estáticos (el aviso de error); el campo de correo no es un texto estático.
        omitir("login: sin pestañas tras 45 s · textos: \(textosVisibles())")
        return false
    }

    /// El permiso de avisos sale justo después de entrar. Se deja ver y se contesta.
    private func responderPermisoDeAvisos() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alerta = springboard.alerts.firstMatch
        if alerta.waitForExistence(timeout: 8) {
            pausa(1.8)
            if contestarAlertaDelSistema(alerta) {
                anotar("Permiso de avisos contestado")
            }
        } else {
            anotar("No apareció el permiso de avisos (ya decidido o llegará después)")
        }
        // Toque neutro en la barra de estado: si quedó una alerta, dispara el monitor.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.02)).tap()
        pausa(1.0)
    }

    private func recorrerInicio() {
        guard irAPestana(.inicio) else {
            omitir("inicio: no se encontró la pestaña")
            return
        }
        esperarSinCarga(10)
        _ = buscar([
            porId("inicio-new-task"),
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Hola")).firstMatch
        ], timeout: 15)
        anotar("Inicio")
        pausa(2.5)
        // Un vistazo a lo de abajo (aprobaciones, eventos de la semana) y de regreso.
        desplazar(haciaArriba: false)
        pausa(1.5)
        desplazar(haciaArriba: true)
        pausa(1.0)
    }

    private func recorrerAprobaciones() {
        asegurarRaiz(.inicio)
        let accesos = [
            porId("inicio-approvals"),
            porId("inicio-approvals-card"),
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Aprobaciones")).firstMatch
        ]
        guard let acceso = buscarDesplazando(accesos, pasos: 3, espera: 3) else {
            omitir("aprobaciones: no se encontró el acceso en Inicio (inicio-approvals)")
            adjuntarJerarquia("dbg-inicio")
            return
        }
        tocar(acceso)
        guard esperarTitulo("Aprobaciones", timeout: 8) else {
            omitir("aprobaciones: el acceso no abrió la pantalla")
            volver(a: .inicio)
            return
        }
        esperarSinCarga(10)
        anotar("Aprobaciones")
        pausa(2.5)
        desplazar(haciaArriba: false)
        pausa(1.5)
        desplazar(haciaArriba: true)
        pausa(1.2)
        volver(a: .inicio)
        pausa(1.0)
    }

    private func recorrerTareas() {
        guard irAPestana(.tareas) else {
            omitir("tareas: no se encontró la pestaña")
            return
        }
        esperarSinCarga(12)
        anotar("Tareas")
        pausa(2.0)
        // La primera «celda» de la lista es la fila de filtros (Pendientes, Vencidas…): se busca la tarea.
        let tarea = NSPredicate(format: "label CONTAINS %@", Dato.tareaDelVideo)
        let candidatas = [
            app.buttons.matching(tarea).firstMatch,
            app.cells.containing(tarea).firstMatch,
            app.staticTexts.matching(tarea).firstMatch
        ]
        guard let fila = buscarTocable(candidatas, timeout: 8) ?? primeraFilaTocable(timeout: 4, altoMinimo: 56) else {
            omitir("tareas: la lista no mostró ninguna tarea")
            adjuntarJerarquia("dbg-tareas")
            return
        }
        tocar(fila)
        guard esperarTitulo("Tarea", timeout: 8) else {
            omitir("tareas: la fila no abrió el detalle")
            volver(a: .tareas)
            return
        }
        esperarSinCarga(10)
        anotar("Detalle de la primera tarea")
        pausa(2.5)
        desplazar(haciaArriba: false)
        pausa(1.5)
        volver(a: .tareas)
        pausa(1.0)
    }

    private func recorrerChatDelEvento() {
        guard irAPestana(.chats) else {
            omitir("chat: no se encontró la pestaña Chats")
            return
        }
        asegurarRaiz(.chats)
        esperarSinCarga(10)
        _ = buscar([porPrefijo("chat-event-"), porPrefijo("chat-row-"), app.cells.firstMatch], timeout: 15)
        anotar("Chats")
        pausa(2.0)

        var hallado = buscarDesplazando(candidatosDelCanal(), pasos: 4, espera: 2)
        if hallado == nil, tocarSiExiste([botonExacto("Expandir Eventos")], timeout: 1) {
            hallado = buscarDesplazando(candidatosDelCanal(), pasos: 3, espera: 2)
        }
        guard let canal = hallado else {
            omitir("chat: no se encontró el canal «\(Dato.canalDelEvento) · \(Dato.eventoDelCanal)»")
            adjuntarJerarquia("dbg-chats")
            return
        }
        tocar(canal)
        guard buscar(candidatosDelComposer(), timeout: 15) != nil else {
            omitir("chat: el canal del evento no se abrió (no aparece el campo «Mensaje»)")
            adjuntarJerarquia("dbg-conversacion")
            volver(a: .chats)
            return
        }
        esperarSinCarga(8)
        anotar("Canal del evento «\(Dato.canalDelEvento) · \(Dato.eventoDelCanal)»")
        pausa(2.5)

        enviarMensaje()
        reportarMensajeDeMateo()
        bloquearAMateo()

        volver(a: .chats)
        pausa(1.0)
    }

    private func enviarMensaje() {
        guard let campo = buscar(candidatosDelComposer(), timeout: 5) else {
            omitir("mensaje: no se encontró el campo «Mensaje»")
            return
        }
        tocar(campo)
        pausa(0.8)
        campo.typeText(Dato.mensajeNuevo)
        pausa(1.2)
        guard let enviar = buscar([
            porId("chat-send"),
            botonExacto("Enviar")
        ], timeout: 4) else {
            omitir("mensaje: no apareció el botón «Enviar»")
            adjuntarJerarquia("dbg-composer")
            return
        }
        tocar(enviar)
        let enviado = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", Dato.trozoDelMensajeNuevo)).firstMatch
        if enviado.waitForExistence(timeout: 8) {
            anotar("Mensaje enviado: «\(Dato.mensajeNuevo)»")
        } else {
            anotar("Mensaje enviado, pero no se vio en la conversación a tiempo")
        }
        // El teclado se queda arriba: el mensaje de Mateo se ve encima de él y la hoja de acciones
        // lo tapa. Arrastrar la conversación para bajarlo colgó la app en el simulador
        // (corrida 37508712069); eso lo revisa aparte testZDiagnosticoArrastre.
        pausa(2.5)
    }

    private func reportarMensajeDeMateo() {
        guard abrirMenuDeMensajeDeMateo() else {
            omitir("reportar: no se encontró un mensaje de \(Dato.autor) (¿sigue bloqueado de otra corrida?)")
            adjuntarJerarquia("dbg-sin-mensaje-de-mateo")
            return
        }
        guard let reportar = buscar([porId("msg-action-report"), botonExacto("Reportar")], timeout: 4) else {
            omitir("reportar: el menú del mensaje no tiene «Reportar» (msg-action-report)")
            adjuntarJerarquia("dbg-menu-mensaje")
            cerrarHoja()
            return
        }
        pausa(1.2)
        tocar(reportar)

        guard let motivo = buscar([
            porId(Dato.idMotivoDelReporte),
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", Dato.motivoDelReporte)).firstMatch,
            app.cells.containing(NSPredicate(format: "label BEGINSWITH %@", Dato.motivoDelReporte)).firstMatch,
            app.staticTexts.matching(NSPredicate(format: "label == %@", Dato.motivoDelReporte)).firstMatch
        ], timeout: 6) else {
            omitir("reportar: no se abrió la hoja de motivos (\(Dato.idMotivoDelReporte))")
            adjuntarJerarquia("dbg-hoja-reporte")
            cerrarHoja()
            return
        }
        anotar("Hoja «Reportar mensaje»")
        pausa(1.8)
        tocar(motivo)
        pausa(1.2)

        guard let enviar = buscar([
            porId("report-submit"),
            botonExacto("Enviar reporte"),
            botonExacto("Enviar"),
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Enviar")).firstMatch
        ], timeout: 4) else {
            omitir("reportar: no apareció «Enviar reporte» (report-submit)")
            adjuntarJerarquia("dbg-hoja-reporte")
            cerrarHoja()
            return
        }
        if !enviar.isEnabled {
            // El motivo no quedó marcado: un segundo toque.
            tocar(motivo)
            pausa(0.8)
        }
        tocar(enviar)
        anotar("Reporte enviado: «\(Dato.motivoDelReporte)»")
        mostrarConfirmacion("reporte", contiene: "Gracias")

        // Si el API respondió con error, la hoja sigue abierta con el aviso: se cierra.
        if porId("report-submit").exists || porId(Dato.idMotivoDelReporte).exists {
            omitir("reportar: la hoja siguió abierta tras enviar · textos: \(textosVisibles())")
            cerrarHoja()
        }
        pausa(1.0)
    }

    private func bloquearAMateo() {
        guard abrirMenuDeMensajeDeMateo() else {
            omitir("bloquear: no se encontró un mensaje de \(Dato.autor)")
            return
        }
        guard let bloquear = buscar([
            porId("msg-action-block"),
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Bloquear a")).firstMatch
        ], timeout: 4) else {
            omitir("bloquear: el menú del mensaje no tiene «Bloquear a…» (msg-action-block)")
            adjuntarJerarquia("dbg-menu-mensaje")
            cerrarHoja()
            return
        }
        pausa(1.2)
        tocar(bloquear)
        pausa(1.0)

        // Diálogo «¿Bloquear a Mateo Ríos Calderón?» → «Bloquear».
        if let confirmar = buscarConfirmacion(
            "Bloquear",
            ids: ["block-confirm", "msg-block-confirm", "chat-block-confirm"],
            evitando: nil,
            timeout: 5
        ) {
            anotar("Confirmación «¿Bloquear a \(Dato.autor)?»")
            pausa(2.2)
            tocar(confirmar)
            anotar("\(Dato.autor) bloqueado")
        } else {
            omitir("bloquear: no apareció la confirmación «Bloquear»")
            adjuntarJerarquia("dbg-confirmar-bloqueo")
        }
        // Sus mensajes desaparecen de la conversación y sale «Bloqueaste a …».
        pausa(3.0)
        despejarAlertasPropias()
        if buscar(candidatosDelMensajeDeMateo(), timeout: 0) != nil {
            anotar("Aviso: los mensajes de \(Dato.autor) siguen a la vista tras bloquear")
        }
    }

    private func recorrerUsuariosBloqueados() {
        guard irAPestana(.mas) else {
            omitir("bloqueados: no se encontró la pestaña Más")
            return
        }
        asegurarRaiz(.mas)
        anotar("Más")
        pausa(1.5)
        guard let fila = buscarDesplazando([
            porId("more-blocked-users"),
            app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Usuarios bloqueados")).firstMatch,
            app.cells.containing(NSPredicate(format: "label CONTAINS %@", "Usuarios bloqueados")).firstMatch,
            app.staticTexts.matching(NSPredicate(format: "label == %@", "Usuarios bloqueados")).firstMatch
        ], pasos: 8, espera: 1.5) else {
            omitir("bloqueados: Más no tiene «Usuarios bloqueados» (more-blocked-users)")
            adjuntarJerarquia("dbg-mas")
            return
        }
        pausa(1.0)
        tocar(fila)
        guard esperarTitulo("Usuarios bloqueados", timeout: 8) else {
            omitir("bloqueados: la fila no abrió «Usuarios bloqueados»")
            volver(a: .mas)
            return
        }
        esperarSinCarga(10)
        anotar("Usuarios bloqueados")
        pausa(2.5)

        let desbloquear = buscar([
            app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "blocked-unblock-")).firstMatch,
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Desbloquear")).firstMatch
        ], timeout: 6)
        if let desbloquear {
            let marco: CGRect? = desbloquear.exists ? desbloquear.frame : nil
            tocar(desbloquear)
            pausa(1.0)
            // Hoy no pide confirmación; si algún día la pide, se acepta.
            if let confirmar = buscarConfirmacion("Desbloquear", ids: ["unblock-confirm"], evitando: marco, timeout: 2) {
                pausa(1.5)
                tocar(confirmar)
            }
            anotar("\(Dato.autor) desbloqueado")
            pausa(2.5)
        } else {
            omitir("bloqueados: la lista no tiene «Desbloquear» (¿no se bloqueó a nadie?)")
            adjuntarJerarquia("dbg-bloqueados")
        }
        volver(a: .mas)
        pausa(1.0)
    }

    /// «Eliminar mi cuenta» abre la web de ARTA en Safari: se deja ver unos segundos y se vuelve.
    private func mostrarEliminarCuenta() {
        guard irAPestana(.mas) else {
            omitir("eliminar cuenta: no se encontró la pestaña Más")
            return
        }
        asegurarRaiz(.mas)
        guard let boton = buscarDesplazando([
            porId("more-delete-account"),
            botonExacto("Eliminar mi cuenta")
        ], pasos: 10, espera: 1.5) else {
            omitir("eliminar cuenta: no se encontró «Eliminar mi cuenta» (more-delete-account)")
            adjuntarJerarquia("dbg-mas")
            return
        }
        pausa(1.5)
        tocar(boton)

        // Diálogo «¿Eliminar tu cuenta?» → «Continuar en la web».
        if let continuar = buscar([
            app.sheets.buttons["Continuar en la web"],
            app.alerts.buttons["Continuar en la web"],
            botonExacto("Continuar en la web")
        ], timeout: 5) {
            anotar("Diálogo «¿Eliminar tu cuenta?»")
            pausa(2.5)
            tocar(continuar)
        } else {
            anotar("Eliminar mi cuenta: sin diálogo, se espera la web directo")
        }

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        if safari.wait(for: .runningForeground, timeout: 10) {
            _ = safari.webViews.firstMatch.waitForExistence(timeout: 10)
            anotar("Página «Eliminar cuenta» en Safari")
            pausa(3.0)
            // Más lento que el «◀︎ ARTA» de la barra de estado, pero no depende de su posición.
            app.activate()
            if !app.wait(for: .runningForeground, timeout: 10) {
                omitir("eliminar cuenta: la app no volvió a primer plano tras Safari")
            } else {
                anotar("De vuelta en ARTA")
            }
        } else if let listo = buscar(Self.botonesDeCierre.map { app.buttons[$0] }, timeout: 3) {
            // Hoja de Safari dentro de la app (SFSafariViewController).
            anotar("Página «Eliminar cuenta» en hoja de Safari")
            pausa(3.0)
            tocar(listo)
        } else {
            omitir("eliminar cuenta: no se abrió Safari ni una hoja web")
            adjuntarJerarquia("dbg-eliminar-cuenta")
        }
        pausa(1.5)
    }

    private func cerrarSesion() {
        if app.state != .runningForeground {
            app.activate()
            _ = app.wait(for: .runningForeground, timeout: 10)
        }
        _ = irAPestana(.mas)
        asegurarRaiz(.mas)
        guard let fila = buscarDesplazando([
            porId("more-logout"),
            botonExacto("Cerrar sesión")
        ], pasos: 10, espera: 1.5) else {
            omitir("cerrar sesión: no se encontró «Cerrar sesión»")
            adjuntarJerarquia("dbg-mas")
            return
        }
        pausa(1.2)
        tocar(fila)
        // El botón de la lista y el del diálogo se llaman igual: se toca el que NO es la fila.
        let marcoDeLaFila: CGRect? = fila.exists ? fila.frame : nil
        pausa(1.0)
        if let confirmar = buscarConfirmacion("Cerrar sesión", ids: ["logout-confirm"], evitando: marcoDeLaFila, timeout: 5) {
            anotar("Diálogo «¿Cerrar sesión en este teléfono?»")
            pausa(2.0)
            tocar(confirmar)
        }
        if porId("login-email").waitForExistence(timeout: 20) {
            anotar("Sesión cerrada: de vuelta en el login")
            pausa(2.5)
        } else {
            omitir("cerrar sesión: la app no volvió al login")
            adjuntarJerarquia("dbg-cerrar-sesion")
        }
    }

    /// Resumen, señal de fin y un margen para que el flujo corte el video con la app aún a la vista.
    private func terminar() {
        anotar("Fin del recorrido · pasos omitidos: \(omitidos.count)")
        let lista = omitidos.map { "  - \($0)" }.joined(separator: "\n")
        adjuntarTexto("resumen", pasos.joined(separator: "\n") + "\n\nOmitidos (\(omitidos.count)):\n" + lista + "\n")
        pausa(1.5)
        senal("fin")
        pausa(4.0)
    }

    // MARK: - Chat

    private func candidatosDelCanal() -> [XCUIElement] {
        let deEvento = NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-event-", Dato.canalDelEvento)
        let cualquiera = NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-", Dato.canalDelEvento)
        let porEvento = NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "chat-", Dato.eventoDelCanal)
        let porNombre = NSPredicate(format: "label CONTAINS %@", Dato.canalDelEvento)
        return [
            app.descendants(matching: .any).matching(deEvento).firstMatch,
            app.descendants(matching: .any).matching(cualquiera).firstMatch,
            app.descendants(matching: .any).matching(porEvento).firstMatch,
            app.buttons.matching(porNombre).firstMatch,
            app.cells.matching(porNombre).firstMatch
        ]
    }

    /// El composer es un `TextField(axis: .vertical)`: según la versión llega como textView o textField.
    private func candidatosDelComposer() -> [XCUIElement] {
        let mensaje = NSPredicate(format: "placeholderValue == %@ OR label == %@ OR identifier == %@", "Mensaje", "Mensaje", "chat-composer")
        return [
            app.textViews.matching(mensaje).firstMatch,
            app.textFields.matching(mensaje).firstMatch
        ]
    }

    private func candidatosDelMensajeDeMateo() -> [XCUIElement] {
        var candidatos = Dato.trozosDelMensajeDeMateo.map {
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", $0)).firstMatch
        }
        candidatos.append(app.staticTexts.matching(NSPredicate(format: "label == %@", Dato.autor)).firstMatch)
        candidatos.append(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", Dato.autorCorto)).firstMatch)
        // Por si SwiftUI junta la burbuja en un solo elemento (tiene acciones de accesibilidad).
        if let trozo = Dato.trozosDelMensajeDeMateo.first {
            candidatos.append(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", trozo)).firstMatch)
        }
        return candidatos
    }

    /// Mantiene presionado un mensaje de Mateo hasta que sale el menú del mensaje.
    private func abrirMenuDeMensajeDeMateo() -> Bool {
        let menu = [
            porId("msg-action-report"),
            porId("msg-action-block"),
            porId("msg-action-reply"),
            porId("msg-action-copy"),
            botonExacto("Responder citando"),
            botonExacto("Copiar texto")
        ]
        for intento in 0..<2 {
            // Mensajes más viejos arriba: primero hacia arriba y luego de vuelta.
            guard let mensaje = buscarDesplazando(
                candidatosDelMensajeDeMateo(),
                pasos: 4,
                haciaArriba: true,
                espera: 2,
                contenedor: app.scrollViews.firstMatch
            ) else { return false }
            pausa(0.8)
            mensaje.press(forDuration: 0.9)
            if buscar(menu, timeout: 4) != nil {
                anotar("Menú del mensaje de \(Dato.autor)")
                return true
            }
            anotar("El mensaje de \(Dato.autor) no abrió el menú (intento \(intento + 1))")
            pausa(0.8)
        }
        return false
    }

    /// Arrastra la conversación hacia el teclado (`scrollDismissesKeyboard(.interactively)`),
    /// como quien baja el teclado con el dedo. Solo lo usa testZDiagnosticoArrastre.
    private func arrastrarConversacionHaciaElTeclado() {
        let desde = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.30))
        let hasta = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.92))
        desde.press(forDuration: 0.05, thenDragTo: hasta)
    }

    /// ¿La app sigue contestando? Una consulta barata con reloj: si el hilo principal está
    /// colgado, XCTest tarda ~30 s por intento en rendirse.
    private func appResponde(_ contexto: String) -> Bool {
        let inicio = Date()
        let vivo = app.navigationBars.firstMatch.waitForExistence(timeout: 5)
        let segundos = Date().timeIntervalSince(inicio)
        anotar(String(format: "%@: %@ (%.1f s)", contexto, vivo ? "la app responde" : "LA APP NO RESPONDE", segundos))
        return vivo && segundos < 10
    }

    // MARK: - Avisos y diálogos

    /// Aviso que deja la app tras una acción (banner «Gracias…» o alerta): se deja leer.
    private func mostrarConfirmacion(_ contexto: String, contiene texto: String) {
        let alerta = app.alerts.firstMatch
        let aviso = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", texto)).firstMatch
        guard buscar([aviso, alerta], timeout: 6) != nil else {
            anotar("\(contexto): no se vio aviso de confirmación")
            return
        }
        if aviso.exists {
            anotar("\(contexto): «\(aviso.label)»")
            pausa(2.5)
        } else {
            pausa(2.0)
            despejarAlertasPropias()
        }
    }

    /// Botón que confirma un diálogo (alerta o confirmationDialog). `evitando`: el marco del botón
    /// que lo abrió, por si se llaman igual («Cerrar sesión»).
    private func buscarConfirmacion(_ etiqueta: String, ids: [String], evitando marco: CGRect?, timeout: TimeInterval) -> XCUIElement? {
        let exacta = NSPredicate(format: "label == %@", etiqueta)
        let prefijo = NSPredicate(format: "label BEGINSWITH %@", etiqueta)
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for id in ids {
                let elemento = porId(id)
                if elemento.exists { return elemento }
            }
            let enDialogo = [app.alerts.buttons.matching(prefijo).firstMatch, app.sheets.buttons.matching(prefijo).firstMatch]
            for elemento in enDialogo where elemento.exists {
                return elemento
            }
            let botones = app.buttons.matching(exacta)
            let total = min(botones.count, 6)
            for i in 0..<total {
                let boton = botones.element(boundBy: i)
                guard boton.exists, boton.isHittable else { continue }
                if let marco, boton.frame == marco { continue }
                return boton
            }
            pausa(0.25)
        } while Date() < limite
        return nil
    }

    /// Alertas de la propia app («Algo falló» → «Entendido»): se anotan y se cierran.
    private func despejarAlertasPropias() {
        let alerta = app.alerts.firstMatch
        guard alerta.exists else { return }
        anotar("Alerta de la app: «\(alerta.label)» \(textos(de: alerta))")
        for nombre in Self.botonesDeAlertaPropia {
            let boton = alerta.buttons[nombre]
            if boton.exists {
                boton.tap()
                pausa(0.6)
                return
            }
        }
        let primero = alerta.buttons.firstMatch
        if primero.exists {
            primero.tap()
            pausa(0.6)
        }
    }

    private func contestarAlertaDelSistema(_ alerta: XCUIElement) -> Bool {
        for nombre in Self.botonesDeAlertaDelSistema {
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

    /// Cierra una hoja: con su botón de barra o arrastrándola hacia abajo.
    private func cerrarHoja() {
        for nombre in Self.botonesDeCierre {
            let boton = botonExacto(nombre)
            if boton.exists && boton.isHittable {
                boton.tap()
                pausa(1.0)
                return
            }
        }
        let desde = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.60))
        let hasta = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.98))
        desde.press(forDuration: 0.05, thenDragTo: hasta)
        pausa(1.0)
    }

    // MARK: - Navegación

    private func elementosDePestana(_ pestana: Pestana) -> [XCUIElement] {
        [
            app.tabBars.buttons.matching(identifier: pestana.id).firstMatch,
            app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", pestana.etiqueta)).firstMatch,
            porId(pestana.id)
        ]
    }

    @discardableResult
    private func irAPestana(_ pestana: Pestana) -> Bool {
        despejarAlertasPropias()
        guard let boton = buscar(elementosDePestana(pestana), timeout: 8) else { return false }
        tocar(boton)
        pausa(1.0)
        return true
    }

    /// Tocar la pestaña activa vuelve a la raíz de su pila (`AppRouter.select`).
    private func asegurarRaiz(_ pestana: Pestana) {
        if tituloActual() == pestana.titulo { return }
        _ = irAPestana(pestana)
        pausa(0.8)
    }

    /// Título de la barra de navegación visible ("" si no hay).
    private func tituloActual() -> String {
        let barra = app.navigationBars.firstMatch
        return barra.exists ? barra.identifier : ""
    }

    private func esperarTitulo(_ titulo: String, timeout: TimeInterval) -> Bool {
        let barra = app.navigationBars.matching(identifier: titulo).firstMatch
        let texto = app.navigationBars.staticTexts.matching(NSPredicate(format: "label == %@", titulo)).firstMatch
        return buscar([barra, texto], timeout: timeout) != nil
    }

    /// Vuelve a la raíz de la pestaña: «atrás» de la barra, botón de cierre, deslizar desde el
    /// borde, deslizar una hoja hacia abajo y, al final, tocar la pestaña.
    private func volver(a pestana: Pestana) {
        for intento in 0..<5 {
            if tituloActual() == pestana.titulo { return }
            despejarAlertasPropias()
            switch intento {
            case 0:
                let atras = NSPredicate(
                    format: "identifier == %@ OR label == %@ OR label == %@ OR label == %@",
                    "BackButton", pestana.titulo, "Atrás", "Back"
                )
                if let boton = buscar([app.navigationBars.buttons.matching(atras).firstMatch], timeout: 1.5) {
                    tocar(boton)
                }
            case 1:
                if let boton = buscar(Self.botonesDeCierre.map { app.navigationBars.buttons[$0] }, timeout: 0.5) {
                    tocar(boton)
                } else {
                    deslizarAtras()
                }
            case 2:
                deslizarAtras()
            case 3:
                let desde = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
                let hasta = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95))
                desde.press(forDuration: 0.05, thenDragTo: hasta)
            default:
                _ = irAPestana(pestana)
            }
            pausa(1.0)
        }
    }

    private func deslizarAtras() {
        let inicio = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let fin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
        inicio.press(forDuration: 0.05, thenDragTo: fin)
    }

    /// Arrastre corto y controlado (sin inercia). `haciaArriba`: muestra lo que está más arriba.
    private func desplazar(haciaArriba: Bool, en contenedor: XCUIElement? = nil) {
        if let contenedor, contenedor.exists, contenedor.isHittable {
            if haciaArriba {
                contenedor.swipeDown(velocity: .slow)
            } else {
                contenedor.swipeUp(velocity: .slow)
            }
            pausa(0.6)
            return
        }
        let desde = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: haciaArriba ? 0.35 : 0.72))
        let hasta = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: haciaArriba ? 0.72 : 0.35))
        desde.press(forDuration: 0.05, thenDragTo: hasta)
        pausa(0.6)
    }

    // MARK: - Búsqueda y toques tolerantes

    private func porId(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func porPrefijo(_ prefijo: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefijo)).firstMatch
    }

    private func botonExacto(_ etiqueta: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", etiqueta)).firstMatch
    }

    /// Primer candidato que exista; consulta cada 0,25 s hasta agotar el tiempo.
    private func buscar(_ candidatos: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for candidato in candidatos where candidato.exists {
                return candidato
            }
            if timeout <= 0 { break }
            pausa(0.25)
        } while Date() < limite
        return nil
    }

    /// Primer candidato que exista y se pueda tocar.
    private func buscarTocable(_ candidatos: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for candidato in candidatos where candidato.exists && candidato.isHittable {
                return candidato
            }
            if timeout <= 0 { break }
            pausa(0.25)
        } while Date() < limite
        return nil
    }

    /// Busca algo que puede estar fuera de la pantalla (listas perezosas): primero sin moverse,
    /// luego desplazando en un sentido `pasos` veces y, si no apareció, en el otro.
    private func buscarDesplazando(
        _ candidatos: [XCUIElement],
        pasos: Int = 6,
        haciaArriba: Bool = false,
        espera: TimeInterval = 2,
        contenedor: XCUIElement? = nil
    ) -> XCUIElement? {
        if let elemento = buscarTocable(candidatos, timeout: espera) { return elemento }
        for sentido in [haciaArriba, !haciaArriba] {
            for _ in 0..<pasos {
                desplazar(haciaArriba: sentido, en: contenedor)
                if let elemento = buscarTocable(candidatos, timeout: 0.5) { return elemento }
            }
        }
        // Existe pero XCTest no lo da por tocable: `tocar` lo intentará por coordenada.
        return buscar(candidatos, timeout: 0)
    }

    /// Toca el primer candidato que exista. `false` (sin fallar la prueba) si ninguno aparece.
    @discardableResult
    private func tocarSiExiste(_ candidatos: [XCUIElement], timeout: TimeInterval = 6) -> Bool {
        guard let elemento = buscar(candidatos, timeout: timeout) else { return false }
        tocar(elemento)
        pausa(0.8)
        return true
    }

    /// `tap()` falla si el elemento no es «hittable»: primero se desplaza hacia él y, si aun así
    /// no lo es, se toca por coordenada.
    private func tocar(_ elemento: XCUIElement) {
        guard elemento.exists else { return }
        var intentos = 0
        while elemento.exists && !elemento.isHittable && intentos < 3 {
            desplazar(haciaArriba: false)
            intentos += 1
        }
        guard elemento.exists else { return }
        if elemento.isHittable {
            elemento.tap()
        } else {
            elemento.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    /// La primera fila de lista que se pueda tocar (las de otras pestañas no lo son).
    private func primeraFilaTocable(timeout: TimeInterval, altoMinimo: CGFloat = 30) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            let celdas = app.cells
            let total = min(celdas.count, 12)
            for i in 0..<total {
                let celda = celdas.element(boundBy: i)
                if celda.exists && celda.isHittable && celda.frame.height > altoMinimo {
                    return celda
                }
            }
            pausa(0.4)
        } while Date() < limite
        return nil
    }

    /// Espera (acotado) a que no quede indicador de carga ni esqueleto «Cargando».
    private func esperarSinCarga(_ segundos: TimeInterval = 8) {
        let cargando = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@ OR label == %@ OR label == %@", "Cargando", "Cargando conversaciones", "Cargando mensajes")
        ).firstMatch
        let limite = Date().addingTimeInterval(segundos)
        while Date() < limite {
            if !cargando.exists && app.activityIndicators.count == 0 { return }
            pausa(0.3)
        }
    }

    private func pausa(_ segundos: TimeInterval) {
        Thread.sleep(forTimeInterval: segundos)
    }

    // MARK: - Señales con el flujo y registro

    private func carpetaDeSalida() -> URL? {
        guard let ruta = ProcessInfo.processInfo.environment["ARTA_REVIEW_OUT"], !ruta.isEmpty else { return nil }
        let carpeta = URL(fileURLWithPath: ruta, isDirectory: true)
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        return carpeta
    }

    private func senal(_ nombre: String) {
        guard let carpeta = carpetaDeSalida() else { return }
        try? "\(Date().timeIntervalSince1970)\n".write(to: carpeta.appendingPathComponent(nombre), atomically: true, encoding: .utf8)
    }

    /// Pide al flujo que empiece a grabar y espera (máx. 30 s) a que lo confirme.
    private func esperarGrabacion() {
        guard let carpeta = carpetaDeSalida() else {
            anotar("Sin ARTA_REVIEW_OUT: no hay señal de grabación")
            return
        }
        senal("listo-para-grabar")
        let grabando = carpeta.appendingPathComponent("grabando").path
        let limite = Date().addingTimeInterval(30)
        while Date() < limite {
            if FileManager.default.fileExists(atPath: grabando) {
                ceroDelVideo = Date()
                anotar("Grabación en curso (pantalla de inicio de iOS)")
                return
            }
            pausa(0.25)
        }
        anotar("No llegó la señal «grabando» en 30 s: se sigue igual")
    }

    /// Paso con su minuto:segundo desde que empezó la grabación. Nunca lleva credenciales.
    private func anotar(_ texto: String) {
        let segundos = max(0, Int(Date().timeIntervalSince(ceroDelVideo)))
        let linea = String(format: "%02ld:%02ld  ", segundos / 60, segundos % 60) + texto
        pasos.append(linea)
        print("[ARTA-VIDEO] \(linea)")
        guard let carpeta = carpetaDeSalida() else { return }
        try? (pasos.joined(separator: "\n") + "\n").write(
            to: carpeta.appendingPathComponent(archivoDePasos),
            atomically: true,
            encoding: .utf8
        )
    }

    private func omitir(_ motivo: String) {
        omitidos.append(motivo)
        anotar("OMITIDO · \(motivo)")
    }

    private func adjuntarTexto(_ nombre: String, _ texto: String) {
        let adjunto = XCTAttachment(string: texto)
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
    }

    /// Árbol de accesibilidad de la pantalla actual. Nunca en el login (trae el correo escrito).
    private func adjuntarJerarquia(_ nombre: String) {
        guard fueraDelLogin else { return }
        adjuntarTexto(nombre, app.debugDescription)
    }

    /// Textos estáticos de la pantalla (avisos de error); los campos de texto no entran.
    private func textosVisibles(_ maximo: Int = 25) -> String {
        let textos = app.staticTexts.allElementsBoundByIndex.prefix(maximo).compactMap { texto -> String? in
            guard texto.exists else { return nil }
            let etiqueta = texto.label
            return etiqueta.isEmpty ? nil : etiqueta
        }
        return textos.joined(separator: " | ")
    }

    private func textos(de elemento: XCUIElement) -> String {
        elemento.staticTexts.allElementsBoundByIndex.compactMap { texto -> String? in
            guard texto.exists else { return nil }
            let etiqueta = texto.label
            return etiqueta.isEmpty ? nil : etiqueta
        }.joined(separator: " · ")
    }
}
