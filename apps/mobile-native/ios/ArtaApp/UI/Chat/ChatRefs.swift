import SwiftUI

// Referencias del chat: arrobar tareas, eventos, OC, formatos, documentos y anticipos
// (docs/CHAT-V2-CONTRATO.md §9). El cuerpo lleva `@Etiqueta` en texto plano y la tarjeta trae el
// estado al momento de leer, con los permisos de quien lee. Espejo de `RefCard.tsx` de la web.

// MARK: - Tipos

/// `kind` del contrato, en el orden del selector.
enum ChatRefKind: String, CaseIterable, Identifiable {
    case task, event, po, format, doc, advance

    var id: String { rawValue }

    var title: String {
        switch self {
        case .task: return "Tareas"
        case .event: return "Eventos"
        case .po: return "Órdenes de compra"
        case .format: return "Formatos"
        case .doc: return "Documentos"
        case .advance: return "Anticipos"
        }
    }

    /// Los mismos símbolos con los que estas cosas ya salen en la app (avisos y hub del evento).
    var symbol: String {
        switch self {
        case .task: return "checklist"
        case .event: return "calendar"
        case .po: return "doc.text"
        case .format: return "list.clipboard"
        case .doc: return "doc"
        case .advance: return "banknote"
        }
    }
}

/// Lo que esta persona puede hacer desde la tarjeta, sin abrir la pantalla.
enum ChatRefAction: String {
    case deliver, complete, approve

    var title: String {
        switch self {
        case .deliver: return "Entregar"
        case .complete: return "Marcar hecha"
        case .approve: return "Aprobar"
        }
    }
}

extension ChatRef {
    var symbol: String { ChatRefKind(rawValue: kind)?.symbol ?? "link" }
    var isMissing: Bool { missing == true }
    /// Llegó por socket: solo trae la etiqueta hasta que se pida su tarjeta.
    var isUnresolved: Bool { resolved == false }
    /// El chip lleva a algún lado.
    var isOpenable: Bool { canOpen == true && !isMissing && !(href ?? "").isEmpty }
    /// Sin acceso no hay tarjeta, solo el chip apagado.
    var showsCard: Bool { canOpen == true && !isMissing }
    var displayTitle: String {
        if let title, !title.isEmpty { return title }
        return label
    }
    /// Relleno = te toca actuar; contorno = solo informa.
    var wantsAction: Bool { tone == "action" }

    var pillTone: PillTone {
        switch tone ?? "" {
        case "action": return .warn
        case "late": return .danger
        case "done": return .ok
        default: return .neutral
        }
    }

    /// Una app vieja ignora las acciones que todavía no conoce.
    var knownActions: [ChatRefAction] { (actions ?? []).compactMap(ChatRefAction.init(rawValue:)) }

    /// Segundo renglón del selector: «Por revisar · vence el vie 7 nov».
    var detailLine: String {
        [statusLabel, subtitle].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Liga interna del chip: `Text` solo sabe de URLs y el destino real es una ruta del panel.
enum ChatRefLink {
    private static let scheme = "arta-ref"

    static func url(href: String) -> URL? {
        // Todo escapado: la ruta trae su propio `?` y `&` (`/events/1?tab=tasks&task=2`).
        guard !href.isEmpty, let encoded = href.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return nil }
        return URL(string: "\(scheme)://open?href=\(encoded)")
    }

    /// `nil`: es una liga normal, no un chip.
    static func href(from url: URL) -> String? {
        guard url.scheme == scheme else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "href" })?
            .value
    }
}

// MARK: - Tarjetas

/// Debajo del mensaje: hasta tres; lo demás con «Ver N más».
struct ChatRefCards: View {
    /// Ya solo las que se pueden abrir (`showsCard`).
    let refs: [ChatRef]
    let busyKey: String?
    var onAction: (ChatRef, ChatRefAction) -> Void

    @State private var showAll = false

    private static let visible = 3

    var body: some View {
        let shown = showAll ? refs : Array(refs.prefix(Self.visible))
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            ForEach(shown, id: \.key) { ref in
                ChatRefCard(ref: ref, busy: busyKey == ref.key) { action in
                    onAction(ref, action)
                }
            }
            if refs.count > shown.count {
                Button {
                    Haptics.selection()
                    withAnimation(.snappy(duration: 0.22)) { showAll = true }
                } label: {
                    Text("Ver \(refs.count - shown.count) más")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArtaColor.muted)
                        .artaHitArea(dx: ArtaSpace.s, dy: ArtaSpace.m)
                }
                .buttonStyle(ArtaPressStyle(scale: 0.97))
            }
        }
    }
}

/// Tarjeta en vivo: qué es, cómo va y lo que te toca hacer ahí mismo.
struct ChatRefCard: View {
    let ref: ChatRef
    var busy = false
    var onAction: (ChatRefAction) -> Void

    private var people: [ChatRefPerson] { ref.people ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.m) {
            Button {
                Haptics.tap()
                if let href = ref.href, !href.isEmpty { AppRouter.shared.openPanel(path: href) }
            } label: {
                summary
            }
            .buttonStyle(ArtaPressStyle(scale: 0.99))
            .disabled(!ref.isOpenable)
            if !ref.knownActions.isEmpty {
                HStack(spacing: ArtaSpace.s) {
                    ForEach(ref.knownActions, id: \.self) { action in
                        actionButton(action)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .artaCard(padding: ArtaSpace.m)
    }

    private var summary: some View {
        HStack(alignment: .top, spacing: ArtaSpace.s) {
            Image(systemName: ref.symbol)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(ref.wantsAction ? ArtaColor.text : ArtaColor.tertiary)
                .frame(width: 22, height: 20)
            VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                Text(ref.displayTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                statusRow
                if let subtitle = ref.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let progress = ref.progress {
                    ProgressBar(value: progress / 100)
                        .padding(.top, ArtaSpace.xxs)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            faces
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var statusRow: some View {
        let status = ref.statusLabel ?? ""
        let amount = ref.amount ?? ""
        if !status.isEmpty || !amount.isEmpty {
            HStack(spacing: ArtaSpace.s) {
                if !status.isEmpty {
                    StatusPill(text: status, tone: ref.pillTone)
                }
                if !amount.isEmpty {
                    Text(amount)
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(ArtaColor.text)
                        .lineLimit(1)
                }
            }
        }
    }

    /// Hasta tres caras encimadas, igual que `PeopleLine`.
    @ViewBuilder
    private var faces: some View {
        if !people.isEmpty {
            HStack(spacing: -6) {
                ForEach(people.prefix(3), id: \.id) { person in
                    Avatar(name: person.name, size: 22)
                        .overlay(Circle().stroke(ArtaColor.surface, lineWidth: 1.5))
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(people.map(\.name).joined(separator: ", "))
        }
    }

    @ViewBuilder
    private func actionButton(_ action: ChatRefAction) -> some View {
        let button = Button {
            onAction(action)
        } label: {
            HStack(spacing: ArtaSpace.xs) {
                if busy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(ArtaColor.tertiary)
                }
                Text(action.title)
            }
        }
        .disabled(busy)
        if ref.wantsAction {
            button.buttonStyle(ArtaPrimaryButtonStyle(fullWidth: false, compact: true))
        } else {
            button.buttonStyle(ArtaSecondaryButtonStyle(fullWidth: false, compact: true))
        }
    }
}

// MARK: - Mencionado en el chat

/// Dónde se ha hablado de esto. La pantalla no la pinta si nadie lo ha mencionado.
struct ChatBacklinksCard: View {
    let links: [ChatBacklink]

    var body: some View {
        ModuleCard(title: "Mencionado en el chat", count: links.count) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(links) { link in
                    Button {
                        open(link)
                    } label: {
                        row(link)
                    }
                    .buttonStyle(ArtaPressStyle(scale: 0.99))
                    if link.id != links.last?.id {
                        ArtaDivider()
                    }
                }
            }
        }
    }

    private func row(_ link: ChatBacklink) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.xxs) {
            HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.s) {
                Text(link.channelName ?? "Conversación")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ArtaColor.muted)
                    .lineLimit(1)
                Spacer(minLength: ArtaSpace.s)
                Text(dayText(link))
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(ArtaColor.tertiary)
                    .fixedSize()
            }
            Text(excerpt(link))
                .font(.subheadline)
                .foregroundStyle(ArtaColor.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, ArtaSpace.s)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func dayText(_ link: ChatBacklink) -> String {
        parseDate(link.at).map { MDate.dayMonthText($0) } ?? ""
    }

    /// «Ana: revisa @Cotizar luces».
    private func excerpt(_ link: ChatBacklink) -> String {
        let text = plainText(link.excerpt ?? "")
        let first = (link.author?.name ?? "").split(separator: " ").first.map(String.init) ?? ""
        return first.isEmpty ? text : "\(first): \(text)"
    }

    private func open(_ link: ChatBacklink) {
        Haptics.tap()
        if let href = link.href, !href.isEmpty {
            AppRouter.shared.openPanel(path: href)
        } else if let channelId = link.channelId {
            AppRouter.shared.openChat(channelId, messageId: link.messageId)
        }
    }
}

// MARK: - Crear tarea desde un mensaje

/// El texto del mensaje ya es el título; basta decir de quién y para cuándo.
struct CreateTaskFromMessageSheet: View {
    let message: ChatMessage
    let members: [ChannelMember]
    /// El de la conversación, si es de un evento: la tarea queda en ese evento.
    let eventId: String?
    /// Crea la tarea y la anuncia en el hilo. `true` si quedó dicho en la conversación.
    let create: (CreateTaskBody) async throws -> Bool
    let onDone: (Bool) -> Void

    private static let titleLimit = 200

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var assigneeIds: [String] = []
    @State private var hasDue = false
    @State private var dueDate = Date()
    @State private var directory: [DirectoryPerson] = []
    @State private var saving = false
    @State private var error: String?
    @State private var showPeople = false
    @State private var didPrefill = false

    private var assigneeSummary: String {
        if assigneeIds.isEmpty { return "Sin asignar" }
        return assigneeIds
            .map { id in directory.first(where: { $0.id == id })?.name ?? "Persona" }
            .joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Qué hay que hacer", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                        .onChange(of: title) { _, value in
                            if value.count > Self.titleLimit { title = String(value.prefix(Self.titleLimit)) }
                        }
                } header: {
                    ArtaSectionHeader("Título")
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    Button {
                        showPeople = true
                    } label: {
                        HStack {
                            Text(assigneeSummary)
                                .foregroundStyle(assigneeIds.isEmpty ? ArtaColor.muted : ArtaColor.text)
                                .lineLimit(2)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(ArtaColor.muted)
                        }
                    }
                } header: {
                    ArtaSectionHeader("Responsables")
                } footer: {
                    Text("La primera persona queda como responsable principal. A cada quien le llega el aviso.")
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    Toggle("Con fecha", isOn: $hasDue.animation())
                    if hasDue {
                        DatePicker("Fecha", selection: $dueDate, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "es_MX"))
                    }
                } header: {
                    ArtaSectionHeader("Vencimiento")
                }
                .tint(ArtaColor.accent)
                .listRowBackground(ArtaColor.bgElev)

                if let error {
                    Section {
                        Text(error).foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle("Crear tarea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Crear") {
                            Task { await save() }
                        }
                        .disabled(title.moduleTrimmed.isEmpty)
                    }
                }
            }
            .sheet(isPresented: $showPeople) {
                AssigneePickerSheet(directory: directory, selection: $assigneeIds)
            }
            .onAppear(perform: prefill)
            .task { await loadPeople() }
            .interactiveDismissDisabled(saving)
        }
    }

    private func prefill() {
        guard !didPrefill else { return }
        didPrefill = true
        let words = plainText(message.text).split(whereSeparator: \.isWhitespace)
        title = String(words.joined(separator: " ").prefix(160))
        directory = members.map { DirectoryPerson(id: $0.id, fullName: $0.fullName, title: $0.title) }
    }

    /// Normalmente son los miembros de la conversación; si el API no los manda, el directorio.
    private func loadPeople() async {
        guard members.isEmpty, directory.isEmpty else { return }
        if let people = try? await ApiClient.shared.directory() { directory = people }
    }

    private func save() async {
        let clean = title.moduleTrimmed
        guard !clean.isEmpty else { return }
        saving = true
        error = nil
        do {
            let body = CreateTaskBody(
                title: clean,
                detail: "Salió del chat, mensaje de \(message.author.fullName).",
                assigneeIds: assigneeIds,
                eventId: eventId,
                dueAt: hasDue ? MDate.ymdString(dueDate) : nil
            )
            let announced = try await create(body)
            Haptics.success()
            onDone(announced)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        saving = false
    }
}
