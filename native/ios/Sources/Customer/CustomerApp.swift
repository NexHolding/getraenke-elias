import SwiftUI

#if CUSTOMER_APP
  @main struct EliasCustomerApp: App {
    @StateObject private var shop = ShopStore()
    @StateObject private var connection = ConnectionMonitor()
    var body: some Scene {
      WindowGroup {
        CustomerRoot().environmentObject(shop).environmentObject(connection).tint(AppConfig.accent)
      }
    }
  }
#endif
struct CustomerRoot: View {
  @EnvironmentObject private var shop: ShopStore
  @EnvironmentObject private var connection: ConnectionMonitor
  @Environment(\.scenePhase) private var scenePhase
  @State private var tab = 0
  @StateObject private var account = WebWorkspace(mode: "customer", path: "/konto")
  var body: some View {
    VStack(spacing: 0) {
      if !connection.online { OfflineBanner() }
      TabView(selection: $tab) {
        CatalogView().tabItem { Label("Entdecken", systemImage: "square.grid.2x2") }.tag(0)
        CartView().tabItem { Label("Warenkorb", systemImage: "basket") }.badge(shop.count).tag(1)
        NavigationStack {
          WorkspaceView(workspace: account).navigationTitle("Mein Elias")
            .navigationBarTitleDisplayMode(.inline).toolbar {
              ToolbarItem(placement: .topBarLeading) {
                Menu {
                  Button("Kontoübersicht") { account.open("/konto") }
                  Button("Konto löschen", role: .destructive) { account.open("/konto/loeschen") }
                  Button("Datenschutz") { account.open("/datenschutz") }
                } label: { Label("Kontoeinstellungen", systemImage: "gearshape") }
                .accessibilityIdentifier("account-settings")
              }
              ToolbarItem(placement: .topBarTrailing) {
                Button {
                  account.reload()
                } label: {
                  Image(systemName: "arrow.clockwise")
                }.accessibilityLabel("Konto aktualisieren")
              }
            }
        }.tabItem { Label("Mein Konto", systemImage: "person.crop.circle") }.tag(2)
        StoreView().tabItem { Label("Dein Markt", systemImage: "mappin.and.ellipse") }.tag(3)
      }
    }
    .task { await shop.refresh() }
    .onReceive(NotificationCenter.default.publisher(for: Notification.Name("elias.account.deleted"))) { _ in
      shop.clearCustomerData()
    }
    .overlay {
      if scenePhase != .active {
        AppConfig.background.ignoresSafeArea().overlay(
          Image("Logo").resizable().scaledToFit().frame(width: 220))
      }
    }
  }
}
struct CatalogView: View {
  @EnvironmentObject private var shop: ShopStore
  @State private var query = ""
  @State private var category = "Alle"
  @State private var selected: Product?
  private var categories: [String] { ["Alle"] + Array(Set(shop.products.map(\.category))).sorted() }
  private var filtered: [Product] {
    shop.products.filter {
      (category == "Alle" || $0.category == category)
        && (query.isEmpty || "\($0.name) \($0.sku)".localizedCaseInsensitiveContains(query))
    }
  }
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          BrandHeader()
          VStack(alignment: .leading, spacing: 10) {
            Text("Gute Getränke.\nDirekt zu dir.").font(
              .system(size: 35, weight: .bold, design: .rounded)
            ).foregroundStyle(AppConfig.ink)
            Text(
              "Dein Sortiment aus Heilbronn. Lieferung ab vier Kisten, Pfand transparent ausgewiesen."
            ).font(.subheadline).foregroundStyle(.secondary)
            Label("Persönlicher Lieferservice", systemImage: "truck.box.fill").font(
              .caption.weight(.semibold)
            ).foregroundStyle(AppConfig.ink)
          }.padding(22).frame(maxWidth: .infinity, alignment: .leading).background(
            AppConfig.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 24))
          if let error = shop.error {
            Label(error, systemImage: "info.circle").font(.callout).foregroundStyle(.secondary)
          }
          if let number = shop.lastOrder {
            Label(
              "Anfrage \(number) eingegangen. Elias bestätigt den Liefertermin.",
              systemImage: "checkmark.circle.fill"
            ).font(.callout).foregroundStyle(AppConfig.ink)
          }
          ScrollView(.horizontal, showsIndicators: false) {
            HStack {
              ForEach(categories, id: \.self) { value in
                Button(value) { category = value }.font(.subheadline.weight(.semibold)).padding(
                  .horizontal, 16
                ).padding(.vertical, 11).background(
                  category == value ? AppConfig.ink : Color(.secondarySystemBackground),
                  in: Capsule()
                ).foregroundStyle(category == value ? .white : AppConfig.ink)
              }
            }
          }
          HStack {
            Text("Deine Auswahl").font(.title2.bold())
            Spacer()
            Text("\(filtered.count) Artikel").font(.caption).foregroundStyle(.secondary)
          }
          if shop.loading && shop.products.isEmpty {
            ProgressView("Sortiment wird geladen …").frame(maxWidth: .infinity).padding(40)
          } else if filtered.isEmpty {
            ContentUnavailableView.search(text: query)
            Button("Sortiment neu laden") { Task { await shop.refresh() } }.buttonStyle(.bordered)
          }
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 155), spacing: 14)], spacing: 14) {
            ForEach(filtered) { product in
              ProductTile(product: product, onDetails: { selected = product })
            }
          }
          if let date = shop.lastUpdated {
            Text(
              "Sortiment: \(date.formatted(date: .abbreviated, time: .shortened))\(shop.cached ? " · gespeichert" : "")"
            ).font(.caption2).foregroundStyle(.secondary)
          }
        }.padding(18)
      }.background(AppConfig.background).navigationTitle("Entdecken").navigationBarTitleDisplayMode(
        .inline
      )
      .searchable(text: $query, prompt: "Getränk oder Artikelnummer suchen")
      .refreshable { await shop.refresh() }
      .sheet(item: $selected) { p in
        ProductDetail(product: p).presentationDetents([.medium, .large])
      }
    }
  }
}
struct ProductPicture: View {
  let product: Product
  var body: some View {
    Group {
      if let path = product.image_url, !path.isEmpty,
        let url = URL(string: path, relativeTo: AppConfig.baseURL)?.absoluteURL,
        url.scheme == "https"
      {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFit()
        } placeholder: {
          Image(systemName: "waterbottle").font(.system(size: 42)).foregroundStyle(
            AppConfig.accent.opacity(0.7))
        }
      } else {
        Image(systemName: "waterbottle").font(.system(size: 42)).foregroundStyle(AppConfig.accent)
      }
    }.accessibilityHidden(true)
  }
}
struct ProductTile: View {
  @EnvironmentObject private var shop: ShopStore
  let product: Product
  let onDetails: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Button(action: onDetails) {
        ProductPicture(product: product).frame(maxWidth: .infinity).frame(height: 122).padding(12)
          .background(Color.white, in: RoundedRectangle(cornerRadius: 15))
      }.accessibilityLabel("Details zu \(product.name)")
      Text(product.name).font(.subheadline.weight(.semibold)).lineLimit(2).frame(
        height: 40, alignment: .topLeading)
      Text(product.pack).font(.caption).foregroundStyle(.secondary)
      Text(product.price).font(.title3.bold()).foregroundStyle(AppConfig.ink)
      Text(
        product.deposit_cents.map { "zzgl. \(Money.euro($0)) Pfand" } ?? "Pfand wird noch geprüft"
      ).font(.caption2).foregroundStyle(.secondary)
      Button {
        shop.set(product.id, quantity: shop.quantity(product.id) + 1)
      } label: {
        Label(
          shop.quantity(product.id) > 0 ? "\(shop.quantity(product.id)) im Korb" : "In den Korb",
          systemImage: "plus"
        ).font(.caption.weight(.bold)).frame(maxWidth: .infinity).padding(.vertical, 11)
      }.buttonStyle(.plain).foregroundStyle(AppConfig.ink).background(
        AppConfig.accent.opacity(0.28), in: RoundedRectangle(cornerRadius: 12)
      ).disabled(shop.pending || shop.quantity(product.id) >= 100).accessibilityIdentifier(
        "add-\(product.id)")
    }.padding(12).background(.white, in: RoundedRectangle(cornerRadius: 20))
  }
}
struct ProductDetail: View {
  @EnvironmentObject private var shop: ShopStore
  @Environment(\.dismiss) private var dismiss
  let product: Product
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          ProductPicture(product: product).frame(maxWidth: .infinity).frame(height: 170)
          Text(product.name).font(.title.bold())
          Text(product.pack).foregroundStyle(.secondary)
          Text(product.price).font(.title2.bold())
          Text(
            product.deposit_cents.map { "Zusätzlich \(Money.euro($0)) Pfand je Gebinde." }
              ?? "Pfand noch nicht hinterlegt.")
          Text("Preis inkl. \(product.tax_rate) % MwSt. · Artikel \(product.sku)").font(.caption)
            .foregroundStyle(.secondary)
          Button("In den Warenkorb") {
            shop.set(product.id, quantity: shop.quantity(product.id) + 1)
            dismiss()
          }.buttonStyle(.borderedProminent).disabled(
            shop.pending || shop.quantity(product.id) >= 100)
        }.padding(24)
      }.toolbar { Button("Schließen") { dismiss() } }
    }
  }
}
struct CartView: View {
  @EnvironmentObject private var shop: ShopStore
  @EnvironmentObject private var connection: ConnectionMonitor
  @State private var checkout: WebWorkspace?
  var body: some View {
    NavigationStack {
      List {
        if shop.items.isEmpty {
          ContentUnavailableView(
            "Noch Platz für Lieblingsgetränke", systemImage: "basket",
            description: Text("Wähle unter Entdecken deine Getränke aus."))
        } else {
          Section("Deine Getränke") {
            ForEach(shop.items) { item in
              let product = shop.products.first(where: { $0.id == item.id })
              VStack(alignment: .leading, spacing: 8) {
                HStack {
                  if let product { ProductPicture(product: product).frame(width: 40, height: 54) }
                  VStack(alignment: .leading) {
                    Text(product?.name ?? "Artikel nicht mehr verfügbar").font(.headline)
                    Text(product?.pack ?? item.id).font(.caption).foregroundStyle(.secondary)
                  }
                  Spacer()
                  Text(product.map { Money.euro($0.price_cents * item.quantity) } ?? "—").font(
                    .subheadline.bold())
                }
                Stepper(
                  "\(item.quantity) Gebinde",
                  value: Binding(
                    get: { shop.quantity(item.id) }, set: { shop.set(item.id, quantity: $0) }),
                  in: 0...100
                ).disabled(shop.pending).accessibilityIdentifier("quantity-\(item.id)")
              }.padding(.vertical, 5)
            }.onDelete { indices in
              let ids = indices.map { shop.items[$0].id }
              ids.forEach { shop.set($0, quantity: 0) }
            }
          }
          Section("Deine Übersicht") {
            if shop.pending {
              Label(
                "Eine Anfrage wurde begonnen. Bitte mit derselben Vorgangsnummer fortsetzen, bevor du den Warenkorb änderst.",
                systemImage: "arrow.triangle.2.circlepath"
              ).font(.callout)
            }
            totalRow("Getränke inkl. MwSt.", shop.totals.goods)
            totalRow("Pfand", shop.totals.deposit)
            totalRow("Gesamt", shop.totals.total).fontWeight(.bold)
            Text(
              "\(shop.totals.crates) von mindestens 4 Kisten. Der Lieferservice bestätigt den Termin persönlich."
            ).font(.caption).foregroundStyle(.secondary)
            if shop.totals.unknownDeposit {
              Text("Bei einem Artikel fehlt der Pfandbetrag. Bitte den Markt kontaktieren.")
                .foregroundStyle(.orange)
            }
            if shop.totals.missingArticles {
              Text("Bitte nicht mehr verfügbare Artikel aus dem Warenkorb entfernen.")
                .foregroundStyle(.orange)
            }
          }
          Section {
            Button {
              let w = WebWorkspace(mode: "customer", path: "/app/bestellen")
              w.checkout = { shop.checkout }
              w.pendingCheckout = { shop.pending }
              w.submitting = { shop.begin($0) }
              w.rejected = { shop.rejected($0) }
              w.completed = { id, number in shop.completed(request: id, number: number) }
              checkout = w
            } label: {
              Text(shop.pending ? "Bestellvorgang fortsetzen" : "Zur Lieferanfrage").fontWeight(
                .bold
              ).frame(maxWidth: .infinity).padding(8)
            }.buttonStyle(.borderedProminent).disabled(
              (!shop.pending && !shop.totals.canCheckout) || !connection.online
            ).accessibilityIdentifier("customer-checkout")
            Text(
              "Im nächsten Schritt: Kontaktdaten, einzelne Adressfelder und Bestätigung. Es wird noch nichts abgesendet."
            ).font(.caption).foregroundStyle(.secondary)
          }
        }
      }.navigationTitle("Warenkorb").scrollContentBackground(.hidden).background(
        AppConfig.background
      )
      .sheet(item: $checkout) { workspace in
        NavigationStack {
          WorkspaceView(workspace: workspace).navigationTitle("Lieferanfrage")
            .navigationBarTitleDisplayMode(.inline).toolbar {
              ToolbarItem(placement: .topBarLeading) { Button("Schließen") { checkout = nil } }
            }
        }.interactiveDismissDisabled()
      }
    }
  }
  private func totalRow(_ label: String, _ cents: Int) -> some View {
    HStack {
      Text(label)
      Spacer()
      Text(Money.euro(cents))
    }
  }
}
struct StoreView: View {
  @State private var page: WebWorkspace?
  var body: some View {
    NavigationStack {
      List {
        Section {
          BrandHeader()
          Text("Gute Getränke.\nGute Nachbarschaft.").font(.title.bold())
          Text("Wartbergstraße 3\n74076 Heilbronn")
        }
        Section("Persönlich für dich da") {
          Link(destination: URL(string: "tel:+4971317975225")!) {
            Label("07131 / 797 52 25", systemImage: "phone")
          }
          Link(destination: URL(string: "mailto:info@getraenke-elias.de")!) {
            Label("E-Mail an den Markt", systemImage: "envelope")
          }
          Link(
            destination: URL(
              string:
                "https://maps.apple.com/?q=Getr%C3%A4nke+Elias&address=Wartbergstra%C3%9Fe+3,74076+Heilbronn"
            )!
          ) { Label("Route planen", systemImage: "location") }
        }
        Section {
          webButton("Öffnungszeiten & Kontakt", path: "/kontakt", icon: "clock")
          webButton("Lieferservice", path: "/lieferservice", icon: "truck.box")
          webButton("Datenschutz", path: "/datenschutz", icon: "hand.raised")
          webButton("Impressum", path: "/impressum", icon: "info.circle")
        }
        Section {
          Text(
            "Elias Kunden-App · 0.1\nBestellungen, Konto und Lieferabos nutzen dasselbe Elias-System."
          ).font(.caption).foregroundStyle(.secondary)
        }
      }.navigationTitle("Dein Markt").scrollContentBackground(.hidden).background(
        AppConfig.background
      )
      .sheet(item: $page) { workspace in
        NavigationStack {
          WorkspaceView(workspace: workspace).toolbar { Button("Schließen") { page = nil } }
        }
      }
    }
  }
  private func webButton(_ title: String, path: String, icon: String) -> some View {
    Button {
      page = WebWorkspace(mode: "customer", path: path)
    } label: {
      Label(title, systemImage: icon)
    }
  }
}
