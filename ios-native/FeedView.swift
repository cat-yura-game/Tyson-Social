import SwiftUI

struct FeedView: View {
    @State private var posts: [TysonPost] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    HStack { Text("Tyson").font(.largeTitle.bold()); Spacer(); Image(systemName: "bell") }.padding(.horizontal)
                    if let message = error { Text(message).foregroundStyle(.secondary).padding() }
                    if loading { ProgressView().padding(40) }
                    ForEach(posts) { post in PostCard(post: post) }
                }.padding(.vertical)
            }
            .background(TysonColor.background)
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        loading = true; error = nil
        do { posts = try await TysonAPI.shared.feed() }
        catch { error = "Не удалось загрузить ленту Tyson." }
        loading = false
    }
}

private struct PostCard: View {
    let post: TysonPost
    var body: some View {
        TysonGlass {
            VStack(alignment: .leading, spacing: 12) {
                HStack { Circle().fill(TysonColor.green.gradient).frame(width: 38, height: 38).overlay(Text(post.displayName.prefix(1)).foregroundStyle(.white).bold()); VStack(alignment: .leading) { Text(post.displayName).font(.subheadline.bold()); Text("@\(post.username)").font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "ellipsis") }
                if let title = post.title, !title.isEmpty { Text(title).font(.headline) }
                Text(post.body).font(.body).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 20) { Label("\(post.likeCount ?? 0)", systemImage: "heart"); Label("\(post.commentCount ?? 0)", systemImage: "bubble.right"); Spacer(); Image(systemName: "square.and.arrow.up") }.font(.caption).foregroundStyle(.secondary)
            }.padding(16)
        }.padding(.horizontal)
    }
}
