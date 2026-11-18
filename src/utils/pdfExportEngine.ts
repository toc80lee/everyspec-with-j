import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { ProgramSpec } from '../types/sap';

export interface PdfExportProgress {
  percent: number;
  step: string;
}

export interface PdfExportOptions {
  mode?: 'high_fidelity' | 'vector';
  includeApproval?: boolean;
  includeRevision?: boolean;
  includeDataFlow?: boolean;
  onProgress?: (progress: PdfExportProgress) => void;
}

/**
 * Renders Korean / Unicode text to in-memory Canvas and places it as image on the jsPDF document.
 * This completely prevents Helvetica / WinAnsi Mojibake and garbled Korean characters.
 */
function renderKoreanTextToDoc(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidthMm: number,
  fontSizePt = 9,
  textColor = '#1e293b',
  isBold = false
): number {
  if (!text) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const dpr = 2.5; // High resolution for crisp PDF text
  const maxWidthPx = (maxWidthMm / 25.4) * 72 * dpr;
  const fontSizePx = (fontSizePt / 72) * 72 * dpr;

  ctx.font = `${isBold ? 'bold ' : ''}${fontSizePx}px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let currentLine = '';

    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidthPx && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  const lineHeight = fontSizePx * 1.45;
  canvas.width = Math.max(maxWidthPx, 200);
  canvas.height = Math.max(lines.length * lineHeight + 12, 28);

  ctx.font = `${isBold ? 'bold ' : ''}${fontSizePx}px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';

  lines.forEach((line, idx) => {
    ctx.fillText(line, 0, idx * lineHeight + 2);
  });

  const heightMm = (canvas.height / dpr / 72) * 25.4;
  const widthMm = (canvas.width / dpr / 72) * 25.4;

  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', x, y, widthMm, heightMm, undefined, 'FAST');

  return heightMm;
}

/**
 * Generate a clean, vector-based PDF using jsPDF and jspdf-autotable.
 * Fast, lightweight, selectable text, and professional enterprise layout.
 */
export async function generateVectorPdf(
  spec: ProgramSpec,
  options?: PdfExportOptions
): Promise<jsPDF> {
  options?.onProgress?.({ percent: 15, step: 'Building vector document structure...' });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Primary colors
  const primaryColor: [number, number, number] = [30, 58, 138]; // Deep SAP Blue
  const secondaryColor: [number, number, number] = [71, 85, 105]; // Slate
  const accentColor: [number, number, number] = [14, 116, 144]; // Cyan / Teal

  // Helper: Draw running header
  const drawRunningHeader = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('SAP S/4HANA ERP - FUNCTIONAL SPECIFICATION', margin, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`[${spec.program_id}] ${title}`, pageWidth - margin, 10, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, 12, pageWidth - margin, 12);
  };

  // Helper: Draw running footer
  const drawRunningFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`CONFIDENTIAL - FDD-${spec.module}-${spec.program_id}`, margin, pageHeight - 8);

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
  };

  // ==========================================
  // PAGE 1: COVER & OVERVIEW
  // ==========================================
  options?.onProgress?.({ percent: 30, step: 'Formatting Document Control & Scope...' });

  // Top Banner
  doc.setFillColor(30, 58, 138);
  doc.rect(margin, 14, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`SAP S/4HANA ERP DEVELOPMENT | MODULE: ${spec.module}`, margin + 4, 19.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(spec.title || 'ABAP Program Specification', margin, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Program ID: ${spec.program_id}  |  T-Code: ${spec.tcode}  |  Release: ${spec.target_sap_release}`, margin, 38);

  // Horizontal divider
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.8);
  doc.line(margin, 42, pageWidth - margin, 42);

  // Section 1: Document Control / Metadata Table
  let currentY = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('1. Document Control & Administration', margin, currentY);

  const statusLabel =
    spec.status === 'qa_passed'
      ? 'QA Passed'
      : spec.status === 'developed'
      ? 'Developed'
      : spec.status === 'approved'
      ? 'Approved'
      : spec.status === 'in_review'
      ? 'In Review'
      : 'Draft';

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Attribute', 'Specification Detail', 'Attribute', 'Specification Detail']],
    body: [
      ['Program ID', spec.program_id, 'T-Code', spec.tcode],
      ['Module', spec.module, 'Program Type', spec.program_type === 'REPORT' ? 'ALV Report (CL_GUI_ALV_GRID)' : 'Dialog/Dynpro'],
      ['Author', spec.author, 'Creation Date', spec.created_date],
      ['SAP Release', spec.target_sap_release, 'Document ID', `FDD-${spec.module}-${spec.program_id}`],
      ['Lifecycle Status', statusLabel, 'Approved By', spec.approved_by || '-'],
      ['ABAP Syntax Mode', spec.abap_syntax_mode === 'modern_740' ? 'ABAP 7.40+ Modern' : 'Classic ABAP', 'SE91 Msg Class', spec.message_class || 'Z01'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 32 },
      3: { cellWidth: 59 },
    },
    margin: { left: margin, right: margin },
  });

  // Section 2: Approval Table
  currentY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('2. Review & Sign-Off Approvals', margin, currentY);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Role / Department', 'Name', 'Signature', 'Date', 'Status']],
    body: [
      ['Functional / Author', spec.author, '', spec.created_date, 'Completed'],
      ['PM / Reviewer', spec.approved_by || 'Pending PM', '', spec.approved_at ? spec.approved_at.slice(0, 10) : '', statusLabel],
      ['Quality Assurance', 'QA Team', '', spec.status === 'qa_passed' ? (spec.approved_at?.slice(0, 10) || spec.created_date) : '', spec.status === 'qa_passed' ? 'QA Passed' : 'Pending'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [71, 85, 105],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    margin: { left: margin, right: margin },
  });

  // Section 3: Business Purpose & Scope
  currentY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('3. Business Purpose & Scope', margin, currentY);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY + 3, contentWidth, 24, 1.5, 1.5, 'FD');

  const purposeText =
    spec.business_purpose ||
    'This ABAP report provides comprehensive querying, filtering, and analysis capabilities for business operations with real-time ALV Grid integration.';
  
  // Render Korean text cleanly onto canvas image without any Helvetica mojibake
  renderKoreanTextToDoc(doc, purposeText, margin + 3, currentY + 5, contentWidth - 6, 8.5, '#1e293b');

  // ==========================================
  // PAGE 2: SELECTION SCREEN & FIELD CATALOG
  // ==========================================
  options?.onProgress?.({ percent: 55, step: 'Generating Selection Screen & Field Catalog tables...' });

  doc.addPage();
  drawRunningHeader(spec.title);

  // Section 4: Selection Screen (Dynpro 1000)
  currentY = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('4. Selection Screen Specification (Dynpro 1000)', margin, currentY);

  const selectionRows = spec.selection_params.map((p) => {
    const baseRef =
      p.kind === 'RADIOBUTTON' && p.radio_group
        ? `GRP ${p.radio_group}`
        : p.ref_table && p.ref_field
        ? `${p.ref_table}-${p.ref_field}`
        : '-';
    const refWithF4 = p.matchcode_object ? `${baseRef} (F4:${p.matchcode_object})` : baseRef;
    return [
      p.block_title || '-',
      p.kind,
      p.name,
      p.text,
      `${p.datatype}(${p.length})`,
      p.obligatory ? 'Y' : 'N',
      p.default_val || '-',
      refWithF4,
    ];
  });

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Box Title', 'Kind', 'Parameter', 'Label / Description', 'Type(Len)', 'Req', 'Default', 'Ref / Group']],
    body: selectionRows.length > 0 ? selectionRows : [['-', 'PARAM', 'P_NONE', 'None defined', 'CHAR(4)', 'N', '-', '-']],
    theme: 'striped',
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      1: { fontStyle: 'bold', cellWidth: 26 },
      2: { cellWidth: 44 },
      3: { cellWidth: 20 },
      4: { halign: 'center', cellWidth: 12 },
      5: { cellWidth: 20 },
      6: { cellWidth: 24 },
      7: { cellWidth: 14 },
    },
    margin: { left: margin, right: margin },
  });

  // Section 5: ALV Grid Field Catalog (LVC_T_FCAT)
  currentY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('5. ALV Grid Field Catalog Specification (LVC_T_FCAT)', margin, currentY);

  const fieldCatRows = spec.field_catalog.map((f) => [
    String(f.col_pos),
    f.fieldname,
    f.coltext,
    f.datatype,
    String(f.outputlen),
    f.just,
    f.key ? 'X' : '',
    f.hotspot ? 'X' : '',
    f.edit ? 'X' : '',
    f.do_sum ? 'X' : '',
    f.ref_table && f.ref_field ? `${f.ref_table}-${f.ref_field}` : '-',
    f.drilldown_tcode || '-',
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Pos', 'Fieldname', 'Column Text', 'Type', 'Len', 'Align', 'Key', 'Link', 'Edit', 'Sum', 'Ref Field', 'T-Code']],
    body: fieldCatRows,
    theme: 'striped',
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', cellWidth: 26 },
      2: { cellWidth: 34 },
      3: { cellWidth: 14 },
      4: { halign: 'center', cellWidth: 10 },
      5: { halign: 'center', cellWidth: 10 },
      6: { halign: 'center', cellWidth: 9 },
      7: { halign: 'center', cellWidth: 9 },
      8: { halign: 'center', cellWidth: 9 },
      9: { halign: 'center', cellWidth: 9 },
      10: { cellWidth: 24 },
      11: { cellWidth: 18 },
    },
    margin: { left: margin, right: margin },
  });

  // If Master-Detail (02) or Tree+Detail (03), include Detail ALV Grid Field Catalog
  if ((spec.sample_type === '02' || spec.sample_type === '03') && spec.item_grid && spec.item_grid.field_catalog?.length > 0) {
    currentY = (doc as any).lastAutoTable.finalY + 8;
    if (currentY > pageHeight - 60) {
      doc.addPage();
      drawRunningHeader(spec.title);
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(
      `5.1 ${spec.item_grid.grid_name || 'Item Detail ALV Grid'} Field Catalog (Link Key: ${spec.item_grid.foreign_key || spec.tree_config?.group_field || 'VBELN'})`,
      margin,
      currentY
    );

    const itemFieldRows = spec.item_grid.field_catalog.map((f) => [
      String(f.col_pos),
      f.fieldname,
      f.coltext,
      f.datatype,
      String(f.outputlen),
      f.just,
      f.key ? 'X' : '',
      f.edit ? 'X' : '',
      f.do_sum ? 'X' : '',
      f.ref_table && f.ref_field ? `${f.ref_table}-${f.ref_field}` : '-',
      f.drilldown_tcode || '-',
    ]);

    autoTable(doc, {
      startY: currentY + 3,
      head: [['Pos', 'Fieldname', 'Column Text', 'Type', 'Len', 'Align', 'Key', 'Edit', 'Sum', 'Ref Field', 'T-Code']],
      body: itemFieldRows,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
      },
      margin: { left: margin, right: margin },
    });
  }

  // ==========================================
  // PAGE 3: EXTRACTION LOGIC & TEST SCENARIOS
  // ==========================================
  options?.onProgress?.({ percent: 75, step: 'Documenting ABAP Logic & Test Scenarios...' });

  doc.addPage();
  drawRunningHeader(spec.title);

  // Section 6: Data Extraction & Processing Logic
  currentY = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('6. Data Extraction & Business Processing Logic', margin, currentY);

  const logicText = spec.data_extraction_logic || 'SELECT * FROM VBAK INTO TABLE @DATA(LT_DATA).';
  const logicLinesCount = logicText.split('\n').length;
  const blockHeight = Math.min(Math.max(logicLinesCount * 5 + 10, 28), 90);

  doc.setFillColor(15, 23, 42); // Dark slate terminal box
  doc.roundedRect(margin, currentY + 3, contentWidth, blockHeight, 1.5, 1.5, 'F');

  // Render Korean & code text cleanly without corruption
  renderKoreanTextToDoc(doc, logicText, margin + 4, currentY + 6, contentWidth - 8, 7.5, '#38bdf8');

  // Section 7: Test Cases & Scenarios
  currentY = currentY + blockHeight + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('7. Test Cases & Verification Scenarios', margin, currentY);

  const testRows = (spec.test_cases || []).map((tc, idx) => [
    String(idx + 1),
    tc.scenario,
    tc.condition,
    tc.expected,
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['No', 'Test Scenario', 'Input Conditions', 'Expected Output']],
    body:
      testRows.length > 0
        ? testRows
        : [
            ['1', 'Normal Execution', 'Enter valid sales organization and dates', 'ALV Grid loads corresponding records'],
            ['2', 'Mandatory Check', 'Leave mandatory parameter blank', 'Display error message on status bar'],
          ],
    theme: 'grid',
    headStyles: {
      fillColor: [71, 85, 105],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { fontStyle: 'bold', cellWidth: 50 },
      2: { cellWidth: 55 },
      3: { cellWidth: 65 },
    },
    margin: { left: margin, right: margin },
  });

  // Section 8: Governance (AUTHORITY-CHECK, SE91, Batch/HANA, Tree/Pivot)
  if (
    (spec.authority_checks && spec.authority_checks.length > 0) ||
    (spec.sap_messages && spec.sap_messages.length > 0) ||
    spec.performance_config ||
    spec.tree_config ||
    spec.pivot_config
  ) {
    currentY = (doc as any).lastAutoTable.finalY + 8;
    if (currentY > pageHeight - 50) {
      doc.addPage();
      drawRunningHeader(spec.title);
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('8. SAP Technical Governance, Authority & Performance', margin, currentY);

    const govRows: string[][] = [];
    if (spec.tree_config) {
      govRows.push(['Tree Config', `Root: ${spec.tree_config.root_label || '-'} | Group: ${spec.tree_config.group_field || '-'} | Label: ${spec.tree_config.group_label_field || '-'}`]);
    }
    if (spec.pivot_config || spec.cds_view_table) {
      govRows.push(['Pivot / CDS Config', `Source: ${spec.cds_view_table || spec.pivot_config?.source_table_or_cds || '-'} | Dim: ${(spec.pivot_config?.default_dimensions || []).join(', ') || '-'} | Meas: ${(spec.pivot_config?.default_measures || []).join(', ') || '-'}`]);
    }
    if (spec.performance_config) {
      govRows.push([
        'Performance & Batch',
        `Volume: ${spec.performance_config.expected_volume || '-'} | Indexes: ${spec.performance_config.recommended_indexes || '-'} | Batch: ${spec.performance_config.batch_supported ? 'Y' : 'N'} | HANA Pushdown: ${spec.performance_config.use_hana_pushdown ? 'Y' : 'N'}`,
      ]);
    }
    (spec.authority_checks || []).forEach((ac) => {
      govRows.push([`AUTH: ${ac.object}`, `${ac.fields} | Trigger: ${ac.trigger_point} | ${ac.description}`]);
    });
    (spec.sap_messages || []).forEach((m) => {
      govRows.push([`SE91 ${m.msg_class}(${m.msg_no}) [${m.msg_type}]`, `${m.text} (${m.trigger_condition})`]);
    });

    if (govRows.length > 0) {
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Category / Object', 'Governance & Technical Detail']],
        body: govRows,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          lineColor: [226, 232, 240],
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 46 },
          1: { cellWidth: 136 },
        },
        margin: { left: margin, right: margin },
      });
    }
  }

  // Calculate total pages and stamp footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawRunningFooter(i, totalPages);
  }

  options?.onProgress?.({ percent: 95, step: 'Finalizing PDF output...' });

  return doc;
}

/**
 * Build offscreen DOM pages with full Korean typography support.
 * This guarantees that when exporting to PDF from any view (Editor, Mockup, Split),
 * Korean characters are natively rasterized with zero glyph corruption.
 */
function buildOffscreenDocumentDom(spec: ProgramSpec): {
  container: HTMLElement;
  pages: HTMLElement[];
} {
  const container = document.createElement('div');
  container.id = 'offscreen-pdf-render-root';
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.height = 'auto';
  container.style.zIndex = '-99999';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.style.overflow = 'visible';
  container.style.backgroundColor = '#ffffff';

  const hasDetailGrid = (spec.sample_type === '02' || spec.sample_type === '03') && !!spec.item_grid && (spec.item_grid.field_catalog?.length || 0) > 0;
  const statusDisplay =
    spec.status === 'qa_passed'
      ? 'QA Passed'
      : spec.status === 'developed'
      ? 'Developed'
      : spec.status === 'approved'
      ? 'Approved'
      : spec.status === 'in_review'
      ? 'In Review'
      : 'Draft';

  const baseFont =
    '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif';

  const createSheet = (): HTMLElement => {
    const sheet = document.createElement('div');
    sheet.className = 'sap-a4-sheet offscreen-sheet';
    sheet.style.width = '794px';
    sheet.style.minHeight = '1123px';
    sheet.style.padding = '44px 38px';
    sheet.style.boxSizing = 'border-box';
    sheet.style.backgroundColor = '#ffffff';
    sheet.style.color = '#0f172a';
    sheet.style.fontFamily = baseFont;
    sheet.style.position = 'relative';
    sheet.style.marginBottom = '20px';
    sheet.style.display = 'flex';
    sheet.style.flexDirection = 'column';
    sheet.style.justifyContent = 'space-between';

    return sheet;
  };

  const createRunningHeader = (title: string) => `
    <div style="border-bottom: 1.5px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; color: #1e3a8a;">
      <span>SAP S/4HANA ERP - FUNCTIONAL SPECIFICATION</span>
      <span style="color: #64748b; font-weight: normal; font-family: monospace;">[${spec.program_id}] ${title}</span>
    </div>
  `;

  const createRunningFooter = (pageNum: number, totalPages: number) => `
    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #94a3b8;">
      <span>CONFIDENTIAL - FDD-${spec.module}-${spec.program_id}</span>
      <span style="font-weight: bold; color: #475569;">Page ${pageNum} of ${totalPages}</span>
    </div>
  `;

  const totalPages = hasDetailGrid ? 5 : 4;
  const pages: HTMLElement[] = [];

  // ==========================================
  // PAGE 1: COVER & OVERVIEW
  // ==========================================
  const page1 = createSheet();
  page1.innerHTML = `
    <div>
      ${createRunningHeader('Cover & Overview')}
      <div style="background-color: #1e3a8a; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; border-radius: 4px; margin-bottom: 14px;">
        SAP S/4HANA ERP DEVELOPMENT | MODULE: ${spec.module}
      </div>

      <h1 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; line-height: 1.2;">
        ${spec.title || 'ABAP Program Specification'}
      </h1>
      <p style="font-size: 12px; color: #64748b; margin: 0 0 16px 0;">
        Program ID: <strong style="font-family: monospace; color: #1e3a8a;">${spec.program_id}</strong> &nbsp;|&nbsp;
        T-Code: <strong style="font-family: monospace; color: #0284c7;">${spec.tcode}</strong> &nbsp;|&nbsp;
        Release: ${spec.target_sap_release}
      </p>

      <!-- Document Control Metadata -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; border: 1px solid #cbd5e1;">
        <tr style="background-color: #f8fafc;">
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; width: 18%; text-align: left; color: #475569;">Author</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; width: 32%;">${spec.author}</td>
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; width: 18%; text-align: left; color: #475569;">Date</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; width: 32%; font-family: monospace;">${spec.created_date}</td>
        </tr>
        <tr>
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; color: #475569;">Program Type</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${spec.program_type} (Sample ${spec.sample_type || '01'})</td>
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; color: #475569;">Module</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">${spec.module}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; color: #475569;">Status / Approver</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;"><strong>${statusDisplay}</strong>${spec.approved_by ? ` (${spec.approved_by})` : ''}</td>
          <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; color: #475569;">Syntax / Msg Class</th>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${spec.abap_syntax_mode === 'modern_740' ? 'ABAP 7.40+' : 'Classic ABAP'} · ${spec.message_class || 'Z01'}</td>
        </tr>
      </table>

      <!-- Business Purpose Section -->
      <div style="margin-bottom: 18px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          1. Business Purpose & Scope
        </h2>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 11.5px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
${spec.business_purpose || '(No business purpose provided)'}
        </div>
      </div>

      <!-- Approvals Table -->
      <div style="margin-bottom: 16px;">
        <h2 style="font-size: 12px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 6px 0;">
          2. Document Control & Approvals
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #cbd5e1; text-align: center; margin-bottom: 10px;">
          <thead style="background-color: #f1f5f9;">
            <tr>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Role</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Name</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Status</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 5px; border: 1px solid #cbd5e1;">Consultant (Author)</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1;">${spec.author}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; color: #16a34a; font-weight: bold;">Completed</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; font-family: monospace;">${spec.created_date}</td>
            </tr>
            <tr>
              <td style="padding: 5px; border: 1px solid #cbd5e1;">PM / Lead Approval</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1;">${spec.approved_by || '-'}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; color: #1e3a8a; font-weight: bold;">${statusDisplay}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; font-family: monospace;">${spec.approved_at ? spec.approved_at.slice(0, 10) : '-'}</td>
            </tr>
          </tbody>
        </table>
        ${
          spec.change_history && spec.change_history.length > 0
            ? `<table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; text-align: left;">
                <thead style="background-color: #f8fafc;">
                  <tr>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 12%;">Version</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 22%;">Date</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 18%;">Author</th>
                    <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Change Summary</th>
                  </tr>
                </thead>
                <tbody>
                  ${spec.change_history
                    .slice(0, 6)
                    .map(
                      (rev) => `<tr>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold;">${rev.version}</td>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${rev.changed_at}</td>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${rev.author}</td>
                        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${rev.comment}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>`
            : ''
        }
      </div>
    </div>
    ${createRunningFooter(1, totalPages)}
  `;
  pages.push(page1);
  container.appendChild(page1);

  // ==========================================
  // PAGE 2: SELECTION SCREEN & FIELD CATALOG
  // ==========================================
  const page2 = createSheet();
  page2.innerHTML = `
    <div>
      ${createRunningHeader('Selection Screen & Field Catalog')}
      
      <!-- Selection Screen Parameters -->
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          3. Selection Screen Definition
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; text-align: left;">
          <thead style="background-color: #f1f5f9; font-weight: bold; color: #334155;">
            <tr>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Block</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Kind</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Name</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Label</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Type(Len)</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">F4 Search Help</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Req</th>
              <th style="padding: 5px 6px; border: 1px solid #cbd5e1;">Default / Group</th>
            </tr>
          </thead>
          <tbody>
            ${spec.selection_params
              .map(
                (p) => `
              <tr>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${p.block_title || '-'}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${p.kind}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e3a8a;">${p.name}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${p.text}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${p.datatype}(${p.length})</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; color: #0369a1;">${p.matchcode_object || '-'}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; color: ${p.obligatory ? '#e11d48' : '#64748b'}; font-weight: ${p.obligatory ? 'bold' : 'normal'};">${p.obligatory ? 'X' : ''}</td>
                <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${p.default_val || '-'}${p.kind === 'RADIOBUTTON' && p.radio_group ? ` (GRP:${p.radio_group})` : ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      ${
        spec.sample_type === '03' && spec.tree_config
          ? `<div style="margin-bottom: 14px; padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; font-size: 10.5px;">
              <strong>Tree Config:</strong> Root=<code>${spec.tree_config.root_label || 'ROOT'}</code>, Group Field=<code>${spec.tree_config.group_field || '-'}</code>, Label Field=<code>${spec.tree_config.group_label_field || '-'}</code>
            </div>`
          : ''
      }
      ${
        spec.sample_type === '04' && (spec.pivot_config || spec.cds_view_table)
          ? `<div style="margin-bottom: 14px; padding: 8px 10px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; font-size: 10.5px;">
              <strong>Pivot / IDA Source:</strong> <code>${spec.cds_view_table || spec.pivot_config?.source_table_or_cds || 'ACDOCA'}</code> | Dimensions: <code>${(spec.pivot_config?.default_dimensions || []).join(', ') || '-'}</code> | Measures: <code>${(spec.pivot_config?.default_measures || []).join(', ') || '-'}</code>
            </div>`
          : ''
      }

      <!-- Field Catalog (FCAT) -->
      <div>
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          4. ALV Grid Field Catalog (${spec.field_catalog.length} Fields)
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; text-align: left;">
          <thead style="background-color: #f1f5f9; font-weight: bold; color: #334155;">
            <tr>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Pos</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Field</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Coltext</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Type</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Len</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Align</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">KEY</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">SUM</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Ref / Drilldown</th>
            </tr>
          </thead>
          <tbody>
            ${spec.field_catalog
              .map(
                (f) => `
              <tr style="${f.key ? 'background-color: #f0fdf4;' : ''}">
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${f.col_pos}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e3a8a;">${f.fieldname}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">${f.coltext}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; font-family: monospace;">${f.datatype}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.outputlen}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.just}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">${f.key ? 'X' : ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #d97706;">${f.do_sum ? 'Σ' : ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 9px;">${f.ref_table ? `${f.ref_table}-${f.ref_field || ''}` : '-'}${f.drilldown_tcode ? ` → ${f.drilldown_tcode}` : ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    ${createRunningFooter(2, totalPages)}
  `;
  pages.push(page2);
  container.appendChild(page2);

  // ==========================================
  // OPTIONAL DETAIL GRID PAGE (Sample 02 or 03)
  // ==========================================
  if (hasDetailGrid && spec.item_grid) {
    const pageDetail = createSheet();
    pageDetail.innerHTML = `
      <div>
        ${createRunningHeader('Detail ALV Grid Specification')}
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          4.1 ${spec.item_grid.grid_name || 'Detail ALV Grid Field Catalog'} (Link Key: ${spec.item_grid.foreign_key || spec.tree_config?.group_field || 'VBELN'})
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; text-align: left;">
          <thead style="background-color: #eef2ff; font-weight: bold; color: #1e1b4b;">
            <tr>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Pos</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Field</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Coltext</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1;">Type</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Len</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Align</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">KEY</th>
              <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">SUM</th>
            </tr>
          </thead>
          <tbody>
            ${spec.item_grid.field_catalog
              .map(
                (f) => `
              <tr>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${f.col_pos}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #312e81;">${f.fieldname}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">${f.coltext}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; font-family: monospace;">${f.datatype}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.outputlen}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.just}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.key ? 'X' : ''}</td>
                <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">${f.do_sum ? 'Σ' : ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${createRunningFooter(3, totalPages)}
    `;
    pages.push(pageDetail);
    container.appendChild(pageDetail);
  }

  // ==========================================
  // LOGIC & GOVERNANCE PAGE
  // ==========================================
  const logicPageNum = hasDetailGrid ? 4 : 3;
  const page3 = createSheet();
  page3.innerHTML = `
    <div>
      ${createRunningHeader('Data Extraction, Governance & Performance')}
      
      <div style="margin-bottom: 18px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          5. Data Extraction & Business Logic
        </h2>
        <div style="background-color: #0f172a; color: #f8fafc; font-family: monospace; font-size: 10.5px; line-height: 1.55; padding: 12px; border-radius: 6px; white-space: pre-wrap;">
${spec.data_extraction_logic || '(No extraction logic provided)'}
        </div>
      </div>

      ${
        (spec.authority_checks && spec.authority_checks.length > 0) ||
        (spec.sap_messages && spec.sap_messages.length > 0) ||
        spec.performance_config
          ? `<div style="margin-bottom: 18px;">
              <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
                5.1 SAP Governance (AUTHORITY-CHECK · SE91 · Batch/HANA)
              </h2>
              ${
                spec.authority_checks && spec.authority_checks.length > 0
                  ? `<table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; margin-bottom: 10px;">
                      <thead style="background-color: #f1f5f9;">
                        <tr>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Auth Object</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Fields / Values</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Trigger Point</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${spec.authority_checks
                          .map(
                            (ac) => `<tr>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold;">${ac.object}</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${ac.fields}</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${ac.trigger_point}</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${ac.description}</td>
                            </tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>`
                  : ''
              }
              ${
                spec.sap_messages && spec.sap_messages.length > 0
                  ? `<table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; margin-bottom: 10px;">
                      <thead style="background-color: #f1f5f9;">
                        <tr>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">SE91 ID</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Type</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Message Text</th>
                          <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Trigger Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${spec.sap_messages
                          .map(
                            (m) => `<tr>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold;">${m.msg_class}(${m.msg_no})</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${m.msg_type}</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">${m.text}</td>
                              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace;">${m.trigger_condition}</td>
                            </tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>`
                  : ''
              }
              ${
                spec.performance_config
                  ? `<div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 10px;">
                      <strong>Expected Volume:</strong> ${spec.performance_config.expected_volume || '-'} &nbsp;|&nbsp;
                      <strong>Indexes:</strong> <code>${spec.performance_config.recommended_indexes || '-'}</code> &nbsp;|&nbsp;
                      <strong>Batch(SY-BATCH):</strong> ${spec.performance_config.batch_supported ? 'Yes' : 'No'} &nbsp;|&nbsp;
                      <strong>HANA Pushdown:</strong> ${spec.performance_config.use_hana_pushdown ? 'Yes' : 'No'}
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }

      <div>
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          6. Status Indicator & Exception Traffic Lights
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #cbd5e1;">
          <tr style="background-color: #f0fdf4;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; width: 25%; font-weight: bold; color: #166534;">1 (Green / Normal)</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">Completed delivery or approved normal order document</td>
          </tr>
          <tr style="background-color: #fefce8;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #854d0e;">2 (Yellow / In Process)</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">Delivery preparation or approval in progress</td>
          </tr>
          <tr style="background-color: #fff1f2;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #9f1239;">3 (Red / Error or Delay)</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1;">Delayed unbilled order, credit limit exceeded, or error</td>
          </tr>
        </table>
      </div>
    </div>
    ${createRunningFooter(logicPageNum, totalPages)}
  `;
  pages.push(page3);
  container.appendChild(page3);

  // ==========================================
  // TEST CASES & MOCK PREVIEW PAGE
  // ==========================================
  const testPageNum = hasDetailGrid ? 5 : 4;
  const page4 = createSheet();
  page4.innerHTML = `
    <div>
      ${createRunningHeader('Test Scenarios & ALV Output')}
      
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          7. Test Scenarios
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #cbd5e1; text-align: left;">
          <thead style="background-color: #f1f5f9;">
            <tr>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 35%;">Scenario</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 35%;">Input Condition</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 30%;">Expected Result</th>
            </tr>
          </thead>
          <tbody>
            ${(spec.test_cases?.length
              ? spec.test_cases
              : [
                  { scenario: 'Standard Query', condition: 'Enter P_VKORG = 1000 and press F8', expected: 'ALV Grid displays valid records' },
                  { scenario: 'Missing Mandatory Check', condition: 'Leave P_VKORG blank and execute', expected: 'Display SAP error message' },
                ]
            )
              .map(
                (tc) => `
              <tr>
                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${tc.scenario}</td>
                <td style="padding: 5px 8px; border: 1px solid #cbd5e1;">${tc.condition}</td>
                <td style="padding: 5px 8px; border: 1px solid #cbd5e1; color: #166534;">${tc.expected}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- ALV Mock Output Table -->
      <div>
        <h2 style="font-size: 13px; font-weight: 700; color: #1e3a8a; border-bottom: 1.5px solid #1e3a8a; padding-bottom: 4px; margin: 0 0 8px 0;">
          8. ALV Output Mock Data Snapshot
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1; font-family: monospace;">
          <thead style="background-color: #d8e4f0; color: #0f172a;">
            <tr>
              ${spec.field_catalog
                .slice(0, 8)
                .map((f) => `<th style="padding: 5px; border: 1px solid #9bbadb;">${f.coltext}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${spec.mock_rows
              .slice(0, 8)
              .map(
                (row) => `
              <tr>
                ${spec.field_catalog
                  .slice(0, 8)
                  .map((f) => {
                    const val = row[f.fieldname];
                    return `<td style="padding: 4px; border: 1px solid #e2e8f0; text-align: ${f.just === 'R' ? 'right' : f.just === 'C' ? 'center' : 'left'};">${val !== undefined ? val : ''}</td>`;
                  })
                  .join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    ${createRunningFooter(testPageNum, totalPages)}
  `;
  pages.push(page4);
  container.appendChild(page4);

  return { container, pages };
}

/**
 * High-fidelity HTML to Canvas to jsPDF exporter.
 * Captures formatted A4 pages with native Korean fonts and slices tall sheets cleanly across sequential A4 pages.
 */
export async function generateHighFidelityPdf(
  spec: ProgramSpec,
  options?: PdfExportOptions
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Find all page elements in the DOM, or build offscreen if in editor view
  let pageElements = Array.from(document.querySelectorAll('.sap-a4-sheet')) as HTMLElement[];
  let cleanupOffscreen: (() => void) | null = null;

  if (pageElements.length === 0) {
    const offscreen = buildOffscreenDocumentDom(spec);
    document.body.appendChild(offscreen.container);
    pageElements = offscreen.pages;
    cleanupOffscreen = () => {
      offscreen.container.remove();
    };
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let isFirstPdfPage = true;

  try {
    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i];

      options?.onProgress?.({
        percent: Math.round(((i + 0.2) / pageElements.length) * 90),
        step: `Capturing Page ${i + 1} of ${pageElements.length} (Korean UTF-8 High-Fidelity)...`,
      });

      // Temporarily ensure element is visible for capture
      const wasHidden = el.classList.contains('hidden');
      const prevDisplay = el.style.display;
      const prevPosition = el.style.position;
      const prevVisibility = el.style.visibility;

      if (wasHidden) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
        el.style.visibility = 'visible';
      }

      try {
        const canvas = await html2canvas(el, {
          scale: 2, // 2x retina crispness
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1200,
        });

        const pageSlicePx = Math.floor(canvas.width * (pageHeight / pageWidth));
        if (canvas.height <= pageSlicePx * 1.02) {
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          if (!isFirstPdfPage) {
            doc.addPage();
          }
          isFirstPdfPage = false;
          const renderedHeightMm = Math.min(pageHeight, (canvas.height / canvas.width) * pageWidth);
          doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, renderedHeightMm, undefined, 'FAST');
        } else {
          // Slice tall sheet cleanly vertically so rows/text are never squashed into one A4 height
          let offsetY = 0;
          while (offsetY < canvas.height) {
            const sliceHeight = Math.min(pageSlicePx, canvas.height - offsetY);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = pageSlicePx;
            const sCtx = sliceCanvas.getContext('2d');
            if (sCtx) {
              sCtx.fillStyle = '#ffffff';
              sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
              sCtx.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
              const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
              if (!isFirstPdfPage) {
                doc.addPage();
              }
              isFirstPdfPage = false;
              doc.addImage(sliceImgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
            }
            offsetY += pageSlicePx;
          }
        }
      } finally {
        if (wasHidden) {
          el.classList.add('hidden');
          el.style.display = prevDisplay;
          el.style.position = prevPosition;
          el.style.visibility = prevVisibility;
        }
      }
    }
  } finally {
    if (cleanupOffscreen) {
      cleanupOffscreen();
    }
  }

  options?.onProgress?.({ percent: 98, step: 'Finalizing PDF document...' });
  return doc;
}

/**
 * Main export function: generates and triggers download of the specification PDF.
 * Defaults to high-fidelity capture so Korean text never corrupts.
 */
export async function exportSpecificationPdf(
  spec: ProgramSpec,
  options?: PdfExportOptions
): Promise<void> {
  const filename = `${spec.program_id || 'SAP_SPEC'}_SPECIFICATION.pdf`;

  let doc: jsPDF;
  try {
    // Always use high-fidelity Korean-safe DOM capture to prevent broken Hangul fonts
    doc = await generateHighFidelityPdf(spec, options);
  } catch (err) {
    console.warn('High fidelity PDF capture failed, falling back to structured vector PDF:', err);
    doc = await generateVectorPdf(spec, options);
  }

  options?.onProgress?.({ percent: 100, step: 'Downloading PDF file...' });
  doc.save(filename);
}

