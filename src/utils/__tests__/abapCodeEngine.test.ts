import { describe, it, expect } from 'vitest';
import {
  generateAllIncludes,
  generateF01Include,
  generateS01Include,
  generateTopInclude,
  mergeUserLogicRegions,
  extractTextSymbolsTable,
  extractPfStatusFunctionsTable,
} from '../abapCodeEngine';
import { ProgramSpec } from '../../types/sap';

function createTestSpec(overrides?: Partial<ProgramSpec>): ProgramSpec {
  return {
    id: 'spec-1',
    program_id: 'ZSD_ORDER_LIST',
    tcode: 'ZSD01',
    title: '판매오더 현황 모니터링',
    module: 'SD',
    author: 'Tester',
    created_date: '2026-01-01',
    target_sap_release: 'SAP S/4HANA 2023',
    program_type: 'REPORT',
    abap_syntax_mode: 'modern_740',
    message_class: 'ZSD01',
    business_purpose: 'Sales Order report',
    data_extraction_logic: 'SELECT vbeln, netwr FROM vbak INTO TABLE @lt_data.',
    selection_params: [
      {
        id: 'sp1',
        kind: 'SELECT_OPTION',
        name: 'S_VBELN',
        text: '판매문서',
        ref_table: 'VBAK',
        ref_field: 'VBELN',
        datatype: 'CHAR',
        length: 10,
        obligatory: false,
        default_val: '',
        matchcode_object: 'VMVA',
        block_id: 'B1',
        block_title: '조회 조건',
      },
    ],
    field_catalog: [
      {
        id: 'fc1',
        col_pos: 1,
        fieldname: 'VBELN',
        coltext: '판매오더',
        datatype: 'CHAR',
        outputlen: 10,
        just: 'L',
        key: true,
        hotspot: true,
        drilldown_tcode: 'VA03',
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
      },
      {
        id: 'fc2',
        col_pos: 2,
        fieldname: 'NETWR',
        coltext: '순가액',
        datatype: 'CURR',
        outputlen: 15,
        just: 'R',
        key: false,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: true,
        emphasize: '',
        cfieldname: 'WAERK',
      },
      {
        id: 'fc3',
        col_pos: 3,
        fieldname: 'WAERK',
        coltext: '통화',
        datatype: 'CUKY',
        outputlen: 5,
        just: 'C',
        key: false,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
      },
    ],
    layout: {
      grid_title: 'Sales Orders',
      zebra: true,
      cwidth_opt: true,
      sel_mode: 'A',
    },
    authority_checks: [
      {
        id: 'ac1',
        object: 'V_VBAK_VKO',
        fields: "VKORG = P_VKORG, ACTVT = '03'",
        trigger_point: 'START-OF-SELECTION',
        description: '영업조직 조회 권한',
      },
    ],
    performance_config: {
      batch_supported: true,
      spool_output: true,
      use_hana_pushdown: true,
    },
    custom_toolbar: [],
    test_cases: [],
    mock_rows: [],
    ...overrides,
  };
}

describe('abapCodeEngine', () => {
  it('generates ABAP 7.40+ VALUE #/NEW vs Classic CREATE OBJECT/CLEAR syntax accurately', () => {
    const spec = createTestSpec();

    const modernF01 = generateF01Include(spec, { syntaxMode: 'modern_740' });
    expect(modernF01).toContain('VALUE #(');
    expect(modernF01).toContain('NEW cl_gui_custom_container');

    const classicF01 = generateF01Include(spec, { syntaxMode: 'classic' });
    expect(classicF01).toContain('CLEAR ls_fcat.');
    expect(classicF01).toContain('CREATE OBJECT go_container');
  });

  it('injects Project ABAP Standards (wrapper grid class, common TOP, message class)', () => {
    const spec = createTestSpec();
    const includes = generateAllIncludes(spec, {
      syntaxMode: 'modern_740',
      standards: {
        common_top_include: 'zproj_commtop',
        common_form_include: 'zproj_commf01',
        grid_class_name: 'zcl_custom_alv_grid',
        message_class: 'ZPRJ9',
      },
    });

    expect(includes.program).toContain('INCLUDE zproj_commtop.');
    expect(includes.program).toContain('MESSAGE-ID zsd01');
    expect(includes.top).toContain('TYPE REF TO zcl_custom_alv_grid');
    expect(includes.c01).toContain('OF zcl_custom_alv_grid');
    expect(includes.f01).toContain('NEW zcl_custom_alv_grid');
  });

  it('preserves *&--- BEGIN/END USER LOGIC custom regions across regenerations', () => {
    const spec = createTestSpec();
    const firstGen = generateF01Include(spec, { syntaxMode: 'modern_740' });
    const modifiedPrev = firstGen.replace(
      '  " Write ABAP Open SQL / CDS Select statements here',
      '  SELECT vbeln, netwr FROM vbak UP TO 100 ROWS INTO TABLE @gt_alv.'
    );

    const updatedSpec = createTestSpec({
      title: 'Updated Report Title',
      source_code: { f01: modifiedPrev },
    });
    const regenerated = generateAllIncludes(updatedSpec, { syntaxMode: 'modern_740' });
    expect(regenerated.f01).toContain('SELECT vbeln, netwr FROM vbak UP TO 100 ROWS INTO TABLE @gt_alv.');

    const standaloneMerge = mergeUserLogicRegions(firstGen, modifiedPrev);
    expect(standaloneMerge).toContain('UP TO 100 ROWS');
  });

  it('emits MATCHCODE OBJECT in S01 and AUTHORITY-CHECK + SY-BATCH in F01', () => {
    const spec = createTestSpec();
    const s01 = generateS01Include(spec);
    expect(s01).toContain('MATCHCODE OBJECT vmva');
    expect(s01).toContain('SELECTION-SCREEN BEGIN OF BLOCK b1');

    const f01 = generateF01Include(spec);
    expect(f01).toContain("AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'");
    expect(f01).toContain("IF sy-batch = 'X'.");
    expect(f01).toContain('FORM write_batch_spool.');
  });

  it('generates dedicated ALV Tree (03) and IDA/CDS Pivot (04) objects', () => {
    const treeTop = generateTopInclude(
      createTestSpec({
        sample_type: '03',
        tree_config: { root_label: 'ROOT_NODE', group_field: 'CARRID' },
      })
    );
    expect(treeTop).toContain('TYPE REF TO cl_gui_alv_tree');

    const pivotTop = generateTopInclude(
      createTestSpec({
        sample_type: '04',
        cds_view_table: 'I_SalesDocumentItem',
      })
    );
    expect(pivotTop).toContain('TYPE REF TO if_salv_gui_table_ida');
    expect(pivotTop).toContain("'I_SALESDOCUMENTITEM'");
  });

  it('includes project dev_package in program header and extracts Text Symbols and PF-STATUS functions', () => {
    const spec = createTestSpec({
      selection_params: [
        {
          id: 'sp1',
          kind: 'SELECT_OPTION',
          name: 'S_VBELN',
          text: '판매문서',
          datatype: 'CHAR',
          length: 10,
          obligatory: false,
          default_val: '',
          block_id: 'B1',
          block_title: '기본 조회 조건',
        },
        {
          id: 'sp2',
          kind: 'PARAMETER',
          name: 'P_VKORG',
          text: '영업조직',
          datatype: 'CHAR',
          length: 4,
          obligatory: true,
          default_val: '1000',
          block_id: 'B2',
          block_title: '조직 옵션',
        },
      ],
      custom_toolbar: [
        {
          id: 'tb-post',
          function: 'POST',
          text: '일괄 전기',
          quickinfo: '선택 오더 전기 처리',
          icon: 'ICON_CHECKED',
          disabled: false,
          visible: true,
          is_standard: false,
        },
      ],
    });

    const includes = generateAllIncludes(spec, {
      standards: { dev_package: 'ZSD_DEV_PKG' },
    });
    expect(includes.program).toContain('* Package      : ZSD_DEV_PKG');

    const symbols = extractTextSymbolsTable(spec);
    expect(symbols).toHaveLength(2);
    expect(symbols[0].symbol).toBe('TEXT-001');
    expect(symbols[0].text).toBe('기본 조회 조건');
    expect(symbols[1].symbol).toBe('TEXT-002');
    expect(symbols[1].text).toBe('조직 옵션');

    const functions = extractPfStatusFunctionsTable(spec);
    expect(functions.some((f) => f.fcode === 'BACK' && f.source === 'GUI Status (0100)')).toBe(true);
    expect(functions.some((f) => f.fcode === 'POST' && f.source === 'ALV Custom Toolbar')).toBe(true);
  });
});
