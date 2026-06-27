import { withBasePath } from "@/lib/basePath";

export type CredentialUploadResult = {
  storagePath: string;
  fileName: string;
  mimeType: string;
};

/** Upload a credential file via API route (uses service key, bypasses Storage RLS). */
export const uploadCredentialFile = async (
  vendorId: string,
  docType: string,
  file: File
): Promise<CredentialUploadResult> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("vendorId", vendorId);
  formData.append("docType", docType);

  const response = await fetch(withBasePath("/api/provider/upload-credential"), {
    method: "POST",
    body: formData,
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Upload failed.");
  }

  return {
    storagePath: json.storagePath,
    fileName: json.fileName,
    mimeType: json.mimeType,
  };
};
