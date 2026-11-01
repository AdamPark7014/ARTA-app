import Combine
import SwiftUI

/// «Enviados» (docs/AVISOS.md § Acuse de visto). Abrirla no marca nada como visto. El API puede no
/// tener la ruta todavía: cualquier falla se queda en lo que ya había o en el vacío, sin error rojo.
@MainActor
final class SentNoticesModel: ObservableObject {
    @Published private(set) var rows: [SentNotice] = []
    @Published private(set) var loading = true

    /// El socket solo recarga con la pestaña abierta; al volver a ella, `load()` la pone al día.
    private var showing = false
    private var bag = Set<AnyCancellable>()

    init() {
        let rt = RealtimeClient.shared
        // Ráfagas (abrió su bandeja con varios avisos a la vista) → una sola recarga.
        rt.notificationSeen
            .merge(with: rt.connected.filter { $0 }.map { _ in () })
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] in Task { await self?.reloadIfShowing() } }
            .store(in: &bag)
    }

    func setShowing(_ on: Bool) {
        showing = on
    }

    func load() async {
        do {
            rows = try await ApiClient.shared.sentNotices()
        } catch {
            // Se canceló (salió de la pestaña): la siguiente vez que aparezca vuelve a cargar.
            if error.isModuleCancellation { return }
        }
        loading = false
    }

    private func reloadIfShowing() async {
        guard showing else { return }
        await load()
    }
}

/// Lo que mandé y quién ya lo vio: una fila por elemento, aunque haya ido a varias personas.
struct SentNoticesView: View {
    @ObservedObject var model: SentNoticesModel
    let now: Date
    let onOpen: (SentNotice) -> Void

    var body: some View {
        content
            .task {
                model.setShowing(true)
                await model.load()
            }
            .onDisappear { model.setShowing(false) }
    }

    @ViewBuilder
    private var content: some View {
        if model.loading && model.rows.isEmpty {
            NotificationsSkeleton()
        } else {
            list
        }
    }

    private var list: some View {
        List {
            if !model.rows.isEmpty { help }
            ForEach(model.rows) { row in rowView(row) }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay {
            if model.rows.isEmpty {
                // Tirar para actualizar también funciona sobre el vacío.
                EmptyState(
                    icon: "paperplane",
                    title: "Todavía no mandas nada",
                    message: "Cuando asignes una tarea, arrobes a alguien o pidas una autorización, aquí verás si ya lo vio."
                )
                .allowsHitTesting(false)
            }
        }
        .refreshable { await model.load() }
        .artaTabBarScrim(glow: false)
    }

    private var help: some View {
        Text("Visto: abrió sus avisos con ese aviso a la vista. No quiere decir que ya lo resolvió.")
            .font(.footnote)
            .foregroundStyle(ArtaColor.tertiary)
            .fixedSize(horizontal: false, vertical: true)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: ArtaSpace.xs, leading: ArtaLayout.gutter, bottom: ArtaSpace.s, trailing: ArtaLayout.gutter))
            .accessibilityIdentifier("notice-sent-help")
    }

    private func rowView(_ row: SentNotice) -> some View {
        Group {
            if let link = row.linkUrl, !link.isEmpty {
                Button {
                    onOpen(row)
                } label: {
                    SentNoticeRow(row: row, now: now)
                }
            } else {
                SentNoticeRow(row: row, now: now)
            }
        }
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(ArtaColor.line)
        .listRowInsets(EdgeInsets(top: ArtaSpace.m, leading: ArtaLayout.gutter, bottom: ArtaSpace.m, trailing: ArtaLayout.gutter))
        .accessibilityIdentifier("notice-sent-row-\(row.id)")
    }
}

// MARK: - Fila

private struct SentNoticeRow: View {
    let row: SentNotice
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            HStack(alignment: .top, spacing: ArtaSpace.m) {
                Text(row.title ?? "Aviso")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Contorno siempre: informa, no pide nada. Lo pendiente solo va más marcado.
                StatusPill(text: row.seenSummary, tone: row.allSeen ? .neutral : .accent)
            }
            VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                ForEach(Array(row.people.enumerated()), id: \.offset) { _, person in
                    personLine(person)
                }
            }
            if let sentAt = row.createdAt {
                Text(NoticeKinds.stamp("Mandado", sentAt, now: now))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(ArtaColor.tertiary)
                    .lineLimit(1)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func personLine(_ person: SentRecipient) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.s) {
            Text(person.fullName ?? "Sin nombre")
                .font(.footnote)
                .foregroundStyle(ArtaColor.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(person.hasSeen ? NoticeKinds.stamp("Visto", person.seenStamp, now: now) : "Sin ver")
                .font(person.hasSeen ? Font.caption : Font.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(person.hasSeen ? ArtaColor.muted : ArtaColor.text)
                .lineLimit(1)
                .fixedSize()
        }
    }
}
