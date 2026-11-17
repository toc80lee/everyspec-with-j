import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/firestoreSync', () => ({
  syncMeetingMinuteToFirestore: vi.fn().mockResolvedValue(undefined),
  deleteMeetingFromFirestore: vi.fn().mockResolvedValue(undefined),
  syncReviewCommentToFirestore: vi.fn().mockResolvedValue(undefined),
  deleteReviewCommentFromFirestore: vi.fn().mockResolvedValue(undefined),
}));

import {
  getSavedSpecList,
  saveSpecToStorage,
  deleteSpecFromStorage,
  reconcileProjectSpecsFromRemote,
  markSpecPendingWrite,
  clearSpecPendingWrite,
} from '../specStorage';
import {
  getMeetingMinutesList,
  saveMeetingMinute,
  reconcileProjectMeetingsFromRemote,
  markMeetingPendingWrite,
} from '../meetingStorage';
import {
  SAP_DDIC_UPDATED_EVENT,
  getDD02LTables,
  getDD03LFields,
  upsertDD02LTable,
  upsertDD03LField,
  reconcileCustomDdicFromRemote,
} from '../sapDdicStorage';
import {
  getReviewCommentsForSpec,
  addReviewComment,
  mergeRemoteReviewComments,
} from '../reviewCommentStorage';
import {
  getFavoriteProgramIds,
  setFavoriteProgramIds,
  toggleFavoriteProgram,
  migrateFavoriteUserKey,
} from '../favoriteStorage';
import { ProgramSpec, ProjectMeetingMinute, SpecReviewComment } from '../../types/sap';

function installTestBrowserEnv() {
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

  const eventTarget = new EventTarget();
  const mockWindow = {
    localStorage: mockStorage,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  };

  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
    writable: true,
  });

  return { mockStorage, eventTarget };
}

function makeSpec(overrides: Partial<ProgramSpec> = {}): ProgramSpec {
  const pid = (overrides.program_id || 'ZTEST_001').toUpperCase();
  return {
    id: overrides.id || `spec-${pid.toLowerCase()}`,
    project_code: overrides.project_code || '2601',
    program_id: pid,
    tcode: overrides.tcode || pid,
    title: overrides.title || `Test Spec ${pid}`,
    module: overrides.module || 'SD',
    program_type: 'REPORT',
    sample_type: '01',
    author: overrides.author || 'Josh Lee',
    author_id: overrides.author_id || 'uid-josh',
    created_date: '2026-11-10',
    target_sap_release: 'SAP S/4HANA 2023',
    status: overrides.status || 'draft',
    business_purpose: 'Overview',
    data_extraction_logic: 'SELECT FROM VBAK',
    selection_params: [],
    field_catalog: [],
    layout: {
      zebra: true,
      cwidth_opt: true,
      sel_mode: 'A',
      grid_title: 'Test Grid',
    },
    custom_toolbar: [],
    test_cases: [],
    mock_rows: [],
    abap_syntax_mode: 'modern_740',
    change_history: [],
    ...overrides,
  };
}

describe('Data sync reconciliation, delete propagation, DDIC & preferences', () => {
  beforeEach(() => {
    installTestBrowserEnv();
  });

  describe('reconcileProjectSpecsFromRemote', () => {
    it('deletes cached non-pending project specs when remote snapshot is empty while preserving other projects and COMM samples', () => {
      const s1 = makeSpec({ id: 'spec-a', program_id: 'ZSD_A', project_code: '2601' });
      const s2 = makeSpec({ id: 'spec-b', program_id: 'ZFI_B', project_code: '2602', module: 'FI' });

      expect(saveSpecToStorage(s1, 'Init', 'Josh Lee').success).toBe(true);
      expect(saveSpecToStorage(s2, 'Init', 'Josh Lee').success).toBe(true);
      clearSpecPendingWrite('ZSD_A');
      clearSpecPendingWrite('spec-a');

      const reconciled = reconcileProjectSpecsFromRemote('2601', [], 'Josh Lee', 'uid-josh');

      // 2601 spec deleted remotely -> gone
      expect(reconciled.some((i) => i.program_id === 'ZSD_A')).toBe(false);
      // 2602 spec untouched
      expect(reconciled.some((i) => i.program_id === 'ZFI_B')).toBe(true);
      // COMM protected sample ZRALV0010 still present
      expect(reconciled.some((i) => i.program_id === 'ZRALV0010' && i.project_code === 'COMM')).toBe(true);
      expect(getSavedSpecList().some((i) => i.program_id === 'ZSD_A')).toBe(false);
    });

    it('preserves specs inside the pending write grace window during empty remote snapshots', () => {
      const pending = makeSpec({ id: 'spec-p', program_id: 'ZSD_PENDING', project_code: '2601', revision: 2 });
      expect(saveSpecToStorage(pending, 'Local edit', 'Josh Lee').success).toBe(true);
      markSpecPendingWrite('ZSD_PENDING');

      const reconciled = reconcileProjectSpecsFromRemote('2601', [], 'Josh Lee', 'uid-josh');
      expect(reconciled.some((i) => i.program_id === 'ZSD_PENDING')).toBe(true);
    });

    it('isolates other users TEMP drafts even if remote TEMP snapshot only returns current users specs', () => {
      const aliceTemp = makeSpec({
        id: 'spec-alice-temp',
        program_id: 'ZTEMP_ALICE',
        project_code: 'TEMP',
        author: 'Alice Kim',
        author_id: 'uid-alice',
      });
      const joshTemp = makeSpec({
        id: 'spec-josh-temp',
        program_id: 'ZTEMP_JOSH',
        project_code: 'TEMP',
        author: 'Josh Lee',
        author_id: 'uid-josh',
      });
      saveSpecToStorage(aliceTemp, 'Init', 'Alice Kim');
      saveSpecToStorage(joshTemp, 'Init', 'Josh Lee');
      clearSpecPendingWrite('ZTEMP_ALICE');
      clearSpecPendingWrite('spec-alice-temp');
      clearSpecPendingWrite('ZTEMP_JOSH');
      clearSpecPendingWrite('spec-josh-temp');

      // Remote snapshot for Josh contains nothing -> Josh's spec removed, Alice's TEMP draft stays isolated/untouched
      const reconciled = reconcileProjectSpecsFromRemote('TEMP', [], 'Josh Lee', 'uid-josh');
      expect(reconciled.some((i) => i.program_id === 'ZTEMP_JOSH')).toBe(false);
      expect(reconciled.some((i) => i.program_id === 'ZTEMP_ALICE')).toBe(true);
    });
  });

  describe('deleteSpecFromStorage', () => {
    it('supports UID ownership, admin override, COMM protection, and returns deletedItem', () => {
      const spec = makeSpec({
        id: 'spec-del-1',
        program_id: 'ZSD_DEL01',
        project_code: '2601',
        author: 'Old Name',
        author_id: 'uid-alice',
      });
      saveSpecToStorage(spec, 'Init', 'Old Name');

      // Different regular user cannot delete
      const denied = deleteSpecFromStorage('ZSD_DEL01', 'Bob Park', {
        currentUserId: 'uid-bob',
        isAdmin: false,
      });
      expect(denied.success).toBe(false);

      // Admin can delete even without ownership
      const adminOk = deleteSpecFromStorage('ZSD_DEL01', 'Josh Lee', {
        currentUserId: 'uid-josh',
        isAdmin: true,
      });
      expect(adminOk.success).toBe(true);
      expect(adminOk.deletedItem?.program_id).toBe('ZSD_DEL01');
      expect(adminOk.deletedItem?.project_code).toBe('2601');

      // Re-save and verify UID match succeeds even if display name changed
      saveSpecToStorage(spec, 'Init', 'Old Name');
      const uidOk = deleteSpecFromStorage('ZSD_DEL01', 'Alice Renamed', {
        currentUserId: 'uid-alice',
        isAdmin: false,
      });
      expect(uidOk.success).toBe(true);

      // COMM system spec cannot be deleted
      const commFail = deleteSpecFromStorage('ZRALV0010', 'Josh Lee', {
        currentUserId: 'uid-josh',
        isAdmin: true,
      });
      expect(commFail.success).toBe(false);
    });
  });

  describe('reconcileProjectMeetingsFromRemote', () => {
    const makeMeeting = (overrides: Partial<ProjectMeetingMinute> = {}): ProjectMeetingMinute => ({
      id: overrides.id || 'mtg-1',
      project_code: overrides.project_code || '2601',
      title: overrides.title || 'Kickoff',
      author: overrides.author || 'Josh Lee',
      author_id: overrides.author_id || 'uid-josh',
      status: 'minutes_ready',
      segments: [],
      raw_transcript: 'notes',
      minutes_markdown: 'summary',
      action_items: [],
      created_at: '2026-11-15 10:00',
      updated_at: '2026-11-15 10:00',
      ...overrides,
    });

    it('propagates remote deletions while keeping pending writes and TEMP isolation', () => {
      // Save remote-deleted meeting in 2601 & simulate TTL expiry by injecting directly into localStorage
      const stale = makeMeeting({ id: 'mtg-stale', project_code: '2601' });
      const pending = makeMeeting({ id: 'mtg-pending', project_code: '2601' });
      const aliceTemp = makeMeeting({
        id: 'mtg-alice-temp',
        project_code: 'TEMP',
        author: 'Alice Kim',
        author_id: 'uid-alice',
      });

      localStorage.setItem('sap_spec_meeting_minutes_v1', JSON.stringify([stale, pending, aliceTemp]));
      markMeetingPendingWrite('mtg-pending');

      const after2601 = reconcileProjectMeetingsFromRemote('2601', [], 'Josh Lee', 'uid-josh');
      expect(after2601.some((m) => m.id === 'mtg-stale')).toBe(false);
      expect(after2601.some((m) => m.id === 'mtg-pending')).toBe(true);
      expect(after2601.some((m) => m.id === 'mtg-alice-temp')).toBe(true);

      const afterTemp = reconcileProjectMeetingsFromRemote('TEMP', [], 'Josh Lee', 'uid-josh');
      expect(afterTemp.some((m) => m.id === 'mtg-alice-temp')).toBe(true);
      expect(getMeetingMinutesList().some((m) => m.id === 'mtg-alice-temp')).toBe(true);
    });
  });

  describe('reconcileCustomDdicFromRemote', () => {
    it('syncs and prunes custom tables while keeping standard SAP tables and emitting SAP_DDIC_UPDATED_EVENT', () => {
      let eventCount = 0;
      window.addEventListener(SAP_DDIC_UPDATED_EVENT, () => {
        eventCount += 1;
      });

      // Seed initial standard tables + a stale custom table directly in storage (no pending flag)
      const stdTables = getDD02LTables();
      const stdFields = getDD03LFields();
      expect(stdTables.some((t) => t.tabname === 'VBAK' && !t.is_custom)).toBe(true);

      localStorage.setItem(
        'sap_ddic_dd02l_tables',
        JSON.stringify([
          ...stdTables,
          { tabname: 'ZOLD_CUST', ddtext: 'Old', module: 'SD', tabclass: 'TRANSP', is_custom: true },
        ])
      );
      localStorage.setItem(
        'sap_ddic_dd03l_fields',
        JSON.stringify([
          ...stdFields,
          {
            id: 'dd03l-ZOLD_CUST-MANDT',
            tabname: 'ZOLD_CUST',
            fieldname: 'MANDT',
            position: 1,
            keyflag: true,
            datatype: 'CHAR',
            leng: 3,
            scrtext_l: 'Client',
            is_custom: true,
          },
        ])
      );

      // Add a pending local custom table via upsertDD02LTable
      upsertDD02LTable({
        tabname: 'ZLOCAL_PEND',
        ddtext: 'Pending Local',
        module: 'MM',
        tabclass: 'TRANSP',
        is_custom: true,
      });
      upsertDD03LField({
        id: 'dd03l-ZLOCAL_PEND-MATNR',
        tabname: 'ZLOCAL_PEND',
        fieldname: 'MATNR',
        position: 1,
        keyflag: true,
        datatype: 'CHAR',
        leng: 18,
        scrtext_l: 'Material',
        ddtext: 'Material Number',
        is_custom: true,
      });

      const eventsBeforeReconcile = eventCount;
      const result = reconcileCustomDdicFromRemote([
        {
          table: {
            tabname: 'ZSHARED_NEW',
            ddtext: 'Shared Remote',
            module: 'FI',
            tabclass: 'TRANSP',
            is_custom: true,
          },
          fields: [
            {
              id: 'dd03l-ZSHARED_NEW-BUKRS',
              tabname: 'ZSHARED_NEW',
              fieldname: 'BUKRS',
              position: 1,
              keyflag: true,
              datatype: 'CHAR',
              leng: 4,
              scrtext_l: 'Company Code',
              ddtext: 'Company Code',
              is_custom: true,
            },
          ],
        },
      ]);

      expect(eventCount).toBeGreaterThan(eventsBeforeReconcile);
      expect(result.tables.some((t) => t.tabname === 'VBAK' && !t.is_custom)).toBe(true);
      expect(result.tables.some((t) => t.tabname === 'ZOLD_CUST')).toBe(false);
      expect(result.tables.some((t) => t.tabname === 'ZLOCAL_PEND')).toBe(true);
      expect(result.tables.some((t) => t.tabname === 'ZSHARED_NEW')).toBe(true);
      expect(result.fields.some((f) => f.tabname === 'ZSHARED_NEW' && f.fieldname === 'BUKRS')).toBe(true);
      expect(result.fields.some((f) => f.tabname === 'ZOLD_CUST')).toBe(false);
    });
  });

  describe('mergeRemoteReviewComments', () => {
    it('propagates remote deletions while retaining pending local comments and other specs comments', () => {
      const staleComment: SpecReviewComment = {
        id: 'cmt-stale',
        project_code: '2601',
        spec_id: 'spec-1',
        section: 'general',
        author_name: 'Alice',
        body: 'Old comment',
        resolved: false,
        replies: [],
        created_at: '2026-11-10T01:00:00Z',
        updated_at: '2026-11-10T01:00:00Z',
      };
      const otherSpecComment: SpecReviewComment = {
        id: 'cmt-other',
        project_code: '2601',
        spec_id: 'spec-2',
        section: 'field_catalog',
        author_name: 'Bob',
        body: 'Other spec comment',
        resolved: false,
        replies: [],
        created_at: '2026-11-10T02:00:00Z',
        updated_at: '2026-11-10T02:00:00Z',
      };
      localStorage.setItem(
        'sap_spec_review_comments_v1',
        JSON.stringify([staleComment, otherSpecComment])
      );

      // Add a fresh pending local comment on spec-1
      const pendingLocal = addReviewComment({
        project_code: '2601',
        spec_id: 'spec-1',
        section: 'data_logic',
        author_name: 'Josh Lee',
        body: 'In-flight local comment',
      });

      const merged = mergeRemoteReviewComments('2601', 'spec-1', []);
      expect(merged.some((c) => c.id === 'cmt-stale')).toBe(false);
      expect(merged.some((c) => c.id === pendingLocal.id)).toBe(true);
      expect(getReviewCommentsForSpec('2601', 'spec-2')).toHaveLength(1);
    });
  });

  describe('favoriteStorage UID migration and cap', () => {
    it('deduplicates, uppercases, caps at 100, and migrates legacy userName favorites to UID', () => {
      const over100 = Array.from({ length: 120 }, (_, i) => `zprog_${i}`);
      over100.push('ZPROG_0'); // duplicate
      const saved = setFavoriteProgramIds('uid-josh', over100);
      expect(saved).toHaveLength(100);
      expect(saved[0]).toBe('ZPROG_0');

      // Reset and test migration
      localStorage.clear();
      toggleFavoriteProgram('Josh Lee', 'zralv0010');
      toggleFavoriteProgram('uid-josh', 'zsd_001');
      toggleFavoriteProgram('uid-josh', 'ZRALV0010');

      const migrated = migrateFavoriteUserKey('Josh Lee', 'uid-josh');
      expect(migrated).toEqual(['ZRALV0010', 'ZSD_001']);
      expect(getFavoriteProgramIds('uid-josh')).toEqual(['ZRALV0010', 'ZSD_001']);
    });
  });
});
