import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const PROVIDER_CREDENTIAL_BUCKET = "provider-claim-documents";

const sanitizePathSegment = (value: string, fallback: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || fallback;
};

export const buildCredentialStoragePath = (
  vendorId: string,
  docType: string,
  fileName: string,
  timestamp = Date.now()
) => {
  const safeVendor = sanitizePathSegment(vendorId, "vendor");
  const safeDocType = sanitizePathSegment(docType, "doc");
  const safeFileName = sanitizePathSegment(fileName || "document", "document");
  return `provider-credentials/${safeVendor}/${safeDocType}-${timestamp}-${safeFileName}`;
};

export type CredentialUploadResult = {
  storagePath: string;
  fileName: string;
  mimeType: string;
};

/** Upload a credential file to Supabase Storage. Returns the storage path. */
export const uploadCredentialFile = async (
  vendorId: string,
  docType: string,
  file: File
): Promise<CredentialUploadResult> => {
  const supabase = createSupabaseBrowserClient();
  const storagePath = buildCredentialStoragePath(vendorId, docType, file.name);
  const mimeType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(PROVIDER_CREDENTIAL_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: mimeType,
    });

  if (error) throw error;

  return { storagePath, fileName: file.name, mimeType };
};
