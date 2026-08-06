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
