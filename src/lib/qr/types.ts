export type MemberQrTokenPayload = {
  sub: string;
  exp: number;
  jti: string;
};

export type ProviderResolveQrResponse =
  | { ok: true; memberId: string; staffId: string; fullName: string; companyId: string; nricPassport?: string; passportNo?: string }
  | { ok: false; error: string };
