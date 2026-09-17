import XCTest

@testable import EliasCore

final class CoreTests: XCTestCase {
  func product(deposit: String = "240", kind: String = "beverage") throws -> Product {
    try JSONDecoder().decode(
      Product.self,
      from: Data(
        """
        {"id":"cola","name":"Cola","sku":"1","category":"Limonade","pack_count":12,"volume_ml":1000,"price_cents":1199,"deposit_cents":\(deposit),"tax_rate":19,"active":true,"kind":"\(kind)"}
        """.utf8))
  }
  func testPricesAndCrates() throws {
    let t = CartTotals(items: [.init(id: "cola", quantity: 4)], products: [try product()])
    XCTAssertEqual(t.goods, 4796)
    XCTAssertEqual(t.deposit, 960)
    XCTAssertEqual(t.total, 5756)
    XCTAssertTrue(t.canCheckout)
    XCTAssertFalse(
      CartTotals(items: [.init(id: "cola", quantity: 4)], products: [try product(deposit: "null")])
        .canCheckout)
    XCTAssertFalse(
      CartTotals(items: [.init(id: "cola", quantity: 4)], products: [try product(kind: "rental")])
        .canCheckout)
    XCTAssertFalse(
      CartTotals(items: [.init(id: "missing", quantity: 4)], products: [try product()]).canCheckout)
  }
  func testCartValidationAndRetryID() throws {
    let id = UUID()
    let p = CheckoutPayload(requestID: id, items: [.init(id: "cola", quantity: 100)])
    XCTAssertTrue(p.isValid)
    XCTAssertEqual(
      try JSONDecoder().decode(CheckoutPayload.self, from: JSONEncoder().encode(p)).request_id, id)
    XCTAssertFalse(
      CheckoutPayload(requestID: id, items: [.init(id: "cola", quantity: 101)]).isValid)
    XCTAssertFalse(
      CheckoutPayload(
        requestID: id, items: [.init(id: "cola", quantity: 1), .init(id: "cola", quantity: 2)]
      ).isValid)
  }
  func testNavigationBoundaries() {
    XCTAssertTrue(
      NavigationPolicy.isTrusted(URL(string: "https://getraenke-elias.vercel.app/konto")!))
    for address in [
      "http://getraenke-elias.vercel.app", "https://getraenke-elias.vercel.app.evil.test",
      "https://getraenke-elias.vercel.app:8443", "https://user@getraenke-elias.vercel.app",
      "file:///etc/passwd",
    ] { XCTAssertFalse(NavigationPolicy.isTrusted(URL(string: address)!)) }
    XCTAssertFalse(NavigationPolicy.isSafeExternal(URL(string: "javascript:alert(1)")!))
  }
  func testPrinterBoundaries() {
    let origin = NavigationPolicy.approvedPrinterOrigin("https://192.168.1.20")!
    XCTAssertTrue(
      NavigationPolicy.isApprovedPrintEndpoint(
        URL(
          string: "https://192.168.1.20/cgi-bin/epos/service.cgi?devid=local_printer&timeout=60000")!,
        origin: origin))
    for u in [
      "http://192.168.1.20", "https://example.com", "https://127.0.0.1",
      "https://192.168.1.20/path", "https://192.168.1.20?x=1", "https://user:pass@192.168.1.20",
      "https://evil.192.168.1.20",
    ] { XCTAssertNil(NavigationPolicy.approvedPrinterOrigin(u)) }
    XCTAssertFalse(
      NavigationPolicy.isApprovedPrintEndpoint(
        URL(
          string: "https://192.168.1.21/cgi-bin/epos/service.cgi?devid=local_printer&timeout=60000")!,
        origin: origin))
    XCTAssertFalse(
      NavigationPolicy.isApprovedPrintEndpoint(
        URL(string: "https://192.168.1.20/admin?devid=local_printer&timeout=60000")!, origin: origin
      ))
  }
}
