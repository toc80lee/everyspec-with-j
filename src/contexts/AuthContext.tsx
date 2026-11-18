import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  auth,
  db,
  isFirestoreQuotaExceeded,
  isFirestoreQuotaExceededError,
  reportFirestoreQuotaExceeded,
  signInWithGoogle,
  signOutFirebase,
} from '../lib/firebase';
import { SapProject, UserProfileRecord, UserProjectRole } from '../types/sap';
import { CurrentUser, getCurrentUser, setCurrentUser } from '../utils/authStorage';
import {
  BOOTSTRAPPED_ADMIN_EMAILS,
  ensureUserProfileOnSignIn,
  isBootstrappedAdminEmail,
  sanitizeFirebaseId,
  subscribeCurrentUserProfile,
} from '../services/userManagementService';
import { getEffectiveMemberRole, normalizeProjectRole } from '../utils/projectRoles';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'toc80.lee@gmail.com';
export { BOOTSTRAPPED_ADMIN_EMAILS };

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  profileLoading: boolean;
  isFirebaseAuthenticated: boolean;
  userProfile: UserProfileRecord | null;
  isAdmin: boolean;
  isApproved: boolean;
  activeUser: CurrentUser;
  projectRole: UserProjectRole;
  setProjectRole: (role: UserProjectRole) => void;
  resolveEffectiveProjectRole: (project?: SapProject | null) => UserProjectRole;
  loginWithGoogle: () => Promise<User | null>;
  logoutGoogle: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authError: string | null;
}

const ROLE_STORAGE_KEY = 'sap_spec_user_project_role_v1';

function clampNonAdminRole(role: unknown, fallback: UserProjectRole = 'FUNC'): UserProjectRole {
  const normalized = normalizeProjectRole(role, fallback);
  return normalized === 'ADMIN' ? 'FUNC' : normalized;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);
  const [activeUser, setActiveUser] = useState<CurrentUser>(() => getCurrentUser());
  const [projectRole, setProjectRoleState] = useState<UserProjectRole>('FUNC');
  const [authError, setAuthError] = useState<string | null>(null);

  const isAdmin = Boolean(
    firebaseUser?.emailVerified &&
      (isBootstrappedAdminEmail(firebaseUser.email) ||
        userProfile?.role === 'admin' ||
        hasAdminDoc)
  );

  const isApproved = Boolean(
    firebaseUser?.emailVerified &&
      (isAdmin || userProfile?.status === 'approved')
  );

  // Only verified Admins may switch role preview; non-admins strictly inherit Firestore-assigned role
  const setProjectRole = useCallback(
    (role: UserProjectRole) => {
      if (!isAdmin) {
        return;
      }
      setProjectRoleState(role);
      try {
        localStorage.setItem(ROLE_STORAGE_KEY, role);
      } catch {
        // ignore
      }
    },
    [isAdmin]
  );

  const resolveEffectiveProjectRole = useCallback(
    (project?: SapProject | null): UserProjectRole => {
      if (isAdmin) {
        return projectRole;
      }
      const safeProfileRole = clampNonAdminRole(userProfile?.projectRole, 'FUNC');
      const effective = getEffectiveMemberRole(
        project ?? undefined,
        userProfile?.uid,
        safeProfileRole
      );
      return effective === 'ADMIN' ? 'FUNC' : effective;
    },
    [isAdmin, projectRole, userProfile?.projectRole, userProfile?.uid]
  );

  const syncLegacyActiveUser = useCallback(
    (user: User, profile: UserProfileRecord | null) => {
      const uid = sanitizeFirebaseId(user.uid);
      const displayName = (
        profile?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'SAP User'
      ).slice(0, 80);
      const adminFlag =
        Boolean(user.emailVerified && isBootstrappedAdminEmail(user.email)) ||
        profile?.role === 'admin';

      const assignedProfileRole = clampNonAdminRole(profile?.projectRole, 'FUNC');

      let resolvedRole: UserProjectRole = assignedProfileRole;
      if (adminFlag) {
        resolvedRole = 'ADMIN';
        try {
          const savedPreview = localStorage.getItem(ROLE_STORAGE_KEY) as UserProjectRole | null;
          if (savedPreview && ['PM', 'FUNC', 'ABAP', 'QA', 'PI', 'ADMIN'].includes(savedPreview)) {
            resolvedRole = savedPreview;
          }
        } catch {
          // ignore
        }
      } else {
        try {
          localStorage.removeItem(ROLE_STORAGE_KEY);
        } catch {
          // ignore
        }
      }

      setProjectRoleState(resolvedRole);

      const syncedUser: CurrentUser = {
        id: uid,
        name: displayName,
        role: adminFlag
          ? 'Platform Admin / Architect'
          : assignedProfileRole,
        department: profile?.department || 'SAP ERP Project Workspace',
        email: user.email || profile?.email || '',
      };
      setCurrentUser(syncedUser);
      setActiveUser(syncedUser);
    },
    []
  );

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let profileSafetyTimer: ReturnType<typeof setTimeout> | null = null;
    let authSequence = 0;

    const clearSafetyTimer = () => {
      if (profileSafetyTimer !== null) {
        clearTimeout(profileSafetyTimer);
        profileSafetyTimer = null;
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const seq = ++authSequence;
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      clearSafetyTimer();

      setFirebaseUser(user);
      setAuthReady(true);

      if (!user) {
        setUserProfile(null);
        setHasAdminDoc(false);
        setProjectRoleState('FUNC');
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setAuthError(null);
      const uid = sanitizeFirebaseId(user.uid);

      profileSafetyTimer = setTimeout(() => {
        if (seq !== authSequence) return;
        setProfileLoading((loading) => {
          if (loading) {
            setAuthError(
              '사용자 권한 프로필 조회가 지연되고 있습니다. 네트워크 상태를 확인하거나 새로고침해 주세요.'
            );
          }
          return false;
        });
      }, 10_000);

      try {
        const ensured = await ensureUserProfileOnSignIn(user, 'FUNC');
        if (seq !== authSequence) return;
        setUserProfile(ensured);
        syncLegacyActiveUser(user, ensured);

        if (user.emailVerified && !isFirestoreQuotaExceeded()) {
          if (!isBootstrappedAdminEmail(user.email)) {
            try {
              const adminSnap = await getDoc(doc(db, 'admins', uid));
              if (seq === authSequence) {
                setHasAdminDoc(adminSnap.exists());
              }
            } catch (adminErr) {
              if (isFirestoreQuotaExceededError(adminErr)) {
                reportFirestoreQuotaExceeded(adminErr);
              }
              if (seq === authSequence) {
                setHasAdminDoc(false);
              }
            }
          }

          if (seq !== authSequence) return;

          if (!isFirestoreQuotaExceeded()) {
            unsubProfile = subscribeCurrentUserProfile(
              uid,
              user.email || '',
              (liveProfile) => {
                if (seq !== authSequence) return;
                clearSafetyTimer();
                if (liveProfile) {
                  setUserProfile(liveProfile);
                  syncLegacyActiveUser(user, liveProfile);
                }
                setProfileLoading(false);
              },
              (err) => {
                if (seq !== authSequence) return;
                clearSafetyTimer();
                if (isFirestoreQuotaExceededError(err)) {
                  reportFirestoreQuotaExceeded(err);
                } else {
                  console.warn('User profile listener warning:', err);
                }
                setProfileLoading(false);
              }
            );
          } else {
            clearSafetyTimer();
            setProfileLoading(false);
          }
        } else {
          clearSafetyTimer();
          setProfileLoading(false);
        }
      } catch (err: any) {
        if (seq !== authSequence) return;
        clearSafetyTimer();
        if (isFirestoreQuotaExceededError(err)) {
          reportFirestoreQuotaExceeded(err);
        } else {
          console.error('Failed to initialize user profile:', err);
          setAuthError(err?.message || 'Failed to load user profile.');
        }
        setProfileLoading(false);
      }
    });

    return () => {
      authSequence++;
      clearSafetyTimer();
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, [syncLegacyActiveUser]);

  const refreshProfile = async (): Promise<void> => {
    if (!firebaseUser || isFirestoreQuotaExceeded()) return;
    setProfileLoading(true);
    try {
      const uid = sanitizeFirebaseId(firebaseUser.uid);
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const refreshed: UserProfileRecord = {
          uid: d.uid || uid,
          email: firebaseUser.email || '',
          displayName: d.displayName || firebaseUser.displayName || 'SAP User',
          photoURL: d.photoURL || firebaseUser.photoURL || '',
          role: d.role === 'admin' ? 'admin' : 'user',
          status:
            d.status === 'approved' || d.status === 'rejected' || d.status === 'pending'
              ? d.status
              : 'pending',
          assignedProjects: Array.isArray(d.assignedProjects) ? d.assignedProjects : [],
          projectRole: d.projectRole || (d.role === 'admin' ? 'ADMIN' : 'FUNC'),
          department: d.department || 'SAP Project Team',
        };
        setUserProfile(refreshed);
        syncLegacyActiveUser(firebaseUser, refreshed);
      }
    } catch (err: any) {
      if (isFirestoreQuotaExceededError(err)) {
        reportFirestoreQuotaExceeded(err);
      } else {
        setAuthError(err?.message || 'Failed to refresh profile status.');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const user = await signInWithGoogle();
      return user;
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('로그인이 취소되었습니다. Google 계정을 선택해 다시 로그인해 주세요.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          '브라우저에서 로그인 팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 시도해 주세요.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `현재 도메인(${host || 'unknown'})이 Firebase 인증 승인 도메인에 등록되지 않았습니다. Firebase Console > Authentication > Settings > 승인된 도메인에 해당 도메인을 추가한 뒤 새로고침해 주세요.`
        );
      } else {
        setAuthError(err?.message || 'Google sign-in failed.');
      }
      return null;
    }
  };

  const logoutGoogle = async (): Promise<void> => {
    setAuthError(null);
    try {
      await signOutFirebase();
      setUserProfile(null);
      setHasAdminDoc(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-out failed.');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        profileLoading,
        isFirebaseAuthenticated: Boolean(firebaseUser && firebaseUser.emailVerified),
        userProfile,
        isAdmin,
        isApproved,
        activeUser,
        projectRole,
        setProjectRole,
        resolveEffectiveProjectRole,
        loginWithGoogle,
        logoutGoogle,
        refreshProfile,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
