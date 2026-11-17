import { ProgramSpec, SapModule, SapProject } from '../types/sap';
import {
  DEFAULT_OPERATOR_USER,
  isDefaultOperatorUser,
  isLegacyRemovedUserName,
} from './authStorage';

const PROJECT_STORAGE_KEY = 'sap_spec_projects_v1';
const PROJECT_MIGRATION_V128_KEY = 'sap_spec_migrated_v128_4char_modern';
const PROJECT_MIGRATION_V129_KEY = 'sap_spec_migrated_v129_josh_members';

export const COMMON_PROJECT_CODE = 'COMM';
export const TEMP_PROJECT_CODE = 'TEMP';
export const DEFAULT_PROJECT_MEMBER = DEFAULT_OPERATOR_USER.name;
export const COMMON_SAMPLE_PROGRAM_IDS = ['ZRALV0010', 'ZRALV0020', 'ZRALV0030', 'ZRALV0040'];

export const ALL_SAP_MODULES: SapModule[] = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
const ALL_MODULES: SapModule[] = ALL_SAP_MODULES;

const LEGACY_PROJECT_CODE_MAP: Record<string, string> = {
  COMMON: 'COMM',
  S4_ERP_2026: '2601',
  SE_ERP_2P26: '2601',
  FI_CLOSE_TF: '2602',
};

export function normalizeLegacyProjectCode(code?: string): string {
  const upper = (code || '').trim().toUpperCase();
  if (!upper) return '';
  return LEGACY_PROJECT_CODE_MAP[upper] || upper;
}

export function isValidFourCharProjectCode(code?: string): boolean {
  const upper = (code || '').trim().toUpperCase();
  return /^[A-Z0-9_]{4}$/.test(upper);
}

/**
 * Enforce that Josh Lee is ALWAYS included as the permanent default member
 * in every project, and strip any removed legacy preset names.
 */
export function enforceProjectMembers(members: string[] = [], owner?: string): string[] {
  const result: string[] = [DEFAULT_PROJECT_MEMBER];
  const seen = new Set<string>([DEFAULT_PROJECT_MEMBER.toLowerCase()]);

  const cleanOwner = (owner || '').trim();
  if (
    cleanOwner &&
    cleanOwner !== 'SYSTEM' &&
    !isLegacyRemovedUserName(cleanOwner) &&
    !isDefaultOperatorUser(cleanOwner) &&
    !seen.has(cleanOwner.toLowerCase())
  ) {
    seen.add(cleanOwner.toLowerCase());
    result.push(cleanOwner);
  }

  for (const m of members) {
    const clean = (m || '').trim();
    if (!clean || isLegacyRemovedUserName(clean) || isDefaultOperatorUser(clean)) {
      continue;
    }
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }

  return result;
}

export const SYSTEM_PROJECTS: SapProject[] = [
  {
    code: COMMON_PROJECT_CODE,
    name: 'Common Standards (COMM)',
    description:
      'Shared repository for enterprise ALV sample series (ZRALV0010–0040) and reference specs. Originals are protected—copy to a project to customize.',
    visibility: 'common',
    target_sap_release: 'SAP S/4HANA 2023 / ECC 6.0',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    owner: DEFAULT_PROJECT_MEMBER,
    members: [DEFAULT_PROJECT_MEMBER],
    modules: ALL_MODULES,
    abap_standards: {
      default_syntax_mode: 'modern_740',
    },
    is_system: true,
    created_date: '2026-10-01',
  },
  {
    code: TEMP_PROJECT_CODE,
    name: 'Personal Workspace (TEMP)',
    description:
      'Private workspace for unassigned drafts. Only specs created by your account are visible and editable here.',
    visibility: 'temp',
    target_sap_release: 'SAP S/4HANA 2023',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    owner: DEFAULT_PROJECT_MEMBER,
    members: [DEFAULT_PROJECT_MEMBER],
    modules: ALL_MODULES,
    abap_standards: {
      default_syntax_mode: 'modern_740',
    },
    is_system: true,
    created_date: '2026-10-01',
  },
];

const INITIAL_TEAM_PROJECTS: SapProject[] = [
  {
    code: '2601',
    name: 'Next-Gen S/4HANA ERP',
    description: 'Enterprise SAP S/4HANA rollout covering SD, MM, FI, CO, and PP.',
    visibility: 'project',
    target_sap_release: 'SAP S/4HANA 2023',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    owner: DEFAULT_PROJECT_MEMBER,
    members: [DEFAULT_PROJECT_MEMBER],
    modules: ['SD', 'MM', 'FI', 'CO', 'PP'],
    abap_standards: {
      default_syntax_mode: 'modern_740',
    },
    is_system: false,
    created_date: '2026-10-15',
  },
  {
    code: '2602',
    name: 'FI/CO Closing Enhancement',
    description: 'Real-time financial/cost closing reports and profitability analysis based on ACDOCA.',
    visibility: 'project',
    target_sap_release: 'SAP S/4HANA 2023',
    start_date: '2026-03-01',
    end_date: '2026-11-30',
    owner: DEFAULT_PROJECT_MEMBER,
    members: [DEFAULT_PROJECT_MEMBER],
    modules: ['FI', 'CO'],
    abap_standards: {
      default_syntax_mode: 'modern_740',
    },
    is_system: false,
    created_date: '2026-11-01',
  },
];

function applyProjectMigrations(
  list: SapProject[],
  forceModernSyntax: boolean,
  cleanLegacyMembers: boolean
): { list: SapProject[]; changed: boolean } {
  let changed = false;
  const dedupMap = new Map<string, SapProject>();

  for (const rawProj of list) {
    const mappedCode = normalizeLegacyProjectCode(rawProj.code);
    if (mappedCode !== rawProj.code) changed = true;

    let nextName = rawProj.name;
    let nextDesc = rawProj.description;
    let nextStart = rawProj.start_date;
    let nextEnd = rawProj.end_date;

    if (mappedCode === '2601') {
      if (rawProj.name === '차세대 S/4HANA ERP 구축') {
        nextName = INITIAL_TEAM_PROJECTS[0].name;
        nextDesc = INITIAL_TEAM_PROJECTS[0].description;
        changed = true;
      }
      if (!nextStart) {
        nextStart = INITIAL_TEAM_PROJECTS[0].start_date;
        changed = true;
      }
      if (!nextEnd) {
        nextEnd = INITIAL_TEAM_PROJECTS[0].end_date;
        changed = true;
      }
    } else if (mappedCode === '2602') {
      if (rawProj.name === '재무·원가 결산 고도화') {
        nextName = INITIAL_TEAM_PROJECTS[1].name;
        nextDesc = INITIAL_TEAM_PROJECTS[1].description;
        changed = true;
      }
      if (!nextStart) {
        nextStart = INITIAL_TEAM_PROJECTS[1].start_date;
        changed = true;
      }
      if (!nextEnd) {
        nextEnd = INITIAL_TEAM_PROJECTS[1].end_date;
        changed = true;
      }
    }

    const currentSyntax = rawProj.abap_standards?.default_syntax_mode;
    const nextSyntax = forceModernSyntax ? 'modern_740' : currentSyntax || 'modern_740';
    if (nextSyntax !== currentSyntax) changed = true;

    const rawOwner = (rawProj.owner || '').trim();
    const nextOwner =
      !rawOwner || rawOwner === 'SYSTEM' || isLegacyRemovedUserName(rawOwner)
        ? DEFAULT_PROJECT_MEMBER
        : rawOwner;
    if (nextOwner !== rawProj.owner) changed = true;

    const rawMembers = Array.isArray(rawProj.members) ? rawProj.members : [];
    const nextMembers = enforceProjectMembers(
      cleanLegacyMembers ? rawMembers.filter((m) => !isLegacyRemovedUserName(m)) : rawMembers,
      nextOwner
    );
    if (
      nextMembers.length !== rawMembers.length ||
      nextMembers.some((m, idx) => rawMembers[idx] !== m)
    ) {
      changed = true;
    }

    const updatedProj: SapProject = {
      ...rawProj,
      code: mappedCode,
      name: nextName,
      description: nextDesc,
      start_date: nextStart,
      end_date: nextEnd,
      owner: nextOwner,
      members: nextMembers,
      abap_standards: {
        ...(rawProj.abap_standards || {}),
        default_syntax_mode: nextSyntax,
      },
    };

    if (!dedupMap.has(mappedCode)) {
      dedupMap.set(mappedCode, updatedProj);
    } else {
      changed = true;
    }
  }

  return { list: Array.from(dedupMap.values()), changed };
}

function ensureSystemProjects(list: SapProject[]): SapProject[] {
  const { list: migrated } = applyProjectMigrations(list, false, true);
  const customProjects = migrated.filter(
    (p) => p.code !== COMMON_PROJECT_CODE && p.code !== TEMP_PROJECT_CODE
  );
  const existingCommon = migrated.find((p) => p.code === COMMON_PROJECT_CODE);
  const existingTemp = migrated.find((p) => p.code === TEMP_PROJECT_CODE);

  return [
    existingCommon
      ? {
          ...existingCommon,
          code: COMMON_PROJECT_CODE,
          name: SYSTEM_PROJECTS[0].name,
          description: SYSTEM_PROJECTS[0].description,
          start_date: existingCommon.start_date || SYSTEM_PROJECTS[0].start_date,
          end_date: existingCommon.end_date || SYSTEM_PROJECTS[0].end_date,
          owner: DEFAULT_PROJECT_MEMBER,
          members: [DEFAULT_PROJECT_MEMBER],
          is_system: true,
          visibility: 'common',
          modules: ALL_SAP_MODULES,
          abap_standards: {
            ...(existingCommon.abap_standards || {}),
            default_syntax_mode: existingCommon.abap_standards?.default_syntax_mode || 'modern_740',
          },
        }
      : {
          ...SYSTEM_PROJECTS[0],
          members: [DEFAULT_PROJECT_MEMBER],
        },
    ...customProjects.map((p) => ({
      ...p,
      members: enforceProjectMembers(p.members, p.owner),
    })),
    existingTemp
      ? {
          ...existingTemp,
          code: TEMP_PROJECT_CODE,
          name: SYSTEM_PROJECTS[1].name,
          description: SYSTEM_PROJECTS[1].description,
          start_date: existingTemp.start_date || SYSTEM_PROJECTS[1].start_date,
          end_date: existingTemp.end_date || SYSTEM_PROJECTS[1].end_date,
          owner: DEFAULT_PROJECT_MEMBER,
          members: enforceProjectMembers(existingTemp.members, DEFAULT_PROJECT_MEMBER),
          is_system: true,
          visibility: 'temp',
          modules: ALL_SAP_MODULES,
          abap_standards: {
            ...(existingTemp.abap_standards || {}),
            default_syntax_mode: existingTemp.abap_standards?.default_syntax_mode || 'modern_740',
          },
        }
      : {
          ...SYSTEM_PROJECTS[1],
          members: [DEFAULT_PROJECT_MEMBER],
        },
  ];
}

export function getProjects(): SapProject[] {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) {
      const initial = ensureSystemProjects(INITIAL_TEAM_PROJECTS);
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(initial));
      localStorage.setItem(PROJECT_MIGRATION_V128_KEY, '1');
      localStorage.setItem(PROJECT_MIGRATION_V129_KEY, '1');
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const alreadyMigratedV128 = localStorage.getItem(PROJECT_MIGRATION_V128_KEY) === '1';
      const alreadyMigratedV129 = localStorage.getItem(PROJECT_MIGRATION_V129_KEY) === '1';
      const { list: migratedList, changed } = applyProjectMigrations(
        parsed,
        !alreadyMigratedV128,
        !alreadyMigratedV129 || true
      );
      const ensured = ensureSystemProjects(migratedList);
      if (changed || !alreadyMigratedV128 || !alreadyMigratedV129) {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(ensured));
        localStorage.setItem(PROJECT_MIGRATION_V128_KEY, '1');
        localStorage.setItem(PROJECT_MIGRATION_V129_KEY, '1');
      }
      return ensured;
    }
  } catch (err) {
    console.error('Failed to load projects from localStorage', err);
  }
  const fallback = ensureSystemProjects(INITIAL_TEAM_PROJECTS);
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(fallback));
    localStorage.setItem(PROJECT_MIGRATION_V128_KEY, '1');
    localStorage.setItem(PROJECT_MIGRATION_V129_KEY, '1');
  } catch {
    // ignore
  }
  return fallback;
}

export interface ProjectAccessFilterOptions {
  uid?: string;
  isAdmin?: boolean;
  assignedProjects?: string[];
  remoteProjects?: SapProject[];
}

export function getAccessibleProjectsForUser(
  userName: string,
  options?: ProjectAccessFilterOptions
): SapProject[] {
  const cleanUser = userName.trim();
  const localAll = getProjects();

  // Merge remote Firestore projects with local projects when authenticated
  let sourceList: SapProject[] = localAll;
  if (options?.remoteProjects && options.remoteProjects.length > 0) {
    const mergedMap = new Map<string, SapProject>();
    // Always ensure COMM and TEMP system containers exist
    localAll
      .filter((p) => p.code === COMMON_PROJECT_CODE || p.code === TEMP_PROJECT_CODE)
      .forEach((p) => mergedMap.set(p.code, p));

    if (options.isAdmin) {
      localAll.forEach((p) => mergedMap.set(p.code, p));
    }

    options.remoteProjects.forEach((rp) => {
      const code = normalizeLegacyProjectCode(rp.code);
      if (!code) return;
      mergedMap.set(code, {
        ...rp,
        code,
        members: enforceProjectMembers(rp.members, rp.owner),
      });
    });

    sourceList = Array.from(mergedMap.values());
  }

  if (options) {
    const assignedSet = new Set(
      (options.assignedProjects || []).map((c) => normalizeLegacyProjectCode(c))
    );
    const uid = (options.uid || '').trim();
    const isAdmin = Boolean(options.isAdmin);

    const filtered = sourceList.filter((p) => {
      if (p.visibility === 'common' || p.visibility === 'temp') return true;
      if (isAdmin) return true;
      if (assignedSet.has(p.code)) return true;
      if (uid && Array.isArray(p.memberUids) && p.memberUids.includes(uid)) return true;
      if (uid && p.ownerId && p.ownerId === uid) return true;
      return false;
    });

    return [
      ...filtered.filter((p) => p.code === COMMON_PROJECT_CODE),
      ...filtered.filter((p) => p.code !== COMMON_PROJECT_CODE && p.code !== TEMP_PROJECT_CODE),
      ...filtered.filter((p) => p.code === TEMP_PROJECT_CODE),
    ];
  }

  return sourceList.filter(
    (p) =>
      p.visibility === 'common' ||
      p.visibility === 'temp' ||
      isDefaultOperatorUser(cleanUser) ||
      p.owner === cleanUser ||
      p.members.includes(cleanUser)
  );
}

export function getProjectByCode(code?: string): SapProject | undefined {
  if (!code) return undefined;
  const upper = normalizeLegacyProjectCode(code);
  return getProjects().find((p) => p.code.toUpperCase() === upper);
}

export function saveProject(project: SapProject): {
  success: boolean;
  message?: string;
  list: SapProject[];
  savedProject?: SapProject;
} {
  const cleanCode = normalizeLegacyProjectCode(project.code);
  if (!isValidFourCharProjectCode(cleanCode)) {
    return {
      success: false,
      message: 'Project code must be exactly 4 characters (A-Z, 0-9, _).',
      list: getProjects(),
    };
  }
  if (!project.name.trim()) {
    return {
      success: false,
      message: 'Please enter a project name.',
      list: getProjects(),
    };
  }
  if (project.start_date && project.end_date && project.end_date < project.start_date) {
    return {
      success: false,
      message: 'End date must be on or after start date.',
      list: getProjects(),
    };
  }

  const list = getProjects();
  const idx = list.findIndex((p) => p.code.toUpperCase() === cleanCode);
  const existing = idx >= 0 ? list[idx] : null;

  const isSystem = cleanCode === COMMON_PROJECT_CODE || cleanCode === TEMP_PROJECT_CODE;
  const safeOwner =
    project.owner && !isLegacyRemovedUserName(project.owner)
      ? project.owner
      : DEFAULT_PROJECT_MEMBER;
  const nextMembers =
    isSystem
      ? [DEFAULT_PROJECT_MEMBER]
      : enforceProjectMembers(project.members, safeOwner);

  const normalized: SapProject = {
    ...project,
    code: cleanCode,
    name: project.name.trim(),
    description: project.description.trim(),
    start_date: project.start_date?.trim() || existing?.start_date || '',
    end_date: project.end_date?.trim() || existing?.end_date || '',
    visibility:
      cleanCode === COMMON_PROJECT_CODE
        ? 'common'
        : cleanCode === TEMP_PROJECT_CODE
        ? 'temp'
        : 'project',
    is_system: isSystem,
    owner: safeOwner,
    members: nextMembers,
    modules: project.modules.length > 0 ? project.modules : ALL_MODULES,
    abap_standards: {
      ...(project.abap_standards || {}),
      default_syntax_mode: project.abap_standards?.default_syntax_mode || 'modern_740',
    },
    created_date: existing?.created_date || project.created_date || new Date().toISOString().split('T')[0],
  };

  let nextList: SapProject[];
  if (idx >= 0) {
    nextList = [...list];
    nextList[idx] = normalized;
  } else {
    nextList = [...list, normalized];
  }

  const ensured = ensureSystemProjects(nextList);
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(ensured));
    return { success: true, list: ensured, savedProject: normalized };
  } catch (err) {
    console.error('Failed to save project', err);
    return { success: false, message: 'Failed to save project.', list };
  }
}

/**
 * Remove a deleted user from all team projects (Josh Lee is protected and never removed).
 */
export function removeMemberFromAllProjects(memberName: string): SapProject[] {
  const clean = (memberName || '').trim();
  if (!clean || isDefaultOperatorUser(clean)) {
    return getProjects();
  }

  const list = getProjects();
  const updated = list.map((p) => {
    if (p.is_system) return p;
    const nextOwner = p.owner.toLowerCase() === clean.toLowerCase() ? DEFAULT_PROJECT_MEMBER : p.owner;
    const nextMembers = enforceProjectMembers(
      (p.members || []).filter((m) => m.toLowerCase() !== clean.toLowerCase()),
      nextOwner
    );
    return {
      ...p,
      owner: nextOwner,
      members: nextMembers,
    };
  });

  const ensured = ensureSystemProjects(updated);
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(ensured));
  } catch (err) {
    console.error('Failed to update project members after user removal', err);
  }
  return ensured;
}

export function deleteProject(code: string): {
  success: boolean;
  message?: string;
  list: SapProject[];
} {
  const cleanCode = normalizeLegacyProjectCode(code);
  if (cleanCode === COMMON_PROJECT_CODE || cleanCode === TEMP_PROJECT_CODE) {
    return {
      success: false,
      message: `System default project ${cleanCode} cannot be deleted.`,
      list: getProjects(),
    };
  }

  const list = getProjects();
  const nextList = ensureSystemProjects(list.filter((p) => p.code.toUpperCase() !== cleanCode));
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextList));
    return { success: true, list: nextList };
  } catch (err) {
    console.error('Failed to delete project', err);
    return { success: false, message: 'Failed to delete project.', list };
  }
}

/**
 * Determine default/migrated project code for any spec that doesn't have one yet.
 */
export function resolveDefaultProjectCode(spec: Pick<ProgramSpec, 'program_id' | 'project_code' | 'is_system'>): string {
  const explicit = normalizeLegacyProjectCode(spec.project_code);
  if (explicit) return explicit;
  const pid = (spec.program_id || '').trim().toUpperCase();
  if (COMMON_SAMPLE_PROGRAM_IDS.includes(pid)) {
    return COMMON_PROJECT_CODE;
  }
  return TEMP_PROJECT_CODE;
}

/**
 * Protected COMM sample check:
 * ZRALV0010 ~ ZRALV0040 system originals residing in COMM cannot be overwritten directly.
 */
export function isCommonProtectedSample(
  spec: Pick<ProgramSpec, 'program_id' | 'project_code' | 'is_system'>
): boolean {
  const pid = (spec.program_id || '').trim().toUpperCase();
  const proj = resolveDefaultProjectCode(spec);
  return !!spec.is_system && proj === COMMON_PROJECT_CODE && COMMON_SAMPLE_PROGRAM_IDS.includes(pid);
}

/**
 * Any spec belonging to the COMM project (or flagged as a protected COMM sample) is read-only.
 */
export function isReadOnlyCommonSpec(
  spec: Pick<ProgramSpec, 'program_id' | 'project_code' | 'is_system'>
): boolean {
  const proj = resolveDefaultProjectCode(spec);
  return proj === COMMON_PROJECT_CODE || isCommonProtectedSample(spec);
}

/**
 * Visibility filter:
 * - TEMP project specs are strictly private to their creator (author_id === currentUserId when available, otherwise author === currentUserName).
 * - COMM and team projects show all specs assigned to that project code.
 */
export function isSpecVisibleInProject(
  item: {
    project_code?: string;
    author?: string;
    author_id?: string;
    program_id?: string;
    spec?: { author_id?: string };
  },
  projectCode: string,
  currentUserName: string,
  currentUserId?: string
): boolean {
  const itemProject = normalizeLegacyProjectCode(
    item.project_code ||
      (item.program_id && COMMON_SAMPLE_PROGRAM_IDS.includes(item.program_id.toUpperCase())
        ? COMMON_PROJECT_CODE
        : TEMP_PROJECT_CODE)
  );
  const targetProject = normalizeLegacyProjectCode(projectCode);

  if (itemProject !== targetProject) return false;

  if (targetProject === TEMP_PROJECT_CODE) {
    const itemAuthorId = (item.author_id || item.spec?.author_id || '').trim();
    const cleanUid = (currentUserId || '').trim();
    if (cleanUid && itemAuthorId) {
      return itemAuthorId === cleanUid;
    }
    return (item.author || '').trim() === currentUserName.trim();
  }

  return true;
}

export function getProjectAbapStandards(projectCode?: string) {
  const proj = getProjectByCode(projectCode);
  return {
    common_top_include: proj?.abap_standards?.common_top_include || 'zcommtop',
    common_form_include: proj?.abap_standards?.common_form_include || 'zcommf01',
    grid_class_name: proj?.abap_standards?.grid_class_name || 'cl_gui_alv_grid',
    message_class: proj?.abap_standards?.message_class || 'Z01',
    default_syntax_mode: proj?.abap_standards?.default_syntax_mode || 'modern_740',
    program_prefix: proj?.abap_standards?.program_prefix || '',
    tcode_pattern: proj?.abap_standards?.tcode_pattern || '',
    dev_package: proj?.abap_standards?.dev_package || '$TMP',
  };
}
