import Foundation

public struct Product: Codable, Identifiable, Hashable, Sendable {
  public let id: String
  public let name: String
  public let sku: String
  public let category: String
  public let pack_count: Int
  public let volume_ml: Int
  public let price_cents: Int
  public let deposit_cents: Int?
  public let tax_rate: Int
  public let image_url: String?
  public let active: Bool
  public let kind: String
  public var pack: String {
    let liters = Decimal(volume_ml) / 1000
    return "\(pack_count) × \(liters.formatted(.number.locale(Locale(identifier: "de_DE")))) l"
  }
  public var price: String { Money.euro(price_cents) }
}
public enum Money {
  public static func euro(_ cents: Int) -> String {
    (Decimal(cents) / 100).formatted(.currency(code: "EUR").locale(Locale(identifier: "de_DE")))
  }
}
public struct Catalog: Codable, Sendable {
  public var products: [Product]
  public var guest_orders: Bool?
  public var instagram: String?
}
public struct CartItem: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public var quantity: Int
  public init(id: String, quantity: Int) {
    self.id = id
    self.quantity = quantity
  }
}
public struct CheckoutPayload: Codable, Equatable, Sendable {
  public let version: Int
  public let request_id: UUID
  public let items: [CartItem]
  public init(requestID: UUID, items: [CartItem]) {
    version = 1
    request_id = requestID
    self.items = items
  }
  public var isValid: Bool {
    version == 1 && !items.isEmpty && items.count <= 200
      && Set(items.map(\.id)).count == items.count
      && items.allSatisfy {
        !$0.id.isEmpty && $0.id.count <= 100 && (1...100).contains($0.quantity)
      }
  }
}
public struct CartTotals: Equatable, Sendable {
  public let goods: Int
  public let deposit: Int
  public let crates: Int
  public let unknownDeposit: Bool
  public let missingArticles: Bool
  public var total: Int { goods + deposit }
  public var canCheckout: Bool { crates >= 4 && !unknownDeposit && !missingArticles }
  public init(items: [CartItem], products: [Product]) {
    var goods = 0
    var deposit = 0
    var crates = 0
    var unknown = false
    var missing = false
    for line in items {
      guard let p = products.first(where: { $0.id == line.id && $0.active }),
        (1...100).contains(line.quantity)
      else {
        missing = true
        continue
      }
      goods += p.price_cents * line.quantity
      deposit += (p.deposit_cents ?? 0) * line.quantity
      unknown = unknown || p.deposit_cents == nil
      if p.kind == "beverage" && p.pack_count > 1 { crates += line.quantity }
    }
    self.goods = goods
    self.deposit = deposit
    self.crates = crates
    unknownDeposit = unknown
    missingArticles = missing
  }
}

public enum NavigationPolicy {
  public static let production = URL(string: "https://getraenke-elias.vercel.app")!
  public static func isTrusted(_ url: URL, base: URL = production) -> Bool {
    url.scheme == "https" && url.host?.lowercased() == base.host?.lowercased()
      && (url.port ?? 443) == (base.port ?? 443) && url.user == nil && url.password == nil
  }
  public static func isCheckout(_ url: URL, base: URL = production) -> Bool {
    isTrusted(url, base: base) && url.path == "/app/bestellen"
  }
  public static func isSafeExternal(_ url: URL) -> Bool {
    ["https", "tel", "mailto"].contains(url.scheme?.lowercased() ?? "") && url.user == nil
      && url.password == nil
  }
  public static func approvedPrinterOrigin(_ input: String) -> URL? {
    guard let u = URL(string: input), u.scheme == "https", u.user == nil, u.password == nil,
      u.query == nil, u.fragment == nil, u.path.isEmpty || u.path == "/",
      let host = u.host?.lowercased(), u.port == nil || (1...65535).contains(u.port!)
    else { return nil }
    let labels = host.split(separator: ".", omittingEmptySubsequences: false)
    let parts = labels.compactMap { Int($0) }
    let privateIPv4 =
      labels.count == 4 && parts.count == 4 && parts.allSatisfy { (0...255).contains($0) }
      && (parts[0] == 10 || (parts[0] == 192 && parts[1] == 168)
        || (parts[0] == 172 && (16...31).contains(parts[1])))
    guard privateIPv4 || (host.hasSuffix(".local") && host.count > 6) else { return nil }
    return u
  }
  public static func isApprovedPrintEndpoint(_ endpoint: URL, origin: URL) -> Bool {
    guard isTrusted(endpoint, base: origin), endpoint.path == "/cgi-bin/epos/service.cgi",
      endpoint.fragment == nil,
      let c = URLComponents(url: endpoint, resolvingAgainstBaseURL: false),
      let query = c.queryItems, query.count == 2,
      query.filter({ $0.name == "timeout" && $0.value == "60000" }).count == 1,
      let device = query.first(where: { $0.name == "devid" })?.value
    else { return false }
    return device.range(of: "^[a-zA-Z0-9_-]{1,64}$", options: .regularExpression) != nil
  }
}
