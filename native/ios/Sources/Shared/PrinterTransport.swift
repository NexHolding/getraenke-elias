import Foundation

// Native transport for the existing audited ePOS workflow. No TLS bypass, redirects or automatic retry.
final class PrinterTransport: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 75
    config.timeoutIntervalForResource = 80
    config.httpCookieStorage = nil
    config.urlCredentialStorage = nil
    config.urlCache = nil
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  func send(endpoint: URL, body: String) async throws -> String {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
    request.setValue("\"\"", forHTTPHeaderField: "SOAPAction")
    request.httpBody = Data(body.utf8)
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count <= 100_000,
      let text = String(data: data, encoding: .utf8)
    else { throw URLError(.badServerResponse) }
    return text
  }
}
