import SwiftUI
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

struct MessengerHomeView: View {
    @State private var conversations: [TysonConversation] = []; @State private var search = ""; @State private var showNew = false
    var filtered: [TysonConversation] { search.isEmpty ? conversations : conversations.filter { ($0.title ?? $0.otherDisplayName ?? $0.otherUsername ?? "").localizedCaseInsensitiveContains(search) } }
    var body: some View { NavigationStack { List { ForEach(filtered) { conversation in NavigationLink { ConversationView(conversation: conversation) } label: { HStack(spacing: 12) { MessengerAvatar(key: conversation.otherAvatarKey, name: conversation.title ?? conversation.otherDisplayName ?? "T"); VStack(alignment: .leading, spacing: 4) { Text(conversation.title ?? conversation.otherDisplayName ?? "Диалог").font(.headline); Text(conversation.kind == "group" ? "\(conversation.memberCount ?? 0) участников" : "@\(conversation.otherUsername ?? "user")").font(.subheadline).foregroundStyle(.secondary) }; Spacer() } } } }.listStyle(.plain).searchable(text: $search, prompt: "Поиск людей и сообщений").overlay { if conversations.isEmpty { ContentUnavailableView("Messenger", systemImage: "message.fill", description: Text("Начните новый диалог или создайте группу.")) } }.navigationTitle("Messenger").toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showNew = true } label: { Image(systemName: "square.and.pencil") } } }.task { await load() }.refreshable { await load() }.sheet(isPresented: $showNew) { NewConversationView { await load() } } } }
    private func load() async { conversations = (try? await TysonAPI.shared.conversations()) ?? [] }
}

private struct MessengerAvatar: View { let key: String?; let name: String; var body: some View { AsyncImage(url: TysonAPI.mediaURL(key)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.accent.gradient).overlay(Text(name.prefix(1)).foregroundStyle(.white).bold()) } }.frame(width: 50, height: 50).clipShape(Circle()) } }

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss; @State private var username = ""; @State private var status = ""; let onCreated: () async -> Void
    var body: some View { NavigationStack { Form { Section("Новый диалог") { TextField("Имя или username", text: $username).textInputAutocapitalization(.never); Button("Создать") { Task { do { try await TysonAPI.shared.createConversation(username: username.replacingOccurrences(of: "@", with: "")); await onCreated(); dismiss() } catch { status = "Не удалось создать диалог" } } } }; if !status.isEmpty { Text(status) } }.navigationTitle("Новый диалог").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } } } }
}

struct ConversationView: View {
    @EnvironmentObject private var session: AppSession
    let conversation: TysonConversation
    @State private var messages: [TysonMessage] = []; @State private var draft = ""; @State private var photo: PhotosPickerItem?; @State private var video: PhotosPickerItem?; @State private var showFiles = false; @StateObject private var recorder = TysonVoiceRecorder(); @State private var error = ""
    var body: some View { ZStack { TysonColor.background.ignoresSafeArea(); VStack(spacing: 0) {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(messages) { message in
                    MessageBubble(message: message, currentUserId: session.currentUser?.id)
                }
            }.padding()
        }.refreshable { await load() }
        if recorder.recording { HStack { Circle().fill(.red).frame(width: 9, height: 9); Text("Запись голосового…"); Spacer(); Button("Отправить") { Task { await finishVoice() } }; Button("Отмена") { recorder.cancel() } }.padding(10).background(.ultraThinMaterial) }
        if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
        composer
    } }.navigationTitle(conversation.title ?? conversation.otherDisplayName ?? "Диалог").navigationBarTitleDisplayMode(.inline).task { await load() }.onChange(of: photo) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { await sendAttachment(data, type: "image", mime: "image/jpeg") } } }.onChange(of: video) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { await sendAttachment(data, type: "video", mime: "video/mp4") } } }.fileImporter(isPresented: $showFiles, allowedContentTypes: [.data, .pdf, .text]) { result in Task { do { let url = try result.get(); let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; let data = try Data(contentsOf: url); await sendAttachment(data, type: "file", mime: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream") } catch { self.error = "Не удалось отправить файл" } } } }
    private func load() async { messages = (try? await TysonAPI.shared.messages(conversationId: conversation.id)) ?? [] }
    private func send() async { let value = draft.trimmingCharacters(in: .whitespacesAndNewlines); draft = ""; do { try await TysonAPI.shared.sendMessage(conversationId: conversation.id, content: value); await load() } catch { self.error = "Не удалось отправить сообщение" } }
    private func sendAttachment(_ data: Data, type: String, mime: String) async { do { try await TysonAPI.shared.sendAttachment(conversationId: conversation.id, data: data, type: type, mimeType: mime); await load() } catch { self.error = "Не удалось отправить вложение" } }
    private func finishVoice() async { guard let result = recorder.stop() else { return }; await sendAttachment(result.data, type: "audio", mime: "audio/mp4") }
    private var composer: some View {
        TysonGlass {
            HStack(spacing: 10) {
                attachmentMenu
                TextField("Сообщение", text: $draft)
                primaryAction
            }.padding(10)
        }.padding(.horizontal, 8).padding(.bottom, 4)
    }
    private var attachmentMenu: some View {
        Menu {
            PhotosPicker(selection: $photo, matching: .images) { Label("Фотография", systemImage: "photo") }
            PhotosPicker(selection: $video, matching: .videos) { Label("Видео", systemImage: "video") }
            Button { showFiles = true } label: { Label("Файл", systemImage: "doc") }
        } label: { Image(systemName: "paperclip").font(.title3) }
    }
    @ViewBuilder private var primaryAction: some View {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Button { Task { await recorder.start() } } label: { Image(systemName: "mic.fill") }
        } else {
            Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }
        }
    }
}

private struct MessageBubble: View {
    let message: TysonMessage
    let currentUserId: String?
    private var own: Bool { message.senderUserId == currentUserId }
    var body: some View {
        HStack {
            if own { Spacer(minLength: 50) }
            Group {
                if let type = message.content?.objectValue?["type"]?.stringValue, type != "text" {
                    Label(label(for: type), systemImage: icon(for: type))
                } else { Text(message.text) }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(own ? TysonColor.accent : Color(uiColor: .secondarySystemBackground), in: .rect(cornerRadius: 18))
            .foregroundStyle(own ? .white : .primary)
            if !own { Spacer(minLength: 50) }
        }
    }
    private func label(for type: String) -> String { type == "audio" ? "Голосовое сообщение" : type == "video" ? "Видеосообщение" : type == "image" ? "Фотография" : "Файл" }
    private func icon(for type: String) -> String { type == "audio" ? "waveform" : type == "video" ? "video.fill" : type == "image" ? "photo.fill" : "doc.fill" }
}

@MainActor final class TysonVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published var recording = false; private var recorder: AVAudioRecorder?; private var url: URL?
    func start() async { let allowed = await AVAudioApplication.requestRecordPermission(); guard allowed else { return }; let url = FileManager.default.temporaryDirectory.appendingPathComponent("tyson-\(UUID().uuidString).m4a"); let settings: [String: Any] = [AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]; try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .spokenAudio); try? AVAudioSession.sharedInstance().setActive(true); recorder = try? AVAudioRecorder(url: url, settings: settings); recorder?.record(); self.url = url; recording = recorder?.isRecording == true }
    func stop() -> (data: Data, duration: Int)? { recorder?.stop(); recording = false; guard let url, let data = try? Data(contentsOf: url) else { return nil }; return (data, 0) }
    func cancel() { recorder?.stop(); recording = false; if let url { try? FileManager.default.removeItem(at: url) } }
}
