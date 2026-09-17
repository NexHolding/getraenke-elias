import test from "node:test";
import assert from "node:assert/strict";
import {
  printerOrigin,
  printerEndpoint,
  monochromeRaster,
  soapPrint,
  epsonStatus,
} from "../lib/epson";
test("Epson endpoint only accepts explicit HTTPS origin and safe device ID", () => {
  assert.equal(
    printerOrigin("https://printer.test:8443/"),
    "https://printer.test:8443",
  );
  assert.match(
    printerEndpoint({ printer_address: "https://192.168.1.55" }),
    /service.cgi\?devid=local_printer&timeout=60000$/,
  );
  for (const address of [
    "http://printer.test",
    "https://u:p@printer.test",
    "https://printer.test/path",
    "https://printer.test/?x=1",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => printerOrigin(address));
  }
  assert.throws(() =>
    printerEndpoint({
      printer_address: "https://printer.test",
      printer_device_id: 'x"<',
    }),
  );
});
test("Epson raster uses black=1, high bit first, independent padded rows and white alpha", () => {
  const rgba = new Uint8ClampedArray(9 * 2 * 4).fill(255);
  for (const pixel of [0, 8, 9]) {
    rgba[pixel * 4] = 0;
    rgba[pixel * 4 + 1] = 0;
    rgba[pixel * 4 + 2] = 0;
  }
  assert.deepEqual([...monochromeRaster(rgba, 9, 2)], [128, 128, 128, 0]);
  rgba[3] = 0;
  assert.deepEqual([...monochromeRaster(rgba, 9, 2)], [0, 128, 128, 0]);
  assert.throws(() => monochromeRaster(rgba, 8, 2));
});
test("Empty SOAP probe has no image/feed/cut and queued/offline/malformed responses never confirm print", () => {
  assert.doesNotMatch(soapPrint(""), /<(image|feed|cut)/);
  assert.equal(epsonStatus("true", "", "2").nearEnd, false);
  assert.equal(epsonStatus("1", "", "131074").nearEnd, true);
  for (const [success, code, status] of [
    ["true", "JobSpooling", "2"],
    ["false", "EPTR_PAPER_EMPTY", "524288"],
    ["true", "", "8"],
    ["true", "", null],
    ["true", "", "invalid"],
  ])
    assert.throws(() => epsonStatus(success, code, status));
});

test("light logo colours retain visible dots instead of disappearing", () => {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 210;
    pixels[i + 1] = 220;
    pixels[i + 2] = 170;
    pixels[i + 3] = 255;
  }
  const raster = monochromeRaster(pixels, 8, 8);
  assert.ok(raster.some((x) => x > 0));
  assert.ok(raster.every((x) => x < 255));
});
