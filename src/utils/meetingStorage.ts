import { ProjectMeetingMinute } from '../types/sap';
import { COMMON_PROJECT_CODE, TEMP_PROJECT_CODE, normalizeLegacyProjectCode } from './projectStorage';
import {
  deleteMeetingFromFirestore,
  syncMeetingMinuteToFirestore,
} from '../services/firestoreSync';

const MEETING_STORAGE_KEY = 'sap_spec_meeting_minutes_v1';
const PENDING_MEETING_WRITE_TTL_MS = 8000;
const pendingMeetingWrites = new Map<string, number>();

export function markMeetingPendingWrite(id?: string): void {
  const clean = (id || '').trim();
  if (!clean) return;
  pendingMeetingWrites.set(clean, Date.now() + PENDING_MEETING_WRITE_TTL_MS);
}

function isMeetingWritePending(id?: string): boolean {
  const clean = (id || '').trim();
  if (!clean) return false;
  const exp = pendingMeetingWrites.get(clean);
  if (!exp) return false;
  if (exp > Date.now()) return true;
  pendingMeetingWrites.delete(clean);
  return false;
}

export function formatNowDateTime(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function getMeetingMinutesList(): ProjectMeetingMinute[] {
  try {
    const raw = localStorage.getItem(MEETING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  } catch (err) {
    console.error('Failed to load meeting minutes from localStorage', err);
    return [];
  }
}

export function getMeetingMinuteById(id: string): ProjectMeetingMinute | undefined {
  return getMeetingMinutesList().find((m) => m.id === id);
}

/**
 * Retrieve meeting minutes visible within a project.
 * Enforces TEMP per-user isolation (author_id === currentUserId or author === currentUserName).
 */
export function getVisibleMinutesForProject(
  projectCode: string,
  currentUserName: string,
  currentUserId?: string
): ProjectMeetingMinute[] {
  const targetCode = normalizeLegacyProjectCode(projectCode || COMMON_PROJECT_CODE);
  const cleanUser = (currentUserName || '').trim();
  const cleanUid = (currentUserId || '').trim();
  const all = getMeetingMinutesList();

  return all.filter((m) => {
    const itemProj = normalizeLegacyProjectCode(m.project_code || TEMP_PROJECT_CODE);
    if (itemProj !== targetCode) return false;
    if (targetCode === TEMP_PROJECT_CODE) {
      if (cleanUid && m.author_id) {
        return m.author_id === cleanUid;
      }
      return (m.author || '').trim() === cleanUser;
    }
    return true;
  });
}

export function upsertMeetingMinutesFromRemote(remoteMinutes: ProjectMeetingMinute[]): ProjectMeetingMinute[] {
  const current = getMeetingMinutesList();
  const map = new Map<string, ProjectMeetingMinute>();
  current.forEach((m) => map.set(m.id, m));
  remoteMinutes.forEach((m) => {
    if (m && m.id) {
      map.set(m.id, m);
    }
  });
  const merged = Array.from(map.values()).sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  );
  try {
    localStorage.setItem(MEETING_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

/**
 * Reconcile cached meetings for a specific project against the authoritative Firestore snapshot,
 * propagating remote deletions even when remoteMinutes is empty.
 */
export function reconcileProjectMeetingsFromRemote(
  projectCode: string,
  remoteMinutes: ProjectMeetingMinute[],
  currentUserName?: string,
  currentUserId?: string
): ProjectMeetingMinute[] {
  const targetProj = normalizeLegacyProjectCode(projectCode || TEMP_PROJECT_CODE);
  const current = getMeetingMinutesList();
  const remoteMap = new Map<string, ProjectMeetingMinute>();
  remoteMinutes.forEach((m) => {
    if (m && m.id) remoteMap.set(m.id, m);
  });

  const nextMap = new Map<string, ProjectMeetingMinute>();
  for (const m of current) {
    const itemProj = normalizeLegacyProjectCode(m.project_code || TEMP_PROJECT_CODE);
    if (itemProj !== targetProj) {
      nextMap.set(m.id, m);
      continue;
    }
    if (targetProj === TEMP_PROJECT_CODE && currentUserId) {
      const belongsToCurrent =
        m.author_id ? m.author_id === currentUserId : !currentUserName || m.author === currentUserName;
      if (!belongsToCurrent) {
        nextMap.set(m.id, m);
        continue;
      }
    }
    const remote = remoteMap.get(m.id);
    if (remote) {
      nextMap.set(m.id, isMeetingWritePending(m.id) ? m : remote);
    } else if (isMeetingWritePending(m.id)) {
      nextMap.set(m.id, m);
    }
  }

  for (const remote of remoteMinutes) {
    if (remote && remote.id && !nextMap.has(remote.id)) {
      nextMap.set(remote.id, remote);
    }
  }

  const merged = Array.from(nextMap.values()).sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  );
  try {
    localStorage.setItem(MEETING_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

export function saveMeetingMinute(record: ProjectMeetingMinute): ProjectMeetingMinute[] {
  const list = getMeetingMinutesList();
  const now = formatNowDateTime();
  const candidateProj = normalizeLegacyProjectCode(record.project_code || TEMP_PROJECT_CODE);
  const normalizedProj =
    candidateProj === COMMON_PROJECT_CODE
      ? TEMP_PROJECT_CODE
      : candidateProj;

  const updatedRecord: ProjectMeetingMinute = {
    ...record,
    project_code: normalizedProj,
    created_at: record.created_at || now,
    updated_at: now,
  };

  const idx = list.findIndex((m) => m.id === updatedRecord.id);
  const nextList =
    idx >= 0
      ? list.map((m, i) => (i === idx ? updatedRecord : m))
      : [updatedRecord, ...list];

  nextList.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  markMeetingPendingWrite(updatedRecord.id);
  try {
    localStorage.setItem(MEETING_STORAGE_KEY, JSON.stringify(nextList));
  } catch (err) {
    console.error('Failed to save meeting minute', err);
  }

  syncMeetingMinuteToFirestore(updatedRecord).catch((err) => {
    console.warn('Firestore meeting sync skipped:', err);
  });

  return nextList;
}

export function deleteMeetingMinute(id: string): ProjectMeetingMinute[] {
  const current = getMeetingMinutesList();
  const target = current.find((m) => m.id === id);
  const nextList = current.filter((m) => m.id !== id);
  pendingMeetingWrites.delete(id);
  try {
    localStorage.setItem(MEETING_STORAGE_KEY, JSON.stringify(nextList));
  } catch (err) {
    console.error('Failed to delete meeting minute', err);
  }

  if (target) {
    deleteMeetingFromFirestore(target.project_code || TEMP_PROJECT_CODE, target.id).catch((err) => {
      console.warn('Firestore meeting delete skipped:', err);
    });
  }
  return nextList;
}
