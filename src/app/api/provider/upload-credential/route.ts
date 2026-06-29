import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";

const BUCKET = "provider-claim-documents";

const sanitizePathSegment = (value: string, fallback: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || fallback;
};

export async function POST(request: Request) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthenticated." }, { status: 401 });
    }
    const [{ data: isProvider }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("is_provider"),
      supabase.rpc("is_admin"),
    ]);
    if (!isProvider && !isAdmin) {
      return NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 });
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const vendorId = formData.get("vendorId") as string | null;
    const docType = formData.get("docType") as string | null;

    if (!file || !vendorId || !docType) {
      return NextResponse.json({ ok: false, error: "Missing file, vendorId, or docType." }, { status: 400 });
    }

    // Build storage path
    const safeVendor = sanitizePathSegment(vendorId, "vendor");
    const safeDocType = sanitizePathSegment(docType, "doc");
    const safeFileName = sanitizePathSegment(file.name || "document", "document");
    const storagePath = `provider-credentials/${safeVendor}/${safeDocType}-${Date.now()}-${safeFileName}`;

    // Upload with service role key (bypasses RLS)
    const service = createServerClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    });

    const { error } = await service.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      storagePath,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
