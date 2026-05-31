"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";

export default function MemberQrPage() {
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [exp, setExp] = useState<number>(0);
  const didFetch = useRef(false);

  const refresh = useCallback(async () => {
    setError("");
    const res = await fetch("/api/member/qr-token", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Failed to generate QR.");
      return;
    }
    const dataUrl = await QRCode.toDataURL(String(json.token), { margin: 1, width: 280 });
    setQrDataUrl(dataUrl);
    setExp(Number(json.exp || 0));
  }, []);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    const id = setTimeout(() => {
      refresh();
    }, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Check-in QR</h1>
        <p className="text-slate-500">Show this to your provider during check-in.</p>
      </div>

      <GlassCard className="p-6 space-y-4">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        <div className="flex items-center justify-center">
          {qrDataUrl ? (
            <Image src={qrDataUrl} alt="Member check-in QR" width={280} height={280} className="rounded-2xl border border-slate-200 bg-white p-3" />
          ) : (
            <p className="text-sm text-slate-500">Generating QR...</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Expires at: {exp ? new Date(exp * 1000).toLocaleTimeString() : "—"}</p>
          <GlassButton variant="secondary" onClick={refresh}>
            Refresh
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
