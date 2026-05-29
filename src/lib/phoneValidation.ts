import { normalizePhone as normalizeBasePhone } from "@/lib/formats";

export const normalizePhoneInput = (value: string) => normalizeBasePhone(value || "");

export const isValidPhone = (value: string) => {
  const normalized = normalizePhoneInput(value);
  if (!normalized) return false;
  return /^\+?\d{8,15}$/.test(normalized);
};
