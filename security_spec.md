# Security Specification & Dirty Dozen Adversarial Test Suite (RBAC v2)

## 1. Data Invariants
1. **Verified Identity Only**: All write operations and admin checks require `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: Email addresses reside strictly at `/users/{userId}/private/info` and are readable only by `userId == request.auth.uid` or a verified admin (`isAdmin()`). `/users/{userId}` holds only non-PII (`uid`, `displayName`, `photoURL`, `role`, `status`, `assignedProjects`, `projectRole`, `department`, `createdAt`, `updatedAt`).
3. **Approval Gate (`status == 'approved'`)**: Only verified users whose `/users/{uid}.status == 'approved'` (or verified admins) can read `common` or `project` data or perform any write across projects, specs, snapshots, comments, meetings, or custom DDIC tables. Users in `'pending'` or `'rejected'` status are blocked at the Firestore rules level.
4. **Anti-Self-Privilege Escalation**:
   - On `/users/{userId}` creation, non-bootstrapped callers MUST initialize with `role == 'user'`, `status == 'pending'`, and `assignedProjects.size() == 0`.
   - On `/users/{userId}` update by the owner, `role`, `status`, and `assignedProjects` MUST remain unchanged (`affectedKeys().hasOnly(['displayName', 'photoURL', 'projectRole', 'department', 'updatedAt'])`). Only `isAdmin()` can mutate `status`, `role`, or `assignedProjects`.
   - Non-admins cannot create/update/delete `/admins/{userId}`.
5. **Project Isolation (`project` scope)**: Any read/write to `/projects/{projectId}` (where `visibility == 'project'`) or its subcollections (`/specs`, `/snapshots`, `/comments`, `/meetings`) requires the caller to be `status == 'approved'` AND explicitly assigned to that project (`projectId in user.assignedProjects` or `uid in project.memberUids` or `ownerId == uid`) or `isAdmin()`. Cross-project access is strictly denied.
6. **Personal Temp Strict Privacy (`temp` scope)**: Documents with `visibility == 'temp'` or `projectVisibility == 'temp'` inside `/specs`, `/snapshots`, `/comments`, and `/meetings` are strictly readable, writable, and deletable ONLY by their creator (`authorId == request.auth.uid`). Teammates and other users (including admins) cannot read or modify another user's private `temp` documents.
7. **Common Standards Read/Write Governance (`common` scope)**: Documents with `visibility == 'common'` are readable by any `'approved'` user and writable/deletable only by `isAdmin()`.
8. **Lifecycle Approval Lock & Immutable Ledger**: Approved/QA-passed specs lock `specData` against non-admin direct mutation without status transition; revision snapshots (`update: if false`) and `createdAt` / `authorId` / `project_code` remain immutable; `createdAt`/`updatedAt` strictly equal `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **ID Poisoning**: Creating `/projects/A...2000chars` -> rejected by `isValidId(projectId)` (`size() <= 128` and regex).
2. **Shadow Ghost Field**: Updating `/users/{uid}` or `/projects/{projectId}/specs/{specId}` with `{ ..., isVerifiedAdmin: true }` -> rejected by `affectedKeys().hasOnly(...)` & `keys().hasOnly(...)`.
3. **Unverified Email Spoofing**: Calling write with `{ email: 'toc80.lee@gmail.com', email_verified: false }` -> rejected by `email_verified == true`.
4. **PII Cross-User Read**: User B calling `get('/users/userA/private/info')` -> rejected by `isOwner(userId) || isAdmin()`.
5. **Client Timestamp Forgery**: Creating user/spec with `createdAt: Timestamp(1999-01-01)` -> rejected by `incoming().createdAt == request.time`.
6. **Author Identity Spoofing**: User B creating a spec with `authorId: 'userA'` -> rejected by `incoming().authorId == request.auth.uid`.
7. **Self-Approval / Role Escalation**: Pending User B updating `/users/{uidB}` with `{ status: 'approved', role: 'admin', assignedProjects: ['2601'] }` -> rejected by `incoming().status == existing().status` & `affectedKeys().hasOnly(...)`.
8. **Pending/Rejected User Data Probe**: Pending User B reading `/projects/2601/specs/s1` or `/projects/COMM/specs/ZRALV0010` -> rejected by `isApprovedUser()`.
9. **Cross-Project Isolation Breach**: Approved User B (assigned only to `2601`) reading or listing `/projects/2602/specs` -> rejected by `isAssignedToProject('2602')` and `request.auth.uid in existing().projectMemberUids`.
10. **Personal Temp Snooping**: Teammate User B or Admin reading `/projects/TEMP/specs/specUserA` (`authorId == 'userA'`) -> rejected by `existing().authorId == request.auth.uid`.
11. **Snapshot & Approval Tampering**: Attempting `update` on `/snapshots/{snapId}` or non-admin editing `specData` on an `approved` spec -> rejected.
12. **Blanket List Query Bypass**: Executing unfiltered `list` on `/users`, `/projects`, or `/specs` without ownership/membership/bootstrapped-admin predicates -> rejected by `allow list` without `get()`/`exists()`.
