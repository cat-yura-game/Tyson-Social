import SwiftUI

enum TysonColor {
    static let accent = Color(red: 0.08, green: 0.48, blue: 0.84)
    static let green = Color(red: 0.08, green: 0.38, blue: 0.25)
    static let background = Color(uiColor: .systemGroupedBackground)
}

struct TysonGlass<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        if #available(iOS 26.0, *) {
            content()
                .padding(1)
                .glassEffect(.regular, in: .rect(cornerRadius: 24))
        } else {
            content()
                .background(.ultraThinMaterial, in: .rect(cornerRadius: 24))
                .overlay { RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.35), lineWidth: 1) }
        }
    }
}

struct TysonAvatar: View {
    let user: TysonUser?
    var body: some View {
        AsyncImage(url: TysonAPI.mediaURL(user?.avatarKey)) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else { ZStack { Circle().fill(TysonColor.green.gradient); Text((user?.displayName ?? "T").prefix(1).uppercased()).font(.headline.weight(.bold)).foregroundStyle(.white) } }
        }
        .frame(width: 42, height: 42)
        .clipShape(Circle())
    }
}
