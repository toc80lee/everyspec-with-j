import { describe, it, expect } from 'vitest';
import {
  validateSapTCode,
  validateSapProgramId,
  validateSelectionParameters,
  validateFieldCatalog,
  validateFieldCatalogReferences,
  validateFullProgramSpec,
  suggestAbapSelectionName,
  analyzeS4HanaCompatibility,
  suggestCompliantIdsForProject,
  validateProjectNamingStandards,
} from '../sapValidation';
import { AlvField, ProgramSpec, SelectionParameter } from '../../types/sap';

function makeField(overrides: Partial<AlvField>): AlvField {
  return {
    id: overrides.id || 'f1',
    col_pos: overrides.col_pos ?? 1,
    fieldname: overrides.fieldname || 'VBELN',
    coltext: overrides.coltext || '오더번호',
    datatype: overrides.datatype || 'CHAR',
    outputlen: overrides.outputlen ?? 10,
    just: overrides.just || 'L',
    key: overrides.key ?? false,
    hotspot: overrides.hotspot ?? false,
    checkbox: overrides.checkbox ?? false,
    edit: overrides.edit ?? false,
    do_sum: overrides.do_sum ?? false,
    emphasize: overrides.emphasize || '',
    ...overrides,
  };
}

function makeParam(overrides: Partial<SelectionParameter>): SelectionParameter {
  return {
    id: overrides.id || 'p1',
    kind: overrides.kind || 'PARAMETER',
    name: overrides.name || 'P_BUKRS',
    text: overrides.text || '회사코드',
    datatype: overrides.datatype || 'CHAR',
    length: overrides.length ?? 4,
    obligatory: overrides.obligatory ?? true,
    default_val: overrides.default_val || '',
    ...overrides,
  };
}

function makeMinimalSpec(overrides?: Partial<ProgramSpec>): ProgramSpec {
  return {
    id: 'spec-test',
    program_id: 'ZSD_ORDER_MONITOR',
    tcode: 'ZSD01',
    title: '영업 오더 모니터링',
    module: 'SD',
    author: 'Tester',
    created_date: '2026-01-01',
    target_sap_release: 'SAP S/4HANA 2023',
    program_type: 'REPORT',
    business_purpose: 'Test spec',
    data_extraction_logic: 'SELECT vbeln FROM vbak.',
    selection_params: [makeParam({ id: 'p1', name: 'P_VKORG', text: '영업조직' })],
    field_catalog: [
      makeField({ id: 'f1', col_pos: 1, fieldname: 'VBELN', coltext: '오더번호', datatype: 'CHAR', key: true }),
    ],
    layout: {
      grid_title: 'Test Grid',
      zebra: true,
      cwidth_opt: true,
      sel_mode: 'A',
    },
    custom_toolbar: [],
    test_cases: [],
    mock_rows: [],
    ...overrides,
  };
}

describe('sapValidation utilities', () => {
  it('validates Z/Y customer T-Codes and rejects SAP standard collisions', () => {
    expect(validateSapTCode('ZSD01').isValid).toBe(true);
    expect(validateSapTCode('YFIN99').isValid).toBe(true);

    const stdCollision = validateSapTCode('VA03');
    expect(stdCollision.isValid).toBe(false);
    expect(stdCollision.status).toBe('reserved_sap_standard');
    expect(stdCollision.suggestedTCode).toBe('ZVA03');

    const nonCust = validateSapTCode('ASD01');
    expect(nonCust.isValid).toBe(false);
    expect(nonCust.status).toBe('invalid_prefix');
    expect(nonCust.suggestedTCode).toBe('ZASD01');
  });

  it('validates SAP Program ID customer namespace and max 40 chars', () => {
    expect(validateSapProgramId('ZR_TEST_01').isValid).toBe(true);
    const nonZ = validateSapProgramId('R_TEST_01');
    expect(nonZ.isValid).toBe(false);
    expect(nonZ.status).toBe('invalid_prefix');

    const tooLong = validateSapProgramId('Z' + 'A'.repeat(45));
    expect(tooLong.isValid).toBe(false);
    expect(tooLong.status).toBe('too_long');
  });

  it('enforces ABAP 8-char limit, duplicate check, and radio group rules on Selection Screen', () => {
    const issues = validateSelectionParameters([
      makeParam({ id: '1', name: 'S_TOO_LONG_PARAM', kind: 'SELECT_OPTION' }),
      makeParam({ id: '2', name: 'P_DUP', kind: 'PARAMETER' }),
      makeParam({ id: '3', name: 'P_DUP', kind: 'PARAMETER' }),
      makeParam({ id: '4', name: 'R_OPT1', kind: 'RADIOBUTTON', radio_group: 'GRP1', default_val: 'X' }),
      makeParam({ id: '5', name: 'R_OPT2', kind: 'RADIOBUTTON', radio_group: 'GRP1', default_val: 'X' }),
    ]);

    expect(issues.some((i) => i.category === 'name_too_long')).toBe(true);
    expect(issues.some((i) => i.category === 'duplicate_name')).toBe(true);
    expect(issues.some((i) => i.category === 'radio_default_conflict')).toBe(true);
    expect(suggestAbapSelectionName('S_VERY_LONG_FIELD', 'SELECT_OPTION').length).toBeLessThanOrEqual(8);
  });

  it('checks Field Catalog types, positions, duplicates, and CFIELDNAME/QFIELDNAME refs', () => {
    const summary = validateFieldCatalog([
      makeField({ id: 'a', col_pos: 1, fieldname: 'NETWR', datatype: 'CURR' }),
      makeField({ id: 'b', col_pos: 1, fieldname: 'NETWR', datatype: 'BAD_TYPE' as any }),
    ]);

    expect(summary.isValid).toBe(false);
    expect(summary.duplicateColPosValues).toContain(1);
    expect(summary.duplicateFieldnames).toContain('NETWR');
    expect(summary.invalidTypeRows).toContain(1);

    const refIssues = validateFieldCatalogReferences([
      makeField({ id: 'c1', col_pos: 1, fieldname: 'NETWR', datatype: 'CURR', cfieldname: 'WAERK' }),
      makeField({ id: 'q1', col_pos: 2, fieldname: 'MENGE', datatype: 'DEC', qfieldname: 'MEINS' }),
    ]);
    expect(refIssues.some((r) => r.id.startsWith('ref-cuky') && r.severity === 'error')).toBe(true);
    expect(refIssues.some((r) => r.id.startsWith('ref-unit') && r.severity === 'error')).toBe(true);
  });

  it('validates Master-Detail foreign key integrity across Header and Item grids', () => {
    const spec = makeMinimalSpec({
      sample_type: '02',
      authority_checks: [
        { id: 'a1', object: 'V_VBAK_VKO', fields: 'ACTVT = 03', trigger_point: 'START-OF-SELECTION', description: 'Sales Org Auth' },
      ],
      item_grid: {
        grid_name: 'Item Grid',
        foreign_key: 'VBELN',
        layout: { grid_title: 'Items', zebra: true, cwidth_opt: true, sel_mode: 'A' },
        field_catalog: [
          makeField({ id: 'i1', col_pos: 1, fieldname: 'POSNR', coltext: '품목번호', datatype: 'NUMC' }),
        ],
        mock_rows: [],
      },
    });

    const report = validateFullProgramSpec(spec);
    expect(report.isValid).toBe(false);
    expect(report.issues.some((i) => i.id === 'item-fk-VBELN')).toBe(true);
  });

  it('detects ECC legacy tables and missing FI ledger keys in analyzeS4HanaCompatibility', () => {
    const spec = makeMinimalSpec({
      module: 'FI',
      target_sap_release: 'SAP S/4HANA 2023',
      data_extraction_logic: 'SELECT belnr, dmbtr FROM bseg JOIN konv ON ... JOIN mseg ON ...',
      selection_params: [makeParam({ id: 'p1', name: 'P_BELNR', text: '전표번호' })],
      performance_config: { use_hana_pushdown: false },
    });

    const diagnostics = analyzeS4HanaCompatibility(spec);
    expect(diagnostics.some((d) => d.detectedTable.includes('BSEG') && d.s4Replacement?.includes('ACDOCA'))).toBe(true);
    expect(diagnostics.some((d) => d.detectedTable.includes('KONV') && d.s4Replacement?.includes('PRCD_ELEMENTS'))).toBe(true);
    expect(diagnostics.some((d) => d.detectedTable.includes('MSEG') && d.s4Replacement?.includes('MATDOC'))).toBe(true);
    expect(diagnostics.some((d) => d.id === 's4-perf-fi-keys')).toBe(true);
    expect(diagnostics.some((d) => d.id === 's4-hana-pushdown-tip')).toBe(true);
  });

  it('suggests and validates project naming standards (program_prefix and tcode_pattern)', () => {
    const standards = {
      program_prefix: 'ZSD_',
      tcode_pattern: 'ZSD*',
      dev_package: 'ZSD_PKG',
    };

    const suggested = suggestCompliantIdsForProject('ZR_CUSTOM_001', 'ZC001', 'SD', standards);
    expect(suggested.program_id.startsWith('ZSD_')).toBe(true);
    expect(suggested.tcode.startsWith('ZSD')).toBe(true);

    const nonCompliant = makeMinimalSpec({
      program_id: 'ZFI_REPORT',
      tcode: 'ZFI01',
    });
    const issues = validateProjectNamingStandards(nonCompliant, standards);
    expect(issues.some((i) => i.id === 'proj-std-program-prefix' && i.targetField === 'program_id')).toBe(true);
    expect(issues.some((i) => i.id === 'proj-std-tcode-pattern' && i.targetField === 'tcode')).toBe(true);

    const compliant = makeMinimalSpec({
      program_id: 'ZSD_ORDER_LIST',
      tcode: 'ZSD01',
    });
    expect(validateProjectNamingStandards(compliant, standards)).toHaveLength(0);
  });
});
