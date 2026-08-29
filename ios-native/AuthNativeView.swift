import SwiftUI
import AuthenticationServices
import UIKit

struct LoginView: View {
    @EnvironmentObject private var appSession: AppSession
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var errorMessage = ""
    @State private var challenge: LoginPayload?
    @State private var approvalCode = ""
    private let telegram = TelegramWebAuthenticator()

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(uiColor: .systemBackground), TysonColor.accent.opacity(0.14)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 22) {
                    Spacer(minLength: 48)
                    Image(systemName: "pawprint.fill").font(.system(size: 54)).foregroundStyle(TysonColor.green)
                    Text("Tyson").font(.system(size: 42, weight: .bold, design: .rounded))
                    Text("Войдите, чтобы продолжить общение").foregroundStyle(.secondary)
                    TysonGlass { VStack(spacing: 15) {
                        if let challenge {
                            Text("Подтвердите вход").font(.title2.bold())
                            Text(challenge.method == "telegram" ? "Разрешите вход в сообщении от Tyson в Telegram." : "Введите шестизначный код из письма.").foregroundStyle(.secondary)
                            if challenge.method != "telegram" { TextField("000000", text: $approvalCode).keyboardType(.numberPad).textFieldStyle(.roundedBorder); Button("Подтвердить код") { Task { await approve(challenge) } }.buttonStyle(.borderedProminent) }
                            ProgressView("Ожидаем подтверждение…")
                            Button("Начать заново") { self.challenge = nil }
                        } else {
                            TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).textFieldStyle(.roundedBorder)
                            SecureField("Пароль", text: $password).textContentType(.password).textFieldStyle(.roundedBorder)
                            Button { Task { await login() } } label: { HStack { if busy { ProgressView() }; Text("Войти").frame(maxWidth: .infinity) } }.buttonStyle(.borderedProminent).controlSize(.large).disabled(email.isEmpty || password.isEmpty || busy)
                            HStack { Rectangle().frame(height: 1).foregroundStyle(.quaternary); Text("или").foregroundStyle(.secondary); Rectangle().frame(height: 1).foregroundStyle(.quaternary) }
                            Button { Task { await telegramLogin() } } label: { Label("Войти через Telegram", systemImage: "paperplane.fill").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large).disabled(busy)
                        }
                        if !errorMessage.isEmpty { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
                    }.padding(22) }.padding(.horizontal, 20)
                    Spacer(minLength: 30)
                }
            }
        }
    }

    private func login() async {
        busy = true; errorMessage = ""; defer { busy = false }
        do {
            let result = try await TysonAPI.shared.login(email: email, password: password)
            if result.requiresApproval == true { challenge = result; Task { await poll(result) } }
            else if let user = result.user { await finish(user) }
            else { errorMessage = "Сервер не вернул данные аккаунта." }
        } catch { errorMessage = "Неверная почта или пароль либо сервер временно недоступен." }
    }

    private func approve(_ value: LoginPayload) async {
        guard let id = value.challengeId, let token = value.approvalToken else { return }
        do { try await TysonAPI.shared.approveLogin(challengeId: id, approvalToken: token, code: approvalCode); await poll(value) }
        catch { errorMessage = "Код неверный или уже истёк." }
    }

    private func poll(_ value: LoginPayload) async {
        guard let id = value.challengeId, let token = value.approvalToken else { return }
        for _ in 0..<120 {
            if Task.isCancelled { return }
            if let result = try? await TysonAPI.shared.loginChallenge(id: id, approvalToken: token), result.status == "approved", let user = result.user { await finish(user); return }
            try? await Task.sleep(for: .seconds(2.5))
        }
        errorMessage = "Время подтверждения истекло. Попробуйте снова."
    }

    private func telegramLogin() async {
        busy = true; errorMessage = ""; defer { busy = false }
        do {
            let url = try await TysonAPI.shared.telegramAuthorizationURL()
            let callback = try await telegram.authenticate(url: url)
            guard let components = URLComponents(url: callback, resolvingAgainstBaseURL: false), let ticket = components.queryItems?.first(where: { $0.name == "ticket" })?.value else { throw URLError(.cannotParseResponse) }
            let user = try await TysonAPI.shared.exchangeTelegram(ticket: ticket)
            await finish(user)
        } catch { errorMessage = "Не удалось завершить вход через Telegram." }
    }

    @MainActor private func finish(_ user: TysonUser) { appSession.currentUser = user; appSession.requiresLogin = false }
}

@MainActor
final class TelegramWebAuthenticator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "tysonsocial") { callback, error in
                if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: error ?? URLError(.cancelled)) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() { continuation.resume(throwing: URLError(.cannotLoadFromNetwork)) }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.windows.first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
    }
}
