import SwiftUI

struct FeedView: View {
    @State private var posts: [TysonPost] = []
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    if let message = loadError { Text(message).foregroundStyle(.secondary).padding() }
                    if loading { ProgressView().padding(40) }
                    ForEach(posts) { post in PostCard(post: post) }
                }.padding(.vertical)
            }
            .background(TysonColor.background)
            .refreshable { await load() }
            .task { await load() }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { HStack(spacing: 8) { Image("TysonLogo").resizable().scaledToFit().frame(width: 34, height: 34).clipShape(Circle()); Text("Tyson").font(.title2.bold()) } }
                ToolbarItem(placement: .topBarTrailing) { NavigationLink { NotificationsView() } label: { Image(systemName: "bell") } }
            }
        }
    }

    private func load() async {
        loading = true; loadError = nil
        do { posts = try await TysonAPI.shared.feed() }
        catch { loadError = "Не удалось загрузить ленту Tyson." }
        loading = false
    }
}

struct NotificationsView: View {
    var body: some View { List { ContentUnavailableView("Уведомлений пока нет", systemImage: "bell", description: Text("Лайки, комментарии, подписки и важные события появятся здесь.")) }.navigationTitle("Уведомления") }
}

struct PostCard: View {
    let post: TysonPost
    var body: some View {
        TysonGlass {
            VStack(alignment: .leading, spacing: 12) {
                HStack { NavigationLink { PublicProfileView(username: post.username) } label: { AsyncImage(url: TysonAPI.mediaURL(post.avatarKey)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.green.gradient).overlay(Text(post.displayName.prefix(1)).foregroundStyle(.white).bold()) } }.frame(width: 40, height: 40).clipShape(Circle()) }; VStack(alignment: .leading) { NavigationLink(post.displayName) { PublicProfileView(username: post.username) }.font(.subheadline.bold()).buttonStyle(.plain); Text("@\(post.username)").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "ellipsis") }
                if let title = post.title, !title.isEmpty { Text(title).font(.headline) }
                Text((try? AttributedString(markdown: post.body)) ?? AttributedString(post.body)).font(.body).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 20) { Label("\(post.likeCount ?? 0)", systemImage: "heart"); Label("\(post.commentCount ?? 0)", systemImage: "bubble.right"); Spacer(); Image(systemName: "square.and.arrow.up") }.font(.caption).foregroundStyle(.secondary)
            }.padding(16)
        }.padding(.horizontal)
    }
}
