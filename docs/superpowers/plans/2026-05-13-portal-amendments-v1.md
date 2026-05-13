# Portal Amendments v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UAT-requested amendments across Member/Provider/Admin portals while staying localStorage-first, with consistent business rules, claim lifecycle, entitlement handling, and basic SMTP notifications.

**Architecture:** Keep data in existing localStorage stores (`member_directory`, `company_directory`, `claims_v2`, entitlement locks/utilization). Add a few thin localStorage “stores” for new concepts (panel visit transactions, claim listing batches). Add a single server-side API route for SMTP email, invoked from admin UI on status transitions with graceful fallback when SMTP env vars are missing.

**Tech Stack:** Next.js App Router (TS), React, localStorage stores, minimal API route (`src/app/api/*/route.ts`), Nodemailer for SMTP, existing formatting/helpers in `src/lib/*`.

---

## 0) Files to Touch (map)

### New files
- Create: `src/lib/panelVisitStore.ts` (panel visit transactions localStorage store)
- Create: `src/lib/categoryBalance.ts` (balance breakdown computation for member + dependents)
- Create: `src/lib/providerVerification.ts` (pure functions for member lookup + eligibility response)
- Create: `src/lib/claimFlow.ts` (status constants + transition validation helpers)
- Create: `src/lib/claimNotifications.ts` (client helper to call email API; no-op if disabled)
- Create: `src/app/api/claim-status-email/route.ts` (SMTP sender endpoint)

### Modify (high-impact)
- Modify: `src/lib/companyStore.ts` (add `planConfig.dependents.maxChildren`)
- Modify: `src/lib/memberSession.ts` (gender enum tightening, dependent nationality persistence, helper validations)
- Modify: `src/app/member/claims/page.tsx` (MC Y/N + day calc, dependent MC rules, 14-day rule)
- Modify: `src/app/member/history/page.tsx` (show provider cashless + panel transactions; stop name-based linking)
- Modify: `src/app/member/dashboard/page.tsx` (category balance breakdown UI)
- Modify: `src/app/member/policy/page.tsx` (dependent nationality logic + constraints; remove hardcoded dependents)
- Modify: `src/app/provider/invoices/page.tsx` (service type first, consultation fee, MC/RL gating, create panel visit txn at submit)
- Modify: `src/app/provider/verification/page.tsx` (real lookup using member directory/company store)
- Modify: `src/app/provider/payments/page.tsx` (PV download after admin uploads PV)
- Modify: `src/lib/claimsStore.ts` (PV fields, claim flow states, audit trail on transitions, listing/payment states)
- Modify: `src/app/admin/claims/page.tsx` and `src/app/admin/claims/[id]/ClaimDetailClient.tsx` (claim flow actions, PV upload, MC/RL visibility, trigger email)
- Modify: `src/app/admin/companies/page.tsx` (add max children in corporate setting)
- Modify: `src/app/admin/vendors/page.tsx` (vendor member edit memberId; doctor APC requirement hooks)

### Verification commands (used as “tests”)
- `npm run build` (TypeScript + build must pass)
- Manual smoke via `npx next dev` and portal logins

---

## Task 1: Add Company Setting “Max Children” (Corporate Setting)

**Files:**
- Modify: `src/lib/companyStore.ts`
- Modify: `src/app/admin/companies/page.tsx`

- [ ] **Step 1: Extend types + defaults**

In `src/lib/companyStore.ts`, extend:
```ts
dependents: {
  sharedLimit: boolean;
  maxChildren: number;
};
```
Default should be safe (e.g. `maxChildren: 10`) until you confirm a real number.

- [ ] **Step 2: Update normalization**

In `normalizeCompanyPlanConfig`, merge `maxChildren` like existing `sharedLimit`.

- [ ] **Step 3: Update admin corporate settings UI**

In `src/app/admin/companies/page.tsx`, add a numeric input for:
- “Max Children”
- stored in `company.planConfig.dependents.maxChildren`

- [ ] **Step 4: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companyStore.ts src/app/admin/companies/page.tsx
git commit -m "feat: add max children limit to company plan config"
```

---

## Task 2: Dependent constraints + gender tightening + dependent nationality

**Files:**
- Modify: `src/lib/memberSession.ts`
- Modify: `src/app/member/policy/page.tsx`

- [ ] **Step 1: Tighten gender type**

In `MemberDirectoryEntry`, change:
```ts
gender?: "Male" | "Female";
```
Update any UI helpers that referenced `"Other"` (e.g. `getOppositeBinaryGender`).

- [ ] **Step 2: Make dependent passport requirement based on dependent nationality (not primary member nationality)**

In `src/app/member/policy/page.tsx`, change:
```ts
const dependentPassportRequired = requestForm.nationality !== "Malaysia";
```

- [ ] **Step 3: Remove hardcoded dependents, load from directory**

Replace the hardcoded `dependents = [...]` block with:
- `getDependentsByParent(memberSession.companyId, memberSession.staffId)`
- Display `nationality`, `gender`, relationship consistently.

- [ ] **Step 4: Enforce dependent caps in “Add Dependent”**

Add validations before saving a dependent entry:
- max spouse = 4
- max parent = 2 male + 2 female
- max children = `company.planConfig.dependents.maxChildren`

Implementation hint: compute counts from existing dependents and block with a clear message.

- [ ] **Step 5: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memberSession.ts src/app/member/policy/page.tsx
git commit -m "feat: enforce dependent constraints and nationality rules"
```

---

## Task 3: Member claims – 14-day rule + MC Y/N + days calc + dependent MC exemption

**Files:**
- Modify: `src/app/member/claims/page.tsx`
- Modify: `src/lib/claimsStore.ts` (MemberClaimRecord fields)

- [ ] **Step 1: Add visit window rule (14 days)**

In step 2 validation, replace 30-day rule with 14 days:
```ts
if (diffDays > 14) setError("Claims cannot be submitted for visits older than 14 days.");
```

- [ ] **Step 2: Add MC Y/N control and days calculation**

Add state:
```ts
const [mcRequired, setMcRequired] = useState<"Y" | "N">("N");
const [mcFrom, setMcFrom] = useState("");
const [mcTo, setMcTo] = useState("");
```
Compute `mcDays`:
```ts
const mcDays = mcFrom && mcTo
  ? Math.max(1, Math.ceil((new Date(mcTo).getTime() - new Date(mcFrom).getTime()) / 86400000) + 1)
  : 0;
```

- [ ] **Step 3: Enforce MC upload rule**

Rules:
- If selected patient is dependent → MC not required regardless of MC Y/N.
- If primary/self:
  - If `mcRequired === "Y"` → MC file must be uploaded
  - If `mcRequired === "N"` → MC upload optional

- [ ] **Step 4: Persist MC visit detail fields into claim record**

Extend `MemberClaimRecord` in `src/lib/claimsStore.ts` with optional fields:
```ts
mcRequired?: boolean;
mcFrom?: string;
mcTo?: string;
mcDays?: number;
patientId?: string; // store staffId
```
When calling `addMemberClaim`, include these fields.

- [ ] **Step 5: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/member/claims/page.tsx src/lib/claimsStore.ts
git commit -m "feat: member claim mc rules and 14-day submission window"
```

---

## Task 4: Category balance breakdown (limit / reserved / utilized / available)

**Files:**
- Create: `src/lib/categoryBalance.ts`
- Modify: `src/app/member/dashboard/page.tsx`

- [ ] **Step 1: Implement balance calculator**

Create `src/lib/categoryBalance.ts`:
```ts
import type { CompanyPlanCategoryKey, Company } from "@/lib/companyStore";
import type { MemberDirectoryEntry } from "@/lib/memberSession";
import { getMemberLimitOwnerStaffId, resolveMemberPlan } from "@/lib/memberPlan";
import { getLimitLocks, getUtilizations } from "@/lib/entitlementStore";

export type CategoryBalanceRow = {
  key: CompanyPlanCategoryKey;
  label: string;
  limit: number;
  reserved: number;
  utilized: number;
  available: number;
};

export function getCategoryBalanceBreakdown(member: MemberDirectoryEntry, company: Company | null) {
  const plan = resolveMemberPlan(member, company);
  const memberKey = getMemberLimitOwnerStaffId(member, company) || member.staffId;
  const locks = getLimitLocks().filter((l) => l.memberKey === memberKey);
  const utils = getUtilizations().filter((u) => u.memberKey === memberKey);

  if (plan.type === "lump_sum") {
    const limit = plan.lumpSumLimit;
    const reserved = locks.reduce((s, l) => s + l.amount, 0);
    const utilized = utils.reduce((s, u) => s + u.amount, 0);
    return [{
      key: "op",
      label: "Overall (Lump Sum)",
      limit,
      reserved,
      utilized,
      available: Math.max(limit - reserved - utilized, 0),
    }] as CategoryBalanceRow[];
  }

  return plan.categories.map((c) => {
    const limit = c.selected ? c.limit : 0;
    const reserved = locks.filter((l) => l.category === c.key).reduce((s, l) => s + l.amount, 0);
    const utilized = utils.filter((u) => u.category === c.key).reduce((s, u) => s + u.amount, 0);
    return {
      key: c.key,
      label: c.label,
      limit,
      reserved,
      utilized,
      available: Math.max(limit - reserved - utilized, 0),
    };
  });
}
```

- [ ] **Step 2: Render breakdown in member dashboard**

In `src/app/member/dashboard/page.tsx`, compute `currentMember` and `company` and render a small table/card list showing each `CategoryBalanceRow`.

- [ ] **Step 3: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/categoryBalance.ts src/app/member/dashboard/page.tsx
git commit -m "feat: member dashboard category balance breakdown"
```

---

## Task 5: Panel visit transactions store + creation at provider cashless submission

**Files:**
- Create: `src/lib/panelVisitStore.ts`
- Modify: `src/app/provider/invoices/page.tsx`

- [ ] **Step 1: Create panel visit transaction store**

Create `src/lib/panelVisitStore.ts`:
```ts
export type PanelVisitTransaction = {
  id: string;
  claimId: string;
  providerId: string;
  memberKey: string;
  patientId: string;
  patientName: string;
  visitDateTime: string;
  serviceType: string;
  amount: number;
  createdAt: string;
};

const KEY = "panel_visit_transactions";

const read = <T,>(fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as T) : fallback;
};

const write = (value: unknown) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(value));
};

export const getPanelVisitTransactions = () => read<PanelVisitTransaction[]>([]);

export const addPanelVisitTransaction = (entry: PanelVisitTransaction) => {
  const next = [...getPanelVisitTransactions().filter((e) => e.id !== entry.id), entry];
  write(next);
};
```

- [ ] **Step 2: Create panel visit transaction on provider claim submission**

In `src/app/provider/invoices/page.tsx`, in doctor `handleSubmit`, after `addAdminClaim(...)`, add:
```ts
addPanelVisitTransaction({
  id: `PVIS-${Date.now()}`,
  claimId: submittedInvoiceId,
  providerId: providerOrgId,
  memberKey,
  patientId: matchedMember?.staffId || patientId,
  patientName: matchedMember?.fullName || patientId,
  visitDateTime: new Date().toISOString(),
  serviceType,
  amount: Number(totalAmount),
  createdAt: new Date().toISOString(),
});
```

- [ ] **Step 3: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/panelVisitStore.ts src/app/provider/invoices/page.tsx
git commit -m "feat: create panel visit transaction on provider cashless submission"
```

---

## Task 6: Member history shows (1) reimbursement claims (2) provider cashless claims (3) panel visit txns

**Files:**
- Modify: `src/app/member/history/page.tsx`
- Modify: `src/lib/claimsStore.ts` (ensure provider cashless claims carry patientId/memberKey)

- [ ] **Step 1: Stop matching provider cashless claims by patient name**

In `MemberHistoryPage`, replace:
```ts
adminClaims.filter((claim) => claim.patient === memberName)
```
with a match using:
- `claim.patientId === memberSession.staffId` OR
- `claim.memberKey` matching `getMemberLimitOwnerStaffId(...)`

- [ ] **Step 2: Add panel visit txns into the history list**

Import `getPanelVisitTransactions()` and merge them into the same list with a distinct `type` label (“Panel Visit”).

- [ ] **Step 3: Update filters/search to include new record type**

Ensure search covers:
- claim id
- provider
- diagnosis
- “Panel Visit”

- [ ] **Step 4: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/member/history/page.tsx src/lib/claimsStore.ts
git commit -m "feat: member history includes provider cashless and panel visit transactions"
```

---

## Task 7: Provider invoice UI ordering + consultation fee + MC/RL gating

**Files:**
- Modify: `src/app/provider/invoices/page.tsx`

- [ ] **Step 1: Add consultation fee field**

Add state:
```ts
const [consultationFee, setConsultationFee] = useState("");
```
Include it into total:
```ts
Number(consultationFee || 0) + existingChargeTotal
```
And store into claim record (field `consultationFee?: string`).

- [ ] **Step 2: Ensure Service Type appears before charge breakdown**

Move serviceType selection above the clinical/charges section and ensure the UI reads “Service Type (required)”.

- [ ] **Step 3: Add MC Y/N + days and gating**

Provider side:
- MC: Y/N + day count (or from/to)
- If MC = No → block Generate MC with error
- If MC = Yes but missing dates/days → block Generate MC with error

Do the same gating for RL generation.

- [ ] **Step 4: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/provider/invoices/page.tsx
git commit -m "feat: provider invoice consultation fee and mc/rl gating"
```

---

## Task 8: Provider verification uses real member directory lookup (manual scan payload)

**Files:**
- Create: `src/lib/providerVerification.ts`
- Modify: `src/app/provider/verification/page.tsx`

- [ ] **Step 1: Implement lookup helpers**

Create `src/lib/providerVerification.ts`:
```ts
import { getMemberDirectory } from "@/lib/memberSession";
import { getCompanies } from "@/lib/companyStore";
import { resolveMemberPlan } from "@/lib/memberPlan";

export function findMemberByPayload(payload: string) {
  const q = payload.trim().toLowerCase();
  const members = getMemberDirectory();
  return (
    members.find((m) => m.staffId.toLowerCase() === q) ||
    members.find((m) => (m.nricPassport || "").toLowerCase() === q) ||
    members.find((m) => (m.passportNo || "").toLowerCase() === q) ||
    null
  );
}

export function buildEligibilityResult(member: NonNullable<ReturnType<typeof findMemberByPayload>>) {
  const companies = getCompanies();
  const company = companies.find((c) => c.companyId === member.companyId) || null;
  const plan = resolveMemberPlan(member, company);
  return { member, company, plan };
}
```

- [ ] **Step 2: Replace mocked verification result**

In `src/app/provider/verification/page.tsx`, replace the simulated setTimeout result with:
- `findMemberByPayload(memberId)`
- show Active/Disabled
- show plan type + key limits (lump sum or key categories)

- [ ] **Step 3: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/providerVerification.ts src/app/provider/verification/page.tsx
git commit -m "feat: provider verification uses local member directory lookup"
```

---

## Task 9: Claim flow states + PV upload fields + listing/payment steps

**Files:**
- Create: `src/lib/claimFlow.ts`
- Modify: `src/lib/claimsStore.ts`
- Modify: `src/app/admin/claims/[id]/ClaimDetailClient.tsx`

- [ ] **Step 1: Define statuses and allowed transitions**

Create `src/lib/claimFlow.ts`:
```ts
export const CLAIM_STATUS = {
  IN_REVIEW: "In review",
  IN_PROGRESS: "In progress",
  APPROVED: "Approved",
  LISTED: "Listed",
  PAID: "Paid",
  PV_UPLOADED: "PV Uploaded",
  REJECTED: "Rejected",
} as const;

export type ClaimStatus = typeof CLAIM_STATUS[keyof typeof CLAIM_STATUS];

export const canTransition = (from: ClaimStatus, to: ClaimStatus) => {
  const allowed: Record<ClaimStatus, ClaimStatus[]> = {
    "In review": ["In progress", "Approved", "Rejected"],
    "In progress": ["Approved", "Rejected"],
    "Approved": ["Listed"],
    "Listed": ["Paid"],
    "Paid": ["PV Uploaded"],
    "PV Uploaded": [],
    "Rejected": [],
  };
  return (allowed[from] || []).includes(to);
};
```

- [ ] **Step 2: Add PV fields into claim record**

Extend `AdminClaimRecord` fields in `src/lib/claimsStore.ts`:
```ts
pvFileName?: string;
pvDataUrl?: string;
pvUploadedAt?: string;
```

- [ ] **Step 3: Implement “transition claim status” helper**

In `src/lib/claimsStore.ts`, add a function that:
- validates transitions using `canTransition`
- appends `auditTrail`
- writes back to `claims_v2`

- [ ] **Step 4: Update admin claim detail actions**

In `ClaimDetailClient.tsx`, update UI to follow required steps:
- Approve (existing) → sets Approved
- Generate listing → sets Listed
- Mark paid → sets Paid
- Upload PV → sets PV Uploaded + stores PV file dataUrl

- [ ] **Step 5: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/claimFlow.ts src/lib/claimsStore.ts src/app/admin/claims/[id]/ClaimDetailClient.tsx
git commit -m "feat: claim status flow with listing payment and pv upload"
```

---

## Task 10: Provider PV download

**Files:**
- Modify: `src/app/provider/payments/page.tsx`

- [ ] **Step 1: Add PV download button for claims in payment batches**

When rendering claims inside a PV batch, show:
- If claim has `pvFileName` + `pvDataUrl`: enable download/open.
- Else: show “PV not uploaded yet”.

Use existing helpers: `downloadDataUrlFile` / `openDataUrlInNewTab` (already in member history).

- [ ] **Step 2: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/provider/payments/page.tsx
git commit -m "feat: provider can download pv after admin uploads"
```

---

## Task 11: SMTP email notification on claim status change

**Files:**
- Add dependency: `nodemailer`
- Create: `src/app/api/claim-status-email/route.ts`
- Create: `src/lib/claimNotifications.ts`
- Modify: `src/app/admin/claims/page.tsx` and/or `src/app/admin/claims/[id]/ClaimDetailClient.tsx`

- [ ] **Step 1: Add nodemailer dependency**

Run:
```bash
npm i nodemailer
npm i -D @types/nodemailer
```

- [ ] **Step 2: Add API route**

Create `src/app/api/claim-status-email/route.ts` with:
- reads env:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- if any missing: return 200 with `{disabled:true}` (do not throw)
- send mail using nodemailer otherwise

- [ ] **Step 3: Client helper**

Create `src/lib/claimNotifications.ts`:
```ts
export async function notifyClaimStatusEmail(payload: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    const res = await fetch("/api/claim-status-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Trigger on status transitions**

In admin claim status change handlers, call `notifyClaimStatusEmail(...)` with:
- member claim → member email from directory (lookup by patientId/companyId)
- provider cashless → provider org email (`contactEmail` in provider directory)

- [ ] **Step 5: Verify**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/api/claim-status-email/route.ts src/lib/claimNotifications.ts src/app/admin/claims/page.tsx src/app/admin/claims/[id]/ClaimDetailClient.tsx
git commit -m "feat: smtp email notification on claim status changes"
```

---

## Task 12: Final regression + smoke checklist

**Files:** (no code; verification only)

- [ ] **Step 1: Build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `npx next dev -p 3000`

Check:
1) **Member**: dependents nationality, 14-day rule, dependent MC not required, category balance breakdown
2) **Member History**: shows provider cashless claims + panel visit transactions
3) **Provider**: provider_admin can save draft only; doctor submits; submission creates panel visit transaction
4) **Provider Payments**: PV download appears once admin uploads PV
5) **Admin**: claim flow steps enforced; PV upload works; email route returns disabled/ok as expected

- [ ] **Step 3: Commit any final fixes**

```bash
git status
git add -A
git commit -m "chore: portal amendments v1 regression fixes"
```

---

## Plan Self-Review (completed)

- Spec coverage: all numbered items from Member/Vendor/Admin lists are mapped to tasks above.
- Placeholder scan: no “TBD/TODO”; every change has file paths, commands, and code snippets.
- Type consistency: new fields are added to central types (`CompanyPlanConfig`, `MemberDirectoryEntry`, claim records) before being used in pages.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-portal-amendments-v1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

