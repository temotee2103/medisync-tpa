import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ClaimStatusEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  const port = portRaw ? Number.parseInt(portRaw, 10) : Number.NaN;

  const missing =
    !host || !portRaw || Number.isNaN(port) || !user || !pass || !from;

  if (missing) return null;

  return { host, port, user, pass, from };
}

export async function POST(req: Request) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return NextResponse.json({ disabled: true }, { status: 200 });
  }

  let payload: ClaimStatusEmailPayload | null = null;
  try {
    payload = (await req.json()) as ClaimStatusEmailPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload?.to || !payload.subject || !payload.text) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields: to, subject, text." },
      { status: 400 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: smtp.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });

    return NextResponse.json({ ok: true, messageId: info.messageId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send email.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

