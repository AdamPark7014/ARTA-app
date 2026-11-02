import Foundation

// Ubicación del equipo (docs/UBICACION.md). Las respuestas traen más campos; aquí solo lo que se usa.

struct LocationStatusResponse: Decodable {
    let tracked: Bool
    let consentAt: String?
}

struct LocationPointsResponse: Decodable {
    let saved: Int?
    let ignored: Int?
}

private struct LocationStateBody: Encodable {
    let state: String
}

private struct LocationPointBody: Encodable {
    let lat: Double
    let lng: Double
    let accuracyM: Double?
    let capturedAt: String
}

private struct LocationPointsBody: Encodable {
    let platform: String
    let points: [LocationPointBody]
}

extension ApiClient {
    private static let capturedAtFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Si a esta persona se le mide y si ya aceptó.
    func locationStatus() async throws -> LocationStatusResponse { try await get("ubicacion/estado") }

    /// 403 si es exenta.
    func acceptLocationConsent() async throws { try await send("POST", "ubicacion/consentimiento") }

    func reportLocationState(_ state: LocationState) async throws {
        try await send("POST", "ubicacion/estado", body: LocationStateBody(state: state.rawValue))
    }

    /// Máximo 50. `capturedAt` es la hora del teléfono al medir, aunque se mande más tarde.
    func sendLocationPoints(_ points: [QueuedLocationPoint]) async throws -> LocationPointsResponse {
        let body = LocationPointsBody(
            platform: "ios",
            points: points.map { point in
                LocationPointBody(
                    lat: point.lat,
                    lng: point.lng,
                    accuracyM: point.accuracyM,
                    capturedAt: Self.capturedAtFormatter.string(from: point.capturedAt)
                )
            }
        )
        return try await send("POST", "ubicacion/puntos", body: body, as: LocationPointsResponse.self)
    }
}
