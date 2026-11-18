import * as XLSX from 'xlsx';
import { AlvField, ProgramSpec, SapProject } from '../types/sap';
import { getEffectiveDataFlow } from '../components/MermaidFlowChartSvg';
import { sanitizeFilename, triggerBlobDownload } from './officeExportHelpers';

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
}

function computeColWidths(rows: unknown[][], minWidth = 10, maxWidth = 54): { wch: number }[] {
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const widths: number[] = Array(colCount).fill(minWidth);

  for (const row of rows) {
    row.forEach((cell, idx) => {
      const text = cell === null || cell === undefined ? '' : String(cell);
      const lines = text.split('\n');
      for (const line of lines) {
        let len = 0;
        for (const ch of line) {
          len += ch.charCodeAt(0) > 255 ? 1.85 : 1;
        }
        const padded = Math.ceil(len) + 3;
        if (padded > widths[idx]) {
          widths[idx] = Math.min(maxWidth, padded);
        }
      }
    });
  }

  return widths.map((wch) => ({ wch }));
}

function appendAoaSheet(wb: XLSX.WorkBook, sheetName: string, rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = computeColWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheetName));
}

function buildFieldCatalogRows(fields: AlvField[]): unknown[][] {
  const header = [
    'COL_POS',
    'FIELDNAME',
    'COLTEXT',
    'SCRTEXT_S',
    'SCRTEXT_M',
    'SCRTEXT_L',
    'DATATYPE',
    'OUTPUTLEN',
    'DECIMALS',
    'JUST',
    'KEY',
    'HOTSPOT',
    'CHECKBOX',
    'EDIT',
    'DO_SUM',
    'EMPHASIZE',
    'CFIELDNAME',
    'QFIELDNAME',
    'REF_TABLE',
    'REF_FIELD',
    'DRILLDOWN_TCODE',
  ];

  const data = fields.map((f) => [
    f.col_pos,
    f.fieldname,
    f.coltext,
    f.scrtext_s || '',
    f.scrtext_m || '',
    f.scrtext_l || '',
    f.datatype,
    f.outputlen,
    f.decimals ?? '',
    f.just,
    f.key ? 'X' : '',
    f.hotspot ? 'X' : '',
    f.checkbox ? 'X' : '',
    f.edit ? 'X' : '',
    f.do_sum ? 'X' : '',
    f.emphasize || '',
    f.cfieldname || '',
    f.qfieldname || '',
    f.ref_table || '',
    f.ref_field || '',
    f.drilldown_tcode || '',
  ]);

  return [header, ...data];
}

/**
 * Export multi-sheet Microsoft Excel (.xlsx) workbook covering the complete SAP functional specification.
 */
export function exportSpecificationXlsx(spec: ProgramSpec): string {
  const wb = XLSX.utils.book_new();
  const effectiveFlow = getEffectiveDataFlow(spec);

  // 1. Overview Sheet
  const overviewRows: unknown[][] = [
    ['SAP FUNCTIONAL SPECIFICATION SUMMARY'],
    ['Generated At', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    [],
    ['1. DOCUMENT & PROGRAM METADATA', 'VALUE'],
    ['Project', spec.project_code || 'TEMP'],
    ['Program ID', spec.program_id],
    ['Program Title', spec.title],
    ['Transaction Code (T-Code)', spec.tcode],
    ['SAP Module', spec.module],
    ['Program Type', spec.program_type === 'REPORT' ? 'ALV Report (CL_GUI_ALV_GRID)' : 'Dialog / Transaction'],
    ['Author', spec.author],
    ['Created Date', spec.created_date],
    ['Target SAP Release', spec.target_sap_release],
    ['Lifecycle Status', spec.status || 'draft'],
    ['Approved By', spec.approved_by || '-'],
    ['Approved At', spec.approved_at || '-'],
    ['ABAP Syntax Mode', spec.abap_syntax_mode === 'modern_740' ? 'ABAP 7.40+ Modern' : 'Classic ABAP'],
    ['SE91 Message Class', spec.message_class || 'Z01'],
    ['CDS View / Main Table', spec.cds_view_table || '-'],
    ...(spec.sample_type === '03' && spec.tree_config
      ? [
          ['Tree Root Label', spec.tree_config.root_label || '-'],
          ['Tree Group Field', spec.tree_config.group_field || '-'],
          ['Tree Label Field', spec.tree_config.group_label_field || '-'],
        ]
      : []),
    ...(spec.sample_type === '04' && spec.pivot_config
      ? [
          ['Pivot Source', spec.pivot_config.source_table_or_cds || spec.cds_view_table || '-'],
          ['Pivot Default Dimensions', (spec.pivot_config.default_dimensions || []).join(', ') || '-'],
          ['Pivot Default Measures', (spec.pivot_config.default_measures || []).join(', ') || '-'],
        ]
      : []),
    ['Batch Supported (SY-BATCH)', spec.performance_config?.batch_supported ? 'Yes' : 'No'],
    ['Spool Output', spec.performance_config?.spool_output ? 'Yes' : 'No'],
    ['HANA Pushdown (CDS/AMDP)', spec.performance_config?.use_hana_pushdown ? 'Yes' : 'No'],
    ['Expected Data Volume', spec.performance_config?.expected_volume || '-'],
    ['Recommended Indexes', spec.performance_config?.recommended_indexes || '-'],
    [],
    ['2. ALV LAYOUT SETTINGS (LVC_S_LAYO)', 'VALUE'],
    ['GRID_TITLE', spec.layout.grid_title || spec.title],
    ['ZEBRA (Striped Rows)', spec.layout.zebra ? 'X' : ''],
    ['CWIDTH_OPT (Optimize Column Width)', spec.layout.cwidth_opt ? 'X' : ''],
    ['SEL_MODE (Selection Mode)', spec.layout.sel_mode],
    ['SGL_CLK_HD (Single Click Sort)', spec.layout.sgl_clk_hd ? 'X' : ''],
    ['NO_TOOLBAR', spec.layout.no_toolbar ? 'X' : ''],
    ['NO_HEADERS', spec.layout.no_headers ? 'X' : ''],
    ['EXCP_FNAME (Traffic Light Field)', spec.layout.excp_fname || 'LIGHTS'],
    ['INFO_FNAME (Row Color Field)', spec.layout.info_fname || ''],
    ['CTAB_FNAME (Cell Color Table)', spec.layout.ctab_fname || ''],
    ['STYLEFNAME (Cell Style Table)', spec.layout.stylefname || ''],
    [],
    ['3. BUSINESS PURPOSE & SCOPE'],
    [spec.business_purpose || '-'],
    [],
    ['4. DATA EXTRACTION & PROCESSING LOGIC'],
    [spec.data_extraction_logic || '-'],
  ];

  if (spec.change_history && spec.change_history.length > 0) {
    overviewRows.push([]);
    overviewRows.push(['5. REVISION HISTORY', 'DATE', 'AUTHOR', 'COMMENT']);
    spec.change_history.forEach((h) => {
      overviewRows.push([h.version, h.changed_at, h.author, h.comment]);
    });
  }
  appendAoaSheet(wb, 'Overview', overviewRows);

  // 2. Selection Screen Sheet
  const selRows: unknown[][] = [
    [
      'SEQ',
      'BLOCK_ID',
      'BLOCK_TITLE',
      'KIND',
      'NAME',
      'SCREEN_TEXT',
      'RADIO_GROUP',
      'DATATYPE',
      'LENGTH',
      'REF_TABLE',
      'REF_FIELD',
      'OBLIGATORY',
      'DEFAULT_VAL',
      'MEMORY_ID',
      'F4_SEARCH_HELP',
    ],
    ...spec.selection_params.map((p, idx) => [
      idx + 1,
      p.block_id || '',
      p.block_title || '',
      p.kind,
      p.name,
      p.text,
      p.radio_group || '',
      p.datatype,
      p.length,
      p.ref_table || '',
      p.ref_field || '',
      p.obligatory ? 'X' : '',
      p.default_val || '',
      p.memory_id || '',
      p.matchcode_object || '',
    ]),
  ];
  appendAoaSheet(wb, 'Selection Screen', selRows);

  // 3. Field Catalog Sheet (Header / Main Grid)
  appendAoaSheet(wb, 'Field Catalog', buildFieldCatalogRows(spec.field_catalog));

  // Optional Item Field Catalog for Master-Detail specs
  if (spec.item_grid && spec.item_grid.field_catalog.length > 0) {
    appendAoaSheet(wb, 'Item Field Catalog', buildFieldCatalogRows(spec.item_grid.field_catalog));
  }

  // 4. Sort & Toolbar Sheet
  const sortToolbarRows: unknown[][] = [
    ['PART A: ALV SORT & SUBTOTAL RULES (LVC_T_SORT)'],
    ['SPOS', 'FIELDNAME', 'UP (ASC)', 'DOWN (DESC)', 'SUBTOT', 'GROUP', 'EXPA'],
  ];
  const explicitSorts =
    spec.sort_fields && spec.sort_fields.length > 0
      ? spec.sort_fields
      : spec.field_catalog
          .filter((f) => f.sort_enable || f.sort_up || f.sort_down || f.subtot || f.subtotal)
          .map((f, idx) => ({
            fieldname: f.fieldname,
            spos: f.spos || idx + 1,
            up: f.sort_up ?? true,
            down: f.sort_down ?? false,
            subtot: f.subtot || f.subtotal || false,
            group: f.group || '',
            expa: f.expa ?? false,
          }));

  if (explicitSorts.length > 0) {
    explicitSorts.forEach((s) => {
      sortToolbarRows.push([
        s.spos,
        s.fieldname,
        s.up ? 'X' : '',
        s.down ? 'X' : '',
        s.subtot ? 'X' : '',
        s.group === true ? '*' : s.group || '',
        s.expa ? 'X' : '',
      ]);
    });
  } else {
    sortToolbarRows.push(['-', 'No predefined sort fields', '', '', '', '', '']);
  }

  sortToolbarRows.push([]);
  sortToolbarRows.push(['PART B: ALV TOOLBAR BUTTONS']);
  sortToolbarRows.push(['TYPE', 'FUNCTION', 'TEXT', 'QUICKINFO', 'ICON', 'VISIBLE', 'DISABLED']);

  const combinedButtons = [
    ...(spec.toolbar_buttons || []),
    ...(spec.custom_toolbar || []).filter(
      (cb) => !(spec.toolbar_buttons || []).some((tb) => tb.function === cb.function)
    ),
  ];

  if (combinedButtons.length > 0) {
    combinedButtons.forEach((b) => {
      sortToolbarRows.push([
        b.is_standard ? 'STANDARD' : 'CUSTOM',
        b.function,
        b.text,
        b.quickinfo,
        b.icon,
        b.visible === false ? '' : 'X',
        b.disabled ? 'X' : '',
      ]);
    });
  } else {
    sortToolbarRows.push(['STANDARD', '-', 'Default ALV Toolbar', '', '', 'X', '']);
  }
  appendAoaSheet(wb, 'Sort & Toolbar', sortToolbarRows);

  // 5. Data Flow Sheet
  const flowRows: unknown[][] = [
    ['NODE_ID', 'STEP / LABEL', 'DETAILED TECHNICAL SPECIFICATION'],
  ];
  const nodeDetailEntries = Object.entries(effectiveFlow.nodeDetails || {});
  if (nodeDetailEntries.length > 0) {
    nodeDetailEntries.forEach(([id, detail]) => {
      flowRows.push([id, detail.label || id, detail.markdown || '']);
    });
  } else if (spec.data_flow?.steps && spec.data_flow.steps.length > 0) {
    spec.data_flow.steps.forEach((step) => {
      flowRows.push([step.step_no, step.label, step.description || '']);
    });
  } else {
    flowRows.push(['FLOW', 'Mermaid Flowchart', effectiveFlow.mermaidCode || '']);
  }
  flowRows.push([]);
  flowRows.push(['MERMAID DIAGRAM SOURCE']);
  flowRows.push([effectiveFlow.mermaidCode || '']);
  appendAoaSheet(wb, 'Data Flow', flowRows);

  // 6. Test Cases Sheet
  const tcRows: unknown[][] = [
    ['NO', 'SCENARIO', 'INPUT CONDITION', 'EXPECTED RESULT'],
    ...(spec.test_cases.length > 0
      ? spec.test_cases.map((tc, idx) => [idx + 1, tc.scenario, tc.condition, tc.expected])
      : [[1, 'Standard Execution Test', 'Default selection parameters', 'ALV Grid displays expected records']]),
  ];
  appendAoaSheet(wb, 'Test Cases', tcRows);

  // 7. Mock Data Sheet
  const mockHeaders = spec.field_catalog.map((f) => f.fieldname);
  const mockSubHeaders = spec.field_catalog.map((f) => f.coltext);
  const mockRows: unknown[][] = [
    mockHeaders,
    mockSubHeaders,
    ...(spec.mock_rows || []).map((row) => mockHeaders.map((fn) => row[fn] ?? '')),
  ];
  appendAoaSheet(wb, 'Mock Data', mockRows);

  if (spec.item_grid && spec.item_grid.field_catalog.length > 0) {
    const itemHeaders = spec.item_grid.field_catalog.map((f) => f.fieldname);
    const itemSubHeaders = spec.item_grid.field_catalog.map((f) => f.coltext);
    const itemMockRows: unknown[][] = [
      itemHeaders,
      itemSubHeaders,
      ...(spec.item_grid.mock_rows || []).map((row) => itemHeaders.map((fn) => row[fn] ?? '')),
    ];
    appendAoaSheet(wb, 'Item Mock Data', itemMockRows);
  }

  // 8. Governance & Performance Sheet
  const govRows: unknown[][] = [
    ['PART A: AUTHORITY-CHECK OBJECTS'],
    ['AUTH_OBJECT', 'FIELDS / ACTVT', 'TRIGGER_POINT', 'DESCRIPTION'],
    ...(spec.authority_checks && spec.authority_checks.length > 0
      ? spec.authority_checks.map((ac) => [ac.object, ac.fields, ac.trigger_point, ac.description])
      : [['-', 'No custom authority objects declared', '', '']]),
    [],
    ['PART B: SE91 MESSAGE DEFINITIONS'],
    ['MSG_CLASS', 'MSG_NO', 'MSG_TYPE', 'MESSAGE_TEXT', 'TRIGGER_CONDITION'],
    ...(spec.sap_messages && spec.sap_messages.length > 0
      ? spec.sap_messages.map((m) => [m.msg_class, m.msg_no, m.msg_type, m.text, m.trigger_condition])
      : [[spec.message_class || 'Z01', '001', 'S', 'Default program message class', 'END-OF-SELECTION']]),
    [],
    ['PART C: BATCH & HANA PERFORMANCE'],
    ['SETTING', 'VALUE'],
    ['Expected Volume', spec.performance_config?.expected_volume || '-'],
    ['Recommended Indexes', spec.performance_config?.recommended_indexes || '-'],
    ['Batch Job (SY-BATCH)', spec.performance_config?.batch_supported ? 'Supported' : 'Not Configured'],
    ['Spool Output', spec.performance_config?.spool_output ? 'Enabled' : 'Disabled'],
    ['S/4HANA Pushdown', spec.performance_config?.use_hana_pushdown ? 'CDS / AMDP' : 'Standard Open SQL'],
    ['Notes', spec.performance_config?.cds_or_amdp_notes || '-'],
  ];
  appendAoaSheet(wb, 'Governance & Perf', govRows);

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `${sanitizeFilename(spec.program_id)}_SPECIFICATION.xlsx`;
  triggerBlobDownload(filename, blob);
  return filename;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  developed: 'Developed',
  qa_passed: 'QA Passed',
};

export function exportProjectWricefIndexXlsx(
  project: SapProject | undefined,
  specs: ProgramSpec[],
  unresolvedCommentCounts?: Record<string, number>
): string {
  const wb = XLSX.utils.book_new();
  const projectCode = project?.code || 'PROJECT';
  const today = new Date().toISOString().split('T')[0];

  // Sheet 1: WRICEF_Index
  const indexRows: unknown[][] = [
    [`${projectCode} — ${project?.name || 'SAP Project'} WRICEF Master Index`],
    [`Target Release: ${project?.target_sap_release || 'SAP S/4HANA 2023'}`, `Export Date: ${today}`, `Total Programs: ${specs.length}`],
    [],
    [
      'No',
      'Project',
      'Module',
      'Program ID',
      'T-Code',
      'Program Title',
      'Sample Type',
      'Lifecycle Status',
      'Author',
      'Approver',
      'Unresolved Reviews',
      'Origin Meeting',
      'Created Date',
    ],
    ...specs.map((s, idx) => [
      idx + 1,
      s.project_code || projectCode,
      s.module,
      s.program_id,
      s.tcode,
      s.title,
      s.sample_type || '01',
      LIFECYCLE_LABELS[s.status || 'draft'] || s.status || 'draft',
      s.author,
      s.approved_by || '-',
      unresolvedCommentCounts?.[s.id] || 0,
      s.source_meeting_title || '-',
      s.created_date || '',
    ]),
  ];
  appendAoaSheet(wb, 'WRICEF_Index', indexRows);

  // Sheet 2: Program_Details
  const detailRows: unknown[][] = [
    [
      'Program ID',
      'Title',
      'Module',
      'Type',
      'Syntax Mode',
      'Message Class',
      'Selection Count',
      'Header Field Count',
      'Item Field Count',
      'Auth Checks',
      'Test Cases',
      'Business Purpose (Summary)',
    ],
    ...specs.map((s) => [
      s.program_id,
      s.title,
      s.module,
      s.program_type,
      s.abap_syntax_mode || 'modern_740',
      s.message_class || 'Z01',
      (s.selection_params || []).length,
      (s.field_catalog || []).length,
      (s.item_grid?.field_catalog || []).length,
      (s.authority_checks || []).map((a) => a.object).join(', ') || '-',
      (s.test_cases || []).length,
      (s.business_purpose || '').replace(/\s+/g, ' ').slice(0, 220),
    ]),
  ];
  appendAoaSheet(wb, 'Program_Details', detailRows);

  // Sheet 3: Selection_&_Tables
  const tableRows: unknown[][] = [
    ['Program ID', 'Module', 'Category', 'Identifier', 'Label / Description', 'Ref Table', 'Ref Field', 'Required'],
  ];
  specs.forEach((s) => {
    (s.selection_params || []).forEach((p) => {
      tableRows.push([
        s.program_id,
        s.module,
        p.kind,
        p.name,
        p.text,
        p.ref_table || '-',
        p.ref_field || '-',
        p.obligatory ? 'Y' : 'N',
      ]);
    });
    if (s.cds_view_table) {
      tableRows.push([s.program_id, s.module, 'CDS/TABLE', s.cds_view_table, 'Primary Data Source', s.cds_view_table, '-', 'Y']);
    }
  });
  appendAoaSheet(wb, 'Selection_&_Tables', tableRows);

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `${sanitizeFilename(projectCode)}_WRICEF_INDEX_${today}.xlsx`;
  triggerBlobDownload(filename, blob);
  return filename;
}
