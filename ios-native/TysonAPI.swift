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

    func login(email: String, password: String) async throws -> LoginPayload {
        let response: Envelope<LoginPayload> = try await request(path: "/auth/login", method: "POST", body: ["email": email, "password": password])
        if let token = response.data.accessToken { UserDefaults.standard.set(token, forKey: "tyson_access_token") }
        return response.data
    }

    func telegramAuthorizationURL() async throws -> URL {
        let body = TelegramStartBody(action: "login", native: true)
        let response: Envelope<TelegramStartPayload> = try await requestEncodable(path: "/auth/telegram/start", body: body)
        guard let url = URL(string: response.data.authorizationUrl) else { throw URLError(.badURL) }
        return url
    }

    func exchangeTelegram(ticket: String) async throws -> TysonUser {
        let response: Envelope<LoginPayload> = try await request(path: "/auth/telegram/exchange", method: "POST", body: ["ticket": ticket])
        guard let user = response.data.user, let token = response.data.accessToken else { throw URLError(.cannotParseResponse) }
        UserDefaults.standard.set(token, forKey: "tyson_access_token")
        return user
    }

    func approveLogin(challengeId: String, approvalToken: String, code: String) async throws {
        try await requestVoid(path: "/auth/login/approve", method: "POST", body: ["challengeId": challengeId, "approvalToken": approvalToken, "code": code])
    }

    func loginChallenge(id: String, approvalToken: String) async throws -> ChallengePayload {
        var request = URLRequest(url: baseURL.appending(path: "/auth/login/challenges/\(id)"))
        request.setValue(approvalToken, forHTTPHeaderField: "x-login-approval-token")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        let envelope = try decoder.decode(Envelope<ChallengePayload>.self, from: data)
        if let token = envelope.data.accessToken { UserDefaults.standard.set(token, forKey: "tyson_access_token") }
        return envelope.data
    }

    func logout() async {
        try? await requestVoid(path: "/auth/logout", method: "POST", body: [:])
        UserDefaults.standard.removeObject(forKey: "tyson_access_token")
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

    func deviceSessions() async throws -> [TysonDeviceSession] {
        let response: Envelope<DeviceSessionsPayload> = try await request(path: "/auth/sessions")
        return response.data.sessions
    }

    func revokeSession(id: String) async throws { try await requestVoid(path: "/auth/sessions/\(id)", method: "DELETE", body: [:]) }
    func revokeOtherSessions() async throws { try await requestVoid(path: "/auth/sessions/others", method: "DELETE", body: [:]) }

    func privacySettings() async throws -> PrivacySettings {
        let response: Envelope<PrivacySettings> = try await request(path: "/users/me/privacy-settings")
        return response.data
    }
    func savePrivacy(_ value: PrivacySettings) async throws {
        let _: Envelope<PrivacySettings> = try await requestEncodable(path: "/users/me/privacy-settings", method: "PUT", body: value)
    }

    func notificationSettings() async throws -> NotificationSettings {
        let response: Envelope<NotificationSettings> = try await request(path: "/users/me/notification-settings")
        return response.data
    }
    func saveNotificationSettings(_ value: NotificationSettings) async throws {
        let _: Envelope<NotificationSettings> = try await requestEncodable(path: "/users/me/notification-settings", method: "PUT", body: value)
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
        authorize(&request)
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func requestEncodable<T: Codable, B: Encodable>(path: String, method: String = "POST", body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        authorize(&request)
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        return try decoder.decode(T.self, from: data)
    }

    private func requestVoid(path: String, method: String, body: [String: String]) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        authorize(&request)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
    }


    private func authorize(_ request: inout URLRequest) {
        if let token = UserDefaults.standard.string(forKey: "tyson_access_token") { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
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
struct LoginPayload: Codable { let user: TysonUser?; let accessToken: String?; let requiresApproval: Bool?; let challengeId: String?; let approvalToken: String?; let method: String? }
struct ChallengePayload: Codable { let status: String; let user: TysonUser?; let accessToken: String?; let method: String? }
private struct TelegramStartBody: Codable { let action: String; let native: Bool }
private struct TelegramStartPayload: Codable { let authorizationUrl: String }
struct TysonDeviceSession: Codable, Identifiable { let id: String; let device: String; let browser: String; let createdAt: String; let lastSeenAt: String; let current: Bool }
private struct DeviceSessionsPayload: Codable { let sessions: [TysonDeviceSession] }
struct PrivacySettings: Codable { var lastSeenVisibility: String; var birthdayVisibility: String; var messagingVisibility: String; var storiesVisibility: String }
struct NotificationSettings: Codable { var messageSoundsEnabled: Bool }
