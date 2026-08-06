"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { hasCamera, makeDecoder, type Decoder } from "./decode";

/**
 * Optical scanning, for a store that has no handheld.
 *
 * WHERE THIS SITS IN THE DESIGN
 * -----------------------------
 * The keyboard-wedge input above is still the primary path and still the right
 * one: a Zebra or Honeywell types digits and sends Enter, so a focused input IS
 * the production mechanism, and it costs no permission, no HTTPS and no
 * lighting. This is the path for the other store - the one issuing phones -
 * and it deliberately resolves into the SAME verification the wedge drives.
 * Nothing downstream can tell which one read the code, which is the property
 * that makes it worth shipping rather than a second way for the gate to be
 * wrong.
 *
 * ONE BUTTON, NOT TWO
 * -------------------
 * A "take a photo" path was here briefly and has been removed. It round-trips
 * through the OS camera app for every item, which is slower than live video on
 * exactly the repetitive task this screen exists to speed up, and it earned
 * its place only against failures already covered three other ways: type the
 * barcode, choose the item off the shelf list, or record it unverified. A
 * fourth escape hatch on a screen whose rule is one decision at a time is cost
 * without cover.
 *
 * Nothing is offered at all when the camera is unreachable. A button that
 * fails after the picker has committed to using it is worse than no button.
 */

/** How often to look at a frame while the camera is live. Fast enough to feel
 *  instant, slow enough that decoding is not fighting the video for the main
 *  thread on a mid-range phone. */
const INTERVAL_MS = 120;

/** Camera support never changes within a session - nothing to subscribe to. */
const noSubscribe = () => () => {};

export function ScanCamera({ onDetect }: { onDetect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read through useSyncExternalStore because the answer differs between the
  // server pass (no navigator, so false) and the client one. Computing it in
  // render would be a hydration mismatch; setting it in an effect would render
  // a frame without the button and then pop it in.
  const liveAvailable = useSyncExternalStore(noSubscribe, hasCamera, () => false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Decoder | null>(null);
  // A detection that lands while the stream is tearing down would fire against
  // an item the picker has already moved past.
  const liveRef = useRef(false);

  /** Built once and cached. On the fallback path this is also what triggers
   *  the decoder download, so it happens on the tap rather than on page load. */
  const decoder = useCallback(async () => {
    decoderRef.current ??= await makeDecoder();
    return decoderRef.current;
  }, []);

  const stop = useCallback(() => {
    liveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  // The camera light staying on after the picker navigates away is the single
  // most alarming thing this component could do.
  useEffect(() => stop, [stop]);

  const startLive = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const decode = await decoder();
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera on a phone; ignored on a laptop, which has one.
        video: { facingMode: { ideal: "environment" } },
      });

      streamRef.current = stream;
      liveRef.current = true;
      setOpen(true);
      setBusy(false);

      // The video element only exists once `open` has rendered it.
      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const tick = async () => {
        if (!liveRef.current || !ctx || !videoRef.current) return;
        const v = videoRef.current;

        if (v.videoWidth > 0) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const code = await decode(canvas).catch(() => null);
          if (code && liveRef.current) {
            stop();
            onDetect(code);
            return;
          }
        }

        if (liveRef.current) setTimeout(tick, INTERVAL_MS);
      };

      void tick();
    } catch (e) {
      // Denied permission, no camera, or a device already in use. All three
      // are recoverable with the input above, so say so and get out of the way
      // rather than blocking the pick.
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera permission denied. Type the barcode instead."
          : `Camera unavailable: ${(e as Error).message}`,
      );
      setBusy(false);
      stop();
    }
  }, [decoder, onDetect, stop]);

  if (open) {
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
          <p className="text-[12px] text-white/55">
            Hold a barcode in the frame
          </p>
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

  // No camera on this device means no button. The wedge input above already
  // covers it, and an offer that cannot be honoured is worse than no offer.
  if (!liveAvailable) return null;

  return (
    <div className="mt-3">
      <button
        onClick={startLive}
        disabled={busy}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/25 text-[13px] font-semibold text-white/75 disabled:opacity-40 active:bg-white/10"
      >
        <CameraIcon />
        {busy ? "Starting camera\u2026" : "Scan with camera"}
      </button>
      {error && <p className="mt-2 text-[12px] text-[#f0b429]">{error}</p>}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1 1 0 0 0 .84-.46l.72-1.1A1 1 0 0 1 9.1 4h5.8a1 1 0 0 1 .84.45l.72 1.1a1 1 0 0 0 .84.45h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
