import SwiftUI

enum TysonColor {
    static let accent = Color(red: 0.08, green: 0.48, blue: 0.84)
    static let green = Color(red: 0.08, green: 0.38, blue: 0.25)
    static let background = Color(uiColor: .systemGroupedBackground)
}

enum TysonProfileColor {
    static func cover(_ value: String?) -> LinearGradient {
        switch value {
        case "ocean": return LinearGradient(colors: [Color(red: 0.07, green: 0.21, blue: 0.39), Color(red: 0.13, green: 0.53, blue: 0.76)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case "sunset": return LinearGradient(colors: [Color(red: 0.58, green: 0.18, blue: 0.16), Color(red: 0.95, green: 0.48, blue: 0.22)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case "violet": return LinearGradient(colors: [Color(red: 0.27, green: 0.16, blue: 0.48), Color(red: 0.54, green: 0.31, blue: 0.69)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case "rose": return LinearGradient(colors: [Color(red: 0.54, green: 0.18, blue: 0.34), Color(red: 0.86, green: 0.37, blue: 0.57)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case "graphite": return LinearGradient(colors: [Color(red: 0.12, green: 0.17, blue: 0.19), Color(red: 0.31, green: 0.39, blue: 0.42)], startPoint: .topLeading, endPoint: .bottomTrailing)
        default: return LinearGradient(colors: [Color(red: 0.07, green: 0.24, blue: 0.16), Color(red: 0.22, green: 0.42, blue: 0.29)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
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

extension View {
    /// Uses Apple's Liquid Glass where the OS provides it, with a material fallback for iOS 17–18.
    @ViewBuilder func tysonGlassSurface<S: Shape>(_ shape: S) -> some View {
        if #available(iOS 26.0, *) {
            self
                .glassEffect(.regular, in: shape)
        } else {
            self
                .background(.ultraThinMaterial, in: shape)
                .overlay { shape.stroke(.white.opacity(0.35), lineWidth: 1) }
                .shadow(color: .black.opacity(0.08), radius: 8, y: 4)
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
