import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View { NavigationStack { List {
        Section { HStack(spacing: 14) { TysonAvatar(user: session.currentUser); VStack(alignment: .leading) { Text(session.currentUser?.displayName ?? "Tyson Social").font(.title3.bold()); Text(session.currentUser.map { "@\($0.username)" } ?? "Аккаунт не подключён").foregroundStyle(.secondary) } } }
        if let user = session.currentUser { Section { HStack { stat("Публикации", "—"); stat("Подписчики", "\(user.followerCount ?? 0)"); stat("Подписки", "\(user.followingCount ?? 0)") } } }
        Section("Настройки") {
            NavigationLink { ProfileEditView() } label: { Label("Профиль", systemImage: "person.crop.circle") }
            NavigationLink { PrivacySettingsView() } label: { Label("Конфиденциальность", systemImage: "lock.shield") }
            NavigationLink { NativeNotificationSettingsView() } label: { Label("Уведомления", systemImage: "bell.badge") }
            NavigationLink { AppearanceSettingsView() } label: { Label("Оформление", systemImage: "paintpalette") }
            NavigationLink { DevicesView() } label: { Label("Устройства", systemImage: "iphone.and.arrow.forward") }
            NavigationLink { AISettingsView() } label: { Label("Tyson AI", systemImage: "sparkles") }
            NavigationLink { AccountSettingsView() } label: { Label("Аккаунт и безопасность", systemImage: "person.badge.key") }
        }
        Section("Алмазы") { NavigationLink { DiamondHistoryView() } label: { Label("История операций", systemImage: "diamond.fill") } }
        Section { Button("Выйти", role: .destructive) { Task { await session.logout() } } }
    }.listStyle(.insetGrouped).navigationTitle("Профиль") } }
    private func stat(_ title: String, _ value: String) -> some View { VStack { Text(value).font(.headline.bold()); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }
}

struct ProfileEditView: View {
    @EnvironmentObject private var session: AppSession; @State private var name = ""; @State private var bio = ""; @State private var saved = ""
    var body: some View { Form { Section("Основное") { TextField("Имя", text: $name); TextEditor(text: $bio).frame(minHeight: 120); Button("Сохранить") { Task { do { try await TysonAPI.shared.updateProfile(name: name, bio: bio); await session.loadSession(); saved = "Профиль сохранён" } catch { saved = "Не удалось сохранить профиль" } } } }; if !saved.isEmpty { Text(saved).foregroundStyle(saved.contains("сохранён") ? .green : .red) }; Section("Дата рождения") { DatePicker("День рождения", selection: .constant(.now), displayedComponents: .date) }; Section("Цвет профиля") { ProfileColorPicker() } }.navigationTitle("Редактировать профиль").onAppear { name = session.currentUser?.displayName ?? ""; bio = session.currentUser?.bio ?? "" } }
}

struct ProfileColorPicker: View { @State private var selected = "forest"; let colors: [(String, Color)] = [("forest", .green), ("ocean", .blue), ("sunset", .orange), ("violet", .purple), ("rose", .pink), ("graphite", .gray)]; var body: some View { HStack { ForEach(colors, id: \.0) { item in Button { selected = item.0 } label: { Circle().fill(item.1.gradient).frame(width: 38, height: 38).overlay { if selected == item.0 { Image(systemName: "checkmark").foregroundStyle(.white).bold() } } }.buttonStyle(.plain) } } } }

struct PrivacySettingsView: View {
    @State private var settings = PrivacySettings(lastSeenVisibility: "everyone", birthdayVisibility: "everyone", messagingVisibility: "everyone", storiesVisibility: "everyone"); @State private var message = ""
    var body: some View { Form { visibility("Время последнего входа", value: $settings.lastSeenVisibility); visibility("День рождения", value: $settings.birthdayVisibility); visibility("Кто может писать", value: $settings.messagingVisibility); visibility("Кто видит сторис", value: $settings.storiesVisibility); Button("Сохранить") { Task { do { try await TysonAPI.shared.savePrivacy(settings); message = "Сохранено" } catch { message = "Не удалось сохранить" } } }; if !message.isEmpty { Text(message).foregroundStyle(.secondary) } }.navigationTitle("Конфиденциальность").task { if let value = try? await TysonAPI.shared.privacySettings() { settings = value } } }
    private func visibility(_ title: String, value: Binding<String>) -> some View { Picker(title, selection: value) { Text("Все").tag("everyone"); Text("Подписчики").tag("followers"); Text("Никто").tag("nobody") } }
}

struct NativeNotificationSettingsView: View { @State private var value = NotificationSettings(messageSoundsEnabled: true); var body: some View { Form { Toggle("Звуки сообщений", isOn: $value.messageSoundsEnabled).onChange(of: value.messageSoundsEnabled) { _, _ in Task { try? await TysonAPI.shared.saveNotificationSettings(value) } }; Toggle("Лайки и комментарии", isOn: .constant(true)); Toggle("Новые подписчики", isOn: .constant(true)); Toggle("Уведомления через Telegram", isOn: .constant(false)) }.navigationTitle("Уведомления").task { if let loaded = try? await TysonAPI.shared.notificationSettings() { value = loaded } } } }
struct AppearanceSettingsView: View { @AppStorage("tysonTheme") private var theme = "system"; var body: some View { Form { Picker("Тема", selection: $theme) { Text("Системная").tag("system"); Text("Светлая").tag("light"); Text("Тёмная").tag("dark") }; Toggle("Уменьшить анимации", isOn: .constant(false)); Toggle("Экономия трафика", isOn: .constant(false)) }.navigationTitle("Оформление") } }
struct AISettingsView: View { @State private var memory = false; @State private var profileName = ""; var body: some View { Form { Section("Модель") { Picker("По умолчанию", selection: .constant("lite")) { Text("Flash Lite").tag("lite"); Text("Flash").tag("flash"); Text("Pro").tag("pro") } }; Section("Память AI Pro") { Toggle("Запоминать информацию обо мне", isOn: $memory); TextField("Как AI может к вам обращаться", text: $profileName) } }.navigationTitle("Tyson AI") } }
struct AccountSettingsView: View { @EnvironmentObject private var session: AppSession; @State private var email = ""; var body: some View { Form { Section("Почта") { TextField("Новая почта", text: $email).keyboardType(.emailAddress); Button("Изменить с подтверждением") {} }; Section("Telegram") { Button("Привязать Telegram") {} }; Section("Безопасность") { NavigationLink("Подтверждение входа") { Text("Telegram, email или оба способа") }; NavigationLink("Дополнительные username") { Text("Коллекционные username") } }; Section { Button("Удалить аккаунт", role: .destructive) {} } }.navigationTitle("Аккаунт") } }

struct DevicesView: View {
    @State private var sessions: [TysonDeviceSession] = []
    var body: some View { List { ForEach(sessions) { item in HStack { Image(systemName: item.device.lowercased().contains("iphone") ? "iphone" : "desktopcomputer"); VStack(alignment: .leading) { HStack { Text(item.device).bold(); if item.current { Text("Это устройство").font(.caption).foregroundStyle(.blue) } }; Text("\(item.browser) · \(item.lastSeenAt)").font(.caption).foregroundStyle(.secondary) }; Spacer(); if !item.current { Button("Завершить") { Task { try? await TysonAPI.shared.revokeSession(id: item.id); await load() } }.font(.caption) } } }; Section { Button("Выйти со всех остальных устройств", role: .destructive) { Task { try? await TysonAPI.shared.revokeOtherSessions(); await load() } } } }.navigationTitle("Устройства").task { await load() } }
    private func load() async { sessions = (try? await TysonAPI.shared.deviceSessions()) ?? [] }
}
struct DiamondHistoryView: View { var body: some View { ContentUnavailableView("История алмазов", systemImage: "diamond.fill", description: Text("Пополнения, награды и покупки отображаются здесь.")) .navigationTitle("Алмазы") } }
