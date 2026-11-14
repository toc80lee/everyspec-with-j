import { ProgramSpec } from '../types/sap';

export function generateSpecMarkdown(spec: ProgramSpec): string {
  return `# [SAP Program Specification] ${spec.title} (${spec.program_id})

## 1. Document Control
- **Project**: \`${spec.project_code || 'TEMP'}\`
- **Program ID**: \`${spec.program_id}\`
- **Transaction Code (T-Code)**: \`${spec.tcode}\`
- **Module**: ${spec.module}
- **Program Type**: ${spec.program_type === 'REPORT' ? 'ALV Report (OOP: CL_GUI_ALV_GRID)' : 'Dialog Transaction (Dynpro)'}
- **Author**: ${spec.author}
- **Created Date**: ${spec.created_date}
- **Target SAP Release**: ${spec.target_sap_release}

---

## 2. Business Purpose & Scope
${spec.business_purpose}

---

## 3. Selection Screen Specification
| Block Title | Kind | Parameter | Description | Ref / Radio Group | Type(Len) | Obligatory | Default | Memory ID |
|:---|:---|:---|:---|:---|:---|:---:|:---|:---|
${spec.selection_params.map(p => `| ${p.block_title || '-'} | ${p.kind === 'SELECT_OPTION' ? 'SELECT-OPTIONS' : p.kind === 'RADIOBUTTON' ? 'RADIOBUTTON' : p.kind === 'CHECKBOX' ? 'CHECKBOX' : 'PARAMETER'} | \`${p.name}\` | ${p.text} | ${p.kind === 'RADIOBUTTON' && p.radio_group ? `\`GROUP ${p.radio_group}\`` : p.ref_table ? `\`${p.ref_table}-${p.ref_field}\`` : '-'} | ${p.datatype}(${p.length}) | ${p.obligatory ? 'Y' : 'N'} | ${p.default_val || '-'} | ${p.memory_id || '-'} |`).join('\n')}

---

## 4. ALV Grid Field Catalog (LVC_T_FCAT)
| No | Fieldname | Column Text | Type | Len | Align | Key | Hotspot | Chk | Edit | Sum | Ref Table-Field | Drilldown T-Code |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|:---|
${spec.field_catalog.map(f => `| ${f.col_pos} | \`${f.fieldname}\` | ${f.coltext} | ${f.datatype} | ${f.outputlen} | ${f.just} | ${f.key ? 'O' : '-'} | ${f.hotspot ? 'O' : '-'} | ${f.checkbox ? 'O' : '-'} | ${f.edit ? 'O' : '-'} | ${f.do_sum ? 'O' : '-'} | ${f.ref_table ? `\`${f.ref_table}-${f.ref_field}\`` : '-'} | ${f.drilldown_tcode ? `\`${f.drilldown_tcode}\`` : '-'} |`).join('\n')}

---

## 5. ALV Layout & Toolbar Specification
- **Zebra Striping (gs_layo-zebra)**: ${spec.layout.zebra ? 'Enabled (X)' : 'Disabled'}
- **Grid Title**: ${spec.layout.grid_title || spec.title}
- **Selection Mode (gs_layo-sel_mode)**: ${spec.layout.sel_mode}
- **Optimize Column Width (gs_layo-cwidth_opt)**: ${spec.layout.cwidth_opt ? 'Enabled (X)' : 'Disabled'}
- **Exception Traffic Light Field**: \`${spec.layout.excp_fname || 'LIGHTS'}\` (1: Green-Normal, 2: Yellow-In Process, 3: Red-Error)

### Custom Toolbar Buttons
${spec.custom_toolbar.length > 0 ? spec.custom_toolbar.map(b => `- **[${b.text}]** (\`${b.function}\`): ${b.quickinfo}`).join('\n') : '- Standard ALV toolbar only'}

---

## 6. Data Extraction & Processing Logic
\`\`\`sql
${spec.data_extraction_logic}
\`\`\`

---

## 7. Test Cases & Scenarios
| No | Test Scenario | Input Condition | Expected Result |
|:---:|:---|:---|:---|
${spec.test_cases.length > 0 ? spec.test_cases.map((tc, idx) => `| ${idx + 1} | ${tc.scenario} | ${tc.condition} | ${tc.expected} |`).join('\n') : '| 1 | Standard Query Test | Enter default selection parameters | ALV Grid renders expected records |'}

---

## 8. Data Flow & Detailed Technical Specification
### 8.1 Program Data Flow (Mermaid)
\`\`\`mermaid
${spec.data_flow?.mermaid_code || 'graph TD;\n  A[Start] --> B[End];'}
\`\`\`

### 8.2 Detailed Technical Specifications
${spec.data_flow?.node_details && Object.keys(spec.data_flow.node_details).length > 0 ? Object.entries(spec.data_flow.node_details).map(([k, v]) => `#### [${k}] ${v.label || k}\n${v.markdown}\n`).join('\n---\n\n') : '- Step-level technical specifications are documented in the Data Flow tab.'}
`;
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFieldCatalogCsv(spec: ProgramSpec): string {
  const headers = ['No', 'FIELDNAME', 'COLTEXT', 'DATATYPE', 'OUTPUTLEN', 'JUST', 'KEY', 'HOTSPOT', 'CHECKBOX', 'EDIT', 'DO_SUM', 'REF_TABLE', 'REF_FIELD', 'DRILLDOWN'];
  const rows = spec.field_catalog.map(f => [
    f.col_pos,
    f.fieldname,
    `"${f.coltext.replace(/"/g, '""')}"`,
    f.datatype,
    f.outputlen,
    f.just,
    f.key ? 'X' : '',
    f.hotspot ? 'X' : '',
    f.checkbox ? 'X' : '',
    f.edit ? 'X' : '',
    f.do_sum ? 'X' : '',
    f.ref_table || '',
    f.ref_field || '',
    f.drilldown_tcode || '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
