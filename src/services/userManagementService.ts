import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  SapProject,
  UserAccountRole,
  UserApprovalStatus,
  UserProfileRecord,
  UserProjectRole,
} from '../types/sap';
import { COMMON_PROJECT_CODE, TEMP_PROJECT_CODE } from '../utils/projectStorage';
import { isValidProjectRole, normalizeProjectRole } from '../utils/projectRoles';

export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'toc80.lee@gmail.com',
  'toc50.park@gmail.com',
];

export function sanitizeFirebaseId(raw: string): string {
  return (raw || 'user').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return BOOTSTRAPPED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function toIsoString(ts: any): string | undefined {
  if (!ts) return undefined;
  if (typeof ts === 'string') return ts;
  if (typeof ts?.toDate === 'function') {
    try {
      return ts.toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function mapDocToUserProfile(uid: string, data: Record<string, any>, fallbackEmail = ''): UserProfileRecord {
  const rawRole = data.role === 'admin' || data.role === 'user' ? data.role : 'user';
  const rawStatus =
    data.status === 'approved' || data.status === 'rejected' || data.status === 'pending'
      ? data.status
      : 'pending';
  const rawProjectRole: UserProjectRole = isValidProjectRole(data.projectRole)
    ? data.projectRole
    : rawRole === 'admin'
    ? 'ADMIN'
    : 'FUNC';

  return {
    uid: data.uid || uid,
    email: fallbackEmail || data.email || '',
    displayName: data.displayName || 'SAP User',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
    role: rawRole,
    status: rawStatus,
    assignedProjects: Array.isArray(data.assignedProjects)
      ? data.assignedProjects.filter((c): c is string => typeof c === 'string')
      : [],
    projectRole: rawProjectRole,
    department: data.department || 'SAP Project Team',
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/**
 * Ensures /users/{uid}, /users/{uid}/private/info, and (if bootstrapped admin) /admins/{uid}
 * exist in Firestore on Google OAuth sign-in without allowing client-side privilege escalation.
 */
export async function ensureUserProfileOnSignIn(
  user: User,
  defaultProjectRole: UserProjectRole = 'FUNC'
): Promise<UserProfileRecord> {
  const uid = sanitizeFirebaseId(user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'SAP User').slice(0, 80);
  const photoURL = (user.photoURL || '').slice(0, 500);
  const email = (user.email || '').slice(0, 200);
  const isBootAdmin = Boolean(user.emailVerified && isBootstrappedAdminEmail(user.email));

  const publicPath = `users/${uid}`;
  const publicRef = doc(db, 'users', uid);

  let profile: UserProfileRecord = {
    uid,
    email,
    displayName,
    photoURL,
    role: isBootAdmin ? 'admin' : 'user',
    status: isBootAdmin ? 'approved' : 'pending',
    assignedProjects: [],
    projectRole: isBootAdmin ? 'ADMIN' : defaultProjectRole === 'ADMIN' ? 'FUNC' : defaultProjectRole,
    department: isBootAdmin ? 'ERP Development Team' : 'SAP Project Team',
  };

  if (!user.emailVerified) {
    return profile;
  }

  try {
    const existingPublic = await getDoc(publicRef);
    if (!existingPublic.exists()) {
      await setDoc(publicRef, {
        uid,
        displayName,
        photoURL,
        role: isBootAdmin ? 'admin' : 'user',
        status: isBootAdmin ? 'approved' : 'pending',
        assignedProjects: [],
        projectRole: profile.projectRole,
        department: profile.department,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = existingPublic.data() || {};
      const isLegacyDoc =
        !('status' in data) ||
        !('assignedProjects' in data) ||
        !('createdAt' in data) ||
        !['admin', 'user'].includes(data.role);

      if (isLegacyDoc) {
        const nextRole: UserAccountRole = isBootAdmin ? 'admin' : 'user';
        const nextStatus: UserApprovalStatus = isBootAdmin ? 'approved' : 'pending';
        const nextAssigned: string[] = Array.isArray(data.assignedProjects)
          ? data.assignedProjects
          : [];
        await setDoc(publicRef, {
          uid,
          displayName: data.displayName || displayName,
          photoURL: photoURL || data.photoURL || '',
          role: nextRole,
          status: nextStatus,
          assignedProjects: nextAssigned,
          projectRole: isBootAdmin ? 'ADMIN' : 'FUNC',
          department: data.department || profile.department,
          createdAt: data.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        profile = {
          ...profile,
          displayName: data.displayName || displayName,
          photoURL: photoURL || data.photoURL || '',
          role: nextRole,
          status: nextStatus,
          assignedProjects: nextAssigned,
        };
      } else {
        const parsed = mapDocToUserProfile(uid, data, email);
        profile = {
          ...parsed,
          displayName: parsed.displayName || displayName,
          photoURL: photoURL || parsed.photoURL,
        };
        if (
          (displayName && data.displayName !== displayName) ||
          (photoURL && data.photoURL !== photoURL)
        ) {
          await updateDoc(publicRef, {
            displayName,
            photoURL,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  if (email) {
    const privatePath = `users/${uid}/private/info`;
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    try {
      const existingPriv = await getDoc(privateRef);
      if (!existingPriv.exists()) {
        await setDoc(privateRef, {
          uid,
          email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (existingPriv.data()?.email !== email) {
        await updateDoc(privateRef, {
          email,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, privatePath);
    }
  }

  if (isBootAdmin && email) {
    const adminPath = `admins/${uid}`;
    try {
      const adminRef = doc(db, 'admins', uid);
      const existingAdmin = await getDoc(adminRef);
      if (!existingAdmin.exists()) {
        await setDoc(adminRef, {
          uid,
          email,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Admin bootstrap notice:', err);
    }
  }

  return profile;
}

export function subscribeCurrentUserProfile(
  uid: string,
  fallbackEmail: string,
  onProfile: (profile: UserProfileRecord | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const cleanUid = sanitizeFirebaseId(uid);
  const path = `users/${cleanUid}`;
  const ref = doc(db, 'users', cleanUid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      onProfile(mapDocToUserProfile(cleanUid, snap.data() || {}, fallbackEmail));
    },
    (err) => {
      if (onError) {
        onError(err);
      } else {
        handleFirestoreError(err, OperationType.GET, path);
      }
    }
  );
}

/**
 * Admin-only real-time listener for all registered users + private email resolution.
 */
export function subscribeAllUsersForAdmin(
  onUsers: (users: UserProfileRecord[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const colPath = 'users';
  const emailCache = new Map<string, string>();

  return onSnapshot(
    collection(db, colPath),
    async (snapshot) => {
      const baseProfiles = snapshot.docs.map((docSnap) =>
        mapDocToUserProfile(docSnap.id, docSnap.data() || {}, emailCache.get(docSnap.id) || '')
      );

      // Enrich missing emails from PII-isolated /users/{uid}/private/info
      const missingEmailProfiles = baseProfiles.filter((u) => !emailCache.has(u.uid));
      if (missingEmailProfiles.length > 0) {
        await Promise.all(
          missingEmailProfiles.map(async (u) => {
            try {
              const privSnap = await getDoc(doc(db, 'users', u.uid, 'private', 'info'));
              if (privSnap.exists()) {
                const emailVal = privSnap.data()?.email;
                if (typeof emailVal === 'string') {
                  emailCache.set(u.uid, emailVal);
                }
              }
            } catch {
              // Ignore individual private doc misses gracefully
            }
          })
        );
      }

      const enriched = baseProfiles
        .map((u) => ({
          ...u,
          email: emailCache.get(u.uid) || u.email || '',
        }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      onUsers(enriched);
    },
    (err) => {
      if (onError) {
        onError(err);
      } else {
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    }
  );
}

export async function updateUserApprovalStatus(
  targetUid: string,
  status: UserApprovalStatus,
  projectRole?: UserProjectRole
): Promise<void> {
  const cleanUid = sanitizeFirebaseId(targetUid);
  const path = `users/${cleanUid}`;
  try {
    const patch: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (projectRole && isValidProjectRole(projectRole)) {
      patch.projectRole = projectRole;
    }
    await updateDoc(doc(db, 'users', cleanUid), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserProjectRole(
  targetUid: string,
  projectRole: UserProjectRole
): Promise<void> {
  const cleanUid = sanitizeFirebaseId(targetUid);
  const path = `users/${cleanUid}`;
  const safeRole = normalizeProjectRole(projectRole, 'FUNC');
  try {
    await updateDoc(doc(db, 'users', cleanUid), {
      projectRole: safeRole,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserAccountRole(
  targetUid: string,
  role: UserAccountRole,
  email?: string
): Promise<void> {
  const cleanUid = sanitizeFirebaseId(targetUid);
  const path = `users/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'users', cleanUid), {
      role,
      projectRole: role === 'admin' ? 'ADMIN' : 'FUNC',
      updatedAt: serverTimestamp(),
    });

    const adminRef = doc(db, 'admins', cleanUid);
    if (role === 'admin' && email) {
      const existing = await getDoc(adminRef);
      if (!existing.exists()) {
        await setDoc(adminRef, {
          uid: cleanUid,
          email: email.slice(0, 200),
          createdAt: serverTimestamp(),
        });
      }
    } else if (role === 'user' && !isBootstrappedAdminEmail(email)) {
      const existing = await getDoc(adminRef);
      if (existing.exists()) {
        await deleteDoc(adminRef);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function syncProjectChildMemberUids(projectId: string, nextMemberUids: string[]): Promise<void> {
  const cleanProj = projectId.trim().toUpperCase();
  if (!cleanProj || cleanProj === COMMON_PROJECT_CODE || cleanProj === TEMP_PROJECT_CODE) return;

  try {
    const batch = writeBatch(db);
    let ops = 0;

    const specsSnap = await getDocs(collection(db, 'projects', cleanProj, 'specs'));
    specsSnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        projectMemberUids: nextMemberUids.slice(0, 50),
        updatedAt: serverTimestamp(),
      });
      ops += 1;
    });

    const meetingsSnap = await getDocs(collection(db, 'projects', cleanProj, 'meetings'));
    meetingsSnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        projectMemberUids: nextMemberUids.slice(0, 50),
        updatedAt: serverTimestamp(),
      });
      ops += 1;
    });

    if (ops > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn(`Child memberUid sync skipped for ${cleanProj}:`, err);
  }
}

/**
 * Atomically updates a user's `assignedProjects` list and syncs `memberUids`/`memberNames`
 * on every affected project document and its child specs/meetings.
 */
export async function updateUserAssignedProjects(
  targetUser: UserProfileRecord,
  nextAssignedProjects: string[],
  projectsCatalog: SapProject[]
): Promise<string[]> {
  const cleanUid = sanitizeFirebaseId(targetUser.uid);
  const normalizedProjects = Array.from(
    new Set(
      nextAssignedProjects
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c && c !== COMMON_PROJECT_CODE && c !== TEMP_PROJECT_CODE)
    )
  ).slice(0, 50);

  const prevSet = new Set(targetUser.assignedProjects.map((c) => c.trim().toUpperCase()));
  const nextSet = new Set(normalizedProjects);

  const userPath = `users/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'users', cleanUid), {
      assignedProjects: normalizedProjects,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }

  const impactedProjects = projectsCatalog.filter(
    (p) =>
      p.visibility === 'project' &&
      (prevSet.has(p.code.toUpperCase()) || nextSet.has(p.code.toUpperCase()))
  );

  for (const proj of impactedProjects) {
    const code = proj.code.toUpperCase();
    const shouldInclude = nextSet.has(code);
    const projRef = doc(db, 'projects', code);

    try {
      const snap = await getDoc(projRef);
      if (!snap.exists()) {
        const fallbackOwnerId = proj.ownerId || cleanUid;
        const nextUids = shouldInclude
          ? Array.from(new Set([fallbackOwnerId, cleanUid])).slice(0, 50)
          : [fallbackOwnerId];
        const nextNames = shouldInclude
          ? Array.from(new Set([...(proj.members || ['Josh Lee']), targetUser.displayName])).slice(0, 50)
          : proj.members || ['Josh Lee'];
        const nextMemberRoles: Record<string, UserProjectRole> = { ...(proj.memberRoles || {}) };
        if (shouldInclude) {
          nextMemberRoles[cleanUid] = normalizeProjectRole(
            nextMemberRoles[cleanUid] || targetUser.projectRole,
            'FUNC'
          );
        } else {
          delete nextMemberRoles[cleanUid];
        }
        await setDoc(projRef, {
          code,
          name: (proj.name || code).slice(0, 120),
          description: (proj.description || '').slice(0, 1000),
          visibility: 'project',
          target_sap_release: (proj.target_sap_release || 'SAP S/4HANA 2023').slice(0, 80),
          start_date: (proj.start_date || '').slice(0, 20),
          end_date: (proj.end_date || '').slice(0, 20),
          ownerId: fallbackOwnerId,
          ownerName: (proj.owner || 'Josh Lee').slice(0, 80),
          memberUids: nextUids,
          memberNames: nextNames,
          memberRoles: nextMemberRoles,
          modules: (proj.modules && proj.modules.length > 0 ? proj.modules : ['SD']).slice(0, 10),
          is_system: false,
          created_date: (proj.created_date || new Date().toISOString().split('T')[0]).slice(0, 30),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await syncProjectChildMemberUids(code, nextUids);
        continue;
      }

      const data = snap.data() || {};
      const existingUids: string[] = Array.isArray(data.memberUids) ? data.memberUids : [];
      const existingNames: string[] = Array.isArray(data.memberNames) ? data.memberNames : proj.members || [];
      const existingRoles: Record<string, UserProjectRole> =
        data.memberRoles && typeof data.memberRoles === 'object' ? { ...data.memberRoles } : {};

      let nextUids = existingUids.filter((id) => id !== cleanUid);
      let nextNames = existingNames.filter(
        (n) => n.trim().toLowerCase() !== targetUser.displayName.trim().toLowerCase()
      );

      if (shouldInclude) {
        nextUids = Array.from(new Set([...nextUids, cleanUid])).slice(0, 50);
        nextNames = Array.from(new Set([...nextNames, targetUser.displayName])).slice(0, 50);
        if (!existingRoles[cleanUid]) {
          existingRoles[cleanUid] = normalizeProjectRole(targetUser.projectRole, 'FUNC');
        }
      } else {
        delete existingRoles[cleanUid];
      }

      await updateDoc(projRef, {
        memberUids: nextUids,
        memberNames: nextNames,
        memberRoles: existingRoles,
        updatedAt: serverTimestamp(),
      });

      await syncProjectChildMemberUids(code, nextUids);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${code}`);
    }
  }

  return normalizedProjects;
}

/**
 * Syncs project membership changes initiated from ProjectManagerModal back to each user's `assignedProjects`
 * and updates `projectMemberUids` on child specs/meetings.
 */
export async function syncProjectMembershipChange(
  projectCode: string,
  nextMemberUids: string[],
  prevMemberUids: string[] = []
): Promise<void> {
  const cleanCode = projectCode.trim().toUpperCase();
  if (!cleanCode || cleanCode === COMMON_PROJECT_CODE || cleanCode === TEMP_PROJECT_CODE) return;

  const uniqueNextUids = Array.from(new Set(nextMemberUids.filter(Boolean)));
  const nextSet = new Set(uniqueNextUids);
  const removedUids = Array.from(new Set(prevMemberUids.filter(Boolean))).filter(
    (uid) => !nextSet.has(uid)
  );

  // Idempotently ensure every active member UID has cleanCode in assignedProjects
  for (const uid of uniqueNextUids) {
    const cleanUid = sanitizeFirebaseId(uid);
    try {
      const ref = doc(db, 'users', cleanUid);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const current: string[] = Array.isArray(snap.data()?.assignedProjects)
        ? snap.data().assignedProjects
        : [];
      if (!current.includes(cleanCode)) {
        await updateDoc(ref, {
          assignedProjects: [...current, cleanCode].slice(0, 50),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn(`Failed to add ${cleanCode} to user ${cleanUid}:`, err);
    }
  }

  for (const uid of removedUids) {
    const cleanUid = sanitizeFirebaseId(uid);
    try {
      const ref = doc(db, 'users', cleanUid);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const current: string[] = Array.isArray(snap.data()?.assignedProjects)
        ? snap.data().assignedProjects
        : [];
      const filtered = current.filter((c) => c !== cleanCode);
      if (filtered.length !== current.length) {
        await updateDoc(ref, {
          assignedProjects: filtered,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn(`Failed to remove ${cleanCode} from user ${cleanUid}:`, err);
    }
  }

  await syncProjectChildMemberUids(cleanCode, uniqueNextUids);
}
