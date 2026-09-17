import AVFoundation
import SwiftUI
import VisionKit

struct BarcodeScanner: View {
  @Environment(\.dismiss) private var dismiss
  @State private var allowed = false
  @State private var message: String?
  let onScan: (String) -> Void
  var body: some View {
    NavigationStack {
      Group {
        if allowed && DataScannerViewController.isSupported && DataScannerViewController.isAvailable
        {
          ScannerSurface(
            onScan: onScan,
            onFailure: {
              message =
                "Kamera konnte nicht gestartet werden. Bitte erneut versuchen oder Barcode manuell eingeben."
              allowed = false
            })
        } else {
          ContentUnavailableView(
            "Barcode scannen", systemImage: "barcode.viewfinder",
            description: Text(message ?? "Kamera wird vorbereitet …"))
        }
      }.navigationTitle("Artikel scannen").navigationBarTitleDisplayMode(.inline).toolbar {
        Button("Schließen") { dismiss() }
      }
      .task {
        guard DataScannerViewController.isSupported else {
          message =
            "Die Kameraerkennung ist auf diesem Gerät nicht verfügbar. Barcode in der Kassensuche eingeben oder einen Tastatur-Scanner verwenden."
          return
        }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .authorized {
          allowed = true
        } else if status == .notDetermined {
          allowed = await AVCaptureDevice.requestAccess(for: .video)
        }
        if !allowed {
          message =
            "Bitte den Kamerazugriff in den iPad-Einstellungen für Elias Kasse erlauben. Alternativ kannst du den Barcode in der Kassensuche eingeben."
        } else if !DataScannerViewController.isAvailable {
          message = "Die Kamera ist gerade nicht verfügbar. Bitte später erneut versuchen."
        }
      }
    }
  }
}
private struct ScannerSurface: UIViewControllerRepresentable {
  let onScan: (String) -> Void
  let onFailure: () -> Void
  func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan, onFailure: onFailure) }
  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [
        .barcode(symbologies: [.ean8, .ean13, .upce, .code128, .code39, .itf14])
      ], qualityLevel: .balanced, recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true, isGuidanceEnabled: true,
      isHighlightingEnabled: true)
    scanner.delegate = context.coordinator
    do { try scanner.startScanning() } catch { Task { @MainActor in onFailure() } }
    return scanner
  }
  func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}
  static func dismantleUIViewController(
    _ uiViewController: DataScannerViewController, coordinator: Coordinator
  ) { uiViewController.stopScanning() }
  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let onScan: (String) -> Void
    var delivered = false
    let onFailure: () -> Void
    init(onScan: @escaping (String) -> Void, onFailure: @escaping () -> Void) {
      self.onScan = onScan
      self.onFailure = onFailure
    }
    func dataScanner(
      _ dataScanner: DataScannerViewController,
      becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
    ) { onFailure() }
    func dataScanner(
      _ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      guard !delivered else { return }
      for item in addedItems {
        if case .barcode(let barcode) = item, let value = barcode.payloadStringValue,
          value.count <= 80
        {
          delivered = true
          dataScanner.stopScanning()
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          onScan(value)
          break
        }
      }
    }
  }
}
