import SwiftUI

struct MessagesView: View {
    var body: some View {
        NavigationStack { ContentUnavailableView("Messenger", systemImage: "message.fill", description: Text("Диалоги и групповые чаты будут подключены к API в следующем шаге.")) .navigationTitle("Messenger") }
    }
}
