import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: AppSession
    @State private var showLogin = false
    var body: some View { NavigationStack { List {
        Section { HStack(spacing: 14) { TysonAvatar(user: session.currentUser); VStack(alignment: .leading) { Text(session.currentUser?.displayName ?? "Tyson Social").font(.title3.bold()); Text(session.currentUser.map { "@\($0.username)" } ?? "Аккаунт не подключён").foregroundStyle(.secondary) } } }
        if let user = session.currentUser { Section { HStack { stat("Публикации", "—"); stat("Подписчики", "\(user.followerCount ?? 0)"); stat("Подписки", "\(user.followingCount ?? 0)") } } }
        Section("Аккаунт") { if session.currentUser == nil { Button { showLogin = true } label: { Label("Войти через почту или Telegram", systemImage: "person.badge.key") } }; NavigationLink { NativeSettingsView() } label: { Label("Настройки профиля", systemImage: "gearshape") }; NavigationLink { DevicesView() } label: { Label("Устройства", systemImage: "iphone.and.arrow.forward") }; NavigationLink { DiamondHistoryView() } label: { Label("История алмазов", systemImage: "diamond.fill") } }
    }.listStyle(.insetGrouped).navigationTitle("Профиль").sheet(isPresented: $showLogin) { LoginView() } } }
    private func stat(_ title: String, _ value: String) -> some View { VStack { Text(value).font(.headline.bold()); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }
}

struct NativeSettingsView: View {
    @State private var name = ""; @State private var bio = ""; @State private var saved = ""
    var body: some View { Form { Section("Профиль") { TextField("Имя", text: $name); TextEditor(text: $bio).frame(minHeight: 100); Button("Сохранить изменения") { Task { try? await TysonAPI.shared.updateProfile(name: name, bio: bio); saved = "Сохранено" } } }; if !saved.isEmpty { Text(saved).foregroundStyle(.green) }; Section("Конфиденциальность") { NavigationLink("Кто видит мои сторис") { StoryPrivacyView() }; Toggle("Показывать статус онлайн", isOn: .constant(true)) }; Section("Уведомления") { Toggle("Уведомления о сообщениях", isOn: .constant(true)); Toggle("Уведомления о новых постах", isOn: .constant(true)) } }.navigationTitle("Настройки") }
}

struct StoryPrivacyView: View { @State private var selection = "Подписчики"; var body: some View { Form { Picker("Показывать сторис", selection: $selection) { Text("Все").tag("Все"); Text("Подписчики").tag("Подписчики"); Text("Близкие друзья").tag("Близкие друзья"); Text("Никто").tag("Никто") }.pickerStyle(.inline); Button("Сохранить") { } } .navigationTitle("Приватность сторис") } }
struct DevicesView: View { var body: some View { List { Section { Label("Это устройство", systemImage: "iphone"); Text("iPhone · Сейчас активно").foregroundStyle(.secondary) }; Section { Button("Выйти со всех остальных устройств", role: .destructive) {} } }.navigationTitle("Устройства") } }
struct DiamondHistoryView: View { var body: some View { ContentUnavailableView("История алмазов", systemImage: "diamond.fill", description: Text("Здесь будут пополнения, награды и расходы алмазов.")) .navigationTitle("Алмазы") } }
