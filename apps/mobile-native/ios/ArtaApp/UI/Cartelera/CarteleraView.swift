import SwiftUI

/// Póster de un show. Sin póster o sin red, la marca sobre tinta: nunca un hueco.
struct ShowPosterImage: View {
    let path: String?

    var body: some View {
        if let path, let url = ApiConfig.resolve(path) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x2B2623), Color(hex: 0x0C0C0D)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image("ArtaWordmark")
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .foregroundStyle(Color.white.opacity(0.22))
                .padding(26)
        }
        .aspectRatio(0.72, contentMode: .fit)
    }
}

/// Lo que viene y la temporada: la misma cartelera del sitio, con pantalla nativa.
struct CarteleraView: View {
    @State private var upcoming: [PublicShow] = []
    @State private var past: [PublicShow] = []
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ArtaSpace.xl) {
                Text("Lo que viene.")
                    .font(ArtaFont.display(34, weight: .semibold))
                    .tracking(-0.5)
                    .foregroundStyle(ArtaColor.text)
                    .accessibilityAddTraits(.isHeader)

                if let loadError, upcoming.isEmpty, past.isEmpty {
                    InlineErrorRow(message: loadError) {
                        Task { await load() }
                    }
                } else if loading, upcoming.isEmpty, past.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 240)
                } else if upcoming.isEmpty {
                    Text("Estamos armando la próxima temporada. Muy pronto anunciamos fechas.")
                        .font(.body)
                        .foregroundStyle(ArtaColor.muted)
                }

                ForEach(upcoming) { show in
                    NavigationLink(value: show) {
                        ShowTile(show: show)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("cartelera-show")
                }

                if !past.isEmpty {
                    VStack(alignment: .leading, spacing: ArtaSpace.m) {
                        Text("La temporada.")
                            .font(ArtaFont.display(28, weight: .semibold))
                            .tracking(-0.4)
                            .foregroundStyle(ArtaColor.text)
                            .accessibilityAddTraits(.isHeader)
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(alignment: .top, spacing: ArtaSpace.m) {
                                ForEach(past) { show in
                                    NavigationLink(value: show) {
                                        ShowPosterImage(path: show.coverUrl)
                                            .frame(height: 210)
                                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                            .accessibilityLabel(show.title)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, ArtaLayout.gutter)
                        }
                        .padding(.horizontal, -ArtaLayout.gutter)
                    }
                }
            }
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.l)
        }
        .navigationTitle("Cartelera")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: PublicShow.self) { ShowDetailView(show: $0) }
        .refreshable { await load() }
        .task { await load() }
        .artaScreenBackground()
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let data = try await ApiClient.shared.publicShows()
            upcoming = data.upcoming
            past = data.past
            loadError = nil
        } catch {
            loadError = error.userMessage
        }
    }
}

/// La tarjeta de un show: el arte le da el color y se asoma abajo, como en el sitio.
private struct ShowTile: View {
    let show: PublicShow

    var body: some View {
        VStack(spacing: ArtaSpace.s) {
            Text([CarteleraRules.dayMonth(show), show.venue].compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline.weight(.medium))
                .opacity(0.92)
            Text(show.title)
                .font(ArtaFont.display(30, weight: .semibold))
                .tracking(-0.4)
                .lineLimit(3)
                .minimumScaleFactor(0.75)
            Text([CarteleraRules.timeLabel(show), CarteleraRules.countdown(show)].compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline)
                .opacity(0.92)
            ShowPosterImage(path: show.coverUrl)
                .frame(width: 200)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .shadow(color: .black.opacity(0.5), radius: 22, y: 12)
                .padding(.top, ArtaSpace.m)
                .padding(.bottom, -70)
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(Color(hex: 0xF7F6F3))
        .padding(.top, ArtaSpace.xxl)
        .padding(.horizontal, ArtaSpace.l)
        .frame(maxWidth: .infinity)
        .background {
            ZStack {
                Color(hex: 0x0C0C0D)
                if show.coverUrl != nil {
                    ShowPosterImage(path: show.coverUrl)
                        .scaleEffect(2.4)
                        .blur(radius: 40)
                        .saturation(1.3)
                        .opacity(0.62)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

/// El detalle de un show: cuándo, dónde, boletos, calendario y compartir.
struct ShowDetailView: View {
    let show: PublicShow

    private var isPast: Bool { CarteleraRules.isPast(show) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ArtaSpace.l) {
                ShowPosterImage(path: show.coverUrl)
                    .frame(maxWidth: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: .black.opacity(0.28), radius: 24, y: 12)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("Póster de \(show.title)")

                Text(show.title)
                    .font(ArtaFont.display(32, weight: .semibold))
                    .tracking(-0.4)
                    .foregroundStyle(ArtaColor.text)
                    .accessibilityAddTraits(.isHeader)
                if let excerpt = show.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(.body)
                        .foregroundStyle(ArtaColor.muted)
                }

                VStack(spacing: 0) {
                    if let date = CarteleraRules.longDate(show) { fact("Fecha", date) }
                    if let time = CarteleraRules.timeLabel(show) { fact("Hora", time) }
                    if let place = CarteleraRules.place(of: show) {
                        if let url = CarteleraRules.directionsURL(for: place) {
                            Link(destination: url) { factRow("Lugar", place, isLink: true) }
                        } else {
                            fact("Lugar", place)
                        }
                    }
                    if isPast {
                        fact("Estado", "Ya se presentó")
                    } else {
                        fact("Boletos", [CarteleraRules.statusLabel(of: show), CarteleraRules.countdown(show)].compactMap { $0 }.joined(separator: " · "))
                    }
                }
                .background(ArtaCardBackground(radius: ArtaRadius.card))

                if !isPast, let tickets = CarteleraRules.ticketURL(of: show) {
                    Link(destination: tickets) {
                        Text(show.ctaLabel ?? "Comprar boletos")
                    }
                    .buttonStyle(ArtaPrimaryButtonStyle())
                    .accessibilityIdentifier("show-tickets")
                }

                HStack(spacing: ArtaSpace.m) {
                    if !isPast, CarteleraRules.status(of: show) != "cancelado", let calendar = CarteleraRules.calendarURL(for: show) {
                        Link(destination: calendar) {
                            Label("Al calendario", systemImage: "calendar.badge.plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ArtaSecondaryButtonStyle())
                    }
                    if let site = CarteleraRules.siteURL(of: show) {
                        ShareLink(item: site, subject: Text(show.title)) {
                            Label("Compartir", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(ArtaSecondaryButtonStyle())
                    }
                }

                ForEach(paragraphs, id: \.self) { paragraph in
                    Text(paragraph)
                        .font(.body)
                        .foregroundStyle(ArtaColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, ArtaLayout.gutter)
            .padding(.vertical, ArtaSpace.l)
        }
        .navigationTitle("Show")
        .navigationBarTitleDisplayMode(.inline)
        .artaScreenBackground()
    }

    private var paragraphs: [String] {
        (show.body ?? "").components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        factRow(label, value, isLink: false)
    }

    private func factRow(_ label: String, _ value: String, isLink: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ArtaSpace.m) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(ArtaColor.text)
                .underline(isLink, color: ArtaColor.lineStrong)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, ArtaSpace.l)
        .padding(.vertical, 13)
    }
}

/// En Inicio: los próximos shows, a un toque. Si no hay o no carga, no enseña nada.
struct CarteleraStrip: View {
    @State private var shows: [PublicShow] = []

    var body: some View {
        Group {
            if !shows.isEmpty {
                VStack(alignment: .leading, spacing: ArtaSpace.s) {
                    NavigationLink(value: AppRoute.cartelera) {
                        HStack {
                            Text("En cartelera")
                                .font(ArtaFont.display(20, weight: .semibold))
                                .foregroundStyle(ArtaColor.text)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ArtaColor.tertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("inicio-cartelera")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: ArtaSpace.s) {
                            ForEach(shows) { show in
                                NavigationLink(value: AppRoute.cartelera) {
                                    VStack(alignment: .leading, spacing: ArtaSpace.xs) {
                                        ShowPosterImage(path: show.coverUrl)
                                            .frame(height: 150)
                                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                        Text(CarteleraRules.dayMonth(show) ?? "")
                                            .font(.caption)
                                            .foregroundStyle(ArtaColor.muted)
                                            .lineLimit(1)
                                    }
                                    .frame(maxWidth: 118, alignment: .leading)
                                    .accessibilityLabel(show.title)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
        .task {
            shows = (try? await ApiClient.shared.publicShows().upcoming) ?? []
        }
    }
}
