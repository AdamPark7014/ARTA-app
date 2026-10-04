import SwiftUI

/// Eventos en lista (próximos, en curso, pasados) o en calendario mensual con las notas del equipo.
struct EventsView: View {
    enum Mode {
        case list, calendar
    }

    enum Scope: String, CaseIterable, Identifiable {
        case upcoming = "Próximos"
        case ongoing = "En curso"
        case past = "Pasados"
        var id: String { rawValue }
    }

    @EnvironmentObject private var router: AppRouter
    @State private var mode: Mode = .list
    @State private var scope: Scope = .upcoming
    @State private var query = ""
    @State private var profile: ModulesProfile?
    @State private var events: [ArtaEvent] = []
    @State private var loading = true
    @State private var loaded = false
    @State private var error: String?
    @State private var refreshError: String?
    @State private var month: Date = MonthGrid.startOfMonth(Date())
    @State private var selectedDay: Date = MonthGrid.calendar.startOfDay(for: Date())
    @State private var notes: [CalendarNote] = []
    @State private var notesError: String?
    @State private var editingNote: NoteDraft?

    private var noteEntities: [String] { profile?.eventEntities ?? [] }

    private var searched: [ArtaEvent] {
        let q = Self.fold(query.moduleTrimmed)
        guard !q.isEmpty else { return events }
        return events.filter { e in
            let haystack = [e.name, e.artist, e.promoter, e.venue, e.city].compactMap { $0 }.joined(separator: " ")
            return Self.fold(haystack).contains(q)
        }
    }

    private var scoped: [ArtaEvent] {
        let rows = searched.filter { Self.bucket($0) == scope }
        let byStart: (ArtaEvent, ArtaEvent) -> Bool = {
            (parseDate($0.startsAt) ?? .distantFuture) < (parseDate($1.startsAt) ?? .distantFuture)
        }
        if scope == .past {
            return rows.sorted { (parseDate($0.startsAt) ?? .distantPast) > (parseDate($1.startsAt) ?? .distantPast) }
        }
        return rows.sorted(by: byStart)
    }

    var body: some View {
        Group {
            if !loaded && loading {
                ModuleSkeletonList()
            } else if !loaded, let error {
                ModuleErrorView(message: error) {
                    Task { await load(showSkeleton: true) }
                }
            } else if mode == .list {
                listContent
            } else {
                calendarContent
            }
        }
        .background(ArtaColor.bg)
        .safeAreaInset(edge: .top) {
            if mode == .list && loaded {
                Picker("Periodo", selection: $scope) {
                    ForEach(Scope.allCases) { s in
                        Text(s.rawValue).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(ArtaColor.bg)
            }
        }
        .searchable(text: $query, prompt: "Buscar evento, artista o lugar")
        .navigationTitle("Eventos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.tap()
                    mode = mode == .list ? .calendar : .list
                } label: {
                    Image(systemName: mode == .list ? "calendar" : "list.bullet")
                }
                .accessibilityLabel(mode == .list ? "Ver calendario" : "Ver lista")
            }
        }
        .task {
            if !loaded { await load() }
        }
        .sheet(item: $editingNote) { draft in
            CalendarNoteSheet(
                draft: draft,
                entities: noteEntities,
                onSaved: { saved in
                    if let index = notes.firstIndex(where: { $0.id == saved.id }) {
                        notes[index] = saved
                    } else {
                        notes.append(saved)
                    }
                },
                onDeleted: { id in
                    notes.removeAll { $0.id == id }
                }
            )
        }
    }

    // MARK: Lista

    @ViewBuilder
    private var listContent: some View {
        let rows = scoped
        if rows.isEmpty {
            ScrollView {
                ModuleEmptyView(icon: "calendar", title: emptyTitle, message: emptyMessage)
                    .frame(minHeight: 420)
            }
            .refreshable { await load() }
        } else {
            List {
                if let refreshError {
                    Label(refreshError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                        .listRowBackground(Color.clear)
                }
                ForEach(rows) { event in
                    Button {
                        router.open(AppRoute.event(event.id))
                    } label: {
                        EventRow(event: event)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
        }
    }

    private var emptyTitle: String {
        if !query.moduleTrimmed.isEmpty { return "Sin resultados" }
        switch scope {
        case .upcoming: return "Sin eventos próximos"
        case .ongoing: return "Nada en curso"
        case .past: return "Sin eventos pasados"
        }
    }

    private var emptyMessage: String {
        if noteEntities.isEmpty { return "Tu rol no opera eventos." }
        if !query.moduleTrimmed.isEmpty { return "Nada coincide con «\(query.moduleTrimmed)»." }
        return "Desliza hacia abajo para actualizar."
    }

    // MARK: Calendario

    private var calendarContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                monthHeader
                VStack(spacing: 6) {
                    HStack(spacing: 4) {
                        ForEach(0..<7, id: \.self) { index in
                            Text(MonthGrid.weekdaySymbols[index])
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ArtaColor.muted)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                        ForEach(MonthGrid.days(for: month), id: \.self) { day in
                            dayCell(day)
                        }
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 16).fill(ArtaColor.bgElev))
                dayAgenda
            }
            .padding(16)
        }
        .refreshable {
            await load()
            await loadNotes()
        }
        .task(id: month) { await loadNotes() }
    }

    private var monthHeader: some View {
        HStack(spacing: 12) {
            Button {
                shiftMonth(-1)
            } label: {
                Image(systemName: "chevron.left").padding(8)
            }
            .accessibilityLabel("Mes anterior")
            Spacer()
            Text(MDate.monthTitle(month))
                .font(.headline)
                .foregroundStyle(ArtaColor.text)
            Spacer()
            Button {
                shiftMonth(1)
            } label: {
                Image(systemName: "chevron.right").padding(8)
            }
            .accessibilityLabel("Mes siguiente")
            Button("Hoy") {
                Haptics.tap()
                month = MonthGrid.startOfMonth(Date())
                selectedDay = MonthGrid.calendar.startOfDay(for: Date())
            }
            .font(.subheadline.weight(.semibold))
        }
        .foregroundStyle(ArtaColor.gold)
        .buttonStyle(.plain)
    }

    private func dayCell(_ day: Date) -> some View {
        let cal = MonthGrid.calendar
        let inMonth = cal.isDate(day, equalTo: month, toGranularity: .month)
        let isToday = cal.isDateInToday(day)
        let isSelected = cal.isDate(day, inSameDayAs: selectedDay)
        let hasEvents = !events(on: day).isEmpty
        let key = MDate.ymdString(day)
        let hasNotes = notes.contains { $0.date.hasPrefix(key) }
        let numberColor: Color = isSelected ? ArtaColor.bg : (inMonth ? ArtaColor.text : ArtaColor.muted.opacity(0.5))
        return Button {
            Haptics.tap()
            selectedDay = day
            if !inMonth { month = MonthGrid.startOfMonth(day) }
        } label: {
            VStack(spacing: 3) {
                Text(MDate.dayNumber(day))
                    .font(.subheadline.weight(isToday ? .bold : .regular))
                    .foregroundStyle(numberColor)
                HStack(spacing: 3) {
                    Circle()
                        .fill(hasEvents ? (isSelected ? ArtaColor.bg : ArtaColor.gold) : Color.clear)
                        .frame(width: 5, height: 5)
                    Circle()
                        .fill(hasNotes ? (isSelected ? ArtaColor.bg : ArtaColor.read) : Color.clear)
                        .frame(width: 5, height: 5)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 10).fill(isSelected ? ArtaColor.gold : Color.clear))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(isToday && !isSelected ? ArtaColor.gold : Color.clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var dayAgenda: some View {
        let dayEvents = events(on: selectedDay)
        let key = MDate.ymdString(selectedDay)
        let dayNotes = notes.filter { $0.date.hasPrefix(key) }
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(MDate.longDayTitle(selectedDay))
                    .font(.headline)
                    .foregroundStyle(ArtaColor.text)
                Spacer()
                if !noteEntities.isEmpty {
                    Button {
                        editingNote = NoteDraft(date: selectedDay, note: nil)
                    } label: {
                        Label("Nota", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ArtaColor.gold)
                    }
                    .buttonStyle(.plain)
                }
            }
            if let notesError {
                Label(notesError, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(ArtaColor.danger)
            }
            if dayEvents.isEmpty && dayNotes.isEmpty {
                Text("Sin eventos ni notas este día.")
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.muted)
            }
            ForEach(dayEvents) { event in
                Button {
                    router.open(AppRoute.event(event.id))
                } label: {
                    EventRow(event: event)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.bgElev))
                }
                .buttonStyle(.plain)
            }
            ForEach(dayNotes) { note in
                Button {
                    editingNote = NoteDraft(date: selectedDay, note: note)
                } label: {
                    noteRow(note)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func noteRow(_ note: CalendarNote) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "note.text")
                .foregroundStyle(ArtaColor.read)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(note.text)
                    .font(.subheadline)
                    .foregroundStyle(ArtaColor.text)
                    .multilineTextAlignment(.leading)
                let author = note.updatedBy?.name ?? note.createdBy?.name
                Text([EntityInfo.label(note.entity), author].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.muted)
            }
            Spacer(minLength: 4)
            Image(systemName: "pencil")
                .font(.caption)
                .foregroundStyle(ArtaColor.muted)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.bgElev))
        .contentShape(Rectangle())
    }

    private func events(on day: Date) -> [ArtaEvent] {
        let cal = MonthGrid.calendar
        let target = cal.startOfDay(for: day)
        return searched.filter { e in
            guard let start = parseDate(e.startsAt) else { return false }
            let first = cal.startOfDay(for: start)
            let last = cal.startOfDay(for: parseDate(e.endsAt) ?? start)
            return target >= first && target <= max(first, last)
        }
    }

    private func shiftMonth(_ delta: Int) {
        Haptics.tap()
        guard let next = MonthGrid.calendar.date(byAdding: .month, value: delta, to: month) else { return }
        month = MonthGrid.startOfMonth(next)
        let today = Date()
        if MonthGrid.calendar.isDate(today, equalTo: month, toGranularity: .month) {
            selectedDay = MonthGrid.calendar.startOfDay(for: today)
        } else {
            selectedDay = month
        }
    }

    // MARK: Datos

    private func load(showSkeleton: Bool = false) async {
        if showSkeleton {
            loading = true
            error = nil
        }
        do {
            let me = try await ModulesProfileStore.shared.load()
            profile = me
            if me.eventEntities.isEmpty {
                events = []
            } else {
                events = try await ApiClient.shared.events(scope: "all")
            }
            loaded = true
            error = nil
            refreshError = nil
        } catch {
            if !error.isModuleCancellation {
                if loaded { refreshError = error.userMessage } else { self.error = error.userMessage }
            }
        }
        loading = false
    }

    /// Las notas se piden por entidad (el API exige una) para las semanas visibles del mes.
    private func loadNotes() async {
        guard let me = profile else { return }
        let days = MonthGrid.days(for: month)
        guard let first = days.first, let last = days.last else { return }
        let from = MDate.ymdString(first)
        let to = MDate.ymdString(last)
        var result: [CalendarNote] = []
        do {
            for entity in me.eventEntities {
                var list = try await ApiClient.shared.calendarNotes(entity: entity, from: from, to: to)
                for index in list.indices where list[index].entity == nil {
                    list[index].entity = entity
                }
                result += list
            }
            notes = result
            notesError = nil
        } catch {
            if !error.isModuleCancellation { notesError = error.userMessage }
        }
    }

    // MARK: Reglas (mismas que `apps/web/app/(app)/events/page.tsx`)

    static func bucket(_ e: ArtaEvent) -> Scope {
        if e.status == "CLOSED" || e.status == "CANCELLED" { return .past }
        guard let start = parseDate(e.startsAt) else { return .upcoming }
        let end = parseDate(e.endsAt) ?? start
        if end < MonthGrid.calendar.startOfDay(for: Date()) { return .past }
        if start <= Date() || MDate.daysFromToday(start) == 0 { return .ongoing }
        return .upcoming
    }

    private static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_MX"))
    }
}

// MARK: - Fila de evento (también la usa Inicio)

struct EventRow: View {
    let event: ArtaEvent

    private var place: String {
        [event.venue, event.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var startDate: Date? { parseDate(event.startsAt) }

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(startDate.map { MDate.shortMonth($0) } ?? "—")
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(ArtaColor.gold)
                Text(startDate.map { MDate.dayNumber($0) } ?? "")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ArtaColor.text)
            }
            .frame(width: 46, height: 50)
            .background(RoundedRectangle(cornerRadius: 10).fill(ArtaColor.surface2))

            VStack(alignment: .leading, spacing: 3) {
                Text(event.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ArtaColor.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(MDate.eventWhen(event.startsAt, event.endsAt))
                    .font(.caption)
                    .foregroundStyle(ArtaColor.gold)
                if !place.isEmpty {
                    Text(place)
                        .font(.caption)
                        .foregroundStyle(ArtaColor.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 4) {
                if let status = event.status, !status.isEmpty, status != "ACTIVE" {
                    StatusPill(text: EventInfo.statusLabel(status), tone: EventInfo.statusTone(status))
                }
                if let entity = event.entity {
                    Text(EntityInfo.label(entity))
                        .font(.caption2)
                        .foregroundStyle(ArtaColor.muted)
                }
            }
        }
        .contentShape(Rectangle())
    }
}

enum EventInfo {
    static func statusLabel(_ status: String?) -> String {
        switch status ?? "" {
        case "DRAFT": return "Borrador"
        case "ACTIVE": return "Activo"
        case "CLOSED": return "Cerrado"
        case "CANCELLED": return "Cancelado"
        default: return status ?? ""
        }
    }

    static func statusTone(_ status: String?) -> PillTone {
        switch status ?? "" {
        case "ACTIVE": return .ok
        case "CLOSED": return .info
        case "CANCELLED": return .danger
        default: return .neutral
        }
    }
}

// MARK: - Cuadrícula del mes (lunes primero, como `MonthCalendar.tsx` de la web)

enum MonthGrid {
    static let weekdaySymbols = ["L", "M", "M", "J", "V", "S", "D"]

    static var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "es_MX")
        cal.timeZone = .current
        cal.firstWeekday = 2
        return cal
    }

    static func startOfMonth(_ date: Date) -> Date {
        let cal = calendar
        return cal.date(from: cal.dateComponents([.year, .month], from: date)) ?? cal.startOfDay(for: date)
    }

    /// Seis semanas completas para que la cuadrícula no cambie de alto entre meses.
    static func days(for month: Date) -> [Date] {
        let cal = calendar
        let first = startOfMonth(month)
        let offset = (cal.component(.weekday, from: first) + 5) % 7
        guard let gridStart = cal.date(byAdding: .day, value: -offset, to: first) else { return [] }
        return (0..<42).compactMap { cal.date(byAdding: .day, value: $0, to: gridStart) }
    }
}

// MARK: - Nota del calendario

struct NoteDraft: Identifiable {
    let id = UUID()
    let date: Date
    let note: CalendarNote?
}

struct CalendarNoteSheet: View {
    let draft: NoteDraft
    let entities: [String]
    let onSaved: (CalendarNote) -> Void
    let onDeleted: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var entity: String
    @State private var saving = false
    @State private var error: String?
    @State private var confirmDelete = false

    private static let maxLength = 500

    init(draft: NoteDraft, entities: [String], onSaved: @escaping (CalendarNote) -> Void, onDeleted: @escaping (String) -> Void) {
        self.draft = draft
        self.entities = entities
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        _text = State(initialValue: draft.note?.text ?? "")
        _entity = State(initialValue: draft.note?.entity ?? entities.first ?? "")
    }

    private var canSave: Bool {
        !text.moduleTrimmed.isEmpty && !entity.isEmpty && !saving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(MDate.longDayTitle(draft.date), systemImage: "calendar")
                        .foregroundStyle(ArtaColor.text)
                }
                .listRowBackground(ArtaColor.bgElev)

                if draft.note == nil && entities.count > 1 {
                    Section("Calendario") {
                        Picker("Entidad", selection: $entity) {
                            ForEach(entities, id: \.self) { key in
                                Text(EntityInfo.label(key)).tag(key)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }

                Section {
                    TextField("Ensayo, montaje, junta, recordatorio…", text: $text, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text("Nota")
                } footer: {
                    Text("\(text.count)/\(Self.maxLength)")
                }
                .listRowBackground(ArtaColor.bgElev)

                if let error {
                    Section {
                        Text(error).foregroundStyle(ArtaColor.danger)
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }

                if draft.note != nil {
                    Section {
                        Button("Eliminar nota", role: .destructive) {
                            confirmDelete = true
                        }
                    }
                    .listRowBackground(ArtaColor.bgElev)
                }
            }
            .tint(ArtaColor.gold)
            .scrollContentBackground(.hidden)
            .background(ArtaColor.bg)
            .navigationTitle(draft.note == nil ? "Nueva nota" : "Editar nota")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Guardar") {
                            Task { await save() }
                        }
                        .disabled(!canSave)
                    }
                }
            }
            .onChange(of: text) { _, newValue in
                if newValue.count > Self.maxLength { text = String(newValue.prefix(Self.maxLength)) }
            }
            .confirmationDialog("¿Eliminar esta nota?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Eliminar", role: .destructive) {
                    Task { await deleteNote() }
                }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Se borra del calendario del equipo.")
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func save() async {
        let value = text.moduleTrimmed
        guard !value.isEmpty, !entity.isEmpty else { return }
        saving = true
        error = nil
        do {
            var saved: CalendarNote
            if let note = draft.note {
                saved = try await ApiClient.shared.updateCalendarNote(note.id, text: value)
            } else {
                let body = CalendarNoteBody(entity: entity, date: MDate.ymdString(draft.date), text: value)
                saved = try await ApiClient.shared.createCalendarNote(body)
            }
            if saved.entity == nil { saved.entity = draft.note?.entity ?? entity }
            Haptics.success()
            onSaved(saved)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        saving = false
    }

    private func deleteNote() async {
        guard let note = draft.note else { return }
        saving = true
        error = nil
        do {
            try await ApiClient.shared.deleteCalendarNote(note.id)
            Haptics.warning()
            onDeleted(note.id)
            dismiss()
        } catch {
            Haptics.error()
            self.error = error.userMessage
        }
        saving = false
    }
}
