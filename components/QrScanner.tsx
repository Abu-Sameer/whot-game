"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface QrScannerProps {
  onScan: (value: string) => void;
}

// Decoding runs on every frame, so each frame is shrunk to this before it is
// searched. A QR fills most of the viewfinder by the time it is readable, and
// at full sensor resolution the search cannot keep up on a phone.
const SEARCH_WIDTH = 480;

/**
 * Points the camera at another phone's pairing code.
 *
 * The camera needs a secure context — https, or localhost. Served over plain
 * http from a LAN address the browser will not offer it at all, which is why
 * every screen using this also offers pasting the code by hand.
 */
export default function QrScanner({ onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Parked in a ref and updated after each render rather than during one, so
  // the scan loop below never restarts just because the callback changed
  // identity — restarting it would mean asking for the camera all over again.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser will not open the camera here — it needs an https address. Paste the code instead.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        setError(
          "No camera access. Allow it in your browser settings, or paste the code instead.",
        );
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay refused. The frame loop below still reads the stream.
      }

      const tick = () => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        if (!context || video.readyState < video.HAVE_CURRENT_DATA) return;

        const { videoWidth: width, videoHeight: height } = video;
        if (!width || !height) return;

        const scale = Math.min(1, SEARCH_WIDTH / width);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, {
          // The codes are always dark on light on a screen, so there is no
          // point spending a second pass looking for an inverted one.
          inversionAttempts: "dontInvert",
        });
        if (found?.data) {
          stopped = true;
          onScanRef.current(found.data);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-200">
        {error}
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-40 w-full object-cover"
      />
      {/* A frame to aim with. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-28 w-28 rounded-lg border-2 border-amber-400/80" />
      </div>
    </div>
  );
}
