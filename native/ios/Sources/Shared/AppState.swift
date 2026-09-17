import Combine
import Network
import SwiftUI

@MainActor enum AppConfig {
  static let baseURL: URL = {
    guard let text = Bundle.main.object(forInfoDictionaryKey: "EliasBaseURL") as? String,
      let url = URL(string: text), NavigationPolicy.isTrusted(url)
    else { return NavigationPolicy.production }
    return url
  }()
  static let isUITest = ProcessInfo.processInfo.arguments.contains("--uitesting")
  static let accent = Color(red: 0.58, green: 0.69, blue: 0.14)
  static let ink = Color(red: 0.15, green: 0.21, blue: 0.14)
  static let background = Color(red: 0.97, green: 0.98, blue: 0.95)
  static func url(_ path: String) -> URL { URL(string: path, relativeTo: baseURL)!.absoluteURL }
}
@MainActor final class ConnectionMonitor: ObservableObject {
  @Published var online = true
  private let monitor = NWPathMonitor()
  init() {
    monitor.pathUpdateHandler = { [weak self] path in
      let connected = path.status == .satisfied
      Task { @MainActor in self?.online = connected }
    }
    monitor.start(queue: DispatchQueue(label: "elias.network"))
  }
  deinit { monitor.cancel() }
}
struct BrandHeader: View {
  var body: some View {
    HStack {
      Image("Logo").resizable().scaledToFit().frame(width: 154, height: 50).accessibilityLabel(
        "Getränke Elias")
      Spacer()
      Text("HEILBRONN").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(.secondary)
    }
  }
}
struct OfflineBanner: View {
  var body: some View {
    Label("Offline · Bestellen und Buchen benötigen eine Verbindung", systemImage: "wifi.slash")
      .font(.caption).frame(maxWidth: .infinity).padding(10).background(Color.orange.opacity(0.15))
  }
}
