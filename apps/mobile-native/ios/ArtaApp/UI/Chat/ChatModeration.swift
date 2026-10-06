import Combine
import SwiftUI

// Reportar mensajes y bloquear personas (docs/chat-reportar-bloquear.md). Apple
// (guía 1.2) lo exige en apps con chat; misma experiencia en iOS y Android.

// MARK: - Personas bloqueadas

/// A quién bloqueé en el chat. Se carga al abrir la app y al entrar al chat
/// (`GET chat/blocks`) y se actualiza al bloquear o desbloquear. El API ya quita sus
/// mensajes de canales, hilos, fijados, guardados y búsqueda; aquí sirve para ignorar
/// lo que llega por el socket y para que sus mensajes desaparezcan de la conversación
/// abierta en cuanto se bloquea.
@MainActor
final class ChatBlocks: ObservableObject {
    static let shared = ChatBlocks()

    /// Como las devuelve el API (la más reciente primero).
    @Published private(set) var users: [BlockedUser] = []
    /// Ids de `users`: lo que consultan el socket y las conversaciones.
    @Published private(set) var ids: Set<String> = []
    /// Ya llegó al menos una respuesta de `GET chat/blocks` en esta sesión.
    @Published private(set) var loaded = false

    private var lastRefresh = Date.distantPast
    /// Sube al bloquear, desbloquear o cerrar sesión: una carga que salió antes no pisa lo nuevo.
    private var generation = 0
    private var bag = Set<AnyCancellable>()

    private init() {
        // Al reconectar el socket (volver del segundo plano) se refresca sin forzar.
        RealtimeClient.shared.connected
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &bag)
    }

    func isBlocked(_ userId: String?) -> Bool {
        guard let userId, !userId.isEmpty else { return false }
        return ids.contains(userId)
    }

    /// En segundo plano y sin errores visibles: si falla, se queda con lo que ya sabía.
    func refresh(force: Bool = false) {
        guard force || Date().timeIntervalSince(lastRefresh) > 60 else { return }
        lastRefresh = Date()
        Task { _ = try? await self.load() }
    }

    /// Para «Usuarios bloqueados», que sí muestra el error.
    @discardableResult
    func load() async throws -> [BlockedUser] {
        let started = generation
        let list = try await ApiClient.shared.chatBlocks()
        guard started == generation else { return users }
        apply(list)
        loaded = true
        lastRefresh = Date()
        return list
    }

    func block(_ userId: String, name: String) async throws {
        try await ApiClient.shared.blockUser(userId)
        generation += 1
        guard !ids.contains(userId) else { return }
        var list = users
        list.insert(BlockedUser(id: userId, name: name, avatarUrl: nil, blockedAt: isoNow()), at: 0)
        apply(list)
    }

    func unblock(_ userId: String) async throws {
        try await ApiClient.shared.unblockUser(userId)
        generation += 1
        apply(users.filter { $0.id != userId })
    }

    /// Cierre de sesión: otra persona puede entrar en el mismo teléfono.
    func reset() {
        generation += 1
        lastRefresh = .distantPast
        loaded = false
        apply([])
    }

    private func apply(_ list: [BlockedUser]) {
        users = list
        let next = Set(list.map(\.id))
        if next != ids { ids = next }
    }
}

// MARK: - Reportar un mensaje

/// Hoja de «Reportar»: motivo (obligatorio) y detalles opcionales (≤1000). Manda
/// `POST chat/messages/:id/report` ella misma; si falla, el error queda en la hoja.
struct ReportMessageSheet: View {
    let message: ChatMessage
    /// Ya se envió: la conversación muestra el aviso de gracias.
    var onReported: () -> Void

    static let detailsLimit = 1000

    @Environment(\.dismiss) private var dismiss
    @State private var reason: ChatReportReason?
    @State private var details = ""
    @State private var busy = false
    @State private var failure: String?

    private var preview: String {
        if !message.text.isEmpty { return plainText(message.text) }
        return message.attachment?.name ?? "Adjunto"
    }

    private var question: String {
        let name = message.author.fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "¿Por qué reportas este mensaje?" : "¿Por qué reportas este mensaje de \(name)?"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(message.author.fullName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                        Text(preview)
                            .font(.subheadline)
                            .foregroundStyle(ArtaColor.muted)
                            .lineLimit(3)
                    }
                    .padding(.vertical, 2)
                } header: {
                    Text("Mensaje")
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    ForEach(ChatReportReason.allCases) { option in
                        Button {
                            reason = option
                            Haptics.tap()
                        } label: {
                            HStack(spacing: 12) {
                                Text(option.label).foregroundStyle(ArtaColor.text)
                                Spacer(minLength: 8)
                                if reason == option {
                                    Image(systemName: "checkmark").foregroundStyle(ArtaColor.gold)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .disabled(busy)
                        .accessibilityIdentifier("report-reason-\(option.rawValue.lowercased())")
                        .accessibilityAddTraits(reason == option ? .isSelected : [])
                    }
                } header: {
                    Text(question).textCase(nil)
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    TextField("Detalles (opcional)", text: $details, axis: .vertical)
                        .lineLimit(3...8)
                        .disabled(busy)
                        .onChange(of: details) { _, value in
                            if value.count > Self.detailsLimit { details = String(value.prefix(Self.detailsLimit)) }
                        }
                        .accessibilityIdentifier("report-details")
                } footer: {
                    Text("\(details.count) / \(Self.detailsLimit)")
                }
                .listRowBackground(ArtaColor.bgElev)

                if let failure {
                    Section {
                        Label(failure, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle("Reportar mensaje")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Enviar reporte") {
                            Task { await submit() }
                        }
                        .disabled(reason == nil)
                        .accessibilityIdentifier("report-submit")
                    }
                }
            }
            .interactiveDismissDisabled(busy)
        }
        .presentationDetents([.large])
    }

    private func submit() async {
        guard let reason, !busy else { return }
        let text = details.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        failure = nil
        do {
            try await ApiClient.shared.reportMessage(
                message.id,
                reason: reason,
                details: text.isEmpty ? nil : String(text.prefix(Self.detailsLimit))
            )
            Haptics.success()
            onReported()
            dismiss()
        } catch {
            Haptics.error()
            failure = error.userMessage
        }
        busy = false
    }
}
