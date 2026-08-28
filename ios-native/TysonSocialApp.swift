import SwiftUI

@main
struct TysonSocialApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(session)
                .tint(TysonColor.accent)
        }
    }
}

final class AppSession: ObservableObject {
    @Published var currentUser: TysonUser?
    @Published var isLoading = false

    init() { Task { await loadSession() } }

    @MainActor
    func loadSession() async {
        isLoading = true
        defer { isLoading = false }
        currentUser = try? await TysonAPI.shared.session()
    }
}
