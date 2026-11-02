import Foundation

/// Modo demostración: la app entera con datos ficticios, sin cuenta y sin red.
///
/// Existe en todas las compilaciones, también la de App Store: Apple revisa la app
/// sin depender de credenciales (guía 2.1) y cualquier persona puede explorarla desde
/// la ficha (guía 3.2) con el botón «Explorar ARTA con datos de muestra» de la
/// pantalla de entrada. También lo usan las capturas de tienda
/// (`.github/workflows/ios-screenshots.yml` + `ArtaAppUITests`), que arrancan con el
/// argumento `-ArtaDemo YES` (dominio de argumentos de `UserDefaults`) o con la
/// variable de entorno `ARTA_DEMO=1`.
///
/// Con el demo activo:
///  - la app entra como la persona de `fixtures/auth__me.json`, solo en memoria: ni
///    cookie, ni `UserDefaults`, ni llavero (`Session.restore` / `Session.enterDemo`);
///  - cada petición HTTP la contesta `DemoURLProtocol` con las respuestas grabadas
///    por `apps/mobile-native/demo/grabar-fixtures.mjs` (organización ficticia);
///    lo que no es del API (fotos de `/uploads`, otros hosts) responde 404;
///  - no se abre el socket, no se pide permiso de avisos ni se registra push;
///  - la hoja y el permiso de ubicación se pueden ver, pero no se mide ni se manda nada (`LocationTracker`);
///  - las secciones que abren el panel web enseñan un aviso (`DemoWebUnavailableView`).
enum DemoMode {
    static let argumentKey = "ArtaDemo"
    static let environmentKey = "ARTA_DEMO"

    private static let lock = NSLock()
    private static var active = launchRequested
    private static var fromLogin = false

    /// `-ArtaDemo YES` (o 1) por el dominio de argumentos de `UserDefaults`, o
    /// `ARTA_DEMO=1`. Se decide una vez por proceso: así arrancan las pruebas de interfaz.
    static let launchRequested: Bool = {
        if UserDefaults.standard.bool(forKey: DemoMode.argumentKey) { return true }
        let raw = (ProcessInfo.processInfo.environment[DemoMode.environmentKey] ?? "").lowercased()
        return ["1", "yes", "true", "on"].contains(raw)
    }()

    /// `-ArtaDemoUbicacion YES`: solo para la captura de la hoja de ubicación. Con `-ArtaDemo YES` a secas la
    /// hoja no sale, para no tapar las demás capturas; desde el botón de la entrada sí sale (Apple la puede ver).
    static let locationSheetRequested = UserDefaults.standard.bool(forKey: "ArtaDemoUbicacion")

    /// Seguro de leer desde cualquier hilo (`DemoURLProtocol.canInit` corre en los de URLSession).
    static var isActive: Bool {
        lock.lock()
        defer { lock.unlock() }
        return active
    }

    /// Entró con el botón de la pantalla de entrada (no por argumento de arranque):
    /// se enseña la pastilla «Modo demostración» con «Salir».
    static var enteredFromLogin: Bool {
        lock.lock()
        defer { lock.unlock() }
        return fromLogin
    }

    /// Botón «Explorar ARTA con datos de muestra».
    static func activateFromLogin() {
        lock.lock()
        active = true
        fromLogin = true
        lock.unlock()
    }

    /// «Salir» de la pastilla o «Cerrar sesión» en Más.
    static func deactivate() {
        lock.lock()
        active = false
        fromLogin = false
        lock.unlock()
    }

    /// Al arrancar (`AppDelegate`): `URLSession.shared` (la usa `AsyncImage`) también
    /// pasa por el interceptor. Se registra siempre: con el demo apagado,
    /// `DemoURLProtocol.canInit` devuelve `false` y no interviene.
    static func bootstrap() {
        _ = sharedRegistration
    }

    /// Se evalúa una sola vez (propiedad estática perezosa).
    private static let sharedRegistration: Bool = URLProtocol.registerClass(DemoURLProtocol.self)

    /// Antepone el interceptor a una configuración de `ApiClient`. Hay que llamarlo
    /// ANTES de crear la `URLSession`: la sesión copia la configuración al nacer. Por
    /// eso va siempre, y es el estado del demo quien decide en cada petición.
    static func install(on config: URLSessionConfiguration) {
        var classes: [AnyClass] = [DemoURLProtocol.self]
        classes.append(contentsOf: config.protocolClasses ?? [])
        config.protocolClasses = classes
    }

    /// La persona en sesión (`fixtures/auth__me.json`, forma `{ "user": {...} }`).
    static func sessionUser() -> UserDto? {
        guard let data = DemoFixtures.data(forKey: "auth/me") else { return nil }
        return (try? JSONDecoder().decode(MeResponse.self, from: data))?.user
    }
}
/// Respuestas grabadas: carpeta `fixtures` en la raíz del bundle (referencia de
/// carpeta en `project.yml`), con `index.json` que lleva de clave a archivo.
enum DemoFixtures {
    private static let directory: URL? = {
        guard let root = Bundle.main.resourceURL else { return nil }
        let dir = root.appendingPathComponent("fixtures", isDirectory: true)
        return FileManager.default.fileExists(atPath: dir.path) ? dir : nil
    }()

    private static let files: [String: String] = {
        guard let dir = DemoFixtures.directory,
              let data = try? Data(contentsOf: dir.appendingPathComponent("index.json")),
              let map = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return map
    }()

    /// Cuerpo grabado para una clave (`chat/channels`, `events?entity=ARTA&scope=current`…).
    static func data(forKey key: String) -> Data? {
        guard let dir = directory, let file = files[key] else { return nil }
        return try? Data(contentsOf: dir.appendingPathComponent(file))
    }

    /// Misma clave que `grabar-fixtures.mjs`: ruta bajo `/api/` más SOLO `entity` y
    /// `scope`, en orden alfabético (`before`, `limit`, `take`, `from`, `to`… no cuentan).
    static func key(path: String, queryItems: [URLQueryItem]) -> String {
        let kept = queryItems
            .filter { ($0.name == "entity" || $0.name == "scope") && !($0.value ?? "").isEmpty }
            .sorted { $0.name < $1.name }
            .map { "\($0.name)=\($0.value ?? "")" }
        return kept.isEmpty ? path : path + "?" + kept.joined(separator: "&")
    }
}

/// Las fixtures traen fechas absolutas del día en que se grabaron (la cuenta se
/// resiembra justo antes: tareas que vencen «hoy», mensajes de hace minutos,
/// eventos de la semana). Para que las capturas se vean igual cualquier otro día,
/// todas las fechas se mueven los días enteros que separan aquel día de hoy
/// (calendario local: la hora del reloj se conserva).
enum DemoClock {
    static let dayOffset: Int = {
        guard let recorded = DemoClock.recordingDate() else { return 0 }
        let cal = Calendar.current
        let from = cal.startOfDay(for: recorded)
        let to = cal.startOfDay(for: Date())
        return cal.dateComponents([.day], from: from, to: to).day ?? 0
    }()

    /// `2026-10-05T01:08:40.463Z` (con o sin fracción de segundo).
    private static let isoPattern = try? NSRegularExpression(
        pattern: #"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z"#
    )

    /// Una fecha sola como valor JSON: `"2026-10-29"`.
    private static let dayPattern = try? NSRegularExpression(
        pattern: #"(?<=")\d{4}-\d{2}-\d{2}(?=")"#
    )

    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let utc: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0) ?? TimeZone.current
        return cal
    }()

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func parse(_ iso: String) -> Date? {
        fractional.date(from: iso) ?? plain.date(from: iso)
    }

    /// Lo más reciente de avisos y chats: la grabación se hace minutos después de sembrar.
    private static func recordingDate() -> Date? {
        var latest: Date?
        let sources: [(key: String, field: String)] = [("notifications", "createdAt"), ("chat/channels", "lastMessageAt")]
        for source in sources {
            guard let data = DemoFixtures.data(forKey: source.key) else { continue }
            let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
            for item in list {
                guard let raw = item[source.field] as? String, let date = parse(raw) else { continue }
                if let current = latest, current >= date { continue }
                latest = date
            }
        }
        return latest
    }

    /// Mueve todas las fechas del cuerpo `dayOffset` días. Sin desfase, no toca nada.
    static func shift(_ data: Data) -> Data {
        let days = dayOffset
        guard days != 0, let text = String(data: data, encoding: .utf8) else { return data }
        var out = replace(isoPattern, in: text) { iso in
            let formatter = iso.contains(".") ? DemoClock.fractional : DemoClock.plain
            guard let date = formatter.date(from: iso),
                  let moved = Calendar.current.date(byAdding: .day, value: days, to: date) else { return nil }
            return formatter.string(from: moved)
        }
        out = replace(dayPattern, in: out) { day in
            guard let date = DemoClock.dayFormatter.date(from: day),
                  let moved = DemoClock.utc.date(byAdding: .day, value: days, to: date) else { return nil }
            return DemoClock.dayFormatter.string(from: moved)
        }
        return Data(out.utf8)
    }

    private static func replace(_ regex: NSRegularExpression?, in text: String, _ transform: (String) -> String?) -> String {
        guard let regex else { return text }
        let source = text as NSString
        let out = NSMutableString(string: text)
        let found = regex.matches(in: text, options: [], range: NSRange(location: 0, length: source.length))
        // De atrás hacia delante: los rangos que quedan por cambiar siguen siendo válidos.
        for match in found.reversed() {
            if let replacement = transform(source.substring(with: match.range)) {
                out.replaceCharacters(in: match.range, with: replacement)
            }
        }
        let result: NSString = out
        return result as String
    }
}
