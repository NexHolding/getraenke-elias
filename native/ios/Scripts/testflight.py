#!/usr/bin/env python3
"""Archive and optionally upload Elias apps using the Apple account in Xcode.

No credentials are embedded. App Store Connect app records must exist first.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import plistlib
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--app", choices=["customer", "pos", "both"], default="both")
parser.add_argument("--team-id", help="Apple Developer Program team ID, not Personal Team")
parser.add_argument("--build-number", required=True, type=int)
parser.add_argument("--upload", action="store_true", help="Upload signed archives to App Store Connect")
parser.add_argument("--unsigned", action="store_true", help="Local archive preflight only; cannot upload")
args = parser.parse_args()
if args.build_number < 1:
    parser.error("Build number must be positive")
if args.unsigned and args.upload:
    parser.error("Unsigned archives cannot be uploaded")
if not args.unsigned and not re.fullmatch(r"[A-Z0-9]{10}", args.team_id or ""):
    parser.error("Signed archives require a 10-character --team-id")

root = Path(__file__).resolve().parents[1]
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
output = root.parents[1] / "output" / "ios" / f"testflight-{args.build_number}-{stamp}"
output.mkdir(parents=True, exist_ok=False)
schemes = {"customer": "EliasCustomer", "pos": "EliasPOS"}
selected = schemes.values() if args.app == "both" else [schemes[args.app]]

def run(command, log):
    print(f"Running {command[0]} · log: {log}", flush=True)
    with log.open("w") as stream:
        result = subprocess.run(command, cwd=root, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(f"Failed ({result.returncode}); inspect {log}. No automatic retry.")

for scheme in selected:
    archive = output / f"{scheme}.xcarchive"
    command = ["xcodebuild", "-project", str(root / "EliasApps.xcodeproj"), "-scheme", scheme,
               "-configuration", "Release", "-destination", "generic/platform=iOS",
               "-archivePath", str(archive), "-derivedDataPath", str(output / f"{scheme}-DerivedData"),
               f"CURRENT_PROJECT_VERSION={args.build_number}", "archive"]
    if args.unsigned:
        command.append("CODE_SIGNING_ALLOWED=NO")
    else:
        command.extend([f"DEVELOPMENT_TEAM={args.team_id}", "CODE_SIGN_STYLE=Automatic", "-allowProvisioningUpdates"])
    run(command, output / f"{scheme}-archive.log")
    if args.upload:
        options = output / f"{scheme}-ExportOptions.plist"
        with options.open("wb") as stream:
            plistlib.dump({"method": "app-store-connect", "destination": "upload",
                          "teamID": args.team_id, "signingStyle": "automatic",
                          "uploadSymbols": True, "manageAppVersionAndBuildNumber": False}, stream)
        run(["xcodebuild", "-exportArchive", "-archivePath", str(archive),
             "-exportOptionsPlist", str(options), "-exportPath", str(output / f"{scheme}-export"),
             "-allowProvisioningUpdates"], output / f"{scheme}-upload.log")
        print(f"{scheme}: upload command succeeded. Verify processing in App Store Connect.", flush=True)
    else:
        print(f"{scheme}: archive created; NOT uploaded.", flush=True)
print(f"Artifacts: {output}")
