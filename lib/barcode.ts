/**
 * Code 128 encoder.
 *
 * WHY CODE 128 AND NOT UPC-A
 * --------------------------
 * The seeded barcodes look like UPCs - twelve digits, "930000000011" - but
 * they are not valid ones. UPC-A's twelfth digit is a check digit over the
 * first eleven, and for that value it would have to be 7. A real scanner
 * computes that check and REJECTS the symbol, so rendering these as UPC-A
 * would produce barcodes that photograph well and refuse to scan. The
 * alternative - silently correcting the check digit - would print a barcode
 * whose digits are not the digits in Nash, which is worse: the gate would
 * report a wrong item and be right.
 *
 * Code 128 carries an arbitrary string with its own internal checksum, so what
 * is scanned back is exactly what is stored. It is also what store shelf-edge
 * labels and picking totes actually use, so this is not a demo compromise.
 *
 * WHY NOT A LIBRARY
 * -----------------
 * The whole encoder is one lookup table and a modulo-103 sum. A dependency
 * here would be more code to audit than the code it replaces, and it would sit
 * in the one place a bug is invisible: a barcode that is subtly wrong still
 * looks like a barcode.
 */

/**
 * The 107 Code 128 symbols as bar/space run lengths.
 *
 * Each entry reads bar, space, bar, space, bar, space and sums to 11 modules.
 * The last one is the stop pattern, which is seven runs and 13 modules - that
 * asymmetry is what lets a scanner tell which end it read from.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

/**
 * The symbol values for a string, start symbol first, checksum last.
 *
 * Subset C packs two digits into one symbol, which halves the width of a
 * twelve-digit code. A narrower symbol is a symbol a camera resolves from
 * further away, which is the whole difference between a barcode that scans off
 * a screen and one that does not. Anything that is not an even-length run of
 * digits falls back to subset B, one symbol per character.
 */
export function symbolsFor(value: string): number[] {
  const digitsOnly = /^\d+$/.test(value) && value.length % 2 === 0;

  const start = digitsOnly ? START_C : START_B;
  const data: number[] = [];

  if (digitsOnly) {
    for (let i = 0; i < value.length; i += 2) {
      data.push(Number(value.slice(i, i + 2)));
    }
  } else {
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      // Subset B covers printable ASCII. Anything else has no representation
      // here, and a substituted character would encode a different barcode.
      if (code < 32 || code > 126) {
        throw new Error(`Code 128 subset B cannot encode ${JSON.stringify(ch)}`);
      }
      data.push(code - 32);
    }
  }

  // Weighted modulo-103 sum, positions starting at 1 for the first data
  // symbol. The start symbol contributes its own value at weight 1.
  let sum = start;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });

  return [start, ...data, sum % 103, STOP];
}

export type Barcode = {
  /** Black bars only, positioned in modules. Spaces are the gaps between. */
  bars: { x: number; width: number }[];
  /** Total width in modules, including the quiet zone at both ends. */
  width: number;
};

/**
 * @param quiet Modules of clear space each side. Ten is the Code 128 minimum
 *   and it is not decoration - a scanner uses it to find the symbol's edge, so
 *   a barcode butted against other ink is a barcode that does not read.
 */
export function code128(value: string, quiet = 10): Barcode {
  if (value === "") throw new Error("Code 128 cannot encode an empty string");

  const bars: { x: number; width: number }[] = [];
  let x = quiet;

  for (const symbol of symbolsFor(value)) {
    const runs = PATTERNS[symbol];
    for (let i = 0; i < runs.length; i++) {
      const width = Number(runs[i]);
      // Runs alternate bar, space, bar, space... starting with a bar.
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }

  return { bars, width: x + quiet };
}
