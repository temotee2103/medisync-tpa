# Admin Console Role RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `staff` admin role with `accountant`, centralize Admin Console permissions, and enforce the approved `Admin / Super Admin / Accountant` behavior across routes and page actions.

**Architecture:** Add a shared admin-permissions module as the single source of truth for route access, page mutability, and delete privileges. Keep `AdminLayout` responsible for route visibility and redirects, and keep each admin page responsible for disabling or hiding its own actions based on shared helpers. Because this repo has no automated test harness yet, validate with targeted ESLint, file diagnostics, and a role-by-role manual checklist.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth, browser-side session helpers, React client components

---

## File Map

### Create

- `src/lib/adminPermissions.ts` - shared RBAC helpers for route access, read-only mode, accountant write access, and delete permission
- `docs/superpowers/plans/2026-05-26-admin-console-role-rbac.md` - this execution plan

### Modify

- `src/lib/adminSession.ts` - replace `staff` with `accountant`, normalize role resolution, and export the updated `AdminRole`
- `src/app/api/admin/admin-users/create-user/route.ts` - accept and persist `accountant`
- `src/app/admin/layout.tsx` - route access, nav filtering, and safe fallback behavior via shared helpers
- `src/app/admin/accountant/page.tsx` - lock actions to `accountant` and `super_admin`, keep `admin` read-only
- `src/app/admin/claims/page.tsx` - disable review actions for `accountant`, keep delete `super_admin` only
- `src/app/admin/claims/[id]/ClaimDetailClient.tsx` - disable review actions for `accountant`
- `src/app/admin/users/page.tsx` - update admin role options to `Admin / Super Admin / Accountant`, enforce read-only and delete rules
- `src/app/admin/vendors/page.tsx` - enforce read-only for `accountant`, delete only for `super_admin`
- `src/app/admin/companies/page.tsx` - enforce read-only for `accountant`, delete only for `super_admin`
- `src/app/admin/medications/_components/CatalogPanel.tsx` - enforce read-only for `accountant`, delete only for `super_admin`
- `src/app/admin/config/page.tsx` - pass read-only state into config entry points if needed
- `src/app/admin/config/master-data/page.tsx` - disable config actions for `accountant`
- `src/app/admin/config/master-data/service-types/page.tsx` - disable config actions for `accountant`
- `src/app/admin/config/categories/page.tsx` - disable config actions for `accountant`

### Verification Targets

- `src/lib/adminSession.ts`
- `src/lib/adminPermissions.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/accountant/page.tsx`
- `src/app/admin/claims/page.tsx`
- `src/app/admin/claims/[id]/ClaimDetailClient.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/vendors/page.tsx`
- `src/app/admin/companies/page.tsx`
- `src/app/admin/medications/_components/CatalogPanel.tsx`
- `src/app/admin/config/page.tsx`
- `src/app/admin/config/master-data/page.tsx`
- `src/app/admin/config/master-data/service-types/page.tsx`
- `src/app/admin/config/categories/page.tsx`

## Preconditions

- The approved spec is `docs/superpowers/specs/2026-05-26-admin-console-role-rbac-design.md`
- Do not change provider roles; `Admin / Doctor` in vendor member management stays as-is
- Do not broaden delete permission beyond `super_admin`
- Do not let `admin` execute finance completion on `/admin/accountant`

## Validation Strategy

- Use `npx eslint <touched files>` for targeted linting instead of repo-wide lint
- Use `GetDiagnostics` on every edited file group
- Run one manual browser pass per role:
  - `admin`
  - `super_admin`
  - `accountant`

### Task 1: Centralize Admin Roles And Permission Helpers

**Files:**
- Create: `src/lib/adminPermissions.ts`
- Modify: `src/lib/adminSession.ts`
- Modify: `src/app/api/admin/admin-users/create-user/route.ts`

- [ ] **Step 1: Add the shared permission helper file**

```ts
// src/lib/adminPermissions.ts
import type { AdminRole } from "@/lib/adminSession";

const ACCOUNTANT_ROUTE = "/admin/accountant";

export const canAccessAdminRoute = (role: AdminRole, path: string) => {
  const normalized = (path || "").replace(/\/+$/, "");
  if (!normalized.startsWith("/admin")) return false;
  return role === "super_admin" || role === "admin" || role === "accountant";
};

export const canOperateAccountantPage = (role: AdminRole) =>
  role === "super_admin" || role === "accountant";

export const canDeleteAdminResource = (role: AdminRole) => role === "super_admin";

export const isAdminReadOnly = (role: AdminRole, path: string) => {
  const normalized = (path || "").replace(/\/+$/, "");
  if (role === "accountant" && normalized !== ACCOUNTANT_ROUTE) return true;
  if (role === "admin" && normalized === ACCOUNTANT_ROUTE) return true;
  return false;
};

export const canOperateAdminPage = (role: AdminRole, path: string) => {
  if (!canAccessAdminRoute(role, path)) return false;
  return !isAdminReadOnly(role, path);
};
```

- [ ] **Step 2: Update the admin role model from `staff` to `accountant`**

```ts
// src/lib/adminSession.ts
export type AdminRole = "super_admin" | "admin" | "accountant";

const toAdminRole = (value: unknown): AdminRole => {
  if (value === "super_admin" || value === "admin" || value === "accountant") return value;
  return "accountant";
};
```

- [ ] **Step 3: Update admin-user creation API to accept `accountant`**

```ts
// src/app/api/admin/admin-users/create-user/route.ts
const role =
  body.role === "super_admin" || body.role === "admin" || body.role === "accountant"
    ? body.role
    : "accountant";
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/lib/adminPermissions.ts src/lib/adminSession.ts src/app/api/admin/admin-users/create-user/route.ts
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminPermissions.ts src/lib/adminSession.ts src/app/api/admin/admin-users/create-user/route.ts
git commit -m "refactor: centralize admin role permissions"
```

### Task 2: Move Route Gating Into `AdminLayout`

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Replace inline role logic with shared helpers**

```ts
// src/app/admin/layout.tsx
import { canAccessAdminRoute } from "@/lib/adminPermissions";
import type { AdminRole } from "@/lib/adminSession";

const [adminRole, setAdminRole] = useState<AdminRole>("accountant");
```

- [ ] **Step 2: Update session role parsing**

```ts
const role =
  roleKey === "super_admin" || roleKey === "admin" || roleKey === "accountant"
    ? roleKey
    : "accountant";

if (!canAccessAdminRoute(role as AdminRole, normalizedPath)) {
  router.replace("/admin/dashboard");
}
```

- [ ] **Step 3: Keep all admin routes visible to all three roles**

```ts
const navItems = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Claim Management", href: "/admin/claims", icon: FileText },
  { name: "Accountant", href: "/admin/accountant", icon: CreditCard },
  { name: "Medications", href: "/admin/medications", icon: Pill },
  { name: "User Management", href: "/admin/users", icon: Users },
  { name: "Corporate Management", href: "/admin/companies", icon: Building2 },
  { name: "Vendor Management", href: "/admin/vendors", icon: Stethoscope },
  { name: "Reports & Analytics", href: "/admin/reports", icon: FileText },
  { name: "System Config", href: "/admin/config", icon: Settings },
].filter((item) => canAccessAdminRoute(adminRole, item.href));
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/app/admin/layout.tsx
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "refactor: use shared admin route access in layout"
```

### Task 3: Lock The Accountant Workspace To Finance Roles

**Files:**
- Modify: `src/app/admin/accountant/page.tsx`

- [ ] **Step 1: Import shared permission helpers**

```ts
// src/app/admin/accountant/page.tsx
import { canOperateAccountantPage, isAdminReadOnly } from "@/lib/adminPermissions";
```

- [ ] **Step 2: Add a read-only gate for `admin` and a write gate for `accountant` / `super_admin`**

```ts
const isReadOnly = adminSession ? isAdminReadOnly(adminSession.role, "/admin/accountant") : true;
const canSubmitCompletion = adminSession ? canOperateAccountantPage(adminSession.role) : false;

if (!canSubmitCompletion) {
  setCompletionError("This role can view the accountant queue but cannot complete payment here.");
  return;
}
```

- [ ] **Step 3: Disable action buttons and upload controls in read-only mode**

```tsx
<GlassButton
  disabled={isReadOnly || item.payoutStatus === "missing" || submittingId === item.id}
  onClick={() => openCompletionModal(item)}
>
  Complete Payment
</GlassButton>
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/app/admin/accountant/page.tsx
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/accountant/page.tsx
git commit -m "feat: restrict accountant workspace actions by role"
```

### Task 4: Make Claims Screens Read-Only For `Accountant`

**Files:**
- Modify: `src/app/admin/claims/page.tsx`
- Modify: `src/app/admin/claims/[id]/ClaimDetailClient.tsx`

- [ ] **Step 1: Add shared page mutability flags**

```ts
// claims page + claim detail
import { canDeleteAdminResource, canOperateAdminPage } from "@/lib/adminPermissions";

const canOperateClaims = adminSession ? canOperateAdminPage(adminSession.role, "/admin/claims") : false;
const canDeleteClaims = adminSession ? canDeleteAdminResource(adminSession.role) : false;
```

- [ ] **Step 2: Gate claim review handlers**

```ts
if (!canOperateClaims || !adminSession?.profileId) {
  setProviderSubmissionError("This role can view claims but cannot perform review actions.");
  return;
}
```

- [ ] **Step 3: Gate buttons and keep delete `super_admin` only**

```tsx
<GlassButton disabled={!canOperateClaims || memberLifecycleSubmittingId === claim.id || !canMarkInProcess(status)}>
  <Clock3 className="w-4 h-4" />
</GlassButton>

{canDeleteClaims && (
  <GlassButton variant="ghost" title="Delete Claim" aria-label="Delete Claim">
    <Trash2 className="w-4 h-4" />
  </GlassButton>
)}
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/app/admin/claims/page.tsx src/app/admin/claims/[id]/ClaimDetailClient.tsx
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/claims/page.tsx src/app/admin/claims/[id]/ClaimDetailClient.tsx
git commit -m "feat: enforce claim review permissions by admin role"
```

### Task 5: Update Admin User Management To The New Role Set

**Files:**
- Modify: `src/app/admin/users/page.tsx`

- [ ] **Step 1: Replace `staff` UI options and defaults with `accountant`**

```ts
// src/app/admin/users/page.tsx
const [newAdminForm, setNewAdminForm] = useState({
  adminId: "",
  fullName: "",
  email: "",
  password: "",
  role: "accountant" as "super_admin" | "admin" | "accountant",
});
```

```tsx
<option value="admin">Admin</option>
<option value="super_admin">Super Admin</option>
<option value="accountant">Accountant</option>
```

- [ ] **Step 2: Add page-level mutability flags**

```ts
import { canDeleteAdminResource, canOperateAdminPage } from "@/lib/adminPermissions";

const canOperateUsers = adminSession ? canOperateAdminPage(adminSession.role, "/admin/users") : false;
const canDeleteUsers = adminSession ? canDeleteAdminResource(adminSession.role) : false;
```

- [ ] **Step 3: Disable create, edit, reset-password, approval, and delete actions based on role**

```tsx
<GlassButton disabled={!canOperateUsers} onClick={saveNewAdminAccount}>
  Save Admin
</GlassButton>

<GlassButton variant="ghost" disabled={!canOperateUsers} onClick={() => resetMemberPassword(member)}>
  Reset Password
</GlassButton>

{canDeleteUsers && (
  <GlassButton variant="ghost" onClick={() => removeAdminUser(user)}>
    <XCircle className="w-4 h-4" />
  </GlassButton>
)}
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/app/admin/users/page.tsx
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/users/page.tsx
git commit -m "feat: align admin user management with accountant role"
```

### Task 6: Enforce Read-Only And Delete Rules On Vendors, Companies, Medications, And Config

**Files:**
- Modify: `src/app/admin/vendors/page.tsx`
- Modify: `src/app/admin/companies/page.tsx`
- Modify: `src/app/admin/medications/_components/CatalogPanel.tsx`
- Modify: `src/app/admin/config/page.tsx`
- Modify: `src/app/admin/config/master-data/page.tsx`
- Modify: `src/app/admin/config/master-data/service-types/page.tsx`
- Modify: `src/app/admin/config/categories/page.tsx`

- [ ] **Step 1: Add shared permission flags to each page**

```ts
import { canDeleteAdminResource, canOperateAdminPage, isAdminReadOnly } from "@/lib/adminPermissions";

const canOperateVendors = adminSession ? canOperateAdminPage(adminSession.role, "/admin/vendors") : false;
const canDeleteVendors = adminSession ? canDeleteAdminResource(adminSession.role) : false;
const isVendorReadOnly = adminSession ? isAdminReadOnly(adminSession.role, "/admin/vendors") : true;
```

- [ ] **Step 2: Convert existing `isSuperAdmin` checks into delete-only checks**

```tsx
{canDeleteVendors && (
  <GlassButton variant="ghost" title="Delete vendor" onClick={() => deleteVendor(vendor)}>
    <XCircle className="w-4 h-4" />
  </GlassButton>
)}
```

```tsx
{canDeleteCompanies && (
  <GlassButton variant="ghost" title="Delete company">
    <XCircle className="w-4 h-4" />
  </GlassButton>
)}
```

- [ ] **Step 3: Disable non-delete actions for `accountant`**

```tsx
<GlassButton disabled={isVendorReadOnly} onClick={() => openAddVendorMember(vendor)}>
  <UserPlus className="w-4 h-4" />
</GlassButton>

<GlassButton disabled={isVendorReadOnly || bulkReviewStatus !== null} onClick={() => void reviewCredentialDecision(item.credentialId!, "approved")}>
  Approve
</GlassButton>

<GlassButton disabled={isMedicationReadOnly || loading} onClick={() => void addManual()}>
  Add Item
</GlassButton>
```

- [ ] **Step 4: Run targeted lint**

Run:

```bash
npx eslint src/app/admin/vendors/page.tsx src/app/admin/companies/page.tsx src/app/admin/medications/_components/CatalogPanel.tsx src/app/admin/config/page.tsx src/app/admin/config/master-data/page.tsx src/app/admin/config/master-data/service-types/page.tsx src/app/admin/config/categories/page.tsx
```

Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vendors/page.tsx src/app/admin/companies/page.tsx src/app/admin/medications/_components/CatalogPanel.tsx src/app/admin/config/page.tsx src/app/admin/config/master-data/page.tsx src/app/admin/config/master-data/service-types/page.tsx src/app/admin/config/categories/page.tsx
git commit -m "feat: apply admin role permissions across admin management pages"
```

### Task 7: Final Diagnostics And Role Matrix Verification

**Files:**
- Verify: `src/lib/adminPermissions.ts`
- Verify: `src/lib/adminSession.ts`
- Verify: `src/app/admin/layout.tsx`
- Verify: `src/app/admin/accountant/page.tsx`
- Verify: `src/app/admin/claims/page.tsx`
- Verify: `src/app/admin/claims/[id]/ClaimDetailClient.tsx`
- Verify: `src/app/admin/users/page.tsx`
- Verify: `src/app/admin/vendors/page.tsx`
- Verify: `src/app/admin/companies/page.tsx`
- Verify: `src/app/admin/medications/_components/CatalogPanel.tsx`
- Verify: `src/app/admin/config/page.tsx`
- Verify: `src/app/admin/config/master-data/page.tsx`
- Verify: `src/app/admin/config/master-data/service-types/page.tsx`
- Verify: `src/app/admin/config/categories/page.tsx`

- [ ] **Step 1: Run final targeted lint**

Run:

```bash
npx eslint src/lib/adminPermissions.ts src/lib/adminSession.ts src/app/admin/layout.tsx src/app/admin/accountant/page.tsx src/app/admin/claims/page.tsx src/app/admin/claims/[id]/ClaimDetailClient.tsx src/app/admin/users/page.tsx src/app/admin/vendors/page.tsx src/app/admin/companies/page.tsx src/app/admin/medications/_components/CatalogPanel.tsx src/app/admin/config/page.tsx src/app/admin/config/master-data/page.tsx src/app/admin/config/master-data/service-types/page.tsx src/app/admin/config/categories/page.tsx
```

Expected: exit code `0`

- [ ] **Step 2: Run file diagnostics**

Use editor diagnostics for every touched file above.

Expected: no new diagnostics in touched files

- [ ] **Step 3: Execute the manual role matrix**

Manual checklist:

```text
super_admin:
- sees all routes
- can delete claim/company/vendor where supported
- can operate accountant page

admin:
- sees all routes
- cannot delete anywhere
- can review claims
- can edit business pages
- sees accountant page as read-only

accountant:
- sees all routes
- cannot act on claims, users, vendors, companies, medications, or config
- can act only on /admin/accountant
```

- [ ] **Step 4: Capture final summary**

```text
- replaced staff with accountant
- centralized admin permissions
- preserved delete for super_admin only
- preserved accountant-only action scope on /admin/accountant
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminPermissions.ts src/lib/adminSession.ts src/app/admin/layout.tsx src/app/admin/accountant/page.tsx src/app/admin/claims/page.tsx src/app/admin/claims/[id]/ClaimDetailClient.tsx src/app/admin/users/page.tsx src/app/admin/vendors/page.tsx src/app/admin/companies/page.tsx src/app/admin/medications/_components/CatalogPanel.tsx src/app/admin/config/page.tsx src/app/admin/config/master-data/page.tsx src/app/admin/config/master-data/service-types/page.tsx src/app/admin/config/categories/page.tsx
git commit -m "feat: finalize admin console role rbac"
```

## Self-Review

### Spec Coverage

- role replacement from `staff` to `accountant` is covered in Task 1 and Task 5
- centralized permission source is covered in Task 1
- layout route access is covered in Task 2
- accountant-only write access on `/admin/accountant` is covered in Task 3
- claim pages read-only for `accountant` are covered in Task 4
- delete restricted to `super_admin` is covered in Tasks 4 and 6
- CRUD page read-only behavior for `accountant` is covered in Tasks 5 and 6

### Placeholder Scan

- no `TODO` or `TBD` placeholders remain
- each code-changing task includes concrete file paths, code snippets, commands, and commit messages

### Type Consistency

- all tasks use `AdminRole = "super_admin" | "admin" | "accountant"`
- shared helpers consistently reference `canAccessAdminRoute`, `canOperateAdminPage`, `canDeleteAdminResource`, `canOperateAccountantPage`, and `isAdminReadOnly`
