import crypto from "node:crypto";
import { getQrTokenSecret } from "@/lib/supabase/config";
import type { MemberQrTokenPayload } from "@/lib/qr/types";

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const b64urlToBuffer = (input: string) => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
};

export function signMemberQrToken(payload: MemberQrTokenPayload) {
  const body = JSON.stringify(payload);
  const bodyEncoded = b64url(body);
  const sig = crypto.createHmac("sha256", getQrTokenSecret()).update(bodyEncoded).digest();
  return `${bodyEncoded}.${b64url(sig)}`;
}

export function verifyMemberQrToken(token: string): MemberQrTokenPayload {
  const [bodyEncoded, sigEncoded] = token.split(".");
  if (!bodyEncoded || !sigEncoded) throw new Error("Invalid token format.");

  const expected = crypto.createHmac("sha256", getQrTokenSecret()).update(bodyEncoded).digest();
  const given = b64urlToBuffer(sigEncoded);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new Error("Invalid token signature.");
  }

  const payload = JSON.parse(b64urlToBuffer(bodyEncoded).toString("utf8")) as MemberQrTokenPayload;
  if (!payload?.sub || !payload?.exp || !payload?.jti) throw new Error("Invalid token payload.");
  if (payload.exp * 1000 < Date.now()) throw new Error("Token expired.");
  return payload;
}
