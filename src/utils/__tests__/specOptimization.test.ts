import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSavedSpecList,
  upsertWorkingSpecQuietly,
  saveSpecToStorage,
  deleteSpecFromStorage,
} from '../specStorage';
import { createBlankProgramSpec } from '../blankSpecFactory';
import { ProjectAbapStandards } from '../../types/sap';

function installTestStorage() {
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
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: mockStorage,
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    },
    configurable: true,
    writable: true,
  });

  return mockStorage;
}

const DEFAULT_STANDARDS: ProjectAbapStandards = {
  common_top_include: 'ZCOMMTOP',
  common_form_include: 'ZCOMMF01',
  grid_class_name: 'CL_GUI_ALV_GRID',
  message_class: 'ZFI_MSG',
  default_syntax_mode: 'modern_740',
  program_prefix: 'ZFI_',
  tcode_pattern: 'ZF*',
  dev_package: 'ZFI_PKG',
};

describe('specStorage snapshot cache & blankSpecFactory', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = installTestStorage();
  });

  it('returns the exact cached array reference when localStorage is unchanged', () => {
    const first = getSavedSpecList();
    const second = getSavedSpecList();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it('invalidates the snapshot cache automatically on localStorage.clear() or external setItem', () => {
    const seeded = getSavedSpecList();
    expect(seeded.length).toBeGreaterThan(0);

    // Mutate title externally without going through specStorage helpers
    const raw = mockStorage.getItem('sap_spec_programs_v4')!;
    const parsed = JSON.parse(raw);
    parsed[0].title = 'Externally Updated Title';
    mockStorage.setItem('sap_spec_programs_v4', JSON.stringify(parsed));

    const refreshed = getSavedSpecList();
    expect(refreshed).not.toBe(seeded);
    expect(refreshed[0].title).toBe('Externally Updated Title');

    // Clear storage -> re-seeds fresh snapshot instead of returning stale cache
    mockStorage.clear();
    const reseeded = getSavedSpecList();
    expect(reseeded).not.toBe(refreshed);
    expect(reseeded[0].title).not.toBe('Externally Updated Title');
  });

  it('keeps snapshot cache synchronized across upsertWorkingSpecQuietly, saveSpecToStorage, and deleteSpecFromStorage', () => {
    const blank = createBlankProgramSpec({
      targetProject: '2602',
      author: 'Tester',
      authorId: 'uid-tester',
      existingProgramIds: getSavedSpecList().map((s) => s.program_id),
      projectStandards: DEFAULT_STANDARDS,
    });

    expect(upsertWorkingSpecQuietly(blank)).toBe(true);
    const afterUpsert = getSavedSpecList();
    const foundAfterUpsert = afterUpsert.find((s) => s.program_id === blank.program_id);
    expect(foundAfterUpsert).toBeDefined();
    expect(foundAfterUpsert?.title).toBe('New ALV Grid Report Program');
    // Subsequent read is an O(1) cache hit
    expect(getSavedSpecList()).toBe(afterUpsert);

    const updated = { ...blank, title: 'Saved Revision Spec' };
    saveSpecToStorage(updated, 'Initial baseline', 'Tester');
    const afterSave = getSavedSpecList();
    const foundAfterSave = afterSave.find((s) => s.program_id === blank.program_id);
    expect(foundAfterSave?.title).toBe('Saved Revision Spec');
    expect(foundAfterSave?.change_history.length).toBeGreaterThan(0);

    deleteSpecFromStorage(blank.program_id);
    const afterDelete = getSavedSpecList();
    expect(afterDelete.find((s) => s.program_id === blank.program_id)).toBeUndefined();
  });

  it('createBlankProgramSpec avoids existing ID collisions and applies project ABAP standards', () => {
    const first = createBlankProgramSpec({
      targetProject: '2602',
      author: 'Josh Lee',
      authorId: 'uid-1',
      existingProgramIds: [],
      projectStandards: DEFAULT_STANDARDS,
    });

    const second = createBlankProgramSpec({
      targetProject: '2602',
      author: 'Josh Lee',
      authorId: 'uid-1',
      existingProgramIds: [first.program_id],
      projectStandards: DEFAULT_STANDARDS,
    });

    expect(first.program_id).not.toBe(second.program_id);
    expect(first.program_id.startsWith('ZFI_')).toBe(true);
    expect(first.tcode.startsWith('ZF')).toBe(true);
    expect(first.abap_syntax_mode).toBe('modern_740');
    expect(first.message_class).toBe('ZFI_MSG');
    expect(first.selection_params.length).toBeGreaterThanOrEqual(2);
    expect(first.field_catalog.length).toBeGreaterThanOrEqual(4);
    expect(first.layout.zebra).toBe(true);
  });
});
