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

    func conversations() async throws -> [TysonConversation] {
        let response: Envelope<ConversationsPayload> = try await request(path: "/messages/conversations")
        return response.data.conversations
    }

    func messages(conversationId: String) async throws -> [TysonMessage] {
        let response: Envelope<MessagesPayload> = try await request(path: "/messages/conversations/\(conversationId)/messages")
        return response.data.messages
    }

    func sendMessage(conversationId: String, content: String) async throws {
        try await requestVoid(path: "/messages/conversations/\(conversationId)/messages", method: "POST", body: ["content": content])
    }

    func createConversation(username: String) async throws {
        try await requestVoid(path: "/messages/conversations", method: "POST", body: ["recipientUsername": username])
    }

    func createPost(title: String, body: String) async throws {
        try await requestVoid(path: "/posts", method: "POST", body: ["title": title, "body": body])
    }

    func updateProfile(name: String, bio: String) async throws {
        try await requestVoid(path: "/users/me", method: "PATCH", body: ["displayName": name, "bio": bio])
    }

    func aiChat(text: String) async throws -> String {
        let response: Envelope<AIResponse> = try await request(path: "/ai/guest/chat", method: "POST", body: ["message": text])
        return response.data.answer
    }

    func search(query: String) async throws -> SearchPayload {
        let response: Envelope<SearchPayload> = try await request(path: "/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)")
        return response.data
    }

    private func request<T: Codable>(path: String, method: String = "GET", body: [String: String]? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func requestVoid(path: String, method: String, body: [String: String]) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
    }
}

private struct SessionPayload: Codable { let user: TysonUser? }
private struct FeedPayload: Codable { let posts: [TysonPost] }

struct TysonConversation: Codable, Identifiable {
    let id: String
    let title: String?
    let otherUsername: String?
    let otherDisplayName: String?
    let lastMessage: String?
    let updatedAt: String?
}
struct TysonMessage: Codable, Identifiable {
    let id: String
    let content: String?
    let senderUsername: String?
    let createdAt: String?
}
private struct ConversationsPayload: Codable { let conversations: [TysonConversation] }
private struct MessagesPayload: Codable { let messages: [TysonMessage] }
struct AIResponse: Codable { let answer: String }
struct TysonSearchUser: Codable, Identifiable { let id: String; let username: String; let displayName: String }
struct TysonSearchPost: Codable, Identifiable { let id: String; let body: String; let title: String?; let username: String; let displayName: String }
struct SearchPayload: Codable { let users: [TysonSearchUser]; let posts: [TysonSearchPost] }
