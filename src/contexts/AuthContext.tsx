import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutFirebase,
} from '../lib/firebase';
import { UserProjectRole } from '../types/sap';
import {
  CurrentUser,
  getCurrentUser,
  setCurrentUser,
} from '../utils/authStorage';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'toc80.lee@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'toc80.lee@gmail.com',
  'toc50.park@gmail.com',
];

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  isFirebaseAuthenticated: boolean;
  activeUser: CurrentUser;
  projectRole: UserProjectRole;
  setProjectRole: (role: UserProjectRole) => void;
  switchPresetUser: (u: CurrentUser) => void;
  loginWithGoogle: () => Promise<User | null>;
  logoutGoogle: () => Promise<void>;
  authError: string | null;
}

const ROLE_STORAGE_KEY = 'sap_spec_user_project_role_v1';

const AuthContext = createContext<AuthContextValue | null>(null);

function sanitizeId(raw: string): string {
  return (raw || 'user').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeUser, setActiveUser] = useState<CurrentUser>(() => getCurrentUser());
  const [projectRole, setProjectRoleState] = useState<UserProjectRole>(() => {
    try {
      const saved = localStorage.getItem(ROLE_STORAGE_KEY) as UserProjectRole | null;
      if (saved && ['PM', 'FUNC', 'ABAP', 'QA', 'ADMIN'].includes(saved)) return saved;
    } catch {
      // ignore
    }
    return 'PM';
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const setProjectRole = (role: UserProjectRole) => {
    setProjectRoleState(role);
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user) {
        const uid = sanitizeId(user.uid);
        const displayName = (user.displayName || user.email?.split('@')[0] || 'SAP User').slice(0, 80);
        const isBootAdmin =
          Boolean(user.email && BOOTSTRAPPED_ADMIN_EMAILS.includes(user.email.toLowerCase())) &&
          user.emailVerified;

        const syncedUser: CurrentUser = {
          id: uid,
          name: displayName,
          role: isBootAdmin ? 'Platform Admin / Architect' : projectRole,
          department: 'SAP ERP Project Workspace',
          email: user.email || '',
        };
        setCurrentUser(syncedUser);
        setActiveUser(syncedUser);

        if (isBootAdmin) {
          setProjectRoleState('ADMIN');
        }

        if (user.emailVerified) {
          // Ensure public profile (no PII) and private PII doc exist per split-collection rule
          const publicPath = `users/${uid}`;
          try {
            const publicRef = doc(db, 'users', uid);
            await setDoc(
              publicRef,
              {
                uid,
                displayName,
                role: ['PM', 'FUNC', 'ABAP', 'QA'].includes(projectRole) ? projectRole : 'PM',
                department: 'SAP ERP Team',
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (err) {
            console.warn('Public profile sync skipped:', err);
          }

          if (user.email) {
            const privatePath = `users/${uid}/private/info`;
            try {
              const privateRef = doc(db, 'users', uid, 'private', 'info');
              const existingPriv = await getDoc(privateRef);
              if (!existingPriv.exists()) {
                await setDoc(privateRef, {
                  uid,
                  email: user.email.slice(0, 200),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                await setDoc(
                  privateRef,
                  {
                    uid,
                    email: user.email.slice(0, 200),
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, privatePath);
            }
          }

          // Bootstrap admin document if signed-in user matches bootstrapped admin email
          if (isBootAdmin && user.email) {
            try {
              const adminRef = doc(db, 'admins', uid);
              const existingAdmin = await getDoc(adminRef);
              if (!existingAdmin.exists()) {
                await setDoc(adminRef, {
                  uid,
                  email: user.email.slice(0, 200),
                  createdAt: serverTimestamp(),
                });
              }
            } catch (err) {
              console.warn('Admin bootstrap notice:', err);
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const switchPresetUser = (u: CurrentUser) => {
    setCurrentUser(u);
    setActiveUser(u);
  };

  const loginWithGoogle = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const user = await signInWithGoogle();
      return user;
    } catch (err: any) {
      const msg = err?.message || 'Google sign-in failed.';
      setAuthError(msg);
      return null;
    }
  };

  const logoutGoogle = async (): Promise<void> => {
    setAuthError(null);
    try {
      await signOutFirebase();
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-out failed.');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        isFirebaseAuthenticated: Boolean(firebaseUser && firebaseUser.emailVerified),
        activeUser,
        projectRole,
        setProjectRole,
        switchPresetUser,
        loginWithGoogle,
        logoutGoogle,
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
