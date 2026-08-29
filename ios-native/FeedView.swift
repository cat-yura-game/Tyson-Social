import SwiftUI
import AVKit
import PhotosUI
import UIKit

struct FeedView: View {
    @State private var posts: [TysonPost] = []
    @State private var stories: [TysonStory] = []
    @State private var mode: FeedViewMode = .forYou
    @State private var openedStory: TysonStory?
    @State private var pickedStory: PhotosPickerItem?
    @State private var storyUploadError = ""
    @State private var uploadingStory = false
    @State private var loading = true
    @State private var loadError: String?
    @State private var diamondBalance = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    StoryRail(stories: stories, openedStory: $openedStory, pickedStory: $pickedStory, uploading: uploadingStory)
                    Picker("Лента", selection: $mode) {
                        ForEach(FeedViewMode.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    if let message = loadError { Text(message).foregroundStyle(.secondary).padding() }
                    if !storyUploadError.isEmpty { Text(storyUploadError).font(.caption).foregroundStyle(.red).padding(.horizontal) }
                    if loading { ProgressView().padding(40) }
                    ForEach(posts) { post in PostCard(post: post) }
                }.padding(.vertical)
            }
            .refreshable { await load(); await loadStories(); await loadBalance() }
            .task { await load(); await loadStories(); await loadBalance() }
            .onChange(of: pickedStory) { _, item in
                Task { await uploadStory(item) }
            }
            .onChange(of: mode) { _, _ in Task { await load() } }
            .fullScreenCover(item: $openedStory) { story in StoryViewer(story: story) }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { NavigationLink { DiamondsHubView() } label: { HStack(spacing: 4) { Image(systemName: "diamond.fill").foregroundStyle(.cyan); Text("\(diamondBalance)").font(.caption.bold()) }.padding(.horizontal, 9).padding(.vertical, 6).background(.thinMaterial, in: Capsule()) } }
                ToolbarItem(placement: .principal) { HStack(spacing: 8) { Image("TysonLogo").resizable().scaledToFit().frame(width: 34, height: 34).clipShape(Circle()); Text("Tyson").font(.title2.bold()) } }
                ToolbarItem(placement: .topBarTrailing) { NavigationLink { NotificationsView() } label: { Image(systemName: "bell") } }
            }
        }
    }

    private func load() async {
        loading = true; loadError = nil
        do { posts = try await TysonAPI.shared.feed(view: mode) }
        catch { loadError = "Не удалось загрузить ленту Tyson." }
        loading = false
    }
    private func loadStories() async { stories = (try? await TysonAPI.shared.stories()) ?? [] }
    private func loadBalance() async { diamondBalance = (try? await TysonAPI.shared.diamondBalance()) ?? diamondBalance }
    private func uploadStory(_ item: PhotosPickerItem?) async {
        guard let item, !uploadingStory else { return }
        uploadingStory = true
        defer { uploadingStory = false; pickedStory = nil }
        guard let rawData = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: rawData),
              let data = image.jpegData(compressionQuality: 0.9) else {
            storyUploadError = "Не удалось прочитать фотографию для сторис."
            return
        }
        do {
            try await TysonAPI.shared.createStory(imageData: data)
            storyUploadError = ""
            await loadStories()
        } catch {
            storyUploadError = "Не удалось опубликовать сторис."
        }
    }
}

private struct StoryRail: View {
    let stories: [TysonStory]
    @Binding var openedStory: TysonStory?
    @Binding var pickedStory: PhotosPickerItem?
    let uploading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Stories").font(.headline).padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 13) {
                    PhotosPicker(selection: $pickedStory, matching: .images) {
                        VStack(spacing: 6) {
                            ZStack {
                                Circle().fill(.thinMaterial)
                                if uploading { ProgressView() } else { Image(systemName: "plus").font(.title2.weight(.semibold)) }
                            }.frame(width: 68, height: 68)
                            Text("Добавить").font(.caption2.weight(.medium)).frame(width: 70)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(uploading)
                    ForEach(stories) { story in
                        Button { openedStory = story } label: {
                            VStack(spacing: 6) {
                                ZStack {
                                    Circle().stroke(AngularGradient(colors: [.pink, .orange, .purple, .pink], center: .center), lineWidth: 3)
                                    StoryAvatar(story: story).padding(4)
                                }
                                .frame(width: 68, height: 68)
                                Text(story.username).font(.caption2.weight(.medium)).lineLimit(1).frame(width: 70)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Сторис @\(story.username)")
                    }
                }
                .padding(.horizontal, 14)
            }
        }
    }
}

private struct StoryAvatar: View {
    let story: TysonStory
    var body: some View {
        AsyncImage(url: TysonAPI.mediaURL(story.avatarKey)) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else { Circle().fill(TysonColor.accent.gradient).overlay(Text(story.displayName.prefix(1)).foregroundStyle(.white).bold()) }
        }
        .clipShape(Circle())
    }
}

private struct StoryViewer: View {
    @Environment(\.dismiss) private var dismiss
    let story: TysonStory
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            storyMedia
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    StoryAvatar(story: story).frame(width: 38, height: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(story.displayName).font(.subheadline.bold())
                        Text("@\(story.username)").font(.caption).foregroundStyle(.white.opacity(0.72))
                    }
                    Spacer()
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.headline.weight(.bold)).frame(width: 38, height: 38) }
                        .buttonStyle(.plain).background(.ultraThinMaterial, in: Circle())
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.top, 10)
                Spacer()
                if let caption = story.caption, !caption.isEmpty {
                    Text(caption).font(.body).foregroundStyle(.white).frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20)).padding(16)
                }
            }
        }
        .task {
            guard story.mediaType == "video", let url = TysonAPI.mediaURL(story.storageKey) else { return }
            let item = AVPlayer(url: url); item.isMuted = false; player = item; item.play()
        }
        .onDisappear { player?.pause() }
    }

    @ViewBuilder private var storyMedia: some View {
        if story.mediaType == "video", let player {
            VideoPlayer(player: player).ignoresSafeArea()
        } else {
            AsyncImage(url: TysonAPI.mediaURL(story.storageKey)) { phase in
                if let image = phase.image { image.resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity) }
                else if phase.error != nil { ContentUnavailableView("Сторис недоступна", systemImage: "exclamationmark.triangle").foregroundStyle(.white) }
                else { ProgressView().tint(.white) }
            }
        }
    }
}

struct NotificationsView: View {
    @State private var notifications: [TysonNotification] = []
    @State private var loading = true
    @State private var error = ""

    var body: some View {
        List {
            if loading {
                ProgressView().frame(maxWidth: .infinity)
            } else if notifications.isEmpty {
                ContentUnavailableView("Уведомлений пока нет", systemImage: "bell", description: Text("Лайки, комментарии, подписки и важные события появятся здесь."))
            } else {
                ForEach(notifications) { notification in
                    HStack(spacing: 12) {
                        AsyncImage(url: TysonAPI.mediaURL(notification.actorAvatarKey)) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                            else { Circle().fill(TysonColor.accent.gradient).overlay(Image(systemName: icon(for: notification.type)).foregroundStyle(.white)) }
                        }
                        .frame(width: 44, height: 44)
                        .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text(notification.actorDisplayName ?? "Tyson").font(.subheadline.bold())
                            Text(notification.message).font(.subheadline)
                            Text(formattedDate(notification.createdAt)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if notification.readAt == nil { Circle().fill(TysonColor.accent).frame(width: 8, height: 8) }
                    }.padding(.vertical, 3)
                }
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Уведомления")
        .toolbar { if !notifications.isEmpty { ToolbarItem(placement: .topBarTrailing) { Button("Прочитать") { Task { try? await TysonAPI.shared.markNotificationsRead(); await load() } } } } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do { notifications = try await TysonAPI.shared.notifications(); error = "" }
        catch { self.error = "Не удалось загрузить уведомления." }
    }
    private func icon(for type: String) -> String { ["like": "heart.fill", "comment": "bubble.left.fill", "follow": "person.badge.plus", "mention": "at" ][type] ?? "bell.fill" }
    private func formattedDate(_ value: String) -> String { guard let date = ISO8601DateFormatter().date(from: value) else { return value }; return date.formatted(date: .abbreviated, time: .shortened) }
}

struct PostCard: View {
    @EnvironmentObject private var session: AppSession
    let post: TysonPost
    @State private var likeCount = 0
    @State private var liked = false
    @State private var pinned = false
    @State private var promoted = false
    @State private var removed = false
    @State private var showPromotion = false
    @State private var showEdit = false
    @State private var status = ""
    private var isOwner: Bool { session.currentUser?.id == post.authorId || session.currentUser?.username == post.username }
    var body: some View {
        if !removed { TysonGlass {
            VStack(alignment: .leading, spacing: 12) {
                HStack { NavigationLink { PublicProfileView(username: post.username) } label: { AsyncImage(url: TysonAPI.mediaURL(post.avatarKey)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.green.gradient).overlay(Text(post.displayName.prefix(1)).foregroundStyle(.white).bold()) } }.frame(width: 40, height: 40).clipShape(Circle()) }; VStack(alignment: .leading) { HStack(spacing: 4) { NavigationLink(post.displayName) { PublicProfileView(username: post.username) }.font(.subheadline.bold()).buttonStyle(.plain); if post.verified?.value == true { Image(systemName: "checkmark.seal.fill").font(.caption).foregroundStyle(.blue).accessibilityLabel("Подтверждённый аккаунт") } }; Text("@\(post.username)").font(.caption).foregroundStyle(.secondary) }; Spacer(); postMenu }
                if let title = post.title, !title.isEmpty { Text(title).font(.headline) }
                if pinned { Label("Закреплено в профиле", systemImage: "pin.fill").font(.caption2.bold()).foregroundStyle(.orange) }
                if promoted { Label("Продвигается", systemImage: "rocket.fill").font(.caption2.bold()).foregroundStyle(.blue) }
                Text(richText).font(.body).fixedSize(horizontal: false, vertical: true)
                if !status.isEmpty { Text(status).font(.caption).foregroundStyle(.secondary) }
                HStack(spacing: 20) { Button { Task { await toggleLike() } } label: { Label("\(likeCount)", systemImage: liked ? "heart.fill" : "heart") }.foregroundStyle(liked ? .red : .secondary); Label("\(post.commentCount ?? 0)", systemImage: "bubble.right"); if (post.diamondCount ?? 0) > 0 { Label("\(post.diamondCount ?? 0)", systemImage: "diamond.fill").foregroundStyle(.blue) }; Spacer(); ShareLink(item: URL(string: "https://tysonsocial.eu.cc/post/\(post.id)")!) { Image(systemName: "square.and.arrow.up") } }.font(.caption).foregroundStyle(.secondary)
            }.padding(16)
        }.padding(.horizontal).onAppear { likeCount = post.likeCount ?? 0; liked = post.viewerReaction == "like"; pinned = post.pinnedAt != nil; promoted = post.promoted?.value ?? false }.sheet(isPresented: $showPromotion) { PostPromotionView(postId: post.id, active: $promoted) }.sheet(isPresented: $showEdit) { PostEditView(post: post) { status = "Публикация обновлена" } } }
    }
    private var richText: AttributedString { (try? AttributedString(markdown: post.body, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(post.body) }
    private var postMenu: some View { Menu { if isOwner { Button { showEdit = true } label: { Label("Редактировать", systemImage: "pencil") }; Button { Task { do { try await TysonAPI.shared.pinPost(id: post.id, pinned: !pinned); pinned.toggle() } catch { status = "Не удалось изменить закрепление" } } } label: { Label(pinned ? "Открепить" : "Закрепить в профиле", systemImage: "pin") }; Button { showPromotion = true } label: { Label(promoted ? "Управлять продвижением" : "Продвинуть", systemImage: "rocket") }; Button(role: .destructive) { Task { do { try await TysonAPI.shared.deletePost(id: post.id); removed = true } catch { status = "Не удалось удалить публикацию" } } } label: { Label("Удалить", systemImage: "trash") } } else { Button { Task { do { try await TysonAPI.shared.repost(id: post.id); status = "Репост опубликован" } catch { status = "Не удалось сделать репост" } } } label: { Label("Сделать репост", systemImage: "repeat") }; ShareLink(item: URL(string: "https://tysonsocial.eu.cc/post/\(post.id)")!) { Label("Поделиться", systemImage: "square.and.arrow.up") } } } label: { Image(systemName: "ellipsis").frame(width: 32, height: 32) } }
    private func toggleLike() async { do { let result = try await TysonAPI.shared.reactToPost(id: post.id, reaction: liked ? nil : "like"); liked = result.reaction == "like"; likeCount = result.likeCount } catch { status = "Не удалось поставить реакцию" } }
}

private struct PostPromotionView: View {
    @Environment(\.dismiss) private var dismiss; let postId: String; @Binding var active: Bool; @State private var views = 50; @State private var busy = false; @State private var error = ""
    var body: some View { NavigationStack { Form { Section("Продвижение") { Stepper("\(views) дополнительных показов", value: $views, in: 10...500, step: 10); LabeledContent("Стоимость", value: "\(views * 2) 💎") }; if active { Section { Button("Остановить продвижение", role: .destructive) { Task { await cancel() } } } } else { Button { Task { await start() } } label: { HStack { Text("Запустить продвижение"); Spacer(); if busy { ProgressView() } } }.disabled(busy) }; if !error.isEmpty { Text(error).foregroundStyle(.red) } }.navigationTitle("Продвижение").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } } } }
    private func start() async { busy = true; defer { busy = false }; do { try await TysonAPI.shared.promotePost(id: postId, views: views); active = true; dismiss() } catch { self.error = "Не удалось запустить продвижение. Проверьте баланс." } }
    private func cancel() async { do { try await TysonAPI.shared.cancelPromotion(id: postId); active = false; dismiss() } catch { self.error = "Не удалось остановить продвижение." } }
}

private struct PostEditView: View {
    @Environment(\.dismiss) private var dismiss; let post: TysonPost; let completed: () -> Void; @State private var title = ""; @State private var bodyText = ""; @State private var error = ""
    var body: some View { NavigationStack { Form { TextField("Заголовок", text: $title); TextEditor(text: $bodyText).frame(minHeight: 240); if !error.isEmpty { Text(error).foregroundStyle(.red) }; Button("Сохранить") { Task { do { try await TysonAPI.shared.updatePost(id: post.id, title: title, body: bodyText); completed(); dismiss() } catch { self.error = "Не удалось сохранить публикацию." } } } }.navigationTitle("Редактировать").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Отмена") { dismiss() } } }.onAppear { title = post.title ?? ""; bodyText = post.body } } }
}
