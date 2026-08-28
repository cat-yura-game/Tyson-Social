import Foundation

struct TysonUser: Codable, Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarKey: String?
    let bio: String?
    let verified: Bool?
    let followerCount: Int?
    let followingCount: Int?
}

struct TysonPost: Codable, Identifiable {
    let id: String
    let body: String
    let title: String?
    let username: String
    let displayName: String
    let avatarKey: String?
    let publishedAt: String
    let likeCount: Int?
    let commentCount: Int?
}

private struct Envelope<T: Codable>: Codable { let data: T }

actor TysonAPI {
    static let shared = TysonAPI()
    private let baseURL = URL(string: "https://api.tysonsocial.eu.cc/api")!
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    func session() async throws -> TysonUser? {
        let response: Envelope<SessionPayload> = try await request(path: "/auth/session")
        return response.data.user
    }

    func feed() async throws -> [TysonPost] {
        let response: Envelope<FeedPayload> = try await request(path: "/feed")
        return response.data.posts
    }

    private func request<T: Codable>(path: String) async throws -> T {
        let request = URLRequest(url: baseURL.appending(path: path))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct SessionPayload: Codable { let user: TysonUser? }
private struct FeedPayload: Codable { let posts: [TysonPost] }
