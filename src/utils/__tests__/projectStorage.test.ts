import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProjects,
  saveProject,
  deleteProject,
  normalizeLegacyProjectCode,
  isValidFourCharProjectCode,
  resolveDefaultProjectCode,
  isCommonProtectedSample,
  isReadOnlyCommonSpec,
  isSpecVisibleInProject,
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
} from '../projectStorage';
import { SapProject } from '../../types/sap';

const PROJECT_STORAGE_KEY = 'sap_spec_projects_v1';
const PROJECT_MIGRATION_V128_KEY = 'sap_spec_migrated_v128_4char_modern';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return mockStorage;
}

describe('projectStorage', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('normalizes legacy project codes to strict 4-character codes', () => {
    expect(normalizeLegacyProjectCode('common')).toBe('COMM');
    expect(normalizeLegacyProjectCode('S4_ERP_2026')).toBe('2601');
    expect(normalizeLegacyProjectCode('SE_ERP_2P26')).toBe('2601');
    expect(normalizeLegacyProjectCode('FI_CLOSE_TF')).toBe('2602');
    expect(normalizeLegacyProjectCode('temp')).toBe('TEMP');
    expect(normalizeLegacyProjectCode('2603')).toBe('2603');
  });

  it('validates strict 4-character uppercase alphanumeric/underscore project codes', () => {
    expect(isValidFourCharProjectCode('COMM')).toBe(true);
    expect(isValidFourCharProjectCode('2601')).toBe(true);
    expect(isValidFourCharProjectCode('A1_9')).toBe(true);
    expect(isValidFourCharProjectCode('AB')).toBe(false);
    expect(isValidFourCharProjectCode('ABCDE')).toBe(false);
    expect(isValidFourCharProjectCode('AB-1')).toBe(false);
    expect(isValidFourCharProjectCode('')).toBe(false);
  });

  it('migrates legacy storage entries and enforces modern_740 once while preserving explicit classic overrides afterwards', () => {
    const legacySeed: SapProject[] = [
      {
        code: 'COMMON',
        name: '공통 표준 영역 (COMMON)',
        description: 'Legacy common',
        visibility: 'common',
        target_sap_release: 'SAP S/4HANA 2023',
        created_date: '2026-11-01',
        owner: 'Josh Lee',
        members: ['Josh Lee'],
        modules: ['FI'],
        abap_standards: { default_syntax_mode: 'classic' },
      },
      {
        code: 'S4_ERP_2026',
        name: '차세대 S/4HANA ERP 구축',
        description: 'Legacy ERP',
        visibility: 'project',
        target_sap_release: 'SAP S/4HANA 2023',
        created_date: '2026-11-01',
        owner: 'Josh Lee',
        members: ['Josh Lee'],
        modules: ['SD', 'MM'],
        abap_standards: { default_syntax_mode: 'classic' },
      },
      {
        code: 'FI_CLOSE_TF',
        name: '재무·원가 결산 고도화',
        description: 'Legacy FI',
        visibility: 'project',
        target_sap_release: 'SAP S/4HANA 2023',
        created_date: '2026-11-01',
        owner: 'Josh Lee',
        members: ['Josh Lee'],
        modules: ['FI', 'CO'],
        abap_standards: { default_syntax_mode: 'classic' },
      },
    ];

    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(legacySeed));

    const migrated = getProjects();
    expect(migrated.map((p) => p.code)).toEqual(['COMM', '2601', '2602', 'TEMP']);
    expect(localStorage.getItem(PROJECT_MIGRATION_V128_KEY)).toBe('1');

    const p2601 = migrated.find((p) => p.code === '2601')!;
    const p2602 = migrated.find((p) => p.code === '2602')!;
    expect(p2601.name).toBe('Next-Gen S/4HANA ERP');
    expect(p2602.name).toBe('FI/CO Closing Enhancement');
    expect(p2601.abap_standards?.default_syntax_mode).toBe('modern_740');
    expect(p2602.abap_standards?.default_syntax_mode).toBe('modern_740');

    // Explicit classic override after migration must persist
    const saved = saveProject({
      ...p2601,
      abap_standards: {
        ...(p2601.abap_standards || {}),
        default_syntax_mode: 'classic',
      },
    });
    expect(saved.success).toBe(true);
    expect(saved.savedProject?.abap_standards?.default_syntax_mode).toBe('classic');

    const reloaded = getProjects().find((p) => p.code === '2601');
    expect(reloaded?.abap_standards?.default_syntax_mode).toBe('classic');
  });

  it('rejects invalid 4-char codes and invalid period dates on saveProject', () => {
    const baseProj: SapProject = {
      code: '2603',
      name: 'Supply Chain Rollout',
      description: 'Valid 4-char project',
      visibility: 'project',
      target_sap_release: 'SAP S/4HANA 2023',
      created_date: '2026-11-01',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      owner: 'Josh Lee',
      members: ['Josh Lee'],
      modules: ['MM', 'PP'],
    };

    const tooShort = saveProject({ ...baseProj, code: 'AB' });
    expect(tooShort.success).toBe(false);

    const tooLong = saveProject({ ...baseProj, code: 'ABCDE' });
    expect(tooLong.success).toBe(false);

    const badDates = saveProject({
      ...baseProj,
      start_date: '2026-10-01',
      end_date: '2026-05-01',
    });
    expect(badDates.success).toBe(false);

    const ok = saveProject(baseProj);
    expect(ok.success).toBe(true);
    expect(ok.savedProject?.code).toBe('2603');
    expect(ok.savedProject?.start_date).toBe('2026-01-01');
    expect(ok.savedProject?.end_date).toBe('2026-12-31');
    expect(ok.savedProject?.abap_standards?.default_syntax_mode).toBe('modern_740');
  });

  it('protects system projects COMM and TEMP while allowing custom project deletion', () => {
    const custom: SapProject = {
      code: '9999',
      name: 'Temp Sandbox',
      description: 'Custom project',
      visibility: 'project',
      target_sap_release: 'SAP S/4HANA 2023',
      created_date: '2026-11-01',
      owner: 'Josh Lee',
      members: ['Josh Lee'],
      modules: ['FI'],
    };
    expect(saveProject(custom).success).toBe(true);

    expect(deleteProject(COMMON_PROJECT_CODE).success).toBe(false);
    expect(deleteProject(TEMP_PROJECT_CODE).success).toBe(false);
    expect(deleteProject('9999').success).toBe(true);
    expect(getProjects().some((p) => p.code === '9999')).toBe(false);
  });

  it('enforces COMM sample protection and TEMP author-private visibility', () => {
    expect(resolveDefaultProjectCode({ program_id: 'ZRALV0010', is_system: true })).toBe('COMM');
    expect(resolveDefaultProjectCode({ program_id: 'ZCUSTOM01', project_code: 'COMMON' })).toBe('COMM');
    expect(resolveDefaultProjectCode({ program_id: 'ZCUSTOM02' })).toBe('TEMP');

    expect(
      isCommonProtectedSample({ program_id: 'ZRALV0020', project_code: 'COMM', is_system: true })
    ).toBe(true);
    expect(
      isReadOnlyCommonSpec({ program_id: 'ZCUSTOM03', project_code: 'COMM', is_system: false })
    ).toBe(true);

    expect(
      isSpecVisibleInProject({ project_code: 'TEMP', author: 'Josh Lee' }, 'TEMP', 'Josh Lee')
    ).toBe(true);
    expect(
      isSpecVisibleInProject({ project_code: 'TEMP', author: 'Josh Lee' }, 'TEMP', 'Other User')
    ).toBe(false);
  });

  it('sets Josh Lee (toc80.lee@gmail.com) as sole default user, strips legacy Korean presets, and keeps Josh Lee in every project', async () => {
    const {
      DEFAULT_OPERATOR_USER,
      getRegisteredUsers,
      getCurrentUser,
      addRegisteredUser,
      removeRegisteredUser,
    } = await import('../authStorage');
    const { removeMemberFromAllProjects } = await import('../projectStorage');

    // Seed legacy preset names in localStorage before loading
    localStorage.setItem(
      'sap_spec_current_user_v1',
      JSON.stringify({ id: 'user-park', name: '박자재 수석', email: 'jajae.park@sap-project.com' })
    );
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify([
        {
          code: '2601',
          name: 'Next-Gen S/4HANA ERP',
          description: 'Test',
          visibility: 'project',
          target_sap_release: 'SAP S/4HANA 2023',
          created_date: '2026-10-15',
          owner: '김원가 책임',
          members: ['홍길동 책임', '김원가 책임', '박자재 수석'],
          modules: ['SD'],
        },
      ])
    );

    expect(getCurrentUser().email).toBe('toc80.lee@gmail.com');
    expect(getCurrentUser().name).toBe(DEFAULT_OPERATOR_USER.name);

    const registered = getRegisteredUsers();
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe('Josh Lee');
    expect(registered[0].email).toBe('toc80.lee@gmail.com');

    const projects = getProjects();
    for (const p of projects) {
      expect(p.members).toContain('Josh Lee');
      expect(p.members).not.toContain('홍길동 책임');
      expect(p.members).not.toContain('김원가 책임');
      expect(p.members).not.toContain('박자재 수석');
      expect(p.owner).not.toBe('김원가 책임');
    }

    // Even if saving a project attempts to omit Josh Lee, he remains included
    const customSave = saveProject({
      code: '2609',
      name: 'Custom Rollout',
      description: 'Ensures Josh Lee stays included',
      visibility: 'project',
      target_sap_release: 'SAP S/4HANA 2023',
      created_date: '2026-11-10',
      owner: 'Alice Kim',
      members: ['Alice Kim'],
      modules: ['FI'],
    });
    expect(customSave.success).toBe(true);
    expect(customSave.savedProject?.members).toContain('Josh Lee');
    expect(customSave.savedProject?.members).toContain('Alice Kim');

    // Add custom user and verify Josh Lee cannot be removed
    const added = addRegisteredUser({ name: 'Alice Kim', email: 'alice@example.com' });
    expect(added.success).toBe(true);
    expect(added.users.map((u) => u.name)).toEqual(['Josh Lee', 'Alice Kim']);

    expect(removeRegisteredUser('user-josh').success).toBe(false);
    expect(addRegisteredUser({ name: '박자재 수석' }).success).toBe(false);

    const removed = removeRegisteredUser(added.user!.id);
    expect(removed.success).toBe(true);
    const cleanedProjects = removeMemberFromAllProjects('Alice Kim');
    const p2609 = cleanedProjects.find((p) => p.code === '2609')!;
    expect(p2609.members).toEqual(['Josh Lee']);
  });

  it('scopes member additions and removals strictly to the target project without altering 2602, COMM, or TEMP', () => {
    const initial = getProjects();
    const p2601 = initial.find((p) => p.code === '2601')!;
    const p2602 = initial.find((p) => p.code === '2602')!;
    const comm = initial.find((p) => p.code === COMMON_PROJECT_CODE)!;
    const temp = initial.find((p) => p.code === TEMP_PROJECT_CODE)!;

    expect(comm.members).toEqual(['Josh Lee']);
    expect(temp.members).toEqual(['Josh Lee']);
    expect(p2601.members).toEqual(['Josh Lee']);
    expect(p2602.members).toEqual(['Josh Lee']);

    // Add Alice Kim only to 2601
    const addedTo2601 = saveProject({
      ...p2601,
      members: [...p2601.members, 'Alice Kim'],
    });
    expect(addedTo2601.success).toBe(true);

    const afterAdd = getProjects();
    expect(afterAdd.find((p) => p.code === '2601')?.members).toEqual(['Josh Lee', 'Alice Kim']);
    expect(afterAdd.find((p) => p.code === '2602')?.members).toEqual(['Josh Lee']);
    expect(afterAdd.find((p) => p.code === COMMON_PROJECT_CODE)?.members).toEqual(['Josh Lee']);
    expect(afterAdd.find((p) => p.code === TEMP_PROJECT_CODE)?.members).toEqual(['Josh Lee']);

    // Add Bob Park to 2602, then remove Alice Kim only from 2601
    const afterBob = saveProject({
      ...afterAdd.find((p) => p.code === '2602')!,
      members: ['Josh Lee', 'Bob Park'],
    });
    expect(afterBob.success).toBe(true);

    const removedFrom2601 = saveProject({
      ...afterAdd.find((p) => p.code === '2601')!,
      members: ['Josh Lee'],
    });
    expect(removedFrom2601.success).toBe(true);

    const finalProjects = getProjects();
    expect(finalProjects.find((p) => p.code === '2601')?.members).toEqual(['Josh Lee']);
    expect(finalProjects.find((p) => p.code === '2602')?.members).toEqual(['Josh Lee', 'Bob Park']);
    expect(finalProjects.find((p) => p.code === COMMON_PROJECT_CODE)?.members).toEqual(['Josh Lee']);
    expect(finalProjects.find((p) => p.code === TEMP_PROJECT_CODE)?.members).toEqual(['Josh Lee']);
  });
});
