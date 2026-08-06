"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Camera scanning, for a store that has no handheld.
 *
 * WHERE THIS SITS IN THE DESIGN
 * -----------------------------
 * The keyboard-wedge input is still the primary path and still the right one:
 * a Zebra or Honeywell types digits and sends Enter, so a focused input IS the
 * production mechanism. This is the path for the other store - the one issuing
 * phones instead of handhelds - and it deliberately resolves into the SAME
 * verification the wedge drives. Nothing downstream can tell which one read
 * the code, which is the property that makes it worth shipping rather than a
 * second way for the gate to be wrong.
 *
 * WHY NO LIBRARY
 * --------------
 * `BarcodeDetector` is native, hardware-accelerated, and on this platform it
 * is backed by the OS vision framework. A bundled decoder would be hundreds of
 * kilobytes shipped to a picker on store wifi to do worse.
 *
 * The cost is honest and it is the reason the wedge stays primary: the API is
 * absent in Safari and on desktop Linux. So support is detected rather than
 * assumed, and when it is missing this renders nothing at all rather than a
 * button that fails after the picker has committed to using it.
 *
 * The format list is wider than the catalog needs on purpose. Scanning a real
 * product from a real shelf gets a real EAN-13, which is not in this store's
 * catalog, and the gate says exactly that - "not in this store's catalog" is a
 * true and useful answer, and it is a better demonstration than refusing to
 * read the symbol at all.
 */

type DetectedBarcode = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type DetectorCtor = {
  new (init?: { formats?: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "upc_e",
  "code_39",
  "code_93",
  "itf",
];

/** How often to look at a frame. Fast enough to feel instant, slow enough
 *  that the decode is not competing with the video for the main thread. */
const INTERVAL_MS = 120;

const ctor = (): DetectorCtor | null =>
  typeof window !== "undefined" &&
  "BarcodeDetector" in window &&
  typeof navigator.mediaDevices?.getUserMedia === "function"
    ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
    : null;

/** Support never changes within a session, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

export function ScanCamera({ onDetect }: { onDetect: (code: string) => void }) {
  // Read through useSyncExternalStore rather than an effect, because the
  // answer differs between the server pass (no window, so false) and the
  // client one. Computing it during render directly would be a hydration
  // mismatch; setting it in an effect would render a frame without the button
  // and then pop it in.
  const supported = useSyncExternalStore(
    noSubscribe,
    () => ctor() !== null,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // A detection while the stream is tearing down would fire onDetect against
  // an item the picker has already moved past.
  const liveRef = useRef(false);

  const stop = useCallback(() => {
    liveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  // The camera light staying on after the picker navigates away is the single
  // most alarming thing this component could do.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    const Detector = ctor();
    if (!Detector) return;

    setError(null);
    setOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera on a phone; ignored on a laptop, which has one.
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      liveRef.current = true;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new Detector({ formats: FORMATS });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const tick = async () => {
        if (!liveRef.current || !ctx || !videoRef.current) return;

        const v = videoRef.current;
        if (v.videoWidth > 0) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          try {
            const found = await detector.detect(canvas);
            // Two symbols in frame is ambiguous - on the shelf sheet the
            // neighbouring label is often half in shot - and guessing which
            // one the picker meant is exactly the wrong call for a gate.
            if (found.length === 1 && liveRef.current) {
              const code = found[0].rawValue;
              stop();
              onDetect(code);
              return;
            }
          } catch {
            // A frame that fails to decode is the normal case, not an error.
          }
        }

        if (liveRef.current) setTimeout(tick, INTERVAL_MS);
      };

      void tick();
    } catch (e) {
      // Denied permission, no camera, or a device already in use. All three
      // are recoverable by using the input above, so say so and get out of
      // the way rather than blocking the pick.
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera permission denied. Type or paste the barcode instead."
          : `Camera unavailable: ${(e as Error).message}`,
      );
      stop();
    }
  }, [onDetect, stop]);

  // Rendering a disabled button on a browser without the API would be a
  // promise the page cannot keep. The wedge input above is already the answer.
  if (!supported) return null;

  if (!open) {
    return (
      <div className="mt-3">
        <button
          onClick={start}
          className="min-h-[44px] w-full rounded-lg border border-white/25 text-[13px] font-semibold text-white/75 active:bg-white/10"
        >
          Scan with camera
        </button>
        {error && <p className="mt-2 text-[12px] text-[#f0b429]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-[#c9ff00]/40">
      <div className="relative bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="block h-56 w-full object-cover"
        />
        {/* An aiming frame, because a picker holding a phone needs to know
            where the camera is looking before it reads anything. */}
        <div className="pointer-events-none absolute inset-x-8 inset-y-16 rounded-lg border-2 border-[#c9ff00]/70" />
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="text-[12px] text-white/55">Hold a barcode in the frame</p>
        <button
          onClick={stop}
          className="min-h-[36px] shrink-0 rounded px-3 text-[12px] font-semibold text-white/70 active:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
