import Combine
import SwiftUI
import WebKit

@MainActor
final class WebWorkspace: NSObject, ObservableObject, Identifiable, WKNavigationDelegate,
  WKUIDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate
{
  let id = UUID()
  let mode: String
  let webView: WKWebView
  @Published var loading = true
  @Published var error: String?
  @Published var currentURL: URL?
  @Published var downloadedFile: URL?
  var checkout: (() -> CheckoutPayload)?
  var pendingCheckout: (() -> Bool)?
  var completed: ((UUID, String) -> Void)?
  var submitting: ((CheckoutPayload) -> Bool)?
  var rejected: ((UUID) -> Void)?
  private let printer = PrinterTransport()
  private var printing = false
  private var downloadLocations: [ObjectIdentifier: URL] = [:]
  init(mode: String, path: String) {
    self.mode = mode
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.applicationNameForUserAgent = "EliasIOS/0.1 \(mode)"
    let origin = AppConfig.baseURL.absoluteString
    // The bridge exists only in the top frame on the exact application origin.
    let script =
      "if(window===window.top && location.origin===\(Self.jsString(origin))){Object.defineProperty(window,'eliasNative',{value:Object.freeze({version:1,app:\(Self.jsString(mode))}),writable:false});}"
    config.userContentController.addUserScript(
      WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    webView = WKWebView(frame: .zero, configuration: config)
    super.init()
    // Proxy avoids WKUserContentController retaining this model through its own web view.
    config.userContentController.addScriptMessageHandler(
      WeakBridge(self), contentWorld: .page, name: "elias")
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.isOpaque = false
    webView.backgroundColor = .systemBackground
    if AppConfig.isUITest {
      webView.loadHTMLString(
        "<html><meta name='viewport' content='width=device-width'><body style='font:20px -apple-system;padding:40px'><h1>\(mode == "pos" ? "Elias Kasse · Vorschau" : "Bestellung prüfen · Vorschau")</h1><p>Isolierter UI-Test. Keine Anmeldung, Bestellung oder Buchung.</p></body></html>",
        baseURL: nil)
    } else {
      open(path)
    }
  }
  static func jsString(_ text: String) -> String {
    let data = try! JSONEncoder().encode(text)
    return String(decoding: data, as: UTF8.self)
  }
  func open(_ path: String) {
    error = nil
    webView.load(URLRequest(url: AppConfig.url(path)))
  }
  func reload() {
    error = nil
    webView.reload()
  }
  func scan(_ barcode: String) {
    guard mode == "pos", let url = webView.url, NavigationPolicy.isTrusted(url),
      url.path == "/crm/kasse"
    else {
      error = "Bitte zuerst die Kasse öffnen und dann scannen."
      return
    }
    webView.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('elias:native-scan',{detail:{barcode:\(Self.jsString(barcode))}}))"
    )
  }
  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    loading = true
    error = nil
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loading = false
    currentURL = webView.url
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    failed(error)
  }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { failed(error) }
  private func failed(_ e: Error) {
    loading = false
    if (e as NSError).code != NSURLErrorCancelled {
      error =
        "Verbindung unterbrochen. Bitte erneut laden. Bereits abgesendete Vorgänge werden nicht automatisch wiederholt."
    }
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    loading = false
    error =
      "Die Ansicht wurde vom System beendet. Bitte erneut laden und den letzten Vorgang prüfen."
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = action.request.url else {
      decisionHandler(.cancel)
      return
    }
    if AppConfig.isUITest && url.scheme == "about" {
      decisionHandler(.allow)
      return
    }
    let trusted = NavigationPolicy.isTrusted(url)
    let ownBlob =
      url.scheme == "blob"
      && url.absoluteString.hasPrefix("blob:\(AppConfig.baseURL.absoluteString)/")
    if trusted || ownBlob {
      if action.shouldPerformDownload {
        decisionHandler(.download)
      } else {
        decisionHandler(.allow)
      }
    } else {
      decisionHandler(.cancel)
      // Only explicit taps open other applications; no redirect-driven external launch.
      if action.navigationType == .linkActivated, NavigationPolicy.isSafeExternal(url) {
        UIApplication.shared.open(url)
      }
    }
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    if let mime = response.response.mimeType,
      ["application/pdf", "text/csv", "application/octet-stream"].contains(mime)
    {
      decisionHandler(.download)
    } else {
      decisionHandler(response.canShowMIMEType ? .allow : .cancel)
    }
  }
  private func presentDialog(_ alert: UIAlertController) {
    guard
      let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(
        where: { $0.activationState == .foregroundActive }),
      var controller = scene.windows.first(where: \.isKeyWindow)?.rootViewController
    else { return }
    while let presented = controller.presentedViewController { controller = presented }
    controller.present(alert, animated: true)
  }
  func webView(
    _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void
  ) {
    let alert = UIAlertController(title: "Getränke Elias", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
    presentDialog(alert)
  }
  func webView(
    _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = UIAlertController(
      title: "Bitte bestätigen", message: message, preferredStyle: .alert)
    alert.addAction(
      UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(false) })
    alert.addAction(
      UIAlertAction(title: "Bestätigen", style: .default) { _ in completionHandler(true) })
    presentDialog(alert)
  }
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = action.request.url {
      if NavigationPolicy.isTrusted(url) {
        webView.load(action.request)
      } else if action.navigationType == .linkActivated, NavigationPolicy.isSafeExternal(url) {
        UIApplication.shared.open(url)
      }
    }
    return nil
  }
  func webView(
    _ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload
  ) { download.delegate = self }
  func webView(
    _ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload
  ) { download.delegate = self }
  func download(
    _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
    completionHandler: @escaping (URL?) -> Void
  ) {
    let ext = response.mimeType == "application/pdf" ? "pdf" : "csv"
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "EliasExports", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let url = folder.appendingPathComponent("Elias-\(UUID().uuidString).\(ext)")
    downloadLocations[ObjectIdentifier(download)] = url
    completionHandler(url)
  }
  func downloadDidFinish(_ download: WKDownload) {
    downloadedFile = downloadLocations.removeValue(forKey: ObjectIdentifier(download))
  }
  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    if let file = downloadLocations.removeValue(forKey: ObjectIdentifier(download)) {
      try? FileManager.default.removeItem(at: file)
    }
    self.error = "Dokument konnte nicht heruntergeladen werden."
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    let origin = message.frameInfo.securityOrigin
    guard message.frameInfo.isMainFrame, origin.protocol == "https",
      origin.host == AppConfig.baseURL.host, [0, 443].contains(origin.port),
      let url = message.frameInfo.request.url, NavigationPolicy.isTrusted(url),
      let body = message.body as? [String: Any], body["version"] as? Int == 1,
      let type = body["type"] as? String
    else {
      replyHandler(nil, "Ungültige App-Anfrage.")
      return
    }
    if mode == "customer", NavigationPolicy.isCheckout(url), type == "checkout.load",
      let payload = checkout?(), payload.isValid,
      let data = try? JSONEncoder().encode(payload),
      var value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    {
      value["pending"] = pendingCheckout?() ?? false
      replyHandler(value, nil)
      return
    }
    if mode == "customer", NavigationPolicy.isCheckout(url), type == "checkout.submitting",
      let cart = body["cart"],
      let data = try? JSONSerialization.data(withJSONObject: cart),
      let payload = try? JSONDecoder().decode(CheckoutPayload.self, from: data), payload.isValid,
      submitting?(payload) == true
    {
      replyHandler(["ok": true], nil)
      return
    }
    if mode == "customer", NavigationPolicy.isCheckout(url), type == "checkout.rejected",
      let id = body["request_id"] as? String, let uuid = UUID(uuidString: id)
    {
      rejected?(uuid)
      replyHandler(["ok": true], nil)
      return
    }
    if mode == "customer", NavigationPolicy.isCheckout(url), type == "checkout.completed",
      let id = body["request_id"] as? String, let uuid = UUID(uuidString: id),
      let number = body["number"] as? String,
      number.range(of: "^EL-[0-9]{1,12}$", options: .regularExpression) != nil
    {
      completed?(uuid, number)
      replyHandler(["ok": true], nil)
      return
    }
    if mode == "pos", url.path.hasPrefix("/crm"), type == "printer.send" {
      guard !printing, let address = UserDefaults.standard.string(forKey: "elias.printer.origin"),
        let approved = NavigationPolicy.approvedPrinterOrigin(address),
        let target = body["endpoint"] as? String, let endpoint = URL(string: target),
        NavigationPolicy.isApprovedPrintEndpoint(endpoint, origin: approved),
        let xml = body["body"] as? String, xml.utf8.count < 2_000_000,
        xml.contains("http://www.epson-pos.com/schemas/2011/03/epos-print"),
        !xml.contains("<!DOCTYPE"), !xml.contains("<!ENTITY")
      else {
        replyHandler(
          nil,
          "Druckeradresse zuerst in der App freigeben und mit den CRM-Einstellungen abgleichen.")
        return
      }
      printing = true
      Task {
        defer { printing = false }
        do { replyHandler(try await printer.send(endpoint: endpoint, body: xml), nil) } catch {
          replyHandler(
            nil,
            "Druckstatus unklar. Netzwerk/Zertifikat und Ausdruck prüfen. Nicht ungeprüft wiederholen."
          )
        }
      }
      return
    }
    replyHandler(nil, "Diese App-Funktion ist hier nicht verfügbar.")
  }
}
@MainActor private final class WeakBridge: NSObject, WKScriptMessageHandlerWithReply {
  weak var target: WebWorkspace?
  init(_ target: WebWorkspace) { self.target = target }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard let target else {
      replyHandler(nil, "Ansicht geschlossen.")
      return
    }
    target.userContentController(
      userContentController, didReceive: message, replyHandler: replyHandler)
  }
}
struct WorkspaceView: View {
  @ObservedObject var workspace: WebWorkspace
  var body: some View {
    VStack(spacing: 0) {
      if workspace.loading {
        ProgressView().frame(maxWidth: .infinity).padding(8).accessibilityLabel("Wird geladen")
      }
      if let error = workspace.error {
        VStack(spacing: 10) {
          Text(error).font(.callout)
          Button("Erneut laden") { workspace.reload() }.buttonStyle(.bordered)
        }.padding().frame(maxWidth: .infinity).background(Color.orange.opacity(0.12))
      }
      WebSurface(webView: workspace.webView)
    }
    .sheet(
      isPresented: Binding(
        get: { workspace.downloadedFile != nil },
        set: {
          if !$0 {
            if let file = workspace.downloadedFile { try? FileManager.default.removeItem(at: file) }
            workspace.downloadedFile = nil
          }
        })
    ) { if let url = workspace.downloadedFile { ShareSheet(url: url) } }
  }
}
private struct WebSurface: UIViewRepresentable {
  let webView: WKWebView
  func makeUIView(context: Context) -> WKWebView { webView }
  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
private struct ShareSheet: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [url], applicationActivities: nil)
  }
  func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
