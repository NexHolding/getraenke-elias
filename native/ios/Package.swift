// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "EliasCore", platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "EliasCore", targets: ["EliasCore"])],
  targets: [
    .target(name: "EliasCore", path: "Sources/Core"),
    .testTarget(
      name: "EliasCoreTests", dependencies: ["EliasCore"], path: "Tests",
      exclude: ["AppUITests.swift"]),
  ])
