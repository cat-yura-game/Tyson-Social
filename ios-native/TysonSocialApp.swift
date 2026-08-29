import SwiftUI

@main
struct TysonSocialApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootTabView()
            .environmentObject(session)
            .tint(TysonColor.accent)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

final class AppSession: ObservableObject {
    @Published var currentUser: TysonUser?
    @Published var isLoading = false
    @Published var requiresLogin = false

    init() { Task { await loadSession() } }

    @MainActor
    func loadSession() async {
        isLoading = true
        defer { isLoading = false }
        currentUser = try? await TysonAPI.shared.session()
        requiresLogin = currentUser == nil
    }

    @MainActor
    func login(email: String, password: String) async throws {
        let result = try await TysonAPI.shared.login(email: email, password: password)
        guard result.requiresApproval != true, let user = result.user else { throw URLError(.userAuthenticationRequired) }
        currentUser = user; requiresLogin = false
    }

    @MainActor
    func acceptTelegram(ticket: String) async throws {
        currentUser = try await TysonAPI.shared.exchangeTelegram(ticket: ticket)
        requiresLogin = false
    }

    @MainActor
    func logout() async { await TysonAPI.shared.logout(); currentUser = nil; requiresLogin = true }
}
