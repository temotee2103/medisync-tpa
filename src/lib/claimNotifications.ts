import { withBasePath } from "@/lib/basePath";

export async function notifyClaimStatusEmail(payload: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    const res = await fetch(withBasePath("/api/claim-status-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}
