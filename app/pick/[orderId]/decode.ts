/**
 * One decode call, two implementations underneath.
 *
 * `BarcodeDetector` is native, hardware-accelerated and free. It is also
 * absent from Safari and Firefox, which between them are most of the phones an
 * audience is holding and every iPhone in a store. A gate that only works on
 * Chrome is not a gate.
 *
 * So the native path is used when it exists and ZXing is loaded on demand when
 * it does not. The import is dynamic on purpose: a browser with the native API
 * never downloads the decoder, and the picker on store wifi pays nothing for a
 * fallback they do not need.
 *
 * Both paths return the same thing - a string or null - so the scan gate has
 * no idea which one ran, and there is no second code path for a wrong scan to
 * behave differently in.
 */

/** Formats worth trying. Wider than this store's catalog on purpose: a real
 *  product scans to a real EAN-13, and "not in this store's catalog" is a
 *  true answer that proves the read was genuine. */
const NATIVE_FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_39",
  "code_93",
  "itf",
];

type DetectedBarcode = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type DetectorCtor = { new (init?: { formats?: string[] }): Detector };

const nativeCtor = (): DetectorCtor | null =>
  typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
    : null;

export const hasCamera = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

export type Decoder = (canvas: HTMLCanvasElement) => Promise<string | null>;

/** Native first, ZXing second. Built once and reused - constructing a reader
 *  per frame would rebuild its format tables thirty times a second. */
export async function makeDecoder(): Promise<Decoder> {
  const Native = nativeCtor();

  if (Native) {
    const detector = new Native({ formats: NATIVE_FORMATS });
    return async (canvas) => {
      const found = await detector.detect(canvas);
      // Two symbols in frame is ambiguous - on the shelf sheet a neighbouring
      // label is often half in shot - and guessing which one the picker meant
      // is exactly the wrong call for a verification gate.
      return found.length === 1 ? found[0].rawValue : null;
    };
  }

  const {
    MultiFormatReader,
    BinaryBitmap,
    HybridBinarizer,
    RGBLuminanceSource,
    DecodeHintType,
    BarcodeFormat,
  } = await import("@zxing/library");

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
  ]);
  // Without this a barcode has to be square-on and centred. With it, a photo
  // taken at arm's length by someone who is not concentrating still reads.
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new MultiFormatReader();
  // Hints set once, then decodeWithState per frame. The alternative rebuilds
  // every format's reader on every frame, which on a phone is the difference
  // between a viewfinder and a slideshow.
  reader.setHints(hints);

  return async (canvas) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    try {
      const source = new RGBLuminanceSource(grey(data, width, height), width, height);
      return reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source)))
        .getText();
    } catch {
      // NotFoundException. No symbol in this frame is the normal case while
      // aiming, not an error worth surfacing.
      return null;
    }
  };
}

/**
 * RGBA to one luminance byte per pixel.
 *
 * Done here rather than handed to RGBLuminanceSource raw, because that class
 * takes EITHER packed ARGB integers or an array that is already one byte per
 * pixel - and canvas data is neither. Passing it straight through type-checks
 * and returns garbage, which on a scanner reads as "it just doesn't work very
 * well" rather than as a bug.
 *
 * The weights are green-favouring, matching what ZXing does internally: human
 * luminance perception is mostly green, and barcode contrast follows it.
 */
function grey(data: Uint8ClampedArray, width: number, height: number) {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (data[p] + 2 * data[p + 1] + data[p + 2]) / 4;
  }
  return out;
}
