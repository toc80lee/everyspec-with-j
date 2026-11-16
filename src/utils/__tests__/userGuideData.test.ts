import { describe, it, expect } from 'vitest';
import {
  GUIDE_CATEGORIES,
  STANDARD_SAMPLE_TYPES,
  USER_GUIDE_CASES,
} from '../../data/userGuideData';

describe('userGuideData', () => {
  it('defines distinct guide cases covering AI meetings, sample types, and source upload', () => {
    const ids = USER_GUIDE_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('ai-meeting-spec');
    expect(ids).toContain('sample-type-creation');
    expect(ids).toContain('legacy-abap-import');

    for (const c of USER_GUIDE_CASES) {
      expect(c.title.en.trim().length).toBeGreaterThan(0);
      expect(c.title.ko.trim().length).toBeGreaterThan(0);
      expect(c.steps.length).toBeGreaterThanOrEqual(2);
      expect(c.sampleFlow.outputBullets.length).toBeGreaterThan(0);
      expect(c.primaryAction.label.en.trim().length).toBeGreaterThan(0);
      expect(c.primaryAction.label.ko.trim().length).toBeGreaterThan(0);
    }
  });

  it('includes all 4 COMM standard sample types (01-04) with valid launcher action IDs', () => {
    expect(STANDARD_SAMPLE_TYPES.map((s) => s.typeCode)).toEqual(['01', '02', '03', '04']);
    expect(STANDARD_SAMPLE_TYPES.map((s) => s.programId)).toEqual([
      'ZRALV0010',
      'ZRALV0020',
      'ZRALV0030',
      'ZRALV0040',
    ]);
    expect(STANDARD_SAMPLE_TYPES.map((s) => s.actionId)).toEqual([
      'open_sample_01',
      'open_sample_02',
      'open_sample_03',
      'open_sample_04',
    ]);
  });

  it('maps every guide case to a defined non-all category', () => {
    const validCategories = new Set(
      GUIDE_CATEGORIES.filter((cat) => cat.id !== 'all').map((cat) => cat.id)
    );
    for (const c of USER_GUIDE_CASES) {
      expect(validCategories.has(c.category)).toBe(true);
    }
  });
});
