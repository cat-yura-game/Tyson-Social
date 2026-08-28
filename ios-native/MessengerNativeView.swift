import SwiftUI

struct MessengerHomeView: View {
    @State private var conversations: [TysonConversation] = []
    @State private var search = ""
    @State private var showNew = false
    var filtered: [TysonConversation] { search.isEmpty ? conversations : conversations.filter { ($0.title ?? $0.otherDisplayName ?? $0.otherUsername ?? "").localizedCaseInsensitiveContains(search) } }
    var body: some View { NavigationStack {
        List {
            ForEach(filtered) { conversation in
                NavigationLink { ConversationView(conversation: conversation) } label: {
                    HStack(spacing: 12) { Circle().fill(TysonColor.accent.gradient).frame(width: 48, height: 48).overlay(Text((conversation.title ?? conversation.otherDisplayName ?? "T").prefix(1)).foregroundStyle(.white).bold()); VStack(alignment: .leading, spacing: 4) { Text(conversation.title ?? conversation.otherDisplayName ?? "Диалог").font(.headline); Text(conversation.lastMessage ?? "Начать диалог").font(.subheadline).foregroundStyle(.secondary).lineLimit(1) } }
                }
            }
        }.searchable(text: $search, prompt: "Поиск людей и сообщений")
        .overlay { if conversations.isEmpty { ContentUnavailableView("Messenger", systemImage: "message.fill", description: Text("Начните новый диалог с подписанным пользователем.")) } }
        .navigationTitle("Messenger").toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showNew = true } label: { Image(systemName: "square.and.pencil") } } }
        .task { await load() }.refreshable { await load() }.sheet(isPresented: $showNew) { NewConversationView { await load() } }
    } }
    private func load() async { conversations = (try? await TysonAPI.shared.conversations()) ?? [] }
}

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss; @State private var username = ""; @State private var title = ""; @State private var status = ""; let onCreated: () async -> Void
    var body: some View { NavigationStack { Form { Section("Новый диалог") { TextField("Имя или username", text: $username); Button("Создать") { Task { do { try await TysonAPI.shared.createConversation(username: username); await onCreated(); dismiss() } catch { status = "Не удалось создать диалог" } } } }; if !status.isEmpty { Text(status) } }.navigationTitle("Новый диалог").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } } } }
}

struct ConversationView: View {
    let conversation: TysonConversation; @State private var messages: [TysonMessage] = []; @State private var draft = ""
    var body: some View { VStack { ScrollView { LazyVStack(alignment: .leading, spacing: 8) { ForEach(messages) { message in Text(message.content ?? "").padding(12).background(.thinMaterial, in: .rect(cornerRadius: 16)).frame(maxWidth: .infinity, alignment: .leading) } }.padding() }; HStack { TextField("Сообщение", text: $draft).textFieldStyle(.roundedBorder); Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }.disabled(draft.isEmpty) }.padding() }.navigationTitle(conversation.title ?? conversation.otherDisplayName ?? "Диалог").task { messages = (try? await TysonAPI.shared.messages(conversationId: conversation.id)) ?? [] } }
    private func send() async { let value = draft; draft = ""; try? await TysonAPI.shared.sendMessage(conversationId: conversation.id, content: value); messages = (try? await TysonAPI.shared.messages(conversationId: conversation.id)) ?? messages }
}
