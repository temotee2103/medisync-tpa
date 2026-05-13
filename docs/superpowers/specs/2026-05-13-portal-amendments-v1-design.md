# Portal Amendments v1 (LocalStorage-first)

Date: 2026-05-13  
Status: Approved (design)  
Scope: Member Portal, Provider (Vendor) Portal, Admin Portal  

## 1) Context / Problem
The current app behaves like a production UI but many business rules are inconsistent across portals and incomplete for UAT. We will implement the requested amendments **while keeping localStorage as the backing store** for now, so that UI/flow is correct and later migration to Supabase/DB becomes a data-migration exercise rather than a product redesign.

Confirmed decisions:
- Storage: **localStorage-first** (Supabase later)
- Provider submission: **doctor submits only**
- Provider admin: **can save draft only**
- Member claim submission window: **14 days**
- Notifications: **SMTP** (server/API route)
- Member history must show **both**:
  - provider cashless claims
  - panel clinic visit transactions
- Panel visit transaction creation timing: **created at claim submission only** (not at scan / draft)

## 2) Goals
### Member Portal
1. Category balance breakdown (limit/reserved/utilized/available) per category.
2. Dependents include nationality; dependents can have different nationality from primary member.
3. Dependent can submit claim; for dependent **MC is not required**.
4. Visit details include MC Y/N, date, and day calculation; enforce MC upload requirement accordingly.
5. Enforce **14-day** submission window for member reimbursement claims.
6. Panel clinic transactions appear in member history.

### Provider (Vendor) Portal
1. Provider admin cannot key diagnosis/description/charge breakdown.
2. Service Type selection comes first; charges breakdown is doctor-only and appears after doctor step.
3. Add Consultation Fee.
4. MC Y/N & Day; gating for generating MC and RL (if No, cannot generate).
5. PV download function (after Admin uploads PV).
6. Doctor APC logic enforcement.
7. Member verification logic (scan / verify in provider portal).

### Admin Portal
1. Claim management sends email if status changes.
2. Claim details show MC/RL.
3. Claim flow: Approve → Generate Listing → Make Payment → Upload PV.
4. Dependent constraints: max spouse/parent rules.
5. Gender only Male/Female.
6. Child number limit in corporate setting.
7. Emergency release limit function.
8. Vendor member edit: allow editing Member ID.
9. Vendor member doctor selection requires APC upload.
10. HR name required; Tier 1 & Tier 2 contact name required; phone format enforced.
11. Add vendor: admin can create vendor org record with vendor login identifier (organization identity), but provider portal authentication remains provider-user based.

## 3) Non-goals (v1)
- Full Supabase Auth / RLS / server-side enforcement (later phase).
- Real file storage (S3/Supabase Storage). Attachments remain dataUrl/local placeholder where already used.
- Real QR rendering + mobile camera integration (we will support scan by text input payload in v1).

## 4) Data Model (LocalStorage) Changes

### 4.1 Member directory fields
Update `MemberDirectoryEntry`:
- `gender`: **"Male" | "Female"** (remove "Other")
- `nationality`: required for both primary and dependent
- dependent constraints:
  - `memberType`: "primary" | "dependent" (already inferred)
  - `relationship`: "Employee" | "Spouse" | "Child" | "Parent"

Company config additions:
- `company.planConfig.dependents.maxChildren` (new)
- enforce parent cap by gender (2 male + 2 female)
- spouse cap: 4

### 4.2 Claims (unified)
Use unified `claims_v2` store (already introduced) with `claimSource`:
- `member_reimbursement`
- `provider_cashless`

Add/standardize fields across claim types:
- visit detail:
  - `visitDate` / `treatmentDate` (normalize to `visitDate` internally; keep legacy fields for UI compatibility)
  - `mcRequired`: boolean
  - `mcFrom`, `mcTo`, `mcDays` (or derived from from/to)
- attachments:
  - `mcFileName`
  - `rlFileName` / `referralFileName`
  - `finalBillFileName` / `receiptFiles`
  - `pvFileName` + `pvDataUrl` (new, for PV upload + provider download)
- entitlement linkage:
  - `memberKey`
  - `limitCategory`
  - `reservedAmount`
- audit:
  - `auditTrail[]` appended on key actions (submit, status change, pv upload, emergency release).

### 4.3 Entitlements / limits
Continue using:
- reservation locks: `member_limit_locks`
- utilization: `member_limit_utilization`

Rules:
- reserve on draft/save and on submit (if no draft)
- consume on admin approve
- release on reject/cancel
- emergency release: admin tool to release or adjust reservation/utilization with audit entry.

### 4.4 Panel visit transactions
New localStorage store:
- `panel_visit_transactions`

Schema (v1 minimal):
- `id`
- `memberKey` / `patientId`
- `providerId`
- `visitDateTime`
- `serviceType`
- `amount` (from claim total at submission)
- `claimId` (link to provider cashless claim)

Creation timing:
- created **only** when doctor submits provider cashless claim.

## 5) Portal UX + Business Rules

### 5.1 Member Portal
#### (A) Category balance breakdown
Dashboard/Policy screens show per category:
- Limit
- Reserved (locks)
- Utilized (approved utilization)
- Available = limit - reserved - utilized

Must handle:
- lump sum plans
- categorized plans
- dependents with shared limit (use `getMemberLimitOwnerStaffId`)

#### (B) Dependent claim submission + MC rules
- If selected patient is dependent:
  - MC upload is **not required**
- If selected patient is primary (Employee/Self):
  - MC required depends on MC Y/N field in Visit Detail

#### (C) Visit detail fields
Add in claim wizard:
- MC Y/N
- If MC=Y: choose date range (from/to) and show computed days
- If MC=N: hide MC upload requirement and disable “Generate MC” (if any)

#### (D) Submission window
- Member reimbursement claim must be submitted within **14 days** from visit date.

#### (E) Member history includes panel clinic transactions
Member history shows:
- reimbursement claims
- provider cashless claims linked to member
- panel visit transactions (created at provider cashless submission)

### 5.2 Provider (Vendor) Portal
#### (A) Role capabilities
- provider_admin:
  - can create/save draft and reserve limit
  - cannot edit diagnosis/description/charge breakdown
  - cannot submit
- doctor:
  - can edit clinical details
  - can submit cashless claim

#### (B) Ordering: Service Type → Consultation Fee → clinical breakdown
- Service type selection must be first step.
- Consultation fee is a dedicated field (included in totals).
- After doctor step, show charge breakdown.

#### (C) MC / RL gating
- MC Y/N & Day:
  - if MC=N → cannot generate MC
  - if MC=Y → allow generate MC; requires MC days/range
- Same gating concept for referral letter (RL):
  - if RL=N → cannot generate

#### (D) PV download
- After admin uploads PV on a claim, provider can download it from provider payments and/or claim view.

#### (E) Doctor APC logic
Provider cashless claim submission blocked unless:
- clinic license approved and valid
- at least one active doctor APC approved and valid
- selected attending doctor must have approved valid APC

#### (F) Member verification scan (v1)
Provider verification page:
- input field for scan payload (text)
- resolve member by staffId / nricPassport / passport
- show eligibility (active/disabled, plan coverage summary)
- no panel visit transaction created at scan (per decision)

### 5.3 Admin Portal
#### (A) Claim flow enforcement
States (recommended minimum):
- Submitted / In review
- Approved (clinical approval)
- Listed (included in payment listing)
- Paid (payment made)
- PV Uploaded (pv attached)
- Rejected

Enforced ordering:
1) Approve
2) Generate Listing (batch)
3) Mark Paid
4) Upload PV

#### (B) Email on status changes (SMTP)
When claim status changes:
- Send email to relevant party:
  - member reimbursement → member email
  - provider cashless → provider org contact email (and optionally doctor/provider admin)

Implementation:
- Next.js API route (server-side) sends email via SMTP env vars.
- If env not configured, log and show a warning in UI (do not crash dev).

#### (C) Dependent constraints + gender
Admin user management and member flows must enforce:
- Gender: Male/Female only
- Max spouse: 4
- Max parents: 2 male + 2 female
- Max children: company setting

#### (D) Emergency release limit
Admin tool to:
- release a reservation lock by claimId/memberKey
- or create an adjustment entry (if needed) with reason
- always append audit trail

#### (E) Vendor member editing + APC requirements
- Vendor member edit allows changing Member ID.
- When a vendor member is a doctor (role doctor):
  - require APC upload before allowing claim submission (blocked until compliant).

#### (F) HR and contacts
Company profile requires:
- HR name
- Tier 1 contact name + phone
- Tier 2 contact name + phone
- phone normalization/format as per existing format utils

## 6) Acceptance Criteria (high-level)
- Member reimbursement claim blocks at >14 days.
- Dependent nationality is captured and displayed; dependent can submit claim; MC not required for dependent.
- Member screens show category breakdown and correct available balance reflecting locks + utilization.
- Provider admin can save draft (reserve), cannot submit; doctor can submit.
- Provider cashless submission creates a panel visit transaction event and appears in member history.
- Provider submission includes consultation fee and new ordering.
- MC/RL generation respects Y/N gating.
- Admin claim flow enforces approve→listing→pay→PV upload.
- Status change triggers SMTP email (or logs warning when SMTP not configured).
- Dependent relationship caps enforced everywhere.

## 7) Milestones (recommended)
1. Member portal amendments (balance breakdown, 14-day, dependent nationality + MC rules, history feed).
2. Provider portal amendments (verification, consultation fee, MC/RL gating, PV download, APC enforcement).
3. Admin portal amendments (claim flow + SMTP notifications + emergency release + constraints + vendor edits).

## 8) Risks / Notes
- localStorage-based enforcement is not secure; this spec focuses on correct flow for UAT.
- “Panel visit transaction at claim submission only” means the member won’t see anything in history until the doctor submits.
- Attachment storage remains mock; PV/MC/RL downloads will be limited to what is stored in localStorage (dataUrl) until DB/storage migration.

