import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TysonGlass { VStack(spacing: 10) { TysonAvatar(user: session.currentUser); Text(session.currentUser?.displayName ?? "Tyson Social").font(.title2.bold()); Text(session.currentUser.map { "@\($0.username)" } ?? "Войдите через Telegram").foregroundStyle(.secondary) }.padding(24).frame(maxWidth: .infinity) }.padding(.horizontal)
                    if let user = session.currentUser { HStack { stat("Публикации", "—"); stat("Подписчики", "\(user.followerCount ?? 0)"); stat("Подписки", "\(user.followingCount ?? 0)") }.padding(.horizontal) }
                    List { NavigationLink("Настройки", destination: Text("Настройки Tyson")); NavigationLink("Устройства", destination: Text("Устройства")) }.frame(height: 120).scrollDisabled(true)
                }.padding(.vertical)
            }.background(TysonColor.background).navigationTitle("Профиль")
        }
    }
    private func stat(_ title: String, _ value: String) -> some View { VStack { Text(value).font(.headline.bold()); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }
}
