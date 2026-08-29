import Foundation
import Sodium
import CryptoKit

struct TysonUser: Codable, Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarKey: String?
    let bio: String?
    let verified: Bool?
    let followerCount: Int?
    let followingCount: Int?
    let viewerFollowing: Bool?
    let createdAt: String?
    let lastSeenAt: String?
    let birthdayMonthDay: String?
    let birthdayYear: Int?
    let profileColor: String?
}

struct TysonPost: Codable, Identifiable {
    let id: String
    let body: String
    let title: String?
    let username: String
    let displayName: String
    let avatarKey: String?
    let verified: TysonFlag?
    let publishedAt: String
    let likeCount: Int?
    let commentCount: Int?
    let authorId: String?
    let diamondCount: Int?
    let pinnedAt: String?
    let promoted: TysonFlag?
    let viewerReaction: String?
}

private struct Envelope<T: Codable>: Codable { let data: T }

actor TysonAPI {
    static let shared = TysonAPI()
    private let baseURL = URL(string: "https://api.tysonsocial.eu.cc/api")!
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    nonisolated static func mediaURL(_ key: String?) -> URL? {
        guard let key, !key.isEmpty else { return nil }
        return URL(string: "https://api.tysonsocial.eu.cc/api/media/\(key.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? key)")
    }

    nonisolated static func publicAssetURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if let url = URL(string: path), url.scheme != nil { return url }
        return URL(string: "https://tysonsocial.eu.cc\(path.hasPrefix("/") ? path : "/\(path)")")
    }

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
        authorize(&request)
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

    func feed(view: FeedViewMode = .forYou) async throws -> [TysonPost] {
        let response: Envelope<FeedPayload> = try await request(
            path: "/feed",
            queryItems: [URLQueryItem(name: "view", value: view.rawValue)]
        )
        return response.data.posts
    }

    func stories() async throws -> [TysonStory] {
        let response: Envelope<StoriesPayload> = try await request(path: "/stories")
        return response.data.stories
    }

    func createStory(imageData: Data, caption: String = "") async throws {
        var request = URLRequest(url: baseURL.appending(path: "/stories"))
        request.httpMethod = "POST"
        authorize(&request)
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue(caption, forHTTPHeaderField: "X-Story-Caption")
        request.httpBody = imageData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        _ = try decoder.decode(Envelope<CreatedStoryPayload>.self, from: data)
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
        let _: Envelope<EmptyPayload> = try await requestEncodable(path: "/messages/conversations/\(conversationId)/messages", body: SendTextBody(content: MessageContentPayload(type: "text", text: content)))
    }

    func sendSticker(conversationId: String, stickerId: String) async throws {
        let _: Envelope<EmptyPayload> = try await requestEncodable(
            path: "/messages/conversations/\(conversationId)/messages",
            body: SendStickerBody(content: StickerContentPayload(type: "sticker", stickerId: stickerId))
        )
    }

    func sendAttachment(conversationId: String, data: Data, type: String, mimeType: String, durationMs: Int? = nil, name: String? = nil) async throws {
        let sodium = Sodium()
        let key = sodium.secretBox.key(); let nonce = sodium.secretBox.nonce()
        guard let ciphertext = sodium.secretBox.seal(message: [UInt8](data), secretKey: key, nonce: nonce) else { throw URLError(.cannotParseResponse) }
        var upload = URLRequest(url: baseURL.appending(path: "/messages/conversations/\(conversationId)/attachments")); upload.httpMethod = "POST"; authorize(&upload); upload.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type"); upload.httpBody = Data(ciphertext)
        let (responseData, response) = try await URLSession.shared.data(for: upload)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        let uploaded = try decoder.decode(Envelope<AttachmentUploadPayload>.self, from: responseData)
        let digest = Data(SHA256.hash(data: Data(ciphertext))).base64EncodedString()
        let content = AttachmentContentPayload(type: type, attachmentId: uploaded.data.attachmentId, key: Data(key).base64EncodedString(), nonce: Data(nonce).base64EncodedString(), digest: digest, mimeType: mimeType, durationMs: durationMs, name: name)
        let _: Envelope<EmptyPayload> = try await requestEncodable(path: "/messages/conversations/\(conversationId)/messages", body: SendAttachmentBody(content: content))
    }

    func downloadAttachment(_ attachment: TysonMessageAttachment) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: "/messages/attachments/\(attachment.id)"))
        authorize(&request)
        let (ciphertext, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        if let digest = attachment.digest, Data(SHA256.hash(data: ciphertext)).base64EncodedString() != digest { throw URLError(.cannotDecodeContentData) }
        guard let key = Data(base64Encoded: attachment.key), let nonce = Data(base64Encoded: attachment.nonce),
              let plain = Sodium().secretBox.open(authenticatedCipherText: [UInt8](ciphertext), secretKey: [UInt8](key), nonce: [UInt8](nonce)) else {
            throw URLError(.cannotDecodeContentData)
        }
        return Data(plain)
    }

    func createConversation(username: String) async throws -> TysonConversation {
        let response: Envelope<CreatedConversationPayload> = try await request(path: "/messages/conversations", method: "POST", body: ["recipientUsername": username])
        return TysonConversation(id: response.data.conversation.id, title: nil, otherUsername: response.data.conversation.otherUser.username, otherDisplayName: response.data.conversation.otherUser.displayName, lastMessage: nil, updatedAt: nil, otherAvatarKey: response.data.conversation.otherUser.avatarKey, kind: "direct", memberCount: nil)
    }

    func createGroup(title: String, username: String) async throws -> TysonConversation {
        let response: Envelope<GroupConversationPayload> = try await requestEncodable(
            path: "/messages/groups",
            body: GroupConversationBody(title: title, username: username)
        )
        let group = response.data.conversation
        return TysonConversation(
            id: group.id,
            title: group.title,
            otherUsername: group.username,
            otherDisplayName: group.title,
            lastMessage: nil,
            updatedAt: nil,
            otherAvatarKey: nil,
            kind: "group",
            memberCount: group.memberCount
        )
    }

    func createPost(title: String, body: String) async throws {
        try await requestVoid(path: "/posts", method: "POST", body: ["title": title, "body": body])
    }

    func createPost(_ input: CreatePostInput) async throws {
        let _: Envelope<CreatePostResult> = try await requestEncodable(path: "/posts", body: input)
    }

    func createPostWithImage(_ input: CreatePostInput, imageData: Data) async throws {
        let boundary = "Tyson-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appending(path: "/posts")); request.httpMethod = "POST"; authorize(&request)
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var data = Data()
        func field(_ name: String, _ value: String) { data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!) }
        field("title", input.title); field("body", input.body)
        if let poll = input.poll, let json = String(data: try JSONEncoder().encode(poll), encoding: .utf8) { field("poll", json) }
        if let date = input.scheduledAt { field("scheduledAt", date) }
        if let names = input.coauthorUsernames, !names.isEmpty { field("coauthorUsernames", names.joined(separator: ",")) }
        data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!); data.append(imageData); data.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = data
        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        _ = try decoder.decode(Envelope<CreatePostResult>.self, from: responseData)
    }

    func profile(username: String) async throws -> TysonUser {
        let response: Envelope<SessionPayload> = try await request(path: "/users/\(username)")
        guard let user = response.data.user else { throw URLError(.resourceUnavailable) }
        return user
    }

    func posts(username: String) async throws -> [TysonPost] {
        let response: Envelope<FeedPayload> = try await request(path: "/users/\(username)/posts")
        return response.data.posts
    }

    func people(username: String, kind: FollowListKind) async throws -> [TysonPerson] {
        let response: Envelope<PeoplePayload> = try await request(path: "/users/\(username)/\(kind.rawValue)")
        return response.data.people
    }

    func setFollowing(username: String, following: Bool) async throws -> FollowResult {
        let response: Envelope<FollowResult> = try await requestEncodable(path: "/users/\(username)/follow", method: following ? "PUT" : "DELETE", body: EmptyPayload())
        return response.data
    }

    func diamondBalance() async throws -> Int { let response: Envelope<DiamondBalancePayload> = try await request(path: "/diamonds/balance"); return response.data.balance }
    func diamondTransactions() async throws -> [DiamondTransaction] { let response: Envelope<DiamondTransactionsPayload> = try await request(path: "/diamonds/transactions"); return response.data.transactions }
    func gifts() async throws -> [TysonGiftType] { let response: Envelope<GiftTypesPayload> = try await request(path: "/gifts"); return response.data.gifts }
    func myGifts() async throws -> [TysonGift] { let response: Envelope<UserGiftsPayload> = try await request(path: "/users/me/gifts"); return response.data.gifts }
    func userGifts(username: String) async throws -> [TysonGift] { let response: Envelope<UserGiftsPayload> = try await request(path: "/users/\(username)/gifts"); return response.data.gifts }
    func aliases() async throws -> AliasesPayload {
        let response: Envelope<AliasesPayload> = try await request(path: "/users/me/aliases")
        return response.data
    }
    func buyAlias(username: String) async throws -> Int { let response: Envelope<AliasPurchasePayload> = try await request(path: "/users/me/aliases", method: "POST", body: ["username": username]); return response.data.balance }
    func deleteAlias(id: String) async throws { try await requestVoid(path: "/users/me/aliases/\(id)", method: "DELETE", body: [:]) }
    func buyGift(id: String, recipientUsername: String?) async throws -> Int {
        let response: Envelope<GiftPurchasePayload> = try await requestEncodable(path: "/gifts/\(id)/buy", body: GiftPurchaseBody(recipientUsername: recipientUsername))
        return response.data.balance
    }
    func upgradeGift(id: String) async throws -> TysonGift {
        let response: Envelope<GiftOperationPayload> = try await requestEncodable(path: "/user-gifts/\(id)/upgrade", body: EmptyPayload())
        return response.data.gift
    }
    func setGiftWorn(id: String, worn: Bool) async throws {
        if worn { try await requestVoid(path: "/user-gifts/\(id)/wear", method: "POST", body: [:]) }
        else { try await requestVoid(path: "/users/me/worn-gift", method: "DELETE", body: [:]) }
    }
    func setGiftPublic(id: String, isPublic: Bool) async throws {
        let _: Envelope<GiftVisibilityPayload> = try await requestEncodable(path: "/user-gifts/\(id)/public", method: "PUT", body: GiftVisibilityBody(isPublic: isPublic))
    }
    func transferGift(id: String, recipientUsername: String) async throws {
        try await requestVoid(path: "/user-gifts/\(id)/transfer", method: "POST", body: ["recipientUsername": recipientUsername])
    }
    func exchangeGift(id: String) async throws {
        try await requestVoid(path: "/user-gifts/\(id)/exchange", method: "POST", body: [:])
    }
    func listGift(id: String, price: Int) async throws {
        let _: Envelope<GiftListingPayload> = try await requestEncodable(path: "/user-gifts/\(id)/list", body: GiftListingBody(price: price))
    }
    func removeGiftInscription(id: String) async throws {
        try await requestVoid(path: "/user-gifts/\(id)/inscription", method: "DELETE", body: [:])
    }
    func starPackages() async throws -> [StarPackage] { let response: Envelope<StarPackagesPayload> = try await request(path: "/diamonds/stars/packages"); return response.data.packages }
    func starInvoice(packageId: String) async throws -> URL {
        let response: Envelope<StarInvoicePayload> = try await requestEncodable(path: "/diamonds/stars/invoice", body: StarInvoiceBody(packageId: packageId))
        guard let url = URL(string: response.data.url) else { throw URLError(.badURL) }; return url
    }

    func promotePost(id: String, views: Int) async throws { let _: Envelope<PromotionPayload> = try await requestEncodable(path: "/posts/\(id)/promote", body: PromotionBody(views: views)) }
    func cancelPromotion(id: String) async throws { try await requestVoid(path: "/posts/\(id)/promote", method: "DELETE", body: [:]) }
    func pinPost(id: String, pinned: Bool) async throws { let _: Envelope<PinPayload> = try await requestEncodable(path: "/posts/\(id)/pin", method: "PUT", body: PinBody(pinned: pinned)) }
    func deletePost(id: String) async throws { try await requestVoid(path: "/posts/\(id)", method: "DELETE", body: [:]) }
    func repost(id: String) async throws { let _: Envelope<RepostPayload> = try await requestEncodable(path: "/posts/\(id)/repost", body: RepostBody(body: "")) }
    func updatePost(id: String, title: String, body: String) async throws { let _: Envelope<UpdatePostPayload> = try await requestEncodable(path: "/posts/\(id)", method: "PUT", body: UpdatePostBody(title: title, body: body)) }
    func reactToPost(id: String, reaction: String?) async throws -> ReactionPayload { let response: Envelope<ReactionPayload> = try await requestEncodable(path: "/posts/\(id)/reaction", method: "PUT", body: ReactionBody(reaction: reaction)); return response.data }

    func editMessage(conversationId: String, messageId: String, text: String) async throws {
        let _: Envelope<EditMessagePayload> = try await requestEncodable(path: "/messages/conversations/\(conversationId)/messages/\(messageId)", method: "PUT", body: SendTextBody(content: MessageContentPayload(type: "text", text: text)))
    }
    func deleteMessage(conversationId: String, messageId: String) async throws { let _: Envelope<DeleteMessagePayload> = try await requestEncodable(path: "/messages/conversations/\(conversationId)/messages/\(messageId)", method: "DELETE", body: EmptyPayload()) }

    func updateProfile(_ input: ProfileUpdateInput) async throws -> TysonUser {
        let response: Envelope<SessionPayload> = try await requestEncodable(path: "/users/me", method: "PATCH", body: input)
        guard let user = response.data.user else { throw URLError(.cannotParseResponse) }
        return user
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

    func notifications() async throws -> [TysonNotification] {
        let response: Envelope<NotificationsPayload> = try await request(path: "/notifications")
        return response.data.notifications
    }

    func markNotificationsRead() async throws {
        try await requestVoid(path: "/notifications/read-all", method: "POST", body: [:])
    }

    func aiChat(text: String) async throws -> String {
        let response: Envelope<AIResponse> = try await request(path: "/ai/guest/chat", method: "POST", body: ["message": text])
        return response.data.answer
    }

    func aiConversations() async throws -> [AIConversation] { let response: Envelope<AIConversationsPayload> = try await request(path: "/ai/conversations"); return response.data.conversations }
    func createAIConversation() async throws -> AIConversation { let response: Envelope<AIConversationPayload> = try await requestEncodable(path: "/ai/conversations", body: EmptyPayload()); return response.data.conversation }
    func deleteAIConversation(id: String) async throws { try await requestVoid(path: "/ai/conversations/\(id)", method: "DELETE", body: [:]) }
    func aiMessages(conversationId: String) async throws -> [AIMessage] { let response: Envelope<AIMessagesPayload> = try await request(path: "/ai/conversations/\(conversationId)/messages"); return response.data.messages }
    func sendAIMessage(conversationId: String, content: String, modelTier: String, attachment: Data? = nil, filename: String = "attachment", mimeType: String = "application/octet-stream", image: Bool = false) async throws -> AIMessage {
        let boundary = "TysonAI-\(UUID().uuidString)"; var request = URLRequest(url: baseURL.appending(path: "/ai/conversations/\(conversationId)/messages")); request.httpMethod = "POST"; authorize(&request); request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type"); var data = Data()
        func field(_ name: String, _ value: String) { data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!) }
        field("content", content); field("modelTier", modelTier)
        if let attachment { data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(image ? "image" : "document")\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!); data.append(attachment); data.append("\r\n".data(using: .utf8)!) }
        data.append("--\(boundary)--\r\n".data(using: .utf8)!); request.httpBody = data
        let (responseData, response) = try await URLSession.shared.data(for: request); guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }; return try decoder.decode(Envelope<AISendPayload>.self, from: responseData).data.assistantMessage
    }

    func search(query: String) async throws -> SearchPayload {
        let response: Envelope<SearchPayload> = try await request(
            path: "/search",
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
        return response.data
    }

    private func request<T: Codable>(
        path: String,
        method: String = "GET",
        body: [String: String]? = nil,
        queryItems: [URLQueryItem] = []
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components?.url else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
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
        request.setValue("https://tysonsocial.eu.cc", forHTTPHeaderField: "Origin")
        request.setValue("TysonSocial-iOS/1.0", forHTTPHeaderField: "User-Agent")
        if let token = UserDefaults.standard.string(forKey: "tyson_access_token") { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    }
}

private struct SessionPayload: Codable { let user: TysonUser? }
private struct FeedPayload: Codable { let posts: [TysonPost] }
enum FeedViewMode: String, CaseIterable, Identifiable {
    case forYou = "for-you"
    case following
    case fresh

    var id: String { rawValue }
    var title: String {
        switch self {
        case .forYou: return "Для вас"
        case .following: return "Подписки"
        case .fresh: return "Свежие"
        }
    }
}
struct TysonStory: Codable, Identifiable {
    let id: String
    let storageKey: String
    let mediaType: String
    let contentType: String
    let caption: String?
    let createdAt: String
    let expiresAt: String
    let authorId: String
    let username: String
    let displayName: String
    let avatarKey: String?
    let verified: TysonFlag?
    let reactionCount: Int?
    let viewerReaction: String?
}
private struct StoriesPayload: Codable { let stories: [TysonStory] }
private struct CreatedStoryPayload: Codable { let story: CreatedStory }
private struct CreatedStory: Codable { let id: String }

struct TysonConversation: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let otherUsername: String?
    let otherDisplayName: String?
    let lastMessage: String?
    let updatedAt: String?
    let otherAvatarKey: String?
    let kind: String?
    let memberCount: Int?
}
struct TysonMessage: Codable, Identifiable {
    let id: String
    let content: JSONValue?
    let senderUserId: String?
    let sentAt: String?
    var text: String { content?.objectValue?["text"]?.stringValue ?? content?.stringValue ?? "Сообщение" }
    var attachment: TysonMessageAttachment? {
        guard let object = content?.objectValue,
              let type = object["type"]?.stringValue,
              ["image", "audio", "video", "file"].contains(type),
              let id = object["attachmentId"]?.stringValue,
              let key = object["key"]?.stringValue,
              let nonce = object["nonce"]?.stringValue,
              let mimeType = object["mimeType"]?.stringValue else { return nil }
        return TysonMessageAttachment(id: id, type: type, key: key, nonce: nonce, digest: object["digest"]?.stringValue, mimeType: mimeType, name: object["name"]?.stringValue)
    }
}
struct TysonMessageAttachment: Hashable { let id: String; let type: String; let key: String; let nonce: String; let digest: String?; let mimeType: String; let name: String? }
private struct ConversationsPayload: Codable { let conversations: [TysonConversation] }
private struct MessagesPayload: Codable { let messages: [TysonMessage] }
private struct CreatedConversationPayload: Codable { let conversation: CreatedConversation }
private struct CreatedConversation: Codable { let id: String; let otherUser: CreatedConversationUser }
private struct CreatedConversationUser: Codable { let username: String; let displayName: String; let avatarKey: String? }
private struct GroupConversationBody: Codable { let title: String; let username: String }
private struct GroupConversationPayload: Codable { let conversation: CreatedGroupConversation }
private struct CreatedGroupConversation: Codable { let id: String; let title: String; let username: String; let memberCount: Int }
enum FollowListKind: String { case followers, following }
struct TysonPerson: Codable, Identifiable { let id: String; let username: String; let displayName: String; let avatarKey: String?; let verified: Int? }
private struct PeoplePayload: Codable { let people: [TysonPerson] }
struct TysonAlias: Codable, Identifiable { let id: String; let username: String; let createdAt: String; let purchasePrice: Int? }
struct AliasesPayload: Codable { let aliases: [TysonAlias]; let price: Int }
private struct AliasPurchasePayload: Codable { let alias: TysonAlias; let balance: Int }
struct FollowResult: Codable { let following: Bool; let followerCount: Int }
private struct DiamondBalancePayload: Codable { let balance: Int }
struct DiamondTransaction: Codable, Identifiable { let id: String; let amount: Int; let type: String; let reason: String; let createdAt: String }
private struct DiamondTransactionsPayload: Codable { let transactions: [DiamondTransaction] }
struct TysonGiftType: Codable, Identifiable { let id: String; let slug: String; let title: String; let basePrice: Int; let upgradePrice: Int?; let maxSupply: Int; let soldCount: Int; let remaining: Int; let baseImage: String; let isLimited: Bool; let isUnlimited: Bool; let canUpgrade: Bool; let canTransfer: Bool; let canWear: Bool; let exchangeReward: Int?; let exchangeWindowDays: Int?; let active: Bool }
struct TysonGift: Codable, Identifiable { let id: String; let giftTypeId: String; let title: String; let serialNumber: Int; let maxSupply: Int; let basePrice: Int; let inscription: String?; let isCollectible: Bool; let accentColor: String; let isPublic: Bool; let worn: Bool; let activeListingId: String?; let variant: String?; let image: String; let purchasedAt: String; let upgradedAt: String?; let upgradePrice: Int?; let isLimited: Bool; let isUnlimited: Bool; let canUpgrade: Bool; let canTransfer: Bool; let canWear: Bool; let exchangeReward: Int?; let exchangeWindowDays: Int?; let collectibleVariants: [String]? }
private struct GiftTypesPayload: Codable { let gifts: [TysonGiftType] }
private struct UserGiftsPayload: Codable { let gifts: [TysonGift] }
private struct GiftPurchaseBody: Codable { let recipientUsername: String? }
private struct GiftPurchasePayload: Codable { let balance: Int }
private struct GiftOperationPayload: Codable { let gift: TysonGift; let balance: Int? }
private struct GiftVisibilityBody: Codable { let isPublic: Bool }
private struct GiftVisibilityPayload: Codable { let isPublic: Bool }
private struct GiftListingBody: Codable { let price: Int }
private struct GiftListingPayload: Codable { let listingId: String; let price: Int }
struct StarPackage: Codable, Identifiable { let id: String; let stars: Int; let diamonds: Int; let label: String }
private struct StarPackagesPayload: Codable { let packages: [StarPackage] }
private struct StarInvoiceBody: Codable { let packageId: String }
private struct StarInvoicePayload: Codable { let url: String }
private struct PromotionBody: Codable { let views: Int }
private struct PromotionPayload: Codable { let cost: Int?; let balance: Int? }
private struct PinBody: Codable { let pinned: Bool }
private struct PinPayload: Codable { let pinned: Bool }
private struct RepostBody: Codable { let body: String }
private struct RepostPayload: Codable { let id: String }
private struct UpdatePostBody: Codable { let title: String; let body: String }
private struct UpdatePostPayload: Codable { let editedAt: String }
private struct ReactionBody: Codable { let reaction: String? }
struct ReactionPayload: Codable { let reaction: String?; let likeCount: Int }
struct TysonNotification: Codable, Identifiable {
    let id: String
    let type: String
    let entityId: String?
    let message: String
    let readAt: String?
    let createdAt: String
    let actorUsername: String?
    let actorDisplayName: String?
    let actorAvatarKey: String?
}
private struct NotificationsPayload: Codable { let notifications: [TysonNotification] }
private struct EditMessagePayload: Codable { let edited: Bool; let editedAt: String? }
private struct DeleteMessagePayload: Codable { let deleted: Bool }
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
struct ProfileUpdateInput: Codable {
    let displayName: String
    let bio: String
    let birthdayMonthDay: String?
    let birthdayYear: Int?
    let profileColor: String
}
struct PollInput: Codable { var question: String; var options: [String] }
struct CreatePostInput: Codable { var title: String; var body: String; var poll: PollInput?; var scheduledAt: String?; var coauthorUsernames: [String]? }
private struct CreatePostResult: Codable { let id: String; let status: String }
private struct EmptyPayload: Codable {}
private struct MessageContentPayload: Codable { let type: String; let text: String }
private struct SendTextBody: Codable { let content: MessageContentPayload }
private struct StickerContentPayload: Codable { let type: String; let stickerId: String }
private struct SendStickerBody: Codable { let content: StickerContentPayload }
private struct AttachmentUploadPayload: Codable { let attachmentId: String }
private struct AttachmentContentPayload: Codable { let type: String; let attachmentId: String; let key: String; let nonce: String; let digest: String; let mimeType: String; let durationMs: Int?; let name: String? }
private struct SendAttachmentBody: Codable { let content: AttachmentContentPayload }

struct TysonFlag: Codable, Equatable {
    let value: Bool
    init(_ value: Bool) { self.value = value }
    init(from decoder: Decoder) throws {
        let box = try decoder.singleValueContainer()
        if let value = try? box.decode(Bool.self) { self.value = value; return }
        if let value = try? box.decode(Int.self) { self.value = value != 0; return }
        if let value = try? box.decode(String.self) { self.value = ["1", "true", "yes"].contains(value.lowercased()); return }
        self.value = false
    }
    func encode(to encoder: Encoder) throws { var box = encoder.singleValueContainer(); try box.encode(value) }
}

enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null
    init(from decoder: Decoder) throws {
        let box = try decoder.singleValueContainer()
        if box.decodeNil() { self = .null }
        else if let value = try? box.decode(String.self) { self = .string(value) }
        else if let value = try? box.decode(Bool.self) { self = .bool(value) }
        else if let value = try? box.decode(Double.self) { self = .number(value) }
        else if let value = try? box.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try box.decode([JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var box = encoder.singleValueContainer()
        switch self { case .string(let v): try box.encode(v); case .number(let v): try box.encode(v); case .bool(let v): try box.encode(v); case .object(let v): try box.encode(v); case .array(let v): try box.encode(v); case .null: try box.encodeNil() }
    }
    var stringValue: String? { if case .string(let value) = self { return value }; return nil }
    var objectValue: [String: JSONValue]? { if case .object(let value) = self { return value }; return nil }
}
struct AIConversation: Codable, Identifiable { let id: String; let title: String; let createdAt: String; let updatedAt: String }
struct AIMessage: Codable, Identifiable { let id: String; let role: String; let content: String; let imageStorageKey: String?; let attachmentName: String?; let attachmentContentType: String?; let modelVersion: String?; let createdAt: String }
private struct AIConversationsPayload: Codable { let conversations: [AIConversation] }
private struct AIConversationPayload: Codable { let conversation: AIConversation }
private struct AIMessagesPayload: Codable { let messages: [AIMessage] }
private struct AISendPayload: Codable { let assistantMessage: AIMessage }
