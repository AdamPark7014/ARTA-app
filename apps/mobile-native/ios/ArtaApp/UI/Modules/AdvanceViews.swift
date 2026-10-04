import SwiftUI

// Anticipos en Aprobaciones (docs/ANTICIPOS-CONTRATO.md): etiquetas y la hoja de rechazo.

enum AdvanceInfo {
    static func title(_ advance: AdvanceRow) -> String {
        if let label = advance.label?.moduleTrimmed, !label.isEmpty { return label }
        return "Anticipo"
    }

    static func statusLabel(_ status: String?) -> String {
        switch status ?? "" {
        case "PENDING": return "Por aprobar"
        case "APPROVED": return "Por pagar"
        case "REJECTED": return "Rechazado"
        case "PAID": return "Pagado"
        default: return "Registrado"
        }
    }

    static func statusTone(_ status: String?) -> PillTone {
        switch status ?? "" {
        case "PENDING": return .warn
        case "APPROVED": return .info
        case "REJECTED": return .danger
        case "PAID": return .ok
        default: return .neutral
        }
    }
}

/// Pide el motivo (obligatorio, mínimo 3 caracteres) y lo entrega a la pantalla,
/// que quita la tarjeta al instante y la regresa si el API falla.
struct RejectAdvanceSheet: View {
    let advance: AdvanceRow
    let onConfirm: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""

    private var trimmed: String { reason.moduleTrimmed }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(AdvanceInfo.title(advance)).font(.headline).foregroundStyle(ArtaColor.text)
                    Text(Money.mxn(advance.amount?.value)).font(.subheadline.weight(.semibold)).foregroundStyle(ArtaColor.text)
                    if let event = advance.event?.name, !event.isEmpty {
                        Text(event).font(.footnote).foregroundStyle(ArtaColor.muted)
                    }
                }
                .listRowBackground(ArtaColor.bgElev)

                Section {
                    TextField("Por qué no procede…", text: $reason, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text("Motivo")
                } footer: {
                    Text("Obligatorio, mínimo 3 caracteres. A quien lo pidió le llega el aviso con tu motivo.")
                }
                .listRowBackground(ArtaColor.bgElev)
            }
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle("Rechazar anticipo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Rechazar") {
                        let text = trimmed
                        guard text.count >= 3 else { return }
                        onConfirm(text)
                        dismiss()
                    }
                    .disabled(trimmed.count < 3)
                }
            }
        }
    }
}
