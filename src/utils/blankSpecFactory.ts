import { ProgramSpec, ProjectAbapStandards } from '../types/sap';
import { suggestCompliantIdsForProject } from './sapValidation';

export interface CreateBlankSpecOptions {
  targetProject: string;
  author: string;
  authorId?: string;
  existingProgramIds: Iterable<string>;
  projectStandards: ProjectAbapStandards;
}

export function createBlankProgramSpec({
  targetProject,
  author,
  authorId,
  existingProgramIds,
  projectStandards,
}: CreateBlankSpecOptions): ProgramSpec {
  const existingIds = new Set(Array.from(existingProgramIds, (id) => id.toUpperCase()));
  let suffix = 1;
  let suggested = suggestCompliantIdsForProject(
    `ZR_CUSTOM_${String(suffix).padStart(3, '0')}`,
    `ZC${String(suffix).padStart(3, '0')}`,
    'SD',
    projectStandards
  );
  while (existingIds.has(suggested.program_id.toUpperCase())) {
    suffix += 1;
    suggested = suggestCompliantIdsForProject(
      `ZR_CUSTOM_${String(suffix).padStart(3, '0')}`,
      `ZC${String(suffix).padStart(3, '0')}`,
      'SD',
      projectStandards
    );
  }

  return {
    id: `spec-custom-${Date.now()}`,
    project_code: targetProject,
    program_id: suggested.program_id,
    tcode: suggested.tcode,
    title: 'New ALV Grid Report Program',
    module: 'SD',
    author,
    author_id: authorId,
    created_date: new Date().toISOString().split('T')[0],
    target_sap_release: 'SAP S/4HANA 2023',
    program_type: 'REPORT',
    abap_syntax_mode: projectStandards.default_syntax_mode,
    message_class: projectStandards.message_class,
    business_purpose: 'ALV report for querying business process data.',
    data_extraction_logic: '1. Define selection criteria and DB extraction logic.',
    selection_params: [
      {
        id: 'p_bukrs',
        kind: 'PARAMETER',
        name: 'P_BUKRS',
        text: 'Company Code',
        ref_table: 'T001',
        ref_field: 'BUKRS',
        datatype: 'CHAR',
        length: 4,
        obligatory: true,
        default_val: '1000',
        low: '1000',
      },
      {
        id: 's_date',
        kind: 'SELECT_OPTION',
        name: 'S_DATE',
        text: 'Posting Date',
        datatype: 'DATS',
        length: 10,
        obligatory: true,
        default_val: 'SY-DATUM',
        low: '2026.10.01',
        high: '2026.10.31',
        sign: 'I',
        option: 'BT',
      },
    ],
    field_catalog: [
      {
        id: 'custom-f1',
        col_pos: 1,
        fieldname: 'ZICON',
        coltext: 'Status',
        datatype: 'CHAR',
        outputlen: 5,
        just: 'C',
        key: true,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
      },
      {
        id: 'custom-f2',
        col_pos: 2,
        fieldname: 'DOC_NO',
        coltext: 'Document No.',
        datatype: 'CHAR',
        outputlen: 12,
        just: 'C',
        key: true,
        hotspot: true,
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
        drilldown_tcode: 'VA03',
      },
      {
        id: 'custom-f3',
        col_pos: 3,
        fieldname: 'DOC_DATE',
        coltext: 'Posting Date',
        datatype: 'DATS',
        outputlen: 10,
        just: 'C',
        key: false,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
      },
      {
        id: 'custom-f4',
        col_pos: 4,
        fieldname: 'PARTNER_NAME',
        coltext: 'Partner Name',
        datatype: 'CHAR',
        outputlen: 25,
        just: 'L',
        key: false,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: false,
        emphasize: '',
      },
      {
        id: 'custom-f5',
        col_pos: 5,
        fieldname: 'AMOUNT',
        coltext: 'Amount',
        datatype: 'CURR',
        outputlen: 15,
        just: 'R',
        key: false,
        hotspot: false,
        checkbox: false,
        edit: false,
        do_sum: true,
        emphasize: '',
      },
      {
        id: 'custom-f6',
        col_pos: 6,
        fieldname: 'CURRENCY',
        coltext: 'Currency',
        datatype: 'CHAR',
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
      zebra: true,
      grid_title: 'Custom ALV Report',
      sel_mode: 'A',
      cwidth_opt: true,
      totals_only: false,
      excp_fname: 'ZICON',
      excp_led: true,
      show_row_numbers: true,
    },
    custom_toolbar: [],
    test_cases: [
      {
        id: 'tc-new-1',
        scenario: 'Normal Data Query',
        condition: 'Company Code = 1000',
        expected: 'Grid renders rows correctly',
      },
    ],
    mock_rows: [
      {
        ZICON: '1',
        DOC_NO: 'DOC-2026-001',
        DOC_DATE: '2026.10.10',
        PARTNER_NAME: 'Samsung Electronics Suwon',
        AMOUNT: 45000000,
        CURRENCY: 'KRW',
      },
      {
        ZICON: '2',
        DOC_NO: 'DOC-2026-002',
        DOC_DATE: '2026.10.15',
        PARTNER_NAME: 'Hyundai Motor Namyang',
        AMOUNT: 38200000,
        CURRENCY: 'KRW',
      },
      {
        ZICON: '3',
        DOC_NO: 'DOC-2026-003',
        DOC_DATE: '2026.10.22',
        PARTNER_NAME: 'LG Energy Solution Ochang',
        AMOUNT: 19800000,
        CURRENCY: 'KRW',
      },
    ],
  };
}
