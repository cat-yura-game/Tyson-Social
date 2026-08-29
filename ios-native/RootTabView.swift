import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View {
        TabView {
            FeedView().tabItem { Label("Главная", systemImage: "house.fill") }
            MessengerHomeView().tabItem { Label("Messenger", systemImage: "message.fill") }
            CreateView().tabItem { Label("Создать", systemImage: "plus") }
            AITabView().tabItem { Label("AI", systemImage: "sparkles") }
            ProfileView().tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }.toolbarBackground(.visible, for: .tabBar).toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .fullScreenCover(isPresented: $session.requiresLogin) { LoginView().interactiveDismissDisabled() }
    }
}

struct CreateView: View {
    @State private var title = ""; @State private var bodyText = ""; @State private var status: String?
    var body: some View { NavigationStack { Form {
        Section("Новая публикация") { TextField("Заголовок", text: $title); TextEditor(text: $bodyText).frame(minHeight: 180) }
        Button { Task { await publish() } } label: { Label("Опубликовать", systemImage: "paperplane.fill") }.disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        if let status { Text(status).foregroundStyle(.secondary) }
    }.navigationTitle("Создать") } }
    private func publish() async { do { try await TysonAPI.shared.createPost(title: title, body: bodyText); title = ""; bodyText = ""; status = "Пост опубликован" } catch { status = "Не удалось опубликовать пост" } }
}

struct AITabView: View {
    @State private var input = ""; @State private var answer = ""; @State private var busy = false
    var body: some View { NavigationStack { VStack(spacing: 14) {
        ScrollView { Text(answer.isEmpty ? "Tyson AI готова помочь с идеями, текстами и вопросами." : answer).frame(maxWidth: .infinity, alignment: .leading).padding() }
        HStack { TextField("Спросить Tyson AI", text: $input).textFieldStyle(.roundedBorder); Button { Task { await ask() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }.disabled(input.isEmpty || busy) }.padding()
    }.navigationTitle("Tyson AI") } }
    private func ask() async { busy = true; defer { busy = false }; do { answer = try await TysonAPI.shared.aiChat(text: input); input = "" } catch { answer = "AI временно недоступна." } }
}
