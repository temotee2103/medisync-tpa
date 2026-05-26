# Admin Console Role RBAC

## Objective

Refine `Admin Console` role behavior into three clear roles so the system matches real operational responsibilities:

- `Admin` handles normal day-to-day work across the console
- `Super Admin` can perform all actions, including destructive actions
- `Accountant` can view all admin pages, but can only operate inside the dedicated accountant workspace

This design removes the old `staff` behavior, which currently mixes limited access with some operational actions that no longer match the intended finance workflow.

## Problems Today

- Current admin roles are still modeled as `super_admin`, `admin`, and `staff`
- `staff` is not a true read-only finance role and still retains some operational claim actions
- Route access and page action permissions are partly split across layout logic and local component conditions
- Delete permissions are not consistently modeled as a cross-cutting rule
- There is no single role matrix that clearly defines who can view versus who can act

## Scope

This design covers:

- new admin role set
- route-access rules for all admin pages
- page-level action rules
- delete restrictions
- accountant read-only behavior outside `/admin/accountant`
- implementation boundary for centralized role helpers

This design does not yet cover:

- exact migration SQL for converting old `staff` rows to `accountant`
- historical audit backfill
- non-admin portal permissions

## Final Role Model

### Admin

`Admin` is the normal operational role.

`Admin` can:

- access all admin pages
- perform normal business actions
- create, edit, review, upload, approve, reject, request additional information, and update statuses where the page normally allows it

`Admin` cannot:

- perform any delete action

### Super Admin

`Super Admin` is unrestricted.

`Super Admin` can:

- access all admin pages
- perform all actions
- perform all delete actions

### Accountant

`Accountant` is a finance-focused role with broad visibility but narrow write access.

`Accountant` can:

- access all admin pages
- review all records, forms, statuses, payout information, and attachments
- perform accountant actions inside `/admin/accountant`

`Accountant` cannot outside `/admin/accountant`:

- create
- edit
- upload
- review
- approve
- reject
- request more information
- change statuses
- reset passwords
- delete

## Core Permission Rules

### Read Versus Operate

The system must distinguish between:

- `can access page`
- `can operate on page`
- `can delete resource`

These must not be treated as the same permission.

### Delete Rule

Delete is reserved for `Super Admin` only.

Delete includes:

- deleting records
- deleting users
- deleting vendors
- deleting companies
- deleting attachments or credentials
- any irreversible remove action

### Accountant Rule

`Accountant` can enter all admin routes, but every non-accountant page must render in read-only mode.

Read-only means:

- action buttons are hidden or disabled
- forms are disabled
- uploads are disabled
- state transitions are disabled
- batch actions are disabled
- submit handlers are blocked

The only exception is `/admin/accountant`, where `Accountant` is allowed to perform finance completion work.

## Route Access Matrix

### Dashboard

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Claim Management

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Claim Detail

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Accountant

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Medications

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### User Management

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Corporate Management

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Vendor Management

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### Reports And Analytics

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

### System Config

- `Admin`: access
- `Super Admin`: access
- `Accountant`: access

## Page Action Matrix

### Claim Management And Claim Detail

- `Admin`: can perform review-stage actions
- `Super Admin`: can perform all actions
- `Accountant`: read-only

Review-stage actions include:

- review
- mark `in_process`
- request additional information
- reject

`Accountant` does not perform review actions here.

### Accountant Page

- `Admin`: read-only
- `Super Admin`: full access
- `Accountant`: full access

This keeps finance completion work inside one dedicated workspace and avoids role overlap.

### User Management

- `Admin`: create and edit allowed, delete not allowed
- `Super Admin`: full access including delete
- `Accountant`: read-only

Examples under this rule:

- create admin user
- create provider user
- edit member or vendor user data
- reset password

Reset password is an operational action, so it is allowed for `Admin` and `Super Admin`, but not for `Accountant`.

### Corporate Management

- `Admin`: create and edit allowed, delete not allowed
- `Super Admin`: full access including delete
- `Accountant`: read-only

### Vendor Management

- `Admin`: create, edit, upload, review, and create member login allowed, delete not allowed
- `Super Admin`: full access including delete
- `Accountant`: read-only

Delete restrictions here include:

- delete vendor
- delete credential
- delete other destructive remove actions

### Medications

- `Admin`: create and edit allowed, delete not allowed
- `Super Admin`: full access including delete
- `Accountant`: read-only

### Reports And Analytics

- `Admin`: read access
- `Super Admin`: read access
- `Accountant`: read access

If export exists, export is treated as a read action and can remain available to all three roles.

### System Config

- `Admin`: normal config edits allowed, delete not allowed
- `Super Admin`: full access including delete
- `Accountant`: read-only

## Implementation Architecture

Role enforcement must move to centralized helper functions instead of scattering role checks across pages.

Recommended helper shape:

- `canAccessAdminRoute(role, path)`
- `canOperateAdminPage(role, path)`
- `canDeleteAdminResource(role)`
- `canOperateAccountantPage(role)`
- `isAdminReadOnly(role, path)`

### Layout Responsibility

`AdminLayout` should decide:

- which routes are visible in navigation
- whether the current route is accessible
- whether redirect is needed

### Page Responsibility

Each page or action component should decide:

- whether action buttons are visible
- whether forms are enabled
- whether submit handlers should execute

This keeps route access and action access separate and predictable.

## Data And Migration Direction

Current `staff` role should be replaced operationally by `accountant`.

Expected direction:

- `profile_roles.role_key = 'staff'` becomes `accountant` for admin portal users that belong to the finance role
- frontend `AdminRole` type changes from `super_admin | admin | staff` to `super_admin | admin | accountant`
- fallback handling should default to the safest non-destructive role during rollout

The exact migration SQL is implementation detail and can be defined in the execution plan.

## Error Handling And Safety

- If role resolution fails, default to the safest behavior
- safest behavior means page access may remain available only where already required by login flow, but actions must stay disabled until role is known
- destructive buttons must not rely on UI hiding alone; handler-level checks must also block execution
- accountant write access outside `/admin/accountant` must be prevented both in UI state and in action handlers

## Success Criteria

The change is successful when:

- `Admin` can do all normal console work except delete
- `Super Admin` can do everything
- `Accountant` can enter all admin pages but only operate in `/admin/accountant`
- old `staff`-style claim operations no longer exist
- delete behavior is consistent across pages
- role rules are defined from one shared permission source

## Testing Focus

Manual verification should cover:

- each role logging in and seeing the correct navigation
- each role opening every main admin page
- `Accountant` seeing non-accountant pages in read-only mode
- `Accountant` successfully operating on `/admin/accountant`
- `Admin` being blocked from all delete actions
- `Super Admin` retaining all delete actions
- direct button-handler attempts being blocked when role is not allowed
