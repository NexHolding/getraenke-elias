import XCTest

final class AppUITests: XCTestCase {
  #if CUSTOMER_APP
    func testLiveCheckoutHandoffWithoutSubmission() throws {
      let app = XCUIApplication()
      app.launch()
      let product = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "add-"))
        .firstMatch
      XCTAssertTrue(product.waitForExistence(timeout: 40))
      app.swipeUp()
      XCTAssertTrue(product.isHittable)
      for _ in 0..<4 { product.tap() }
      app.tabBars.buttons["Warenkorb"].tap()
      let checkout = app.buttons["customer-checkout"]
      XCTAssertTrue(checkout.waitForExistence(timeout: 5))
      checkout.tap()
      XCTAssertTrue(app.webViews.staticTexts["Deine Getränkeauswahl"].waitForExistence(timeout: 40))
      let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      image.name = "Native-WebKit-Live-Uebergabe"
      image.lifetime = .keepAlways
      add(image)
      // Stop before entering customer details or submitting anything to /api/orders.
      app.buttons["Schließen"].tap()
    }
    func testLiveCatalogReadOnly() throws {
      let app = XCUIApplication()
      app.launch()
      let product = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "add-"))
        .firstMatch
      XCTAssertTrue(product.waitForExistence(timeout: 40))
      let image = XCTAttachment(screenshot: app.screenshot())
      image.name = "Kunden-App-Live-Sortiment"
      image.lifetime = .keepAlways
      add(image)
      // Read-only: no login, no cart changes and no order submission.
    }
  #endif
  func testFoundationFlow() throws {
    let app = XCUIApplication()
    app.launchArguments = ["--uitesting"]
    app.launch()
    #if CUSTOMER_APP
      let addButton = app.buttons["add-cola"]
      XCTAssertTrue(addButton.waitForExistence(timeout: 25))
      for _ in 0..<4 { addButton.tap() }
      app.tabBars.buttons["Warenkorb"].tap()
      let checkout = app.buttons["customer-checkout"]
      XCTAssertTrue(checkout.waitForExistence(timeout: 5))
      XCTAssertTrue(checkout.isEnabled)
      let cartScreenshot = XCTAttachment(screenshot: app.screenshot())
      cartScreenshot.name = "Kunden-App-Warenkorb"
      cartScreenshot.lifetime = .keepAlways
      add(cartScreenshot)
      checkout.tap()
      XCTAssertTrue(
        app.webViews.staticTexts["Bestellung prüfen · Vorschau"].waitForExistence(timeout: 15))
      app.buttons["Schließen"].tap()
      app.tabBars.buttons["Dein Markt"].tap()
      XCTAssertTrue(app.staticTexts["Persönlich für dich da"].exists)
    #else
      XCUIDevice.shared.orientation = .landscapeLeft
      XCTAssertTrue(app.buttons["pos-printer"].waitForExistence(timeout: 20))
      let landscape = NSPredicate { _, _ in app.frame.width > app.frame.height }
      expectation(for: landscape, evaluatedWith: nil)
      waitForExpectations(timeout: 10)
      app.buttons["pos-printer"].tap()
      let field = app.textFields["printer-address"]
      XCTAssertTrue(field.waitForExistence(timeout: 5))
      field.tap()
      field.typeText("http://example.com")
      app.buttons["printer-save"].tap()
      XCTAssertTrue(app.staticTexts["Bitte eine lokale HTTPS-Adresse ohne Pfad eingeben."].exists)
      let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      screenshot.name = "iPad-Epson-Assistent"
      screenshot.lifetime = .keepAlways
      add(screenshot)
      app.buttons["Fertig"].tap()
      XCTAssertTrue(app.buttons["pos-scan"].exists)
      XCUIDevice.shared.orientation = .portrait
    #endif
  }
}
