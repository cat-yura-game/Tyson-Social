import SwiftUI
import PhotosUI
import AVFoundation
import AVKit
import UniformTypeIdentifiers
import UIKit

struct MessengerHomeView: View {
    @State private var conversations: [TysonConversation] = []
    @State private var search = ""
    @State private var showNew = false
    @State private var loading = true
    @State private var openedConversation: TysonConversation?
    private var filtered: [TysonConversation] { search.isEmpty ? conversations : conversations.filter { ($0.title ?? $0.otherDisplayName ?? $0.otherUsername ?? "").localizedCaseInsensitiveContains(search) } }
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(filtered.enumerated()), id: \.element.id) { index, conversation in
                        NavigationLink { ConversationView(conversation: conversation) } label: {
                            HStack(spacing: 12) {
                                MessengerAvatar(key: conversation.otherAvatarKey, name: conversation.title ?? conversation.otherDisplayName ?? "T", size: 48)
                                VStack(alignment: .leading, spacing: 4) { Text(conversation.title ?? conversation.otherDisplayName ?? "Диалог").font(.headline).foregroundStyle(.primary).lineLimit(1); Text(conversation.lastMessage?.isEmpty == false ? conversation.lastMessage! : conversation.kind == "group" ? "\(conversation.memberCount ?? 0) участников" : "@\(conversation.otherUsername ?? "user")").font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 8) { if let value = conversation.updatedAt { Text(shortTime(value)).font(.caption2).foregroundStyle(.tertiary) }; Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary) }
                            }.padding(.horizontal, 16).padding(.vertical, 11)
                        }
                        .buttonStyle(.plain)
                        if index < filtered.count - 1 { Divider().padding(.leading, 76) }
                    }
                }.padding(.vertical, 8)
            }
            .scrollContentBackground(.hidden)
            .overlay { if loading { ProgressView() } else if conversations.isEmpty { ContentUnavailableView("Messenger", systemImage: "message.fill", description: Text("Начните новый диалог или создайте группу.")) } }
            .searchable(text: $search, prompt: "Поиск людей и сообщений")
            .navigationTitle("Сообщения")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showNew = true } label: { Image(systemName: "square.and.pencil").font(.headline) } } }
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $showNew) { NewConversationView { conversation in openedConversation = conversation; await load() } }
            .navigationDestination(item: $openedConversation) { ConversationView(conversation: $0) }
        }
    }
    private func load() async { loading = true; conversations = (try? await TysonAPI.shared.conversations()) ?? []; loading = false }
    private func shortTime(_ value: String) -> String { guard let date = ISO8601DateFormatter().date(from: value) else { return "" }; return date.formatted(date: .omitted, time: .shortened) }
}

private struct MessengerAvatar: View {
    let key: String?; let name: String; var size: CGFloat = 50
    var body: some View { AsyncImage(url: TysonAPI.mediaURL(key)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.accent.gradient).overlay(Text(name.prefix(1)).foregroundStyle(.white).font(.headline).bold()) } }.frame(width: size, height: size).clipShape(Circle()).overlay(Circle().stroke(.white.opacity(0.7), lineWidth: 2)).shadow(color: TysonColor.accent.opacity(0.16), radius: 8, y: 4) }
}

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var kind = 0; @State private var username = ""; @State private var title = ""; @State private var status = ""; @State private var busy = false
    let onCreated: (TysonConversation) async -> Void
    var body: some View { NavigationStack { Form {
        Picker("Тип", selection: $kind) { Text("Диалог").tag(0); Text("Группа").tag(1) }.pickerStyle(.segmented)
        if kind == 0 { Section("Новый диалог") { TextField("Username", text: $username).textInputAutocapitalization(.never) } }
        else { Section("Новая группа") { TextField("Название", text: $title); TextField("Username группы", text: $username).textInputAutocapitalization(.never); Text("Участников можно добавить позже — сразу после создания.").font(.caption).foregroundStyle(.secondary) } }
        Button { Task { await create() } } label: { HStack { Text(kind == 0 ? "Создать диалог" : "Создать группу"); Spacer(); if busy { ProgressView() } } }
            .disabled(username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (kind == 1 && title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || busy)
        if !status.isEmpty { Text(status).foregroundStyle(.red) }
    }.navigationTitle(kind == 0 ? "Новый диалог" : "Новая группа").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } } } }
    private func create() async { busy = true; defer { busy = false }; do { let normalized = username.replacingOccurrences(of: "@", with: "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased(); let conversation = kind == 0 ? try await TysonAPI.shared.createConversation(username: normalized) : try await TysonAPI.shared.createGroup(title: title.trimmingCharacters(in: .whitespacesAndNewlines), username: normalized); await onCreated(conversation); dismiss() } catch { status = kind == 0 ? "Не удалось создать диалог" : "Не удалось создать группу: этот username может быть занят." } }
}

struct ConversationView: View {
    @EnvironmentObject private var session: AppSession
    let conversation: TysonConversation
    @State private var messages: [TysonMessage] = []; @State private var draft = ""; @State private var photo: PhotosPickerItem?; @State private var video: PhotosPickerItem?; @State private var showFiles = false; @StateObject private var recorder = TysonVoiceRecorder(); @State private var error = ""; @State private var editingMessage: TysonMessage?; @State private var replyingTo: TysonMessage?; @State private var showStickers = false; @State private var sendingSticker = false
    private var title: String { conversation.title ?? conversation.otherDisplayName ?? "Диалог" }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                        if index == 0 || dayKey(messages[index - 1].sentAt) != dayKey(message.sentAt) { DaySeparator(value: message.sentAt) }
                        MessageBubble(message: message, currentUserId: session.currentUser?.id)
                            .id(message.id)
                            .contextMenu { messageMenu(message) }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)
                .padding(.bottom, 98)
            }
            .scrollIndicators(.hidden)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onChange(of: messages.count) { _, _ in if let id = messages.last?.id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } } }
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: 6) {
                if recorder.recording { recordingBar }
                if editingMessage != nil || replyingTo != nil { actionBar }
                if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
                if showStickers { StickerPicker(disabled: sendingSticker) { id in Task { await sendSticker(id) } } }
                composer
            }
            .padding(.bottom, 4)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let username = conversation.otherUsername, conversation.kind != "group" {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { PublicProfileView(username: username) } label: {
                        MessengerAvatar(key: conversation.otherAvatarKey, name: title, size: 30)
                    }
                }
            }
        }
        .task { await load() }
        .onChange(of: photo) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { await sendAttachment(data, type: "image", mime: "image/jpeg") } } }
        .onChange(of: video) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { await sendAttachment(data, type: "video", mime: "video/mp4", duration: 1) } } }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.data, .pdf, .text]) { result in Task { do { let url = try result.get(); let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; let data = try Data(contentsOf: url); await sendAttachment(data, type: "file", mime: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", name: url.lastPathComponent) } catch { self.error = "Не удалось отправить файл" } } }
    }
    private var recordingBar: some View { HStack { Circle().fill(.red).frame(width: 9, height: 9); Text("Запись голосового…"); Spacer(); Button("Отправить") { Task { await finishVoice() } }; Button("Отмена") { recorder.cancel() } }.font(.subheadline).padding(10).tysonGlassSurface(Capsule()) }
    private var actionBar: some View { HStack { Image(systemName: editingMessage != nil ? "pencil" : "arrowshape.turn.up.left"); VStack(alignment: .leading) { Text(editingMessage != nil ? "Редактирование" : "Ответ").font(.caption.bold()); Text((editingMessage ?? replyingTo)?.text ?? "").font(.caption).lineLimit(1) }; Spacer(); Button { editingMessage = nil; replyingTo = nil } label: { Image(systemName: "xmark.circle.fill") } }.padding(.horizontal, 14).padding(.vertical, 7).tysonGlassSurface(Capsule()) }
    private var composer: some View { HStack(alignment: .bottom, spacing: 6) {
        PhotosPicker(selection: $photo, matching: .images) { Image(systemName: "photo").frame(width: 42, height: 42) }.glassCircle()
        HStack(alignment: .bottom, spacing: 4) { Menu { PhotosPicker(selection: $video, matching: .videos) { Label("Видео", systemImage: "video") }; Button { showFiles = true } label: { Label("Файл", systemImage: "doc") } } label: { Image(systemName: "plus.circle").frame(width: 34, height: 40) }; TextField("Сообщение", text: $draft, axis: .vertical).lineLimit(1...4).padding(.vertical, 9); Button { showStickers.toggle() } label: { Image(systemName: showStickers ? "face.smiling.inverse" : "face.smiling").foregroundStyle(.secondary).frame(width: 32, height: 40) }.buttonStyle(.plain).accessibilityLabel("Открыть стикеры") }.padding(.horizontal, 6).tysonGlassSurface(Capsule())
        primaryAction
    }.padding(.horizontal, 8).padding(.top, 4).padding(.bottom, 5) }
    @ViewBuilder private var primaryAction: some View { if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Button { Task { await recorder.start() } } label: { Image(systemName: "mic.fill").frame(width: 42, height: 42) }.glassCircle() } else { Button { Task { await send() } } label: { Image(systemName: "arrow.up").font(.headline.bold()).foregroundStyle(.white).frame(width: 42, height: 42).background(TysonColor.accent, in: Circle()) } } }
    @ViewBuilder private func messageMenu(_ message: TysonMessage) -> some View { Button { replyingTo = message; editingMessage = nil } label: { Label("Ответить", systemImage: "arrowshape.turn.up.left") }; if message.senderUserId == session.currentUser?.id { if message.content?.objectValue?["type"]?.stringValue == "text" { Button { editingMessage = message; replyingTo = nil; draft = message.text } label: { Label("Редактировать", systemImage: "pencil") } }; Button(role: .destructive) { Task { try? await TysonAPI.shared.deleteMessage(conversationId: conversation.id, messageId: message.id); await load() } } label: { Label("Удалить", systemImage: "trash") } } }
    private func load() async { messages = (try? await TysonAPI.shared.messages(conversationId: conversation.id)) ?? [] }
    private func send() async { let clean = draft.trimmingCharacters(in: .whitespacesAndNewlines); guard !clean.isEmpty else { return }; let value = replyingTo.map { "↪ \($0.text.prefix(80))\n\(clean)" } ?? clean; draft = ""; do { if let editing = editingMessage { try await TysonAPI.shared.editMessage(conversationId: conversation.id, messageId: editing.id, text: clean) } else { try await TysonAPI.shared.sendMessage(conversationId: conversation.id, content: value) }; editingMessage = nil; replyingTo = nil; await load() } catch { draft = clean; self.error = "Не удалось отправить сообщение" } }
    private func sendSticker(_ id: String) async { sendingSticker = true; defer { sendingSticker = false }; do { try await TysonAPI.shared.sendSticker(conversationId: conversation.id, stickerId: id); showStickers = false; await load() } catch { self.error = "Не удалось отправить стикер" } }
    private func sendAttachment(_ data: Data, type: String, mime: String, duration: Int? = nil, name: String? = nil) async { do { try await TysonAPI.shared.sendAttachment(conversationId: conversation.id, data: data, type: type, mimeType: mime, durationMs: duration, name: name); await load() } catch { self.error = "Не удалось отправить вложение" } }
    private func finishVoice() async { guard let result = recorder.stop() else { return }; await sendAttachment(result.data, type: "audio", mime: "audio/mp4", duration: result.duration) }
    private func dayKey(_ value: String?) -> String { guard let value, let date = ISO8601DateFormatter().date(from: value) else { return "" }; return Calendar.current.startOfDay(for: date).description }
}

private extension View { func glassCircle() -> some View { self.buttonStyle(.plain).tysonGlassSurface(Circle()) } }
private struct TysonSticker: Identifiable { let id: String; let title: String }
private enum TysonStickerCatalog {
    static let stickers: [TysonSticker] = [
        .init(id: "love", title: "Любовь"), .init(id: "looking", title: "Смотрит"), .init(id: "like", title: "Нравится"), .init(id: "dislike", title: "Не нравится"), .init(id: "dead-laugh", title: "Умер со смеху"), .init(id: "fire", title: "Огонь"), .init(id: "laugh", title: "Смешно"), .init(id: "angry", title: "Злой"), .init(id: "crying", title: "Плачет"), .init(id: "shock", title: "Шок"), .init(id: "rocket", title: "Мощно"), .init(id: "thinking", title: "Думает"), .init(id: "confirm", title: "Да"), .init(id: "no", title: "Нет"), .init(id: "awkward", title: "Неловко"), .init(id: "cool", title: "Круто"), .init(id: "got-it", title: "Ну ты понял"), .init(id: "sleep", title: "Сплю"), .init(id: "eye-roll", title: "Закатывает глаза"), .init(id: "suspicious", title: "Подозревает"), .init(id: "quiet", title: "Тихо"), .init(id: "please", title: "Пожалуйста"), .init(id: "salute", title: "Есть")
    ]
    static func sticker(id: String) -> TysonSticker? { stickers.first { $0.id == id } }
    static func url(_ id: String) -> URL? { URL(string: "https://tysonsocial.eu.cc/stickers/\(id).webp") }
}
private struct StickerPicker: View {
    let disabled: Bool; let onSelect: (String) -> Void
    var body: some View { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { ForEach(TysonStickerCatalog.stickers) { sticker in Button { onSelect(sticker.id) } label: { StickerArtwork(sticker: sticker).frame(width: 64, height: 64) }.buttonStyle(.plain).disabled(disabled).accessibilityLabel(sticker.title) } }.padding(8) }.tysonGlassSurface(RoundedRectangle(cornerRadius: 22)).padding(.horizontal, 8) }
}
private struct StickerArtwork: View {
    let sticker: TysonSticker
    var body: some View { AsyncImage(url: TysonStickerCatalog.url(sticker.id)) { phase in if let image = phase.image { image.resizable().scaledToFit() } else if phase.error != nil { Image(systemName: "face.smiling").font(.title2).foregroundStyle(TysonColor.accent) } else { ProgressView() } }.accessibilityLabel(sticker.title) }
}
private struct DaySeparator: View {
    let value: String?

    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundStyle(.secondary)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .tysonGlassSurface(Capsule())
            .padding(.vertical, 4)
    }

    private var label: String {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else { return "Сегодня" }
        if Calendar.current.isDateInToday(date) { return "Сегодня" }
        if Calendar.current.isDateInYesterday(date) { return "Вчера" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct MessageBubble: View {
    let message: TysonMessage; let currentUserId: String?
    private var own: Bool { message.senderUserId == currentUserId }; private var type: String { message.content?.objectValue?["type"]?.stringValue ?? "text" }
    private var sticker: TysonSticker? { guard type == "sticker", let id = message.content?.objectValue?["stickerId"]?.stringValue else { return nil }; return TysonStickerCatalog.sticker(id: id) }
    var body: some View { HStack(alignment: .bottom) { if own { Spacer(minLength: 52) }; if let sticker { VStack(alignment: .trailing, spacing: 2) { StickerArtwork(sticker: sticker).frame(width: 146, height: 146); if let sent = message.sentAt { Text(time(sent)).font(.system(size: 9)).foregroundStyle(.secondary) } } } else { bubble }; if !own { Spacer(minLength: 52) } }.frame(maxWidth: .infinity) }
    private var bubble: some View {
        VStack(alignment: .trailing, spacing: 3) {
            bubbleContent.padding(.horizontal, 13).padding(.vertical, 9)
            if let sent = message.sentAt { Text(time(sent)).font(.system(size: 9)).foregroundStyle(.secondary).padding(.trailing, 5).padding(.bottom, 4) }
        }
        .tysonGlassSurface(bubbleShape)
    }
    private var bubbleShape: UnevenRoundedRectangle { UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: own ? 20 : 6, bottomTrailingRadius: own ? 6 : 20, topTrailingRadius: 20) }
    @ViewBuilder private var bubbleContent: some View {
        if let attachment = message.attachment {
            MessageAttachmentView(attachment: attachment)
        } else {
            switch type {
            case "gift": VStack(spacing: 6) { Image(systemName: "gift.fill").font(.largeTitle); Text(message.content?.objectValue?["title"]?.stringValue ?? "Подарок Tyson").bold() }
            case "sticker": EmptyView()
            case "post": Label("Публикация Tyson", systemImage: "doc.text.image")
            default: Text(verbatim: message.text).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
    private func time(_ value: String) -> String { guard let date = ISO8601DateFormatter().date(from: value) else { return "" }; return date.formatted(date: .omitted, time: .shortened) }
}

private struct MessageAttachmentView: View {
    let attachment: TysonMessageAttachment
    @State private var data: Data?
    @State private var videoURL: URL?
    @State private var player: AVAudioPlayer?
    @State private var failed = false

    var body: some View {
        Group {
            if attachment.type == "image", let data, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: 250, maxHeight: 280).clipShape(RoundedRectangle(cornerRadius: 13))
            } else if attachment.type == "video", let videoURL {
                VideoPlayer(player: AVPlayer(url: videoURL)).frame(width: 250, height: 170).clipShape(RoundedRectangle(cornerRadius: 13))
            } else if attachment.type == "audio", data != nil {
                Button { toggleAudio() } label: { Label(player?.isPlaying == true ? "Пауза" : "Голосовое сообщение", systemImage: player?.isPlaying == true ? "pause.circle.fill" : "play.circle.fill") }.buttonStyle(.plain)
            } else if attachment.type == "file", let data {
                ShareLink(item: data, preview: SharePreview(attachment.name ?? "Файл Tyson")) { Label(attachment.name ?? "Файл", systemImage: "doc.fill") }
            } else if failed {
                Label("Не удалось загрузить вложение", systemImage: "exclamationmark.triangle")
            } else {
                HStack(spacing: 8) { ProgressView(); Text(loadingLabel) }
            }
        }
        .task(id: attachment.id) { await load() }
    }

    private var loadingLabel: String { ["image": "Загружаем фотографию", "audio": "Загружаем голосовое", "video": "Загружаем видео", "file": "Загружаем файл"][attachment.type] ?? "Загружаем вложение" }
    private func load() async {
        do {
            let loaded = try await TysonAPI.shared.downloadAttachment(attachment)
            data = loaded
            if attachment.type == "video" {
                let ext = attachment.mimeType == "video/webm" ? "webm" : "mp4"
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("tyson-video-\(attachment.id).\(ext)")
                try loaded.write(to: url, options: .atomic)
                videoURL = url
            }
        } catch { failed = true }
    }
    private func toggleAudio() {
        if let player {
            if player.isPlaying { player.pause() } else { player.play() }
            return
        }
        guard let data, let created = try? AVAudioPlayer(data: data) else { failed = true; return }
        created.prepareToPlay(); created.play(); player = created
    }
}

@MainActor final class TysonVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published var recording = false; private var recorder: AVAudioRecorder?; private var url: URL?
    func start() async { let allowed = await AVAudioApplication.requestRecordPermission(); guard allowed else { return }; let url = FileManager.default.temporaryDirectory.appendingPathComponent("tyson-\(UUID().uuidString).m4a"); let settings: [String: Any] = [AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]; try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .spokenAudio); try? AVAudioSession.sharedInstance().setActive(true); recorder = try? AVAudioRecorder(url: url, settings: settings); recorder?.record(); self.url = url; recording = recorder?.isRecording == true }
    func stop() -> (data: Data, duration: Int)? { let duration = max(1, Int((recorder?.currentTime ?? 0) * 1000)); recorder?.stop(); recording = false; guard let url, let data = try? Data(contentsOf: url) else { return nil }; return (data, duration) }
    func cancel() { recorder?.stop(); recording = false; if let url { try? FileManager.default.removeItem(at: url) } }
}
