import SwiftUI

#if POS_APP
  @main struct EliasPOSApp: App {
    var body: some Scene { WindowGroup { POSRoot().tint(AppConfig.accent) } }
  }
#endif
struct POSRoot: View {
  @StateObject private var workspace = WebWorkspace(mode: "pos", path: "/kassenzugang")
  @StateObject private var connection = ConnectionMonitor()
  @Environment(\.scenePhase) private var scenePhase
  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        if !connection.online { OfflineBanner() }
        WorkspaceView(workspace: workspace)
      }
      .navigationTitle("Elias Kasse").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Image("Logo").resizable().scaledToFit().frame(width: 112, height: 36).accessibilityLabel(
            "Getränke Elias")
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
          Button {
            workspace.showScanner = true
          } label: {
            Label("Scannen", systemImage: "barcode.viewfinder")
          }.accessibilityIdentifier("pos-scan")
          Button {
            workspace.showPrinter = true
          } label: {
            Label("Drucker", systemImage: "printer")
          }.accessibilityIdentifier("pos-printer")
        }
      }
      .toolbar(workspace.registerVisible ? .hidden : .visible, for: .navigationBar)
      .statusBarHidden(workspace.registerVisible)
      .sheet(isPresented: $workspace.showScanner) {
        BarcodeScanner { value in
          workspace.showScanner = false
          workspace.scan(value)
        }
      }
      .sheet(isPresented: $workspace.showPrinter) { PrinterSettings() }
      .overlay {
        if scenePhase != .active {
          AppConfig.background.ignoresSafeArea().overlay(
            VStack {
              Image("Logo").resizable().scaledToFit().frame(width: 220)
              Label("Arbeitsplatz geschützt", systemImage: "lock.fill").padding()
            })
        }
      }
    }
  }
}
struct PrinterSettings: View {
  @Environment(\.dismiss) private var dismiss
  @State private var address = UserDefaults.standard.string(forKey: "elias.printer.origin") ?? ""
  @State private var saved = false
  @State private var error: String?
  var body: some View {
    NavigationStack {
      Form {
        Section("1 · Epson TM-m30II verbinden") {
          Text(
            "Den Epson TM-m30II per LAN mit dem Router verbinden und das iPad Pro im selben Netzwerk anmelden. ePOS-Print und HTTPS in der Epson Web Config aktivieren. Bei einer WLAN-Variante kann auch der Drucker über WLAN verbunden werden."
          )
          Text(
            "Ein vertrauenswürdiges Druckerzertifikat ist erforderlich. Die App umgeht keine Zertifikatsprüfung."
          ).font(.caption).foregroundStyle(.secondary)
        }
        Section("2 · Drucker für dieses iPad freigeben") {
          TextField("https://192.168.1.20", text: $address).textInputAutocapitalization(.never)
            .autocorrectionDisabled().keyboardType(.URL).accessibilityIdentifier("printer-address")
          Text(
            "Lokale IPv4-Adresse oder .local-Name. Genau dieselbe HTTPS-Adresse anschließend im CRM eintragen."
          ).font(.caption)
          Button("Druckeradresse speichern") {
            guard
              let url = NavigationPolicy.approvedPrinterOrigin(
                address.trimmingCharacters(in: .whitespacesAndNewlines))
            else {
              error = "Bitte eine lokale HTTPS-Adresse ohne Pfad eingeben."
              return
            }
            UserDefaults.standard.set(url.absoluteString, forKey: "elias.printer.origin")
            saved = true
            error = nil
          }.accessibilityIdentifier("printer-save")
          if saved {
            Label(
              "Adresse gespeichert. Verbindung noch nicht getestet.",
              systemImage: "checkmark.circle"
            ).foregroundStyle(.green)
          }
          if let error { Text(error).foregroundStyle(.red) }
        }
        Section("3 · Einrichtung im CRM abschließen") {
          Text(
            "Einstellungen → Bondrucker öffnen. Modell, Gerätekennung und Papierbreite wählen, Verbindung testen und Testbon drucken. Erst danach den Drucker im Assistenten bestätigen."
          )
          Text(
            "Der native Anschluss übernimmt den vorhandenen ePOS-Druckauftrag und meldet die Druckerantwort an das Belegprotokoll zurück. Unklare Druckaufträge werden nicht automatisch wiederholt."
          ).font(.caption).foregroundStyle(.secondary)
        }
        Section("Weitere Anschlüsse") {
          Text(
            "Diese App verwendet den Netzwerkanschluss des TM-m30II. Bluetooth und USB sind in dieser Version nicht eingebunden. Vor dem ersten Verkauf Verbindungstest und Testbon im CRM durchführen."
          ).font(.callout)
        }
      }.navigationTitle("Epson einrichten").navigationBarTitleDisplayMode(.inline).toolbar {
        Button("Fertig") { dismiss() }
      }
    }
  }
}
