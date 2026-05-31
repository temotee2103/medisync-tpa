"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let isStopped = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            if (isStopped) return;
            if (result?.getText()) onResult(result.getText());
          }
        );
      } catch (e: unknown) {
        onError?.(e instanceof Error ? e.message : "Unable to start camera.");
      }
    })();

    return () => {
      isStopped = true;
    };
  }, [onError, onResult]);

  return <video ref={videoRef} className="w-full rounded-2xl border border-slate-200 bg-black" />;
}
