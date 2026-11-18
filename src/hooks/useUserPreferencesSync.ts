import { useEffect, useRef } from 'react';
import {
  SapGuiTheme,
  isValidSapGuiTheme,
  saveSapTheme,
} from '../data/sapGuiThemes';
import type { DualSplitLayout } from '../components/TopNav';
import {
  subscribeUserPreferences,
  syncUserPreferencesToFirestore,
} from '../services/firestoreSync';
import { getFavoriteProgramIds, setFavoriteProgramIds } from '../utils/favoriteStorage';
import { DUAL_SPLIT_CYCLE } from './useSplitWorkspace';

interface UseUserPreferencesSyncParams {
  isFirebaseAuthenticated: boolean;
  uid?: string;
  favoriteProgramIds: string[];
  setFavoriteProgramIdsState: (ids: string[]) => void;
  currentTheme: SapGuiTheme;
  setCurrentTheme: (theme: SapGuiTheme) => void;
  splitLayout: DualSplitLayout;
  setSplitLayout: (layout: DualSplitLayout) => void;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  splitRatioRef: React.MutableRefObject<number>;
  isResizingSplit: boolean;
}

export function useUserPreferencesSync({
  isFirebaseAuthenticated,
  uid,
  favoriteProgramIds,
  setFavoriteProgramIdsState,
  currentTheme,
  setCurrentTheme,
  splitLayout,
  setSplitLayout,
  splitRatio,
  setSplitRatio,
  splitRatioRef,
  isResizingSplit,
}: UseUserPreferencesSyncParams): void {
  const prefsHydratedRef = useRef(false);
  const applyingRemotePrefsRef = useRef(false);
  const latestLocalRef = useRef({ currentTheme, splitLayout });
  latestLocalRef.current = { currentTheme, splitLayout };

  useEffect(() => {
    prefsHydratedRef.current = false;
    if (!isFirebaseAuthenticated || !uid) return;

    const unsubscribe = subscribeUserPreferences(uid, (remotePrefs) => {
      if (!remotePrefs) {
        prefsHydratedRef.current = true;
        void syncUserPreferencesToFirestore({
          favoriteProgramIds: getFavoriteProgramIds(uid),
          sapGuiTheme: latestLocalRef.current.currentTheme,
          splitLayout: latestLocalRef.current.splitLayout,
          splitRatio: splitRatioRef.current,
        }).catch(() => {});
        return;
      }

      applyingRemotePrefsRef.current = true;
      if (Array.isArray(remotePrefs.favoriteProgramIds)) {
        const syncedFavs = setFavoriteProgramIds(uid, remotePrefs.favoriteProgramIds);
        setFavoriteProgramIdsState(syncedFavs);
      }
      if (remotePrefs.sapGuiTheme && isValidSapGuiTheme(remotePrefs.sapGuiTheme)) {
        setCurrentTheme(remotePrefs.sapGuiTheme);
        saveSapTheme(remotePrefs.sapGuiTheme);
      }
      if (remotePrefs.splitLayout && DUAL_SPLIT_CYCLE.includes(remotePrefs.splitLayout)) {
        setSplitLayout(remotePrefs.splitLayout);
        try {
          localStorage.setItem('sap_spec_dual_split_layout', remotePrefs.splitLayout);
        } catch {
          // ignore
        }
      }
      if (
        typeof remotePrefs.splitRatio === 'number' &&
        remotePrefs.splitRatio >= 20 &&
        remotePrefs.splitRatio <= 80
      ) {
        setSplitRatio(remotePrefs.splitRatio);
        splitRatioRef.current = remotePrefs.splitRatio;
        try {
          localStorage.setItem('sap_spec_dual_split_ratio', String(remotePrefs.splitRatio));
        } catch {
          // ignore
        }
      }
      prefsHydratedRef.current = true;
      window.setTimeout(() => {
        applyingRemotePrefsRef.current = false;
      }, 0);
    });

    return () => {
      unsubscribe();
      prefsHydratedRef.current = false;
    };
  }, [
    isFirebaseAuthenticated,
    uid,
    setFavoriteProgramIdsState,
    setCurrentTheme,
    setSplitLayout,
    setSplitRatio,
    splitRatioRef,
  ]);

  useEffect(() => {
    if (
      !isFirebaseAuthenticated ||
      !uid ||
      !prefsHydratedRef.current ||
      applyingRemotePrefsRef.current ||
      isResizingSplit
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncUserPreferencesToFirestore({
        favoriteProgramIds,
        sapGuiTheme: currentTheme,
        splitLayout,
        splitRatio,
      }).catch((err) => {
        console.warn('User preferences sync notice:', err);
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    isFirebaseAuthenticated,
    uid,
    favoriteProgramIds,
    currentTheme,
    splitLayout,
    splitRatio,
    isResizingSplit,
  ]);
}
