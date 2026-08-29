import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View { NavigationStack { List {
        Section { if let user = session.currentUser { NavigationLink { PublicProfileView(username: user.username) } label: { HStack(spacing: 14) { TysonAvatar(user: user); VStack(alignment: .leading) { Text(user.displayName).font(.title3.bold()); Text("@\(user.username)").foregroundStyle(.secondary) } } } } }
        if let user = session.currentUser { Section { HStack(spacing: 0) { stat("Публикации", "—"); NavigationLink { PeopleListView(username: user.username, kind: .followers) } label: { stat("Подписчики", "\(user.followerCount ?? 0)") }; NavigationLink { PeopleListView(username: user.username, kind: .following) } label: { stat("Подписки", "\(user.followingCount ?? 0)") } } } }
        Section("Настройки") {
            NavigationLink { ProfileEditView() } label: { Label("Профиль", systemImage: "person.crop.circle") }
            NavigationLink { PrivacySettingsView() } label: { Label("Конфиденциальность", systemImage: "lock.shield") }
            NavigationLink { NativeNotificationSettingsView() } label: { Label("Уведомления", systemImage: "bell.badge") }
            NavigationLink { AppearanceSettingsView() } label: { Label("Оформление", systemImage: "paintpalette") }
            NavigationLink { DevicesView() } label: { Label("Устройства", systemImage: "iphone.and.arrow.forward") }
            NavigationLink { AISettingsView() } label: { Label("Tyson AI", systemImage: "sparkles") }
            NavigationLink { AccountSettingsView() } label: { Label("Аккаунт и безопасность", systemImage: "person.badge.key") }
        }
        Section("Алмазы и подарки") { NavigationLink { DiamondsHubView() } label: { Label("Алмазы Tyson", systemImage: "diamond.fill") }; NavigationLink { MyGiftsView() } label: { Label("Мои подарки", systemImage: "gift.fill") } }
        Section { Button("Выйти", role: .destructive) { Task { await session.logout() } } }
    }.listStyle(.insetGrouped).navigationTitle("Профиль") } }
    private func stat(_ title: String, _ value: String) -> some View { VStack { Text(value).font(.headline.bold()); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) }
}

struct ProfileEditView: View {
    @EnvironmentObject private var session: AppSession
    @State private var name = ""
    @State private var bio = ""
    @State private var birthday = ""
    @State private var year = ""
    @State private var profileColor = "forest"
    @State private var saved = ""
    @State private var busy = false

    var body: some View { Form {
        Section("Основное") { TextField("Имя", text: $name); TextEditor(text: $bio).frame(minHeight: 120); Text("До 500 символов").font(.caption).foregroundStyle(.secondary) }
        Section("День рождения") { TextField("ДД-ММ — например 26-03", text: $birthday).keyboardType(.numbersAndPunctuation); TextField("Год (необязательно)", text: $year).keyboardType(.numberPad); Text("Если оставить оба поля пустыми, день рождения не будет указан.").font(.caption).foregroundStyle(.secondary) }
        Section("Цвет профиля") { ProfileColorPicker(selected: $profileColor) }
        Section { Button { Task { await save() } } label: { HStack { Spacer(); if busy { ProgressView() } else { Label("Сохранить", systemImage: "checkmark.circle.fill") }; Spacer() } }.disabled(busy) }
        if !saved.isEmpty { Text(saved).foregroundStyle(saved.contains("сохранён") ? .green : .red) }
    }.navigationTitle("Редактировать профиль").onAppear { name = session.currentUser?.displayName ?? ""; bio = session.currentUser?.bio ?? ""; birthday = session.currentUser?.birthdayMonthDay ?? ""; year = session.currentUser?.birthdayYear.map(String.init) ?? ""; profileColor = session.currentUser?.profileColor ?? "forest" } }

    private func save() async {
        let cleanBirthday = birthday.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanYear = year.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanBirthday.isEmpty || validBirthday(cleanBirthday) else { saved = "Укажите дату в формате ДД-ММ."; return }
        guard cleanYear.isEmpty || Int(cleanYear).map({ $0 >= 1900 && $0 <= Calendar.current.component(.year, from: .now) }) == true else { saved = "Проверьте год рождения."; return }
        busy = true; defer { busy = false }
        do {
            _ = try await TysonAPI.shared.updateProfile(ProfileUpdateInput(displayName: name, bio: bio, birthdayMonthDay: cleanBirthday.isEmpty ? nil : cleanBirthday, birthdayYear: cleanBirthday.isEmpty ? nil : Int(cleanYear), profileColor: profileColor))
            await session.loadSession(); saved = "Профиль сохранён"
        } catch { saved = "Не удалось сохранить профиль. Проверьте введённые данные." }
    }
    private func validBirthday(_ value: String) -> Bool {
        let parts = value.split(separator: "-")
        guard parts.count == 2, let day = Int(parts[0]), let month = Int(parts[1]), month >= 1, month <= 12 else { return false }
        let date = DateComponents(calendar: .current, year: 2000, month: month).date ?? .now
        let maxDay = Calendar.current.range(of: .day, in: .month, for: date)?.count ?? 31
        return day >= 1 && day <= maxDay
    }
}

struct ProfileColorPicker: View { @Binding var selected: String; let colors: [(String, Color)] = [("forest", .green), ("ocean", .blue), ("sunset", .orange), ("violet", .purple), ("rose", .pink), ("graphite", .gray)]; var body: some View { HStack { ForEach(colors, id: \.0) { item in Button { selected = item.0 } label: { Circle().fill(item.1.gradient).frame(width: 38, height: 38).overlay { if selected == item.0 { Image(systemName: "checkmark").foregroundStyle(.white).bold() } } }.buttonStyle(.plain).accessibilityLabel(item.0) } } } }

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
struct DiamondsHubView: View {
    @State private var balance = 0
    var body: some View {
        ScrollView { VStack(spacing: 18) {
            TysonGlass { VStack(spacing: 14) { Image(systemName: "diamond.fill").font(.system(size: 62)).symbolRenderingMode(.palette).foregroundStyle(.cyan, .blue).shadow(color: .cyan.opacity(0.35), radius: 18); Text("Алмазы Tyson").font(.largeTitle.bold()); HStack(alignment: .firstTextBaseline, spacing: 8) { Text("\(balance)").font(.system(size: 44, weight: .bold, design: .rounded)); Text("💎").font(.title) }; Text("Ваш баланс и возможности Tyson в одном месте.").foregroundStyle(.secondary).multilineTextAlignment(.center) }.padding(28).frame(maxWidth: .infinity) }.padding(.horizontal)
            LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                NavigationLink { DiamondTopUpView() } label: { DiamondActionCard(title: "Пополнить", subtitle: "Telegram Stars", icon: "star.fill", color: .orange) }
                NavigationLink { GiftStoreView() } label: { DiamondActionCard(title: "Подарки", subtitle: "Каталог Tyson", icon: "gift.fill", color: .pink) }
                NavigationLink { MyGiftsView() } label: { DiamondActionCard(title: "Мои подарки", subtitle: "Коллекция", icon: "shippingbox.fill", color: .purple) }
                NavigationLink { DiamondHistoryView() } label: { DiamondActionCard(title: "История", subtitle: "Все операции", icon: "clock.arrow.circlepath", color: .blue) }
            }.buttonStyle(.plain).padding(.horizontal)
        }.padding(.vertical) }.background(TysonColor.background).navigationTitle("Алмазы").navigationBarTitleDisplayMode(.inline).task { balance = (try? await TysonAPI.shared.diamondBalance()) ?? 0 }.refreshable { balance = (try? await TysonAPI.shared.diamondBalance()) ?? balance }
    }
}

private struct DiamondActionCard: View { let title: String; let subtitle: String; let icon: String; let color: Color; var body: some View { TysonGlass { VStack(alignment: .leading, spacing: 12) { Image(systemName: icon).font(.title).foregroundStyle(color); Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }.padding(16).frame(maxWidth: .infinity, minHeight: 128, alignment: .leading) } } }

struct DiamondTopUpView: View {
    @Environment(\.openURL) private var openURL
    @State private var packages: [StarPackage] = []; @State private var busy: String?; @State private var error = ""
    var body: some View { List { Section { Text("Пополнение проходит через безопасный счёт Telegram Stars. После оплаты баланс обновится автоматически.").foregroundStyle(.secondary) }; Section("Пакеты") { ForEach(packages) { item in Button { Task { await buy(item) } } label: { HStack { VStack(alignment: .leading) { Text(item.label).font(.headline); Text("\(item.stars) ⭐️").foregroundStyle(.secondary) }; Spacer(); if busy == item.id { ProgressView() } else { Image(systemName: "chevron.right") } } } } }; if !error.isEmpty { Text(error).foregroundStyle(.red) } }.navigationTitle("Пополнить").task { packages = (try? await TysonAPI.shared.starPackages()) ?? [] } }
    private func buy(_ item: StarPackage) async { busy = item.id; defer { busy = nil }; do { openURL(try await TysonAPI.shared.starInvoice(packageId: item.id)) } catch { self.error = "Не удалось создать счёт Telegram." } }
}

struct DiamondHistoryView: View {
    @State private var transactions: [DiamondTransaction] = []
    var body: some View { List { if transactions.isEmpty { ContentUnavailableView("Операций пока нет", systemImage: "diamond", description: Text("Пополнения, награды и покупки появятся здесь.")) } else { ForEach(transactions) { item in HStack(spacing: 12) { Image(systemName: item.amount >= 0 ? "arrow.down.circle.fill" : "arrow.up.circle.fill").font(.title2).foregroundStyle(item.amount >= 0 ? .green : .red); VStack(alignment: .leading) { Text(reason(item.reason)).font(.subheadline.bold()); Text(formatDate(item.createdAt)).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("\(item.amount > 0 ? "+" : "")\(item.amount) 💎").font(.headline).foregroundStyle(item.amount >= 0 ? .green : .primary) } } } }.navigationTitle("История алмазов").task { transactions = (try? await TysonAPI.shared.diamondTransactions()) ?? [] } }
    private func reason(_ value: String) -> String { ["gift_purchase":"Покупка подарка", "post_promotion":"Продвижение публикации", "post_diamond_sent":"Алмазы автору", "post_diamond_received":"Алмазы за публикацию", "daily_task_reward":"Ежедневная награда", "permanent_task_reward":"Награда за задание", "telegram_stars_purchase":"Покупка через Telegram Stars"][value] ?? value.replacingOccurrences(of: "_", with: " ").capitalized }
    private func formatDate(_ value: String) -> String { guard let date = ISO8601DateFormatter().date(from: value) else { return value }; return date.formatted(date: .abbreviated, time: .shortened) }
}

struct GiftStoreView: View {
    @State private var gifts: [TysonGiftType] = []; @State private var selected: TysonGiftType?; @State private var error = ""
    var body: some View { ScrollView { LazyVGrid(columns: [.init(.adaptive(minimum: 150), spacing: 12)], spacing: 12) { ForEach(gifts) { gift in Button { selected = gift } label: { TysonGlass { VStack(spacing: 10) { GiftArtwork(path: gift.baseImage, size: 104); Text(gift.title).font(.headline).multilineTextAlignment(.center); Text("\(gift.basePrice) 💎").font(.subheadline.bold()).foregroundStyle(TysonColor.accent); if gift.isLimited { Text("Осталось \(gift.remaining)").font(.caption2).foregroundStyle(.secondary) } }.padding(14).frame(maxWidth: .infinity, minHeight: 190) } }.buttonStyle(.plain) } }.padding(); if !error.isEmpty { Text(error).foregroundStyle(.red) } }.background(TysonColor.background).navigationTitle("Подарки").task { do { gifts = try await TysonAPI.shared.gifts() } catch { self.error = "Не удалось загрузить подарки." } }.sheet(item: $selected) { gift in GiftDetailView(gift: gift) } }
}

private struct GiftDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let gift: TysonGiftType
    @State private var showPurchase = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    TysonGlass {
                        VStack(spacing: 16) {
                            GiftArtwork(path: gift.baseImage, size: 210)
                            Text(gift.title).font(.largeTitle.bold()).multilineTextAlignment(.center)
                            Text("\(gift.basePrice) 💎").font(.title2.bold()).foregroundStyle(TysonColor.accent)
                            if gift.isLimited { Label("Осталось \(gift.remaining) из \(gift.maxSupply)", systemImage: "sparkles").font(.subheadline).foregroundStyle(.secondary) }
                            else { Label("Без лимита", systemImage: "infinity").font(.subheadline).foregroundStyle(.secondary) }
                        }.padding(24).frame(maxWidth: .infinity)
                    }
                    VStack(alignment: .leading, spacing: 13) {
                        Label(gift.canTransfer ? "Можно передарить" : "Без передачи", systemImage: "arrow.left.arrow.right")
                        Label(gift.canWear ? "Можно надеть в профиль" : "Коллекционный подарок", systemImage: "person.crop.circle")
                        if gift.canUpgrade { Label("Доступно улучшение за \(gift.upgradePrice ?? 0) 💎", systemImage: "arrow.up.circle") }
                    }.font(.subheadline).padding(18).tysonGlassSurface(RoundedRectangle(cornerRadius: 24))
                    Button { showPurchase = true } label: { Label("Купить подарок", systemImage: "gift.fill").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14) }
                        .buttonStyle(.borderedProminent)
                }.padding()
            }
            .background(TysonColor.background)
            .navigationTitle("Подарок")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } }
            .sheet(isPresented: $showPurchase) { GiftPurchaseView(gift: gift) { dismiss() } }
        }
    }
}

private struct GiftPurchaseView: View {
    @Environment(\.dismiss) private var dismiss; let gift: TysonGiftType; let completed: () -> Void; @State private var recipient = ""; @State private var busy = false; @State private var error = ""
    var body: some View { NavigationStack { Form { Section { HStack { Spacer(); GiftArtwork(path: gift.baseImage, size: 150); Spacer() }; Text(gift.title).font(.title2.bold()).frame(maxWidth: .infinity); Text("\(gift.basePrice) 💎").font(.title3.bold()).foregroundStyle(TysonColor.accent).frame(maxWidth: .infinity) }; Section("Получатель") { TextField("Username без @ — пусто для себя", text: $recipient).textInputAutocapitalization(.never) }; if !error.isEmpty { Text(error).foregroundStyle(.red) }; Button { Task { await buy() } } label: { HStack { Spacer(); if busy { ProgressView() } else { Text("Купить подарок") }; Spacer() } }.disabled(busy) }.navigationTitle("Покупка").toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } } } }
    private func buy() async { busy = true; defer { busy = false }; do { _ = try await TysonAPI.shared.buyGift(id: gift.id, recipientUsername: recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : recipient.replacingOccurrences(of: "@", with: "")); completed(); dismiss() } catch { self.error = "Не удалось купить подарок. Проверьте баланс и получателя." } }
}

struct MyGiftsView: View {
    @State private var gifts: [TysonGift] = []; @State private var selected: TysonGift?
    var body: some View { ScrollView { if gifts.isEmpty { ContentUnavailableView("Подарков пока нет", systemImage: "gift", description: Text("Откройте каталог и соберите свою коллекцию.")) .padding(.top, 80) } else { LazyVGrid(columns: [.init(.adaptive(minimum: 145), spacing: 12)], spacing: 12) { ForEach(gifts) { gift in Button { selected = gift } label: { TysonGlass { VStack(spacing: 9) { GiftArtwork(path: gift.image, size: 100); Text(gift.title).font(.headline).multilineTextAlignment(.center); Text("№\(gift.serialNumber)").font(.caption).foregroundStyle(.secondary); if gift.worn { Label("Надет", systemImage: "checkmark.seal.fill").font(.caption).foregroundStyle(.green) } }.padding(13).frame(maxWidth: .infinity, minHeight: 180) } }.buttonStyle(.plain) } }.padding() } }.background(TysonColor.background).navigationTitle("Мои подарки").task { gifts = (try? await TysonAPI.shared.myGifts()) ?? [] }.sheet(item: $selected) { CollectedGiftDetailView(gift: $0) } }
}

private struct CollectedGiftDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let gift: TysonGift

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    TysonGlass { VStack(spacing: 16) { GiftArtwork(path: gift.image, size: 220); Text(gift.title).font(.largeTitle.bold()); Text("Подарок №\(gift.serialNumber)").foregroundStyle(.secondary); if let inscription = gift.inscription, !inscription.isEmpty { Text(inscription).italic().multilineTextAlignment(.center) } }.padding(25).frame(maxWidth: .infinity) }
                    VStack(alignment: .leading, spacing: 13) {
                        Label(gift.isCollectible ? "Коллекционный" : "Обычный подарок", systemImage: "seal.fill")
                        Label(gift.worn ? "Сейчас надет в профиль" : "Не надет в профиль", systemImage: "person.crop.circle")
                        if gift.canTransfer { Label("Можно передарить", systemImage: "arrow.left.arrow.right") }
                        if gift.canUpgrade { Label("Можно улучшить", systemImage: "arrow.up.circle") }
                    }.font(.subheadline).padding(18).tysonGlassSurface(RoundedRectangle(cornerRadius: 24))
                }.padding()
            }
            .background(TysonColor.background).navigationTitle("Подарок").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Закрыть") { dismiss() } } }
        }
    }
}

private struct GiftArtwork: View { let path: String; let size: CGFloat; var body: some View { AsyncImage(url: TysonAPI.publicAssetURL(path)) { phase in if let image = phase.image { image.resizable().scaledToFit() } else { RoundedRectangle(cornerRadius: 22).fill(.blue.opacity(0.1)).overlay(Image(systemName: "gift.fill").font(.largeTitle).foregroundStyle(.blue)) } }.frame(width: size, height: size) } }

struct PeopleListView: View {
    let username: String; let kind: FollowListKind; @State private var people: [TysonPerson] = []; @State private var loading = true
    var body: some View { List { if loading { ProgressView().frame(maxWidth: .infinity) } else if people.isEmpty { ContentUnavailableView(kind == .followers ? "Подписчиков пока нет" : "Подписок пока нет", systemImage: "person.2") } else { ForEach(people) { person in NavigationLink { PublicProfileView(username: person.username) } label: { HStack(spacing: 12) { AsyncImage(url: TysonAPI.mediaURL(person.avatarKey)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.accent.gradient).overlay(Text(person.displayName.prefix(1)).foregroundStyle(.white).bold()) } }.frame(width: 46, height: 46).clipShape(Circle()); VStack(alignment: .leading) { Text(person.displayName).font(.headline); Text("@\(person.username)").font(.caption).foregroundStyle(.secondary) } } } } } }.navigationTitle(kind == .followers ? "Подписчики" : "Подписки").task { people = (try? await TysonAPI.shared.people(username: username, kind: kind)) ?? []; loading = false } }
}

struct PublicProfileView: View {
    @EnvironmentObject private var session: AppSession
    let username: String
    @State private var user: TysonUser?; @State private var posts: [TysonPost] = []; @State private var gifts: [TysonGift] = []; @State private var selectedTab = 0; @State private var followPending = false; @State private var openedConversation: TysonConversation?; @State private var error = ""
    private var isOwner: Bool { session.currentUser?.id == user?.id }
    var body: some View { ScrollView { VStack(spacing: 16) {
        TysonGlass { VStack(spacing: 12) { TysonAvatarLarge(user: user); HStack(spacing: 6) { Text(user?.displayName ?? username).font(.title.bold()); if user?.verified == true { Image(systemName: "checkmark.seal.fill").foregroundStyle(.blue) } }; Text("@\(user?.username ?? username)").foregroundStyle(.secondary); if let bio = user?.bio, !bio.isEmpty { Text(bio).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true) }; HStack { profileStatLink("Подписчики", user?.followerCount ?? 0, kind: .followers); profileStatLink("Подписки", user?.followingCount ?? 0, kind: .following) }; if !isOwner { HStack { Button { Task { await toggleFollow() } } label: { Label(user?.viewerFollowing == true ? "Вы подписаны" : "Подписаться", systemImage: user?.viewerFollowing == true ? "person.badge.checkmark" : "person.badge.plus") }.buttonStyle(.borderedProminent).disabled(followPending); Button { Task { await openChat() } } label: { Label("Написать", systemImage: "message.fill") }.buttonStyle(.bordered) } }; if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red) } }.padding(22).frame(maxWidth: .infinity) }.padding(.horizontal)
        Picker("Раздел", selection: $selectedTab) { Text("Публикации").tag(0); Text("Подарки").tag(1) }.pickerStyle(.segmented).padding(.horizontal)
        if selectedTab == 0 { LazyVStack(spacing: 14) { ForEach(posts) { PostCard(post: $0) } } } else if gifts.isEmpty { ContentUnavailableView("Подарков пока нет", systemImage: "gift") } else { LazyVGrid(columns: [.init(.adaptive(minimum: 140), spacing: 12)], spacing: 12) { ForEach(gifts) { gift in TysonGlass { VStack { GiftArtwork(path: gift.image, size: 92); Text(gift.title).font(.caption.bold()); if gift.worn { Text("Надет").font(.caption2).foregroundStyle(.green) } }.padding(12).frame(maxWidth: .infinity) } } }.padding(.horizontal) }
    }.padding(.vertical) }.background(TysonColor.background).navigationTitle("Профиль").navigationBarTitleDisplayMode(.inline).navigationDestination(item: $openedConversation) { ConversationView(conversation: $0) }.task { await load() } }
    private func load() async { async let loadedUser = try? TysonAPI.shared.profile(username: username); async let loadedPosts = try? TysonAPI.shared.posts(username: username); async let loadedGifts = try? TysonAPI.shared.userGifts(username: username); user = await loadedUser; posts = await loadedPosts ?? []; gifts = await loadedGifts ?? [] }
    private func toggleFollow() async { guard let user else { return }; followPending = true; defer { followPending = false }; do { let result = try await TysonAPI.shared.setFollowing(username: user.username, following: user.viewerFollowing != true); self.user = TysonUser(id: user.id, username: user.username, displayName: user.displayName, avatarKey: user.avatarKey, bio: user.bio, verified: user.verified, followerCount: result.followerCount, followingCount: user.followingCount, viewerFollowing: result.following, createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, birthdayMonthDay: user.birthdayMonthDay, birthdayYear: user.birthdayYear, profileColor: user.profileColor) } catch { self.error = "Не удалось изменить подписку." } }
    private func openChat() async { guard let user else { return }; do { openedConversation = try await TysonAPI.shared.createConversation(username: user.username) } catch { self.error = "Не удалось открыть диалог." } }
    private func profileStatLink(_ title: String, _ value: Int, kind: FollowListKind) -> some View { NavigationLink { PeopleListView(username: user?.username ?? username, kind: kind) } label: { VStack { Text("\(value)").bold(); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity) } }
}

private struct TysonAvatarLarge: View { let user: TysonUser?; var body: some View { AsyncImage(url: TysonAPI.mediaURL(user?.avatarKey)) { phase in if let image = phase.image { image.resizable().scaledToFill() } else { Circle().fill(TysonColor.green.gradient).overlay(Text((user?.displayName ?? "T").prefix(1)).font(.largeTitle.bold()).foregroundStyle(.white)) } }.frame(width: 94, height: 94).clipShape(Circle()) } }
