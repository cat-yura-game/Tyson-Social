import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct RootTabView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View {
        TabView {
            FeedView().tabItem { Label("Главная", systemImage: "house.fill") }
            MessengerHomeView().tabItem { Label("Messenger", systemImage: "message.fill") }
            CreateView().tabItem { Label("Создать", systemImage: "plus") }
            AITabView().tabItem { Label("AI", systemImage: "sparkles") }
            ProfileView().tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
        .fullScreenCover(isPresented: $session.requiresLogin) { LoginView().interactiveDismissDisabled() }
    }
}

struct CreateView: View {
    @AppStorage("tysonPostDraft") private var savedDraft = ""
    @State private var title = ""; @State private var bodyText = ""; @State private var status: String?; @State private var photo: PhotosPickerItem?; @State private var photoData: Data?
    @State private var pollEnabled = false; @State private var pollQuestion = ""; @State private var pollOptions = ["", ""]; @State private var scheduleEnabled = false; @State private var scheduledAt = Date().addingTimeInterval(3600); @State private var coauthors = ""
    var body: some View { NavigationStack { ScrollView { VStack(spacing: 15) {
        TysonGlass { VStack(alignment: .leading, spacing: 14) {
            HStack { Text("Новая публикация").font(.headline); Spacer(); Button { savedDraft = bodyText; status = "Черновик сохранён" } label: { Label("Черновик", systemImage: "square.and.arrow.down") } }
            TextField("Заголовок (необязательно)", text: $title).font(.title3.bold())
            ScrollView(.horizontal, showsIndicators: false) { HStack { format("Заголовок", "textformat.size", "## "); format("Жирный", "bold", "**текст**"); format("Курсив", "italic", "*текст*"); format("Зачеркнуть", "strikethrough", "~~текст~~"); format("Ссылка", "link", "[текст](https://)"); format("Список", "list.bullet", "\n- "); format("Цитата", "text.quote", "\n> ") } }
            TextEditor(text: $bodyText).frame(minHeight: 210).scrollContentBackground(.hidden)
            if let photoData, let image = UIImage(data: photoData) { Image(uiImage: image).resizable().scaledToFit().clipShape(.rect(cornerRadius: 16)).overlay(alignment: .topTrailing) { Button { self.photoData = nil; photo = nil } label: { Image(systemName: "xmark.circle.fill").font(.title).symbolRenderingMode(.palette).foregroundStyle(.white, .black.opacity(0.6)) }.padding(8) } }
        }.padding(18) }.padding(.horizontal)
        TysonGlass { VStack(alignment: .leading, spacing: 12) {
            PhotosPicker(selection: $photo, matching: .images) { Label("Добавить фотографию", systemImage: "photo") }
            Toggle("Добавить опрос", isOn: $pollEnabled)
            if pollEnabled { TextField("Вопрос опроса", text: $pollQuestion); ForEach(pollOptions.indices, id: \.self) { index in TextField("Вариант \(index + 1)", text: $pollOptions[index]) }; Button("Добавить вариант") { if pollOptions.count < 10 { pollOptions.append("") } } }
            TextField("Соавторы через запятую", text: $coauthors).textInputAutocapitalization(.never)
            Toggle("Отложенная публикация", isOn: $scheduleEnabled)
            if scheduleEnabled { DatePicker("Дата публикации", selection: $scheduledAt, in: Date()...) }
        }.padding(18) }.padding(.horizontal)
        Button { Task { await publish() } } label: { Label("Опубликовать", systemImage: "paperplane.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large).padding(.horizontal).disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        if let status { Text(status).foregroundStyle(.secondary) }
    }.padding(.vertical) }.navigationTitle("Создать").navigationBarTitleDisplayMode(.inline).onAppear { if bodyText.isEmpty { bodyText = savedDraft } }.onChange(of: photo) { _, item in Task { photoData = try? await item?.loadTransferable(type: Data.self) } } } }
    private func format(_ title: String, _ icon: String, _ insertion: String) -> some View { Button { bodyText += insertion } label: { Label(title, systemImage: icon) }.buttonStyle(.bordered) }
    private func publish() async {
        let poll = pollEnabled ? PollInput(question: pollQuestion.trimmingCharacters(in: .whitespacesAndNewlines), options: pollOptions.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }) : nil
        if let poll, poll.question.isEmpty || poll.options.count < 2 { status = "Для опроса нужен вопрос и минимум два варианта"; return }
        let input = CreatePostInput(title: title, body: bodyText, poll: poll, scheduledAt: scheduleEnabled ? ISO8601DateFormatter().string(from: scheduledAt) : nil, coauthorUsernames: coauthors.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "@", with: "") }.filter { !$0.isEmpty })
        do { if let photoData { try await TysonAPI.shared.createPostWithImage(input, imageData: photoData) } else { try await TysonAPI.shared.createPost(input) }; title = ""; bodyText = ""; self.photoData = nil; savedDraft = ""; status = scheduleEnabled ? "Публикация запланирована" : "Пост опубликован" } catch { status = "Не удалось опубликовать пост" }
    }
}

struct AITabView: View {
    @State private var input = ""; @State private var busy = false; @State private var model = "lite"; @State private var conversations: [AIConversation] = []; @State private var active: AIConversation?; @State private var messages: [AIMessage] = []; @State private var photo: PhotosPickerItem?; @State private var attachmentData: Data?; @State private var attachmentName = ""; @State private var attachmentMime = "application/octet-stream"; @State private var attachmentIsImage = false; @State private var showFiles = false; @State private var showChats = false
    var body: some View { NavigationStack { VStack(spacing: 0) {
            Picker("Модель", selection: $model) { Text("Flash Lite").tag("lite"); Text("Flash").tag("flash"); Text("Smart").tag("smart") }
                .pickerStyle(.segmented).padding(6).tysonSystemMaterial(Capsule()).padding(.horizontal, 12).padding(.vertical, 8)
            ScrollView { LazyVStack(spacing: 12) { if messages.isEmpty { ContentUnavailableView("Tyson AI", systemImage: "sparkles", description: Text("Задайте вопрос или прикрепите изображение либо документ.")) }; ForEach(messages) { AIMessageBubble(message: $0) } }.padding(.horizontal, 12).padding(.vertical, 8) }
                .scrollContentBackground(.hidden)
            if !attachmentName.isEmpty { HStack { Label(attachmentName, systemImage: attachmentIsImage ? "photo" : "doc"); Spacer(); Button { clearAttachment() } label: { Image(systemName: "xmark.circle.fill") } }.padding(10).tysonSystemMaterial(Capsule()).padding(.horizontal, 8) }
            HStack { Menu { PhotosPicker(selection: $photo, matching: .images) { Label("Изображение", systemImage: "photo") }; Button { showFiles = true } label: { Label("Документ", systemImage: "doc") } } label: { Image(systemName: "paperclip") }; TextField("Сообщение", text: $input, axis: .vertical).lineLimit(1...4); Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }.disabled((input.isEmpty && attachmentData == nil) || busy) }.padding(10).tysonSystemMaterial(Capsule()).padding(8)
        }
    }.navigationTitle(active?.title ?? "Tyson AI").navigationBarTitleDisplayMode(.inline).toolbar {
        ToolbarItem(placement: .topBarLeading) { Button { showChats = true } label: { Image(systemName: "bubble.left.and.bubble.right") }.accessibilityLabel("Чаты Tyson AI") }
        ToolbarItem(placement: .topBarTrailing) { Button { Task { await newChat() } } label: { Image(systemName: "square.and.pencil") } }
    }.sheet(isPresented: $showChats) { AIChatsSheet(conversations: conversations, activeID: active?.id, create: { Task { await newChat(); showChats = false } }) { conversation in Task { await open(conversation) }; showChats = false } }.task { await load() }.onChange(of: photo) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { attachmentData = data; attachmentName = "Изображение"; attachmentMime = "image/jpeg"; attachmentIsImage = true } } }.fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .plainText, .json, .commaSeparatedText, .data]) { result in if let url = try? result.get() { let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; attachmentData = try? Data(contentsOf: url); attachmentName = url.lastPathComponent; attachmentMime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"; attachmentIsImage = false } } }
    private func load() async { conversations = (try? await TysonAPI.shared.aiConversations()) ?? []; if let first = conversations.first { await open(first) } }
    private func open(_ conversation: AIConversation) async { active = conversation; messages = (try? await TysonAPI.shared.aiMessages(conversationId: conversation.id)) ?? [] }
    private func newChat() async { if let value = try? await TysonAPI.shared.createAIConversation() { active = value; messages = []; conversations.insert(value, at: 0) } }
    private func send() async { busy = true; defer { busy = false }; if active == nil { await newChat() }; guard let active else { return }; let text = input; input = ""; do { _ = try await TysonAPI.shared.sendAIMessage(conversationId: active.id, content: text, modelTier: model, attachment: attachmentData, filename: attachmentName, mimeType: attachmentMime, image: attachmentIsImage); clearAttachment(); messages = (try? await TysonAPI.shared.aiMessages(conversationId: active.id)) ?? messages; conversations = (try? await TysonAPI.shared.aiConversations()) ?? conversations } catch { input = text } }
    private func clearAttachment() { attachmentData = nil; attachmentName = ""; attachmentIsImage = false; photo = nil }
}

private struct AIChatsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let conversations: [AIConversation]; let activeID: String?; let create: () -> Void; let open: (AIConversation) -> Void
    var body: some View { NavigationStack { ScrollView { LazyVStack(spacing: 12) { Button(action: create) { Label("Новый чат", systemImage: "square.and.pencil").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 13) }.buttonStyle(.borderedProminent); if conversations.isEmpty { ContentUnavailableView("Чатов пока нет", systemImage: "bubble.left.and.bubble.right", description: Text("Начните новый разговор с Tyson AI.")) } else { ForEach(conversations) { chat in Button { open(chat); dismiss() } label: { HStack(spacing: 12) { Image(systemName: "sparkles").foregroundStyle(TysonColor.accent); VStack(alignment: .leading, spacing: 3) { Text(chat.title).foregroundStyle(.primary).lineLimit(1); Text(date(chat.updatedAt)).font(.caption).foregroundStyle(.secondary) }; Spacer(); if chat.id == activeID { Image(systemName: "checkmark.circle.fill").foregroundStyle(TysonColor.accent) } }.padding(15).tysonSystemMaterial(RoundedRectangle(cornerRadius: 22)) }.buttonStyle(.plain) } } }.padding() }.navigationTitle("Чаты Tyson AI").toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Готово") { dismiss() } } } } }
    private func date(_ value: String) -> String { guard let date = ISO8601DateFormatter().date(from: value) else { return "" }; return date.formatted(date: .abbreviated, time: .shortened) }
}

private struct AIMessageBubble: View {
    let message: AIMessage
    var body: some View { HStack { if message.role == "user" { Spacer(minLength: 46) }; VStack(alignment: .leading, spacing: 6) { Text(message.role == "assistant" ? "Tyson AI" : "Вы").font(.caption.bold()).foregroundStyle(.secondary); AIFormattedText(content: message.content); if let name = message.attachmentName { Label(name, systemImage: "doc.fill").font(.caption) } }.padding(13).modifier(AIMessageSurface(own: message.role == "user")); if message.role != "user" { Spacer(minLength: 28) } } }
}

private struct AIMessageSurface: ViewModifier { let own: Bool; @ViewBuilder func body(content: Content) -> some View { if own { content.tysonGlassSurface(RoundedRectangle(cornerRadius: 20)) } else { content } } }

private struct AIFormattedText: View {
    let content: String
    var body: some View { VStack(alignment: .leading, spacing: 10) { ForEach(blocks) { block in switch block.kind { case .text: Text((try? AttributedString(markdown: block.value, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(block.value)).fixedSize(horizontal: false, vertical: true); case .table(let rows): AITable(rows: rows) } } } }
    private var blocks: [AIContentBlock] { AIContentBlock.parse(content) }
}

private struct AIContentBlock: Identifiable { enum Kind { case text; case table([[String]]) }; let id = UUID(); let kind: Kind; let value: String
    static func parse(_ content: String) -> [AIContentBlock] { let lines = content.components(separatedBy: .newlines); var result: [AIContentBlock] = []; var index = 0; var text: [String] = []; func flush() { if !text.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result.append(.init(kind: .text, value: text.joined(separator: "\n"))) }; text = [] }; while index < lines.count { if index + 1 < lines.count, lines[index].contains("|"), isTableDivider(lines[index + 1]) { flush(); var rows = [cells(lines[index])]; index += 2; while index < lines.count, lines[index].contains("|") { rows.append(cells(lines[index])); index += 1 }; result.append(.init(kind: .table(rows), value: "")); continue }; text.append(lines[index]); index += 1 }; flush(); return result }
    private static func isTableDivider(_ line: String) -> Bool { let trimmed = line.trimmingCharacters(in: .whitespaces); return trimmed.contains("-") && trimmed.allSatisfy { "|-: \t".contains($0) } }
    private static func cells(_ line: String) -> [String] { line.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "|")).split(separator: "|", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) } }
}

private struct AITable: View { let rows: [[String]]; var body: some View { ScrollView(.horizontal, showsIndicators: false) { Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) { ForEach(Array(rows.enumerated()), id: \.offset) { rowIndex, row in GridRow { ForEach(Array(row.enumerated()), id: \.offset) { column, cell in Text((try? AttributedString(markdown: cell, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(cell)).font(.caption).fontWeight(rowIndex == 0 ? .bold : .regular).padding(8).frame(minWidth: 86, alignment: .leading).background(rowIndex == 0 ? TysonColor.accent.opacity(0.16) : .clear).overlay { Rectangle().stroke(.secondary.opacity(0.22), lineWidth: 0.5) } } } } } }.clipShape(RoundedRectangle(cornerRadius: 10)) } }
