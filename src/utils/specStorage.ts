import { ProgramSpec, SapModule, SpecChangeHistoryItem } from '../types/sap';
import { SAMPLE_SPECS } from '../data/sampleSpecs';
import {
  DEFAULT_OPERATOR_USER,
  isLegacyRemovedUserName,
} from './authStorage';
import {
  COMMON_PROJECT_CODE,
  COMMON_SAMPLE_PROGRAM_IDS,
  TEMP_PROJECT_CODE,
  isCommonProtectedSample,
  isReadOnlyCommonSpec,
  normalizeLegacyProjectCode,
  resolveDefaultProjectCode,
} from './projectStorage';

const STORAGE_KEY = 'sap_spec_programs_v4';

interface SpecListCacheEntry {
  raw: string;
  items: SavedProgramSpecItem[];
}

let cachedSpecSnapshot: SpecListCacheEntry | null = null;

function persistSpecList(items: SavedProgramSpecItem[]): void {
  const serialized = JSON.stringify(items);
  localStorage.setItem(STORAGE_KEY, serialized);
  cachedSpecSnapshot = { raw: serialized, items };
}

export interface SavedProgramSpecItem {
  program_id: string;
  project_code: string;
  tcode: string;
  title: string;
  module: SapModule;
  sample_type?: string;
  author: string;
  updated_at: string;
  is_system?: boolean;
  change_history: SpecChangeHistoryItem[];
  spec: ProgramSpec;
}

const PENDING_SPEC_WRITE_TTL_MS = 8000;
const pendingSpecWrites = new Map<string, number>();

export const markSpecPendingWrite = (programIdOrSpecId?: string): void => {
  const clean = (programIdOrSpecId || '').trim().toUpperCase();
  if (!clean) return;
  pendingSpecWrites.set(clean, Date.now() + PENDING_SPEC_WRITE_TTL_MS);
};

export const clearSpecPendingWrite = (programIdOrSpecId?: string): void => {
  const clean = (programIdOrSpecId || '').trim().toUpperCase();
  if (!clean) return;
  pendingSpecWrites.delete(clean);
};

const isSpecWritePending = (spec: { program_id?: string; id?: string }): boolean => {
  const now = Date.now();
  const keys = [spec.program_id, spec.id]
    .map((v) => (v || '').trim().toUpperCase())
    .filter(Boolean);
  for (const key of keys) {
    const exp = pendingSpecWrites.get(key);
    if (exp && exp > now) return true;
    if (exp && exp <= now) pendingSpecWrites.delete(key);
  }
  return false;
};

/**
 * Seed initial sample programs if storage is empty
 */
const getInitialSeedSpecs = (): SavedProgramSpecItem[] => {
  return SAMPLE_SPECS.map((s) => {
    const cleanId = s.program_id.toUpperCase();
    const projectCode = resolveDefaultProjectCode({
      program_id: cleanId,
      project_code: s.project_code,
      is_system: s.is_system,
    });
    const isSystem = !!s.is_system || COMMON_SAMPLE_PROGRAM_IDS.includes(cleanId);
    const history = s.change_history || [
      {
        id: `init-${cleanId}`,
        version: 'v1.0',
        changed_at: `${s.created_date || '2026-11-01'} 09:00:00`,
        author: s.author,
        comment: 'Registered SAP standard sample spec',
      },
    ];

    return {
      program_id: cleanId,
      project_code: projectCode,
      tcode: s.tcode,
      title: s.title,
      module: s.module,
      sample_type: s.sample_type || '01',
      author: s.author,
      updated_at: s.created_date || new Date().toISOString().split('T')[0],
      is_system: isSystem,
      change_history: history,
      spec: {
        ...s,
        program_id: cleanId,
        project_code: projectCode,
        is_system: isSystem,
        change_history: history,
      },
    };
  });
};

function normalizeSavedItems(items: SavedProgramSpecItem[]): {
  normalized: SavedProgramSpecItem[];
  changed: boolean;
} {
  let changed = false;
  const normalized = items.map((item) => {
    const cleanId = (item.program_id || item.spec?.program_id || 'ZPROG01').toUpperCase();
    const isCommonSample = COMMON_SAMPLE_PROGRAM_IDS.includes(cleanId);
    const expectedProj = isCommonSample
      ? COMMON_PROJECT_CODE
      : normalizeLegacyProjectCode(item.project_code || item.spec?.project_code || TEMP_PROJECT_CODE) || TEMP_PROJECT_CODE;
    const expectedSystem = isCommonSample ? true : !!item.is_system;

    const rawAuthor = item.author || item.spec?.author || '';
    const authorNeedsMigration = isLegacyRemovedUserName(rawAuthor) || isLegacyRemovedUserName(item.spec?.author);
    const expectedAuthor = isLegacyRemovedUserName(rawAuthor)
      ? DEFAULT_OPERATOR_USER.name
      : rawAuthor || DEFAULT_OPERATOR_USER.name;

    const historyNeedsMigration =
      Array.isArray(item.change_history) &&
      item.change_history.some((h) => isLegacyRemovedUserName(h.author));

    if (
      item.project_code !== expectedProj ||
      item.spec?.project_code !== expectedProj ||
      (isCommonSample && !item.is_system) ||
      authorNeedsMigration ||
      historyNeedsMigration
    ) {
      changed = true;
      const nextHistory = Array.isArray(item.change_history)
        ? item.change_history.map((h) =>
            isLegacyRemovedUserName(h.author) ? { ...h, author: DEFAULT_OPERATOR_USER.name } : h
          )
        : item.change_history;
      return {
        ...item,
        program_id: cleanId,
        project_code: expectedProj,
        author: expectedAuthor,
        is_system: expectedSystem,
        change_history: nextHistory,
        spec: {
          ...item.spec,
          program_id: cleanId,
          project_code: expectedProj,
          author: expectedAuthor,
          is_system: expectedSystem,
          change_history: nextHistory,
        },
      };
    }
    return item;
  });

  // Ensure any missing ZRALV0010~0040 sample specs are present in COMMON
  const existingIds = new Set(normalized.map((i) => i.program_id.toUpperCase()));
  const seeds = getInitialSeedSpecs();
  seeds.forEach((seed) => {
    if (COMMON_SAMPLE_PROGRAM_IDS.includes(seed.program_id) && !existingIds.has(seed.program_id)) {
      normalized.push(seed);
      changed = true;
    }
  });

  return { normalized, changed };
}

/**
 * Retrieve all saved Program Specs from localStorage
 */
export const getSavedSpecList = (): SavedProgramSpecItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialSeedSpecs();
      persistSpecList(initial);
      return initial;
    }
    if (cachedSpecSnapshot && cachedSpecSnapshot.raw === raw) {
      return cachedSpecSnapshot.items;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const { normalized, changed } = normalizeSavedItems(parsed);
      if (changed) {
        persistSpecList(normalized);
      } else {
        cachedSpecSnapshot = { raw, items: normalized };
      }
      return normalized;
    }
    const initial = getInitialSeedSpecs();
    persistSpecList(initial);
    return initial;
  } catch (err) {
    console.error('Failed to load saved specs from localStorage', err);
    return getInitialSeedSpecs();
  }
};

/**
 * Helper to generate next version number
 */
const getNextVersion = (history: SpecChangeHistoryItem[]): string => {
  if (!history || history.length === 0) return 'v1.0';
  const last = history[history.length - 1];
  const match = last.version.match(/v(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10) + 1;
    return `v${major}.${minor}`;
  }
  return `v1.${history.length}`;
};

/**
 * Auto-sync live edits for writable (non-COMMON) specs without adding a revision entry every keystroke.
 */
export const upsertWorkingSpecQuietly = (spec: ProgramSpec): boolean => {
  if (isReadOnlyCommonSpec(spec)) return false;
  try {
    const list = getSavedSpecList();
    const cleanProgramId = (spec.program_id || 'ZPROG01').trim().toUpperCase();
    const projectCode = resolveDefaultProjectCode(spec);
    if (projectCode === COMMON_PROJECT_CODE) return false;

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const existingIndex = list.findIndex(
      (item) => item.program_id.toUpperCase() === cleanProgramId || item.spec?.id === spec.id
    );
    const existingItem = existingIndex >= 0 ? list[existingIndex] : null;
    if (existingItem && isReadOnlyCommonSpec(existingItem.spec)) {
      return false;
    }

    const history = existingItem?.change_history || spec.change_history || [
      {
        id: `h-${Date.now()}`,
        version: 'v1.0',
        changed_at: now,
        author: spec.author || 'Josh Lee',
        comment: 'Initial draft',
      },
    ];

    const updatedSpec: ProgramSpec = {
      ...spec,
      program_id: cleanProgramId,
      project_code: projectCode,
      is_system: false,
      change_history: history,
    };

    const itemToSave: SavedProgramSpecItem = {
      program_id: cleanProgramId,
      project_code: projectCode,
      tcode: updatedSpec.tcode,
      title: updatedSpec.title,
      module: updatedSpec.module,
      sample_type: updatedSpec.sample_type || '01',
      author: updatedSpec.author,
      updated_at: now,
      is_system: false,
      change_history: history,
      spec: updatedSpec,
    };

    let updatedList: SavedProgramSpecItem[];
    if (existingIndex >= 0) {
      updatedList = [...list];
      updatedList[existingIndex] = itemToSave;
    } else {
      updatedList = [itemToSave, ...list];
    }
    markSpecPendingWrite(cleanProgramId);
    if (updatedSpec.id) markSpecPendingWrite(updatedSpec.id);
    persistSpecList(updatedList);
    return true;
  } catch {
    // ignore storage quota errors during quiet auto-sync
    return false;
  }
};

/**
 * Save or overwrite a specification by program_id with Change History Tracking
 */
export const saveSpecToStorage = (
  spec: ProgramSpec,
  changeComment?: string,
  authorName?: string
): { success: boolean; message?: string; savedItem?: SavedProgramSpecItem } => {
  try {
    const projectCode = normalizeLegacyProjectCode(spec.project_code);
    if (!projectCode) {
      return {
        success: false,
        message: 'Please select a Project in General Info.',
      };
    }

    const list = getSavedSpecList();
    const cleanProgramId = (spec.program_id || 'ZPROG01').trim().toUpperCase();
    const existingIndex = list.findIndex(
      (item) => item.program_id.toUpperCase() === cleanProgramId
    );
    const existingItem = existingIndex >= 0 ? list[existingIndex] : null;

    if (
      isReadOnlyCommonSpec(spec) ||
      (existingItem && isReadOnlyCommonSpec(existingItem.spec))
    ) {
      return {
        success: false,
        message:
          'COMM sample specs are read-only. Copy to a project (or TEMP) before saving.',
      };
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const author = authorName || spec.author || 'Josh Lee';

    const prevHistory: SpecChangeHistoryItem[] =
      existingItem?.change_history || spec.change_history || [];

    const nextVer = getNextVersion(prevHistory);
    const newHistoryItem: SpecChangeHistoryItem = {
      id: `h-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      version: nextVer,
      changed_at: now,
      author,
      comment:
        changeComment?.trim() ||
        (existingItem ? 'Updated and saved spec' : 'Created and saved new spec'),
    };

    const updatedHistory = [...prevHistory, newHistoryItem];

    const updatedSpec: ProgramSpec = {
      ...spec,
      program_id: cleanProgramId,
      project_code: projectCode,
      author,
      change_history: updatedHistory,
      is_system: false,
    };

    const itemToSave: SavedProgramSpecItem = {
      program_id: cleanProgramId,
      project_code: projectCode,
      tcode: updatedSpec.tcode,
      title: updatedSpec.title,
      module: updatedSpec.module,
      sample_type: updatedSpec.sample_type || '01',
      author,
      updated_at: now,
      is_system: false,
      change_history: updatedHistory,
      spec: updatedSpec,
    };

    let updatedList: SavedProgramSpecItem[];
    if (existingIndex >= 0) {
      updatedList = [...list];
      updatedList[existingIndex] = itemToSave;
    } else {
      updatedList = [itemToSave, ...list];
    }

    markSpecPendingWrite(cleanProgramId);
    if (updatedSpec.id) markSpecPendingWrite(updatedSpec.id);
    persistSpecList(updatedList);
    return { success: true, savedItem: itemToSave };
  } catch (err) {
    console.error('Failed to save spec to localStorage', err);
    return { success: false, message: 'Failed to save to local storage.' };
  }
};

/**
 * Copy an existing spec to a new program_id and target project
 */
export const copySpecInStorage = (
  sourceProgramId: string,
  newProgramId: string,
  authorName?: string,
  targetProjectCode?: string,
  overrideTitle?: string,
  overrideTcode?: string,
  authorId?: string
): { success: boolean; message?: string; newSpec?: ProgramSpec } => {
  const cleanSourceId = sourceProgramId.trim().toUpperCase();
  const cleanNewId = newProgramId.trim().toUpperCase();

  if (!cleanNewId) {
    return {
      success: false,
      message: 'Please enter a new Program ID.',
    };
  }

  const list = getSavedSpecList();

  const alreadyExists = list.some(
    (item) => item.program_id.toUpperCase() === cleanNewId
  );

  if (alreadyExists) {
    return {
      success: false,
      message: 'Program ID already exists.',
    };
  }

  const sourceItem = list.find(
    (item) => item.program_id.toUpperCase() === cleanSourceId
  );

  if (!sourceItem) {
    return {
      success: false,
      message: `Source program '${cleanSourceId}' not found.`,
    };
  }

  const resolvedTargetProject = normalizeLegacyProjectCode(
    targetProjectCode ||
      (normalizeLegacyProjectCode(sourceItem.project_code) === COMMON_PROJECT_CODE
        ? TEMP_PROJECT_CODE
        : sourceItem.project_code || TEMP_PROJECT_CODE)
  );

  if (resolvedTargetProject === COMMON_PROJECT_CODE && COMMON_SAMPLE_PROGRAM_IDS.includes(cleanNewId)) {
    return {
      success: false,
      message: 'COMM sample IDs are reserved. Please copy to a project or TEMP.',
    };
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const author = authorName || 'Josh Lee';

  const initialHistory: SpecChangeHistoryItem[] = [
    {
      id: `h-${Date.now()}`,
      version: 'v1.0',
      changed_at: now,
      author,
      comment: `Copied from '${cleanSourceId}' (${normalizeLegacyProjectCode(sourceItem.project_code) || COMMON_PROJECT_CODE}) to '${resolvedTargetProject}'`,
    },
  ];

  const defaultTcode =
    overrideTcode?.trim().toUpperCase() ||
    (cleanNewId.startsWith('Z') || cleanNewId.startsWith('Y')
      ? cleanNewId.slice(0, 20)
      : `Z${cleanNewId.slice(0, 19)}`);

  const newSpec: ProgramSpec = {
    ...JSON.parse(JSON.stringify(sourceItem.spec)),
    id: `spec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    project_code: resolvedTargetProject,
    program_id: cleanNewId,
    tcode: defaultTcode,
    title: overrideTitle?.trim() || `${sourceItem.spec.title} (Copy)`,
    author,
    author_id: authorId || undefined,
    created_date: new Date().toISOString().split('T')[0],
    is_system: false,
    status: 'draft',
    approved_by: undefined,
    approved_at: undefined,
    revision: undefined,
    change_history: initialHistory,
  };

  const newItem: SavedProgramSpecItem = {
    program_id: cleanNewId,
    project_code: resolvedTargetProject,
    tcode: newSpec.tcode,
    title: newSpec.title,
    module: newSpec.module,
    sample_type: newSpec.sample_type || '01',
    author,
    updated_at: now,
    is_system: false,
    change_history: initialHistory,
    spec: newSpec,
  };

  const updatedList = [newItem, ...list];
  try {
    markSpecPendingWrite(cleanNewId);
    if (newSpec.id) markSpecPendingWrite(newSpec.id);
    persistSpecList(updatedList);
    return {
      success: true,
      newSpec,
    };
  } catch (err) {
    console.error('Failed to save copied spec to localStorage', err);
    return {
      success: false,
      message: 'Failed to save copied specification.',
    };
  }
};

/**
 * Reassign all specs belonging to a deleted project into TEMP
 */
export const reassignSpecsProjectToTemp = (deletedProjectCode: string): void => {
  const target = normalizeLegacyProjectCode(deletedProjectCode);
  if (!target || target === COMMON_PROJECT_CODE || target === TEMP_PROJECT_CODE) return;
  const list = getSavedSpecList();
  let changed = false;
  const updated = list.map((item) => {
    if (normalizeLegacyProjectCode(item.project_code) === target) {
      changed = true;
      return {
        ...item,
        project_code: TEMP_PROJECT_CODE,
        spec: {
          ...item.spec,
          project_code: TEMP_PROJECT_CODE,
        },
      };
    }
    return item;
  });
  if (changed) {
    try {
      persistSpecList(updated);
    } catch {
      // ignore
    }
  }
};

/**
 * Reconcile a project's cached specs against the authoritative Firestore snapshot.
 * Propagates remote deletions (even when remoteSpecs is empty) while preserving
 * COMM protected samples, active local in-flight writes, and other users' TEMP drafts.
 */
export const reconcileProjectSpecsFromRemote = (
  projectCode: string,
  remoteSpecs: ProgramSpec[],
  currentUserName?: string,
  currentUserId?: string
): SavedProgramSpecItem[] => {
  const targetProj = normalizeLegacyProjectCode(projectCode || TEMP_PROJECT_CODE);
  if (!targetProj) return getSavedSpecList();

  const currentList = getSavedSpecList();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const remoteByKey = new Map<string, ProgramSpec>();
  remoteSpecs.forEach((r) => {
    if (!r) return;
    if (r.program_id) remoteByKey.set(`PID:${r.program_id.trim().toUpperCase()}`, r);
    if (r.id) remoteByKey.set(`ID:${r.id.trim().toUpperCase()}`, r);
  });

  const existingByKey = new Map<string, SavedProgramSpecItem>();
  currentList.forEach((item) => {
    if (item.program_id) existingByKey.set(`PID:${item.program_id.trim().toUpperCase()}`, item);
    if (item.spec?.id) existingByKey.set(`ID:${item.spec.id.trim().toUpperCase()}`, item);
  });

  const nextItems: SavedProgramSpecItem[] = [];
  const consumedRemoteKeys = new Set<string>();

  for (const item of currentList) {
    const itemProj = normalizeLegacyProjectCode(item.project_code || item.spec?.project_code || TEMP_PROJECT_CODE);
    const pidKey = `PID:${item.program_id.trim().toUpperCase()}`;
    const idKey = item.spec?.id ? `ID:${item.spec.id.trim().toUpperCase()}` : '';

    if (itemProj !== targetProj) {
      nextItems.push(item);
      continue;
    }

    if (isCommonProtectedSample(item.spec)) {
      nextItems.push(item);
      consumedRemoteKeys.add(pidKey);
      if (idKey) consumedRemoteKeys.add(idKey);
      continue;
    }

    // For TEMP scope, Firestore only returns docs owned by currentUserId. Do not prune cached items from other offline profiles.
    if (targetProj === TEMP_PROJECT_CODE && currentUserId) {
      const belongsToCurrent =
        item.spec?.author_id
          ? item.spec.author_id === currentUserId
          : !currentUserName || item.author === currentUserName;
      if (!belongsToCurrent) {
        nextItems.push(item);
        continue;
      }
    }

    const remote = remoteByKey.get(pidKey) || (idKey ? remoteByKey.get(idKey) : undefined);
    if (remote) {
      consumedRemoteKeys.add(`PID:${remote.program_id.trim().toUpperCase()}`);
      if (remote.id) consumedRemoteKeys.add(`ID:${remote.id.trim().toUpperCase()}`);

      const pendingLocal = isSpecWritePending(item.spec);
      const localRev = item.spec?.revision ?? 0;
      const remoteRev = remote.revision ?? 0;
      if (pendingLocal && localRev >= remoteRev) {
        nextItems.push(item);
      } else {
        const cleanPid = (remote.program_id || item.program_id).trim().toUpperCase();
        const history = remote.change_history && remote.change_history.length > 0
          ? remote.change_history
          : item.change_history;
        const mergedSpec: ProgramSpec = {
          ...remote,
          program_id: cleanPid,
          project_code: targetProj,
          is_system: false,
          change_history: history,
        };
        nextItems.push({
          program_id: cleanPid,
          project_code: targetProj,
          tcode: mergedSpec.tcode,
          title: mergedSpec.title,
          module: mergedSpec.module,
          sample_type: mergedSpec.sample_type || '01',
          author: mergedSpec.author,
          updated_at: item.updated_at || now,
          is_system: false,
          change_history: history,
          spec: mergedSpec,
        });
      }
    } else if (isSpecWritePending(item.spec)) {
      // Keep locally created/modified item during in-flight write grace window
      nextItems.push(item);
    }
    // Else: item was deleted remotely -> omitted from nextItems!
  }

  // Append newly discovered remote specs not yet in localStorage
  for (const remote of remoteSpecs) {
    if (!remote || isCommonProtectedSample(remote)) continue;
    const cleanPid = (remote.program_id || 'ZPROG01').trim().toUpperCase();
    const pidKey = `PID:${cleanPid}`;
    const idKey = remote.id ? `ID:${remote.id.trim().toUpperCase()}` : '';
    if (consumedRemoteKeys.has(pidKey) || (idKey && consumedRemoteKeys.has(idKey))) {
      continue;
    }
    const existing = existingByKey.get(pidKey) || (idKey ? existingByKey.get(idKey) : undefined);
    const history =
      remote.change_history && remote.change_history.length > 0
        ? remote.change_history
        : existing?.change_history || [
            {
              id: `h-${Date.now()}`,
              version: 'v1.0',
              changed_at: now,
              author: remote.author || 'SAP User',
              comment: 'Synced from cloud workspace',
            },
          ];
    const cleanSpec: ProgramSpec = {
      ...remote,
      program_id: cleanPid,
      project_code: targetProj,
      is_system: false,
      change_history: history,
    };
    nextItems.unshift({
      program_id: cleanPid,
      project_code: targetProj,
      tcode: cleanSpec.tcode,
      title: cleanSpec.title,
      module: cleanSpec.module,
      sample_type: cleanSpec.sample_type || '01',
      author: cleanSpec.author,
      updated_at: now,
      is_system: false,
      change_history: history,
      spec: cleanSpec,
    });
  }

  try {
    persistSpecList(nextItems);
  } catch {
    // ignore storage quota errors
  }
  return nextItems;
};

/**
 * Delete a spec from storage
 */
export const deleteSpecFromStorage = (
  programId: string,
  currentUserName?: string,
  options?: { currentUserId?: string; isAdmin?: boolean }
): {
  success: boolean;
  message?: string;
  list: SavedProgramSpecItem[];
  deletedItem?: SavedProgramSpecItem;
} => {
  const cleanId = programId.trim().toUpperCase();
  const list = getSavedSpecList();
  const target = list.find((item) => item.program_id.toUpperCase() === cleanId);

  if (!target) {
    return { success: false, message: 'Specification not found.', list };
  }

  if (target.is_system) {
    return {
      success: false,
      message: 'System COMM sample originals cannot be deleted.',
      list,
    };
  }

  const isUidOwner =
    Boolean(options?.currentUserId) &&
    Boolean(target.spec?.author_id) &&
    target.spec.author_id === options?.currentUserId;
  const isNameOwner = !currentUserName || !target.author || target.author === currentUserName;

  if (!options?.isAdmin && !isUidOwner && !isNameOwner) {
    return {
      success: false,
      message: `Only the author can delete this spec (Author: ${target.author}, Current: ${currentUserName}).`,
      list,
    };
  }

  const updatedList = list.filter((item) => item.program_id.toUpperCase() !== cleanId);
  clearSpecPendingWrite(cleanId);
  if (target.spec?.id) clearSpecPendingWrite(target.spec.id);
  try {
    persistSpecList(updatedList);
    return { success: true, list: updatedList, deletedItem: target };
  } catch (err) {
    console.error('Failed to delete spec from localStorage', err);
    return {
      success: false,
      message: 'Storage error while deleting specification.',
      list,
    };
  }
};
