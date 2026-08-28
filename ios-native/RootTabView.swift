import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            FeedView().tabItem { Label("Главная", systemImage: "house.fill") }
            MessagesView().tabItem { Label("Messenger", systemImage: "message.fill") }
            CreateView().tabItem { Label("Создать", systemImage: "plus") }
            AITabView().tabItem { Label("AI", systemImage: "sparkles") }
            ProfileView().tabItem { Label("Профиль", systemImage: "person.crop.circle") }
        }
    }
}

struct CreateView: View { var body: some View { ContentUnavailableView("Новая публикация", systemImage: "square.and.pencil", description: Text("Создание поста появится в следующей бета-версии.")) } }
struct AITabView: View { var body: some View { ContentUnavailableView("Tyson AI", systemImage: "sparkles", description: Text("AI-помощник подключится через общий API.")) } }
