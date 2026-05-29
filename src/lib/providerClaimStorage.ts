import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const PROVIDER_CLAIM_DOCUMENT_BUCKET = "provider-claim-documents";

export type ProviderClaimDocumentType = "final_bill" | "mc" | "referral_letter";

export type ProviderClaimUploadResult = {
  storagePath: string;
  fileName: string;
  mimeType: string;
};

const sanitizePathSegment = (value: string, fallback: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || fallback;
};

const sanitizeFileName = (fileName: string) => sanitizePathSegment(fileName || "document", "document");

export const buildProviderClaimStoragePath = (
  providerUuid: string,
  claimNumber: string,
  docType: ProviderClaimDocumentType,
  fileName: string,
  timestamp = Date.now()
) => {
  const safeProviderUuid = sanitizePathSegment(providerUuid, "provider");
  const safeClaimNumber = sanitizePathSegment(claimNumber, "claim");
  const safeFileName = sanitizeFileName(fileName);
  return `provider-claims/${safeProviderUuid}/${safeClaimNumber}/${docType}-${timestamp}-${safeFileName}`;
};

export const uploadProviderClaimFile = async (
  providerUuid: string,
  claimNumber: string,
  docType: ProviderClaimDocumentType,
  file: File
): Promise<ProviderClaimUploadResult> => {
  const supabase = createSupabaseBrowserClient();
  const storagePath = buildProviderClaimStoragePath(providerUuid, claimNumber, docType, file.name);
  const mimeType = file.type || "application/octet-stream";
  const { error } = await supabase.storage.from(PROVIDER_CLAIM_DOCUMENT_BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: mimeType,
  });

  if (error) throw error;

  return {
    storagePath,
    fileName: file.name,
    mimeType,
  };
};

export const getProviderClaimSignedUrl = async (storagePath: string, expiresInSeconds = 60) => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(PROVIDER_CLAIM_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;

  return data.signedUrl;
};
