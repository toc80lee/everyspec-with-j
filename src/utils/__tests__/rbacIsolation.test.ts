import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  isSpecVisibleInProject,
} from '../projectStorage';
import {
  getVisibleMinutesForProject,
  saveMeetingMinute,
} from '../meetingStorage';
import { SapProject } from '../../types/sap';

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

const REMOTE_PROJECTS: SapProject[] = [
  {
    code: COMMON_PROJECT_CODE,
    name: 'Common Standards',
    description: 'Common',
    visibility: 'common',
    is_system: true,
    target_sap_release: 'SAP S/4HANA 2023',
    created_date: '2026-10-01',
    owner: 'Josh Lee',
    members: ['Josh Lee'],
    modules: ['SD'],
  },
  {
    code: '2601',
    name: 'Next-Gen S/4HANA ERP',
    description: 'Project A',
    visibility: 'project',
    target_sap_release: 'SAP S/4HANA 2023',
    created_date: '2026-10-01',
    owner: 'Josh Lee',
    members: ['Josh Lee', 'Alice Kim'],
    memberUids: ['uid-josh', 'uid-alice'],
    modules: ['SD', 'MM'],
  },
  {
    code: '2602',
    name: 'FI/CO Closing Enhancement',
    description: 'Project B',
    visibility: 'project',
    target_sap_release: 'SAP S/4HANA 2023',
    created_date: '2026-10-01',
    owner: 'Josh Lee',
    members: ['Josh Lee', 'Bob Park'],
    memberUids: ['uid-josh', 'uid-bob'],
    modules: ['FI', 'CO'],
  },
  {
    code: TEMP_PROJECT_CODE,
    name: 'Personal Workspace',
    description: 'Private temp',
    visibility: 'temp',
    is_system: true,
    target_sap_release: 'SAP S/4HANA 2023',
    created_date: '2026-10-01',
    owner: 'Josh Lee',
    members: ['Josh Lee'],
    modules: ['SD'],
  },
];

describe('RBAC 3-scope isolation', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('restricts approved regular users to COMM, assigned projects, and TEMP — never unassigned projects', () => {
    const aliceProjects = getAccessibleProjectsForUser('Alice Kim', {
      uid: 'uid-alice',
      isAdmin: false,
      assignedProjects: ['2601'],
      remoteProjects: REMOTE_PROJECTS,
    });

    expect(aliceProjects.map((p) => p.code)).toEqual(['COMM', '2601', 'TEMP']);
    expect(aliceProjects.some((p) => p.code === '2602')).toBe(false);
  });

  it('grants approved regular user with zero assigned projects access only to COMM and TEMP', () => {
    const unassignedProjects = getAccessibleProjectsForUser('Charlie Choi', {
      uid: 'uid-charlie',
      isAdmin: false,
      assignedProjects: [],
      remoteProjects: REMOTE_PROJECTS,
    });

    expect(unassignedProjects.map((p) => p.code)).toEqual(['COMM', 'TEMP']);
  });

  it('grants admins visibility into all projects including COMM, team projects, and TEMP', () => {
    const adminProjects = getAccessibleProjectsForUser('Josh Lee', {
      uid: 'uid-josh',
      isAdmin: true,
      assignedProjects: [],
      remoteProjects: REMOTE_PROJECTS,
    });

    expect(adminProjects.map((p) => p.code)).toEqual(['COMM', '2601', '2602', 'TEMP']);
  });

  it('strictly isolates TEMP specs by author_id UID even if display names collide', () => {
    const aliceDraft = {
      project_code: 'TEMP',
      author: 'Alex Kim',
      author_id: 'uid-alice',
      program_id: 'ZTEMP_ALICE',
    };

    expect(isSpecVisibleInProject(aliceDraft, 'TEMP', 'Alex Kim', 'uid-alice')).toBe(true);
    // Same display name, different UID -> blocked
    expect(isSpecVisibleInProject(aliceDraft, 'TEMP', 'Alex Kim', 'uid-imposter')).toBe(false);
    // Admin UID -> still blocked from viewing another user's private TEMP spec
    expect(isSpecVisibleInProject(aliceDraft, 'TEMP', 'Josh Lee', 'uid-josh')).toBe(false);
  });

  it('strictly isolates TEMP meeting minutes by author_id UID', () => {
    saveMeetingMinute({
      id: 'mtg-alice-temp',
      project_code: 'TEMP',
      title: 'Private Notes',
      author: 'Alex Kim',
      author_id: 'uid-alice',
      status: 'minutes_ready',
      segments: [],
      raw_transcript: 'Confidential draft',
      minutes_markdown: 'Summary',
      action_items: [],
      created_at: '2026-11-15 10:00',
      updated_at: '2026-11-15 10:00',
    });

    expect(getVisibleMinutesForProject('TEMP', 'Alex Kim', 'uid-alice')).toHaveLength(1);
    expect(getVisibleMinutesForProject('TEMP', 'Alex Kim', 'uid-other')).toHaveLength(0);
    expect(getVisibleMinutesForProject('TEMP', 'Josh Lee', 'uid-josh')).toHaveLength(0);
  });
});
