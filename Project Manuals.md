# MediSync TPA — User Manual (All Portals)
This document explains how to use the MediSync TPA web application across all portals: Member, Provider (Vendor/Doctor), Admin, and Customer (Corporate). It focuses on end-to-end flows, especially the claim lifecycle.

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Portals & Roles](#2-portals--roles)
3. [Login, Password, and Logout](#3-login-password-and-logout)
4. [Claim Lifecycle (Unified Flow)](#4-claim-lifecycle-unified-flow)
   1. [End-to-End Process Maps](#41-end-to-end-process-maps)
   2. [Member Reimbursement Claim Process](#42-member-reimbursement-claim-process)
   3. [Provider Cashless Claim (Invoice) Process](#43-provider-cashless-claim-invoice-process)
   4. [Admin + Accountant Payout Process](#44-admin--accountant-payout-process)
5. [Member Portal Guide](#5-member-portal-guide)
6. [Provider Portal Guide](#6-provider-portal-guide)
7. [Admin Portal Guide](#7-admin-portal-guide)
8. [Accountant Workflow (Admin)](#8-accountant-workflow-admin)
9. [Customer / Corporate Portal Guide (Status)](#9-customer--corporate-portal-guide-status)
10. [Notifications & Downloads](#10-notifications--downloads)
11. [Common Issues & Troubleshooting](#11-common-issues--troubleshooting)

---

## 1. System Overview
MediSync TPA manages healthcare-related claims and visits in three main ways:
- Member reimbursement claims submitted by members (employee/dependent).
- Provider cashless claims submitted by providers (panel / vendor) via invoice submission.
- Panel visit transactions (cashless visits) that appear in member history.

The application uses a unified claim lifecycle so all teams can track progress consistently.

---

## 2. Portals & Roles

### 2.1 Member Portal (Employees & Dependents)
Use the Member Portal to:
- View your dashboard and policy.
- Submit reimbursement claims (with supporting documents).
- Track claim status and history (including cashless claims and panel visits when available).

### 2.2 Provider Portal (Vendors / Doctors)
Use the Provider Portal to:
- Verify member eligibility.
- Submit invoices (cashless claims).
- Track payment status and download approval documents (if provided).
- Manage compliance information (licenses / APC where applicable).

### 2.3 Admin Portal (Internal Operations)
Use the Admin Portal to:
- Review and manage claims (member + provider).
- Move claims through lifecycle statuses.
- Manage companies (corporates), vendors (providers), users, policies, and configuration.
- Generate reports and payout logs.

Admin roles (behavior depends on your assigned role):
- Super Admin: full access.
- Admin: operational access, but no delete actions where restricted.
- Accountant: can view all pages but is intended to avoid operational actions; uses Accountant Workspace to finalize payouts.

### 2.4 Customer / Corporate Portal (HR / Corporate Admin)
The Customer (Corporate) portal routes exist, but the portal is currently disabled by system configuration (see Section 9).

---

## 3. Login, Password, and Logout

### 3.1 Choose the Correct Portal Login
Use the login page that matches your role:
- Admin: `/admin/login`
- Member: `/member/login`
- Provider: `/provider/login`
- Customer (Corporate): `/customer/login` (currently inactive)

### 3.2 First Login: Change Password
If your account requires a password update, you will be redirected to a Change Password page after login:
- Admin: `/admin/change-password`
- Member: `/member/change-password`
- Provider: `/provider/change-password`

Follow the on-screen prompts to set a new password.

### 3.3 Forgot Password
If enabled for your deployment, use `/forgot-password` and follow instructions to recover your account.

### 3.4 Logout
Use the Logout action in your portal (if shown). Logging out ends your session across the portal.

---

## 4. Claim Lifecycle (Unified Flow)
Claims across portals follow the same lifecycle statuses:
- Submitted
- Request Additional Information
- Rejected
- In Process
- Approved

Typical meaning:
- Submitted: claim is received and waiting for review.
- Request Additional Information: reviewer needs clarification or missing documents.
- Rejected: claim is not approved (reason usually recorded in notes).
- In Process: approved for payout processing (accounting/payment preparation).
- Approved: payout is completed and supporting payout document may be available.

High-level end-to-end flow:
1. Member submits reimbursement claim or Provider submits invoice (cashless claim).
2. Admin reviews and updates the claim status (may request more info or reject).
3. When ready for payout, Admin marks claim In Process.
4. Accountant finalizes payout in Accountant Workspace (requires payout profile information).
5. Claim becomes Approved and relevant payout documents may be downloadable by Provider and visible in history to Member (depending on claim type and configuration).

### 4.1 End-to-End Process Maps

#### 4.1.1 Unified Claim Lifecycle (Status State Machine)
Text version (copy-friendly):

```
Submitted
  -> Request Additional Information (admin asks for more documents/details)
       -> Submitted (member/provider provides the requested info)
  -> Rejected (admin rejects)
  -> In Process (admin marks ready for payout)
       -> Approved (accountant completes payout)
```

Transition summary:

| From | To | Trigger / Who |
|---|---|---|
| Submitted | Request Additional Information | Admin requests more info |
| Request Additional Information | Submitted | Member/Provider provides info and claim is re-reviewed |
| Submitted | Rejected | Admin rejects |
| Submitted | In Process | Admin approves for payout processing |
| In Process | Approved | Accountant completes payout |

#### 4.1.2 Swimlane Overview (Who Does What)
Copy-friendly swimlane table:

| Step | Member | Provider | Admin | Accountant |
|---|---|---|---|---|
| 1 | Submit reimbursement claim (`/member/claims`) | Verify member eligibility (`/provider/verification`) |  |  |
| 2 |  | Submit invoice/cashless claim (`/provider/invoices`) | Review claim (`/admin/claims`) |  |
| 3 | Respond if info requested (upload/add details, then re-submit as instructed) | Respond if info requested (`/provider/payments`) | Request Additional Information / Reject / Mark In Process |  |
| 4 | Track status (`/member/history`) | Track status (`/provider/payments`) | Mark In Process when ready for payout | Process In Process claims (`/admin/accountant`) |
| 5 | See Approved/Rejected result | Download PV/approval docs when available | Optional post-approval documentation | Mark Approved after payout |

### 4.2 Member Reimbursement Claim Process
This flow applies when a member pays first and later requests reimbursement.

#### 4.2.1 Member Reimbursement Flow (Detailed)
Copy-friendly flow:

```
Member
  -> Login (/member/login)
  -> Submit Claim (/member/claims)
       -> Select Patient (Self/Dependent)
       -> Enter Claim Details (category, visit date, provider, amount, receipt no)
       -> Add Diagnosis (at least 1)
       -> Upload Documents (receipts + required docs)
       -> Validation
            -> If error: fix inputs and retry
            -> If ok: Submit (status = Submitted)
  -> Track status (/member/history)

Admin
  -> Review (/admin/claims)
       -> Request Additional Information (status = Request Additional Information) -> Member responds -> Re-review
       -> Reject (status = Rejected)
       -> Mark In Process (status = In Process)

Accountant
  -> Process payout (/admin/accountant)
       -> If payout profile missing: hold (cannot approve)
       -> If payout completed: Approve (status = Approved)

Member
  -> See final result in /member/history
```

1. Member opens Submit Claim: `/member/claims`.
2. Member completes the form (patient, category, visit date, amount, diagnosis, documents).
3. Member submits. Status becomes Submitted.
4. Admin reviews the claim:
   - If documents/details are missing: status becomes Request Additional Information.
   - If not eligible: status becomes Rejected.
   - If eligible and ready for payout: status becomes In Process.
5. Accountant completes payout:
   - If payout profile/bank info exists: status becomes Approved.
   - If payout profile missing: claim stays visible in Accountant Workspace but cannot be approved yet.
6. Member tracks results in `/member/history` and downloads proofs when available.

### 4.3 Provider Cashless Claim (Invoice) Process
This flow applies when the provider submits an invoice and the member does not pay upfront (cashless).

#### 4.3.1 Provider Cashless Flow (Detailed)
Copy-friendly flow:

```
Provider
  -> Login (/provider/login)
  -> Member Verification (/provider/verification)
  -> Submit Invoice (/provider/invoices)
       -> Fill invoice details (member, treatment date, invoice no, amount, diagnosis)
       -> Upload required documents (final bill + reports)
       -> Submission checks
            -> If missing final bill/reports: system blocks submission until uploaded
            -> If ok: Submit (status = Submitted)
  -> Track status (/provider/payments)

Admin
  -> Review (/admin/claims)
       -> Request Additional Information -> Provider responds -> Re-review
       -> Reject
       -> Mark In Process

Accountant
  -> Payout (/admin/accountant)
       -> Approve after payout completion

Provider
  -> See Approved status in /provider/payments
  -> Download PV/approval docs (if uploaded)
```

1. Provider verifies eligibility: `/provider/verification`.
2. Provider submits invoice: `/provider/invoices`.
3. Provider uploads required supporting documents (final bill and reports are mandatory for submission).
4. Claim is created with status Submitted and appears in:
   - Provider: `/provider/payments`
   - Admin: `/admin/claims`
   - Member history (if the claim is linked to the member in the directory): `/member/history`
5. Admin reviews the claim and updates status:
   - Request Additional Information: provider supplies missing documents and admin re-reviews.
   - Rejected: provider sees rejection in Payment History.
   - In Process: claim is queued for payout.
6. Accountant completes payout and marks Approved.
7. Provider downloads PV/approval documents (if uploaded) from `/provider/payments`.

### 4.4 Admin + Accountant Payout Process
This section describes the operational flow after a claim is ready for payout.

1. Admin completes claim review in `/admin/claims`.
2. Admin marks the claim In Process when it is ready for payout.
3. Accountant opens `/admin/accountant` to process only In Process claims.
4. Accountant verifies payout readiness (payee bank/payout profile exists, correct amount and references).
5. Accountant marks the claim Approved after payout completion.
6. Post-approval:
   - Member sees Approved status in `/member/history`.
   - Provider sees Approved status in `/provider/payments` and can download PV if available.

---

## 5. Member Portal Guide

### 5.1 Navigation
Member portal pages:
- My Dashboard: `/member/dashboard`
- Submit Claim: `/member/claims`
- My History: `/member/history`
- My Policy: `/member/policy`

### 5.2 My Dashboard
Use the dashboard to:
- Confirm you are logged in with the correct member identity.
- Review high-level benefit information and available balances (as presented by your deployment data).

### 5.3 Submit Claim (Reimbursement)
Path: `/member/claims`

The submission is a guided multi-step flow (4 steps). The exact fields shown depend on the category and selections, but the process is consistent.

#### Step 1 — Select Patient
- Choose who the claim is for:
  - Self (employee)
  - Dependent (spouse/child/parent if configured for your company)
- Confirm the displayed ID and relationship before continuing.

#### Step 2 — Claim Details
- Choose claim category.
- Enter visit date.
- Enter provider/hospital name.
- Enter invoice/receipt number (if applicable).
- Enter claim amount.

#### Step 3 — Medical Details & Supporting Documents
- Add at least one diagnosis (required to submit).
- Upload supporting documents based on your case:
  - Receipt(s): required for reimbursement claims.
  - Referral letter: if you are claiming under a referral case.
  - MC (Medical Certificate) and RL: depending on your policy and MC selection.

#### Step 4 — Review & Submit
- Review all inputs for accuracy.
- Submit the claim and confirm the success message.

Typical required fields include:
- Patient selection: self or dependent (if dependents exist under your profile).
- Claim category.
- Visit date.
- Provider / hospital name.
- Claim amount.
- Invoice/receipt number.
- Diagnosis (at least one diagnosis must be added).
- Supporting documents (receipts and other documents depending on the claim).

Important rules enforced by the system:
- Visit date must be within 14 days (older visits cannot be submitted).
- If a referral letter is used, the referral date must be within 14 days of the visit date.
- MC logic:
  - For employee (Self) claims, you can select MC Y/N and provide MC date range when required.
  - For dependent claims, MC is not required by the system flow.

What happens after you submit:
- Your claim status starts as Submitted.
- If Admin requests more details, the claim moves to Request Additional Information.
- Once your claim is prepared for payout, it moves to In Process.
- After payout completion, it becomes Approved (or Rejected if not eligible).

Submission outcome:
- After successful submission, the system generates a Claim ID and shows a confirmation.
- Your claim appears in My History and will move through lifecycle statuses based on review.

### 5.4 My History (Claims + Cashless + Panel Visits)
Path: `/member/history`

History may include:
- Reimbursement claims you submitted.
- Cashless claims created by providers (invoices) that match your membership.
- Panel visit transactions (if your deployment records panel visits).

You can typically:
- Filter by status and year.
- Search by keywords.
- Open details for each record.
- Download or open attachments when provided (for example, bank slip / payout proof if available).

### 5.5 My Policy
Path: `/member/policy`

Use this page to view benefit/policy details configured for your company plan.

---

## 6. Provider Portal Guide

### 6.1 Navigation
Provider portal pages:
- Dashboard: `/provider/dashboard`
- Submit Invoice: `/provider/invoices`
- Payment History: `/provider/payments`
- Compliance: `/provider/compliance`
- Member Verification: `/provider/verification`

### 6.2 Member Verification
Path: `/provider/verification`

Use Member Verification to confirm a member’s eligibility before providing services.
Typical flow:
1. Enter member identifiers or scan where supported by the UI.
2. Review the returned coverage/eligibility details.
3. Proceed with service only when eligibility is confirmed.

### 6.3 Submit Invoice (Cashless Claim Submission)
Path: `/provider/invoices`

Use this flow to submit an invoice that will become a provider cashless claim.
Typical information required includes:
- Member/patient identification.
- Treatment date.
- Invoice number and amount.
- Doctor and diagnosis details (based on your role and permissions).
- Supporting documents.

Important document rule:
- Final bill and reports must be uploaded to submit successfully. If missing, the system blocks submission until they are provided.

After submission:
- The claim appears in Payment History with lifecycle status tracking.
- If Admin requests additional information, you must provide the requested details/documents and resubmit/update as instructed.

Provider best-practice flow (recommended SOP):
1. Verify member eligibility before treatment: `/provider/verification`.
2. Collect final bill + clinical report during/after treatment.
3. Submit invoice promptly and ensure invoice number and amount are correct.
4. Monitor `/provider/payments` for status updates and admin requests.

### 6.4 Payment History
Path: `/provider/payments`

Use this page to:
- Track all submitted invoices and their current lifecycle status.
- Open details of each invoice/claim.
- Download approval or payout documents (PV) when they are uploaded and the claim is approved.

### 6.5 Compliance
Path: `/provider/compliance`

Use this page to manage compliance documents and licensing requirements (for example, APC uploads where required by your organization).

---

## 7. Admin Portal Guide

### 7.1 Navigation
Admin portal pages:
- Dashboard: `/admin/dashboard`
- Claim Management: `/admin/claims`
- Accountant: `/admin/accountant`
- Medications: `/admin/medications`
- User Management: `/admin/users`
- Corporate Management: `/admin/companies`
- Vendor Management: `/admin/vendors`
- Reports & Analytics: `/admin/reports`
- System Config: `/admin/config`

### 7.2 Dashboard
Path: `/admin/dashboard`

Use the dashboard for a quick overview of operations and shortcuts to key management areas.

### 7.3 Claim Management (Unified)
Path: `/admin/claims`

This is the central workflow for both:
- Member Claims (reimbursement submissions)
- Vendor/Provider Claims (cashless invoices)

Typical admin actions:
- Review claim details and attachments.
- Request Additional Information: provide a note describing what is missing.
- Reject: provide a reason/note.
- Mark In Process: indicates the claim is ready for payout preparation.
- Track the lifecycle status and audit context for follow-up.

Recommended review checklist:
- Identify claim source:
  - Member reimbursement: check receipt, visit date, category, amount, diagnosis, and required supporting docs.
  - Provider cashless: check invoice details, final bill and reports, treatment date, and provider details.
- Validate basic rules:
  - Member visit date within allowed submission window (14-day rule).
  - Referral documents (if any) satisfy the 14-day relationship to visit date.
- Validate payee readiness:
  - If claim will be paid out soon, confirm payout profile exists (member/vendor bank details).

Request Additional Information loop:
1. Admin sets status to Request Additional Information and writes a note.
2. Member/Provider provides missing information or uploads required documents.
3. Admin re-checks and either rejects, or marks In Process.

#### Admin Decision Tree (Quick Guide)
Copy-friendly decision tree:

```
Open claim (/admin/claims)
  -> Review details + attachments
       -> If missing info:
            - Set status = Request Additional Information
            - Write a clear note (what is missing)
       -> If not eligible:
            - Set status = Rejected
            - Write a clear reason
       -> If complete and eligible:
            - Set status = In Process
            - Accountant completes payout in /admin/accountant
            - Status becomes Approved after payout
```

Claim detail page (provider-focused review):
- `/admin/claims/[id]`

### 7.4 Accountant Workspace
Path: `/admin/accountant`

This workspace is designed for payout completion. Only claims with `In Process` appear here.
Key rule:
- Claims without required payout profile information remain visible but cannot be marked Approved until payout profile data exists.

### 7.5 Corporate Management
Path: `/admin/companies`

Use this page to manage corporate/company records and settings used by member policies and eligibility.

### 7.6 Vendor Management
Path: `/admin/vendors`

Use this page to:
- Manage provider/vendor information.
- Review provider compliance and associated doctors/APC status where configured.

### 7.7 User Management
Path: `/admin/users`

Use this page to manage internal accounts and portal access:
- Create users, reset passwords, and manage role assignments based on your permissions.

### 7.8 Reports & Analytics
Path: `/admin/reports`

Use this page to:
- Filter by company and period (month).
- View summarized metrics.
- Download payout logs (CSV) for accounting reconciliation.

### 7.9 System Configuration
Path: `/admin/config`

Use this area to manage master data and system settings:
- Categories: `/admin/config/categories`
- Master data: `/admin/config/master-data`
- Service type rules: `/admin/config/master-data/service-types`

---

## 8. Accountant Workflow (Admin)
This section describes the recommended operational sequence when the Accountant Workspace is used.

1. Admin reviews claims in Claim Management and sets qualifying claims to In Process.
2. Accountant opens `/admin/accountant` to see only claims that are In Process.
3. Accountant verifies payout readiness:
   - Bank account / payout profile information exists for the correct payee (member or provider).
4. Accountant marks the claim Approved only when payout info exists and payment is confirmed.
5. Optional: Admin uploads payout voucher/proof documents for provider visibility where required by SOP.

### 8.1 Accountant Workspace Process Diagram
Copy-friendly process (sequence):

```
1) Admin reviews claim + attachments (/admin/claims)
2) Admin marks claim In Process
3) Accountant opens Accountant Workspace (/admin/accountant)
   - Shows In Process claims only
4) Accountant verifies payout profile exists (member/vendor bank/payout info)
   - If missing: hold claim (cannot approve yet)
   - If OK: complete payout
5) Accountant marks Approved
6) Member sees Approved in /member/history
7) Provider sees Approved in /provider/payments (and can download PV if uploaded)
```

---

## 9. Customer / Corporate Portal Guide (Status)
Customer portal routes exist under `/customer/*`, but the portal is currently disabled by configuration and shows a “Corporate Portal is not active” message instead of the full UI.

If your deployment enables it in the future, these pages are available:
- Dashboard: `/customer/dashboard`
- Employee Management: `/customer/members`
- Claims Overview: `/customer/claims`
- Company Profile: `/customer/profile`

---

## 10. Notifications & Downloads

### 10.1 Status Change Notifications
Depending on deployment configuration, members/providers may receive email notifications when claim statuses change (Submitted → In Process → Approved, etc.).

### 10.2 Downloads
Common downloadable items include:
- Provider PV / approval documents (in Provider Payment History when a claim is approved and PV is uploaded).
- Member bank slip / payout proof attachments (when made available in claim history).
- Admin payout logs (CSV) from Reports & Analytics.

---

## 11. Common Issues & Troubleshooting

### 11.1 “Redirected back to login”
- Ensure you are using the correct portal login page.
- Your session may have expired; log in again.
- If you were forced to change password, complete the Change Password step first.

### 11.2 “Claims cannot be submitted for visits older than 14 days”
- The Member reimbursement flow enforces a 14-day submission window from the visit date.
- Submit earlier visits only if your organization’s SOP allows and the system is configured to accept them (admin/system rule changes required).

### 11.3 “Final bill and reports are required”
- Provider invoice submission requires final bill and reports before submission can complete.

### 11.4 “Requested additional information”
- Read the note left by the reviewer and attach the requested documents.
- Resubmit or update according to the instructions shown in your portal.

---

## Appendix A — Quick Route Reference
- Admin: `/admin/login`, `/admin/dashboard`, `/admin/claims`, `/admin/accountant`, `/admin/reports`
- Member: `/member/login`, `/member/dashboard`, `/member/claims`, `/member/history`, `/member/policy`
- Provider: `/provider/login`, `/provider/dashboard`, `/provider/invoices`, `/provider/payments`, `/provider/verification`, `/provider/compliance`
- Customer: `/customer/login` (inactive by default)
