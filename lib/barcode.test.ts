import { test } from "node:test";
import assert from "node:assert/strict";
import { code128, symbolsFor } from "./barcode.ts";

/**
 * A wrong barcode still looks like a barcode. There is no visual review that
 * catches a bad checksum or a dropped module, so the encoder needs tests that
 * check the arithmetic rather than the appearance.
 *
 * The end-to-end check is separate and better: render one and ask a real
 * decoder to read it back. These tests exist so that when that fails, the
 * cause is narrowed before anyone opens a camera.
 */

test("the checksum is the weighted modulo-103 sum, start symbol included", () => {
  // Subset C: start 105, one data symbol 12 at weight 1.
  // 105 + 12 = 117, and 117 mod 103 = 14.
  assert.deepEqual(symbolsFor("12"), [105, 12, 14, 106]);
});

test("a seeded twelve-digit barcode encodes as six subset-C pairs", () => {
  // 105 + 93·1 + 0·2 + 0·3 + 0·4 + 0·5 + 11·6 = 264, and 264 mod 103 = 58.
  assert.deepEqual(
    symbolsFor("930000000011"),
    [105, 93, 0, 0, 0, 0, 11, 58, 106],
  );
});

test("odd-length digits fall back to subset B rather than dropping one", () => {
  // Subset C consumes digits in pairs, so an odd count cannot use it. The
  // failure mode worth preventing is a silent truncation to an even length.
  const symbols = symbolsFor("123");
  assert.equal(symbols[0], 104);
  // "1", "2", "3" are ASCII 49, 50, 51, so subset B values 17, 18, 19.
  assert.deepEqual(symbols.slice(1, 4), [17, 18, 19]);
});

test("subset C is chosen for even digits, and it is half the width", () => {
  const packed = code128("930000000011");
  const perCharacter = code128("93000000001x");

  assert.equal(symbolsFor("930000000011")[0], 105);
  assert.ok(
    packed.width < perCharacter.width,
    "pairing digits must produce a narrower symbol, which is the point of it",
  );
});

test("a character subset B cannot represent is refused, not substituted", () => {
  // Encoding a replacement character would produce a barcode that scans
  // cleanly as the wrong value - the one failure the gate cannot detect.
  assert.throws(() => code128("café"), /cannot encode/);
  assert.throws(() => code128(""), /empty/);
});

test("every run is one to four modules, which is the format's whole alphabet", () => {
  const { bars } = code128("930000000011");
  for (const b of bars) {
    assert.ok(b.width >= 1 && b.width <= 4, `bar width ${b.width} is not legal`);
  }
});

test("bars advance strictly and never overlap", () => {
  const { bars, width } = code128("930000000011");
  let cursor = 0;
  for (const b of bars) {
    assert.ok(b.x >= cursor, "a bar started before the previous one ended");
    cursor = b.x + b.width;
  }
  assert.ok(cursor <= width, "the last bar ran past the stated width");
});

test("the quiet zone is real space at both ends, not a rounding artefact", () => {
  // A scanner finds the symbol's edge by the clear space around it. Ten
  // modules is the minimum, and a barcode butted against other ink is one
  // that will not read.
  const { bars, width } = code128("930000000011", 10);
  assert.equal(bars[0].x, 10);
  const last = bars[bars.length - 1];
  assert.equal(width - (last.x + last.width), 10);
});

test("the symbol is start, data, checksum, stop - in that order", () => {
  const symbols = symbolsFor("930000000011");
  assert.equal(symbols.at(0), 105, "start C");
  assert.equal(symbols.at(-1), 106, "stop");
  assert.equal(symbols.length, 1 + 6 + 1 + 1);
});

/**
 * ENCODER AND FALLBACK DECODER, AGREEING.
 *
 * The scan gate has two decoders under it: the browser's native
 * BarcodeDetector, and ZXing for Safari and Firefox where the native one does
 * not exist. The native path was verified against these same symbols in a real
 * browser. This covers the other one, and it runs in CI rather than needing
 * someone to remember.
 *
 * It rasterises the bars into pixels and decodes them, so an off-by-one in a
 * run length or a wrong checksum shows up as a failed decode - which is the
 * only way to catch it, because a wrong barcode still looks like a barcode.
 */

/** The symbol as one luminance byte per pixel: black bars on white. */
function raster(value: string, module = 3, height = 40) {
  const { bars, width } = code128(value);
  const w = width * module;
  const pixels = new Uint8ClampedArray(w * height).fill(255);

  for (const bar of bars) {
    for (let x = bar.x * module; x < (bar.x + bar.width) * module; x++) {
      for (let y = 0; y < height; y++) pixels[y * w + x] = 0;
    }
  }

  return { pixels, width: w, height };
}

test("ZXing reads back exactly what the encoder wrote", async () => {
  const {
    MultiFormatReader,
    BinaryBitmap,
    HybridBinarizer,
    RGBLuminanceSource,
    DecodeHintType,
    BarcodeFormat,
  } = await import("@zxing/library");

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);

  // Every seeded barcode, plus the awkward cases: odd length forces subset B,
  // and a non-digit string exercises it end to end.
  const values = [
    "930000000011", "930000000028", "930000001005", "930000001012",
    "930000001029", "930000002002", "930000002019", "930000002026",
    "930000002033", "930000003009", "930000003016", "930000003023",
    "930000004003", "930000005006",
    "12345", "PRD-BAN-001",
  ];

  for (const value of values) {
    const { pixels, width, height } = raster(value);
    const source = new RGBLuminanceSource(pixels, width, height);
    const result = reader.decodeWithState(
      new BinaryBitmap(new HybridBinarizer(source)),
    );
    assert.equal(result.getText(), value, `round trip failed for ${value}`);
  }
});
