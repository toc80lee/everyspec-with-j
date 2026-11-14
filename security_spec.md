# Phase 0: Security Specification & Dirty Dozen Adversarial Test Suite

## 1. Data Invariants
1. **Verified Identity Only**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: Email addresses reside strictly at `/users/{userId}/private/info` and are readable only by `userId == request.auth.uid` or a verified admin. `/users/{userId}` holds only non-PII (`displayName`, `role`, `department`).
3. **Self-Assigned Admin Block**: Users cannot add themselves to `/admins/{userId}` or elevate role privileges in public profiles to `'ADMIN'`.
4. **Master Gate Membership**: Any read/write to `/projects/{projectId}/specs/{specId}`, `/snapshots/{snapshotId}`, or `/meetings/{minuteId}` must belong to an existing parent project where the caller is `ownerId` or in `memberUids`.
5. **TEMP Private Isolation & COMMON Immutability**: Specs in `TEMP` are visible/writable only by their `authorId`. Specs in `COMMON` cannot be modified or deleted by non-admins.
6. **Lifecycle Approval Lock (Terminal Outcome Guard)**: Once a `ProgramSpecDoc` transitions to `status == 'approved'` or `status == 'qa_passed'`, non-admin contributors cannot mutate its specification payload (`specData`) directly without transitioning state or admin override; `authorId`, `project_code`, and `createdAt` remain permanently immutable.
7. **Immutable Snapshot Ledger**: Revision snapshots at `/projects/{projectId}/specs/{specId}/snapshots/{snapshotId}` cannot be modified (`update: if false`) once created.
8. **Temporal Integrity**: `createdAt` on create and `updatedAt` on update must strictly equal `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **ID Poisoning**: Creating `/projects/A...2000chars` -> rejected by `isValidId(projectId)` (`size() <= 128` and regex).
2. **Shadow Ghost Field**: Updating `/projects/{projectId}/specs/{specId}` with `{ ..., isVerifiedAdmin: true }` -> rejected by `affectedKeys().hasOnly(...)` & `keys().hasOnly(...)`.
3. **Unverified Email Spoofing**: Calling write with `{ email: 'toc50.park@gmail.com', email_verified: false }` -> rejected by `email_verified == true`.
4. **PII Cross-User Read**: User B calling `get('/users/userA/private/info')` -> rejected by `isOwner(userId)`.
5. **Client Timestamp Forgery**: Creating spec with `createdAt: Timestamp(1999-01-01)` -> rejected by `incoming().createdAt == request.time`.
6. **Author Identity Spoofing**: User B creating a spec with `authorId: 'userA'` -> rejected by `incoming().authorId == request.auth.uid`.
7. **Immutable Field Mutation**: Updating spec to change `authorId` or `project_code` or `createdAt` -> rejected by `incoming().authorId == existing().authorId`.
8. **Orphaned Spec Creation**: Creating spec under nonexistent `/projects/NONEXISTENT/specs/s1` -> rejected by `exists(/databases/$(database)/documents/projects/$(projectId))`.
9. **Approval Lock Bypass**: Non-admin editing `specData` while `existing().status == 'approved'` -> rejected by approval lock gate.
10. **Snapshot Tampering**: Attempting `update` on `/projects/{projectId}/specs/{specId}/snapshots/{snapId}` -> rejected by `allow update: if false`.
11. **Self-Admin Escalation**: Non-admin creating `/admins/{myUid}` or setting `role: 'ADMIN'` on `/users/{myUid}` -> rejected.
12. **Blanket List Query Bypass**: Executing unfiltered `list` on `/projects/{projectId}/specs` where `resource.data` is `TEMP` belonging to another user -> rejected by `allow list` `resource.data.authorId == request.auth.uid` check.
