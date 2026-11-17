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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const { normalized, changed } = normalizeSavedItems(parsed);
      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    }
    const initial = getInitialSeedSpecs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
};

/**
 * Delete a spec from storage
 */
export const deleteSpecFromStorage = (
  programId: string,
  currentUserName?: string
): { success: boolean; message?: string; list: SavedProgramSpecItem[] } => {
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

  if (currentUserName && target.author && target.author !== currentUserName) {
    return {
      success: false,
      message: `Only the author can delete this spec (Author: ${target.author}, Current: ${currentUserName}).`,
      list,
    };
  }

  const updatedList = list.filter((item) => item.program_id.toUpperCase() !== cleanId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    return { success: true, list: updatedList };
  } catch (err) {
    console.error('Failed to delete spec from localStorage', err);
    return {
      success: false,
      message: 'Storage error while deleting specification.',
      list,
    };
  }
};
