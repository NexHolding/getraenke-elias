import Combine
import SwiftUI

@MainActor final class ShopStore: ObservableObject {
  @Published var products: [Product] = []
  @Published var items: [CartItem] = []
  @Published var loading = false
  @Published var error: String?
  @Published var lastUpdated: Date?
  @Published var cached = false
  @Published var lastOrder: String?
  @Published var pending = false
  private var requestID = UUID()
  private let folder: URL
  private struct SavedCart: Codable {
    let items: [CartItem]
    let requestID: UUID
    let pending: Bool?
  }
  private struct SavedCatalog: Codable {
    let products: [Product]
    let date: Date
  }
  init() {
    folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(AppConfig.isUITest ? "UITestElias" : "Elias", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    if !AppConfig.isUITest {
      if let data = try? Data(contentsOf: folder.appendingPathComponent("cart.json")),
        let saved = try? JSONDecoder().decode(SavedCart.self, from: data),
        CheckoutPayload(requestID: saved.requestID, items: saved.items).isValid
      {
        items = saved.items
        requestID = saved.requestID
        pending = saved.pending ?? false
      }
      if let data = try? Data(contentsOf: folder.appendingPathComponent("catalog.json")),
        let saved = try? JSONDecoder().decode(SavedCatalog.self, from: data)
      {
        products = saved.products
        lastUpdated = saved.date
        cached = true
      }
    }
  }
  var totals: CartTotals { CartTotals(items: items, products: products) }
  var count: Int { items.reduce(0) { $0 + $1.quantity } }
  var checkout: CheckoutPayload { CheckoutPayload(requestID: requestID, items: items) }
  func quantity(_ id: String) -> Int { items.first(where: { $0.id == id })?.quantity ?? 0 }
  func set(_ id: String, quantity: Int) {
    guard !pending else {
      error = "Bitte zuerst den begonnenen Bestellvorgang fortsetzen."
      return
    }
    let amount = min(100, max(0, quantity))
    if amount > 0 && !items.contains(where: { $0.id == id }) && items.count >= 200 {
      error = "Maximal 200 verschiedene Artikel pro Bestellung."
      return
    }
    items.removeAll { $0.id == id }
    if amount > 0 { items.append(CartItem(id: id, quantity: amount)) }
    requestID = UUID()
    persist()
  }
  func completed(request: UUID, number: String) {
    guard request == requestID else { return }
    items = []
    requestID = UUID()
    lastOrder = number
    pending = false
    persist()
  }
  func begin(_ payload: CheckoutPayload) -> Bool {
    guard payload.isValid, payload.request_id == requestID else { return false }
    if pending && payload.items != items { return false }
    items = payload.items
    pending = true
    return persist()
  }
  func rejected(_ id: UUID) {
    guard id == requestID else { return }
    pending = false
    persist()
  }
  @discardableResult private func persist() -> Bool {
    guard
      let data = try? JSONEncoder().encode(
        SavedCart(items: items, requestID: requestID, pending: pending))
    else { return false }
    do {
      try data.write(
        to: folder.appendingPathComponent("cart.json"), options: [.atomic, .completeFileProtection])
      return true
    } catch {
      self.error = "Warenkorb konnte auf diesem Gerät nicht gespeichert werden."
      return false
    }
  }
  func clearCustomerData() {
    items = []
    requestID = UUID()
    pending = false
    lastOrder = nil
    error = nil
    try? FileManager.default.removeItem(at: folder.appendingPathComponent("cart.json"))
  }
  func refresh() async {
    guard !loading else { return }
    loading = true
    defer { loading = false }
    do {
      let data: Data
      if AppConfig.isUITest {
        data = try Data(
          contentsOf: Bundle.main.url(forResource: "catalog-preview", withExtension: "json")!)
      } else {
        var request = URLRequest(url: AppConfig.url("/api/catalog"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 20
        let (body, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, body.count <= 5_000_000 else {
          throw URLError(.badServerResponse)
        }
        data = body
      }
      let catalog = try JSONDecoder().decode(Catalog.self, from: data)
      products = catalog.products.filter(\.active)
      lastUpdated = Date()
      cached = false
      error = nil
      let saved = SavedCatalog(products: products, date: lastUpdated!)
      try JSONEncoder().encode(saved).write(
        to: folder.appendingPathComponent("catalog.json"), options: .atomic)
    } catch {
      cached = !products.isEmpty
      self.error =
        products.isEmpty
        ? "Das Sortiment ist gerade nicht erreichbar. Bitte erneut laden."
        : "Gespeichertes Sortiment. Preise werden vor der Bestellung erneut geprüft."
    }
  }
}
