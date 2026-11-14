import React, { useState, useMemo, useEffect } from 'react';
import {
  Printer,
  Download,
  Share2,
  Upload,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Check,
  FileText,
  Sliders,
  Table,
  FileDown,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { ProgramSpec, AlvField, TestCase } from '../types/sap';
import { generateSpecMarkdown, downloadFile, exportFieldCatalogCsv } from '../utils/specExport';
import { exportSpecificationDocx, exportSpecificationXlsx } from '../utils/officeExport';
import { InteractiveDataFlowCanvas } from './InteractiveDataFlowCanvas';
import {
  MermaidFlowChartSvg,
  getEffectiveDataFlow,
  parseMermaidCode,
  layoutMermaidDiagram,
} from './MermaidFlowChartSvg';
import { getSapAlvCellStyle } from './SapGuiMockup';
import { validateSapTCode } from '../utils/sapValidation';
import { PdfExportModal } from './PdfExportModal';

interface SpecDocumentViewProps {
  spec: ProgramSpec;
  onImportSpec?: (imported: ProgramSpec) => void;
  onReturnToWorkspace?: () => void;
}

export const SpecDocumentView: React.FC<SpecDocumentViewProps> = ({
  spec,
  onImportSpec,
  onReturnToWorkspace,
}) => {
  // Document customization & display toggles
  const [includeApproval, setIncludeApproval] = useState(true);
  const [includeRevision, setIncludeRevision] = useState(true);
  const [includeDataFlow, setIncludeDataFlow] = useState(true);
  const [includeMockSnapshot, setIncludeMockSnapshot] = useState(true);
  const [includeItemGrid, setIncludeItemGrid] = useState(true);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Pagination & Page-flipping state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'flip' | 'all'>('flip'); // 'flip': single page turn, 'all': continuous pages
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  const isMasterDetail = spec.sample_type === '02' && !!spec.item_grid;
  const isTreeWithDetail = spec.sample_type === '03' && !!spec.item_grid;
  const hasDetailGrid = (spec.sample_type === '02' || spec.sample_type === '03') && !!spec.item_grid;
  // Total pages: Detail-grid specs (02 / 03) have 5 pages, Single/Pivot ALV has 4 pages
  const totalPages = hasDetailGrid ? 5 : 4;

  const tcodeValidation = useMemo(() => validateSapTCode(spec.tcode), [spec.tcode]);

  const lifecycleMeta = useMemo(() => {
    const status = spec.status || 'draft';
    switch (status) {
      case 'in_review':
        return { label: 'In Review', badgeClass: 'bg-amber-50 text-amber-800 border-amber-300', cellText: 'Pending', cellColor: 'text-amber-700' };
      case 'approved':
        return { label: 'Approved', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300', cellText: 'Approved', cellColor: 'text-emerald-700' };
      case 'developed':
        return { label: 'Developed', badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300', cellText: 'Developed', cellColor: 'text-indigo-700' };
      case 'qa_passed':
        return { label: 'QA Passed', badgeClass: 'bg-teal-50 text-teal-800 border-teal-300', cellText: 'QA Passed', cellColor: 'text-teal-700' };
      default:
        return { label: 'Draft', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', cellText: 'Draft', cellColor: 'text-slate-500' };
    }
  }, [spec.status]);

  // Page titles for quick jump navigation
  const pageDefinitions = useMemo(() => {
    if (isMasterDetail) {
      return [
        { page: 1, title: 'Cover & Overview', sub: 'Basic Info · Approval · Revision' },
        { page: 2, title: 'Selection Screen & Header ALV', sub: 'Selection Screen · Header FCAT' },
        { page: 3, title: 'Item ALV Grid Spec', sub: 'Item Grid FCAT · Foreign Key (VBELN)' },
        { page: 4, title: 'Logic, Flow & Governance', sub: 'Extraction Logic · Authority · SE91' },
        { page: 5, title: 'Test Cases & Mock Preview', sub: 'Test Scenarios · ALV Mock Data' },
      ];
    }
    if (isTreeWithDetail) {
      return [
        { page: 1, title: 'Cover & Overview', sub: 'Basic Info · Approval · Revision' },
        { page: 2, title: 'Selection & Tree Hierarchy', sub: 'Selection Screen · Tree FCAT · Config' },
        { page: 3, title: 'Detail ALV Grid Spec', sub: 'Detail Schedule Grid FCAT · Toolbar' },
        { page: 4, title: 'Logic, Flow & Governance', sub: 'Extraction Logic · Authority · SE91' },
        { page: 5, title: 'Test Cases & Mock Preview', sub: 'Test Scenarios · ALV Mock Data' },
      ];
    }
    return [
      { page: 1, title: 'Cover & Overview', sub: 'Basic Info · Approval · Revision' },
      { page: 2, title: 'Screen & Field Catalog', sub: 'Selection Screen · ALV FCAT · Toolbar' },
      { page: 3, title: 'Logic, Flow & Governance', sub: 'Extraction Logic · Authority · SE91' },
      { page: 4, title: 'Test Cases & Mock Preview', sub: 'Test Scenarios · ALV Mock Data' },
    ];
  }, [isMasterDetail, isTreeWithDetail]);

  // Keyboard navigation for page flipping (ArrowLeft / ArrowRight / PageUp / PageDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in form inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  // Header Total calculations (DO_SUM)
  const headerTotals = useMemo(() => {
    const sumMap: Record<string, number> = {};
    spec.field_catalog.forEach((f) => {
      if (f.do_sum) {
        sumMap[f.fieldname] = (spec.mock_rows || []).reduce((acc, row) => {
          const val = Number(row[f.fieldname]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sumMap;
  }, [spec.field_catalog, spec.mock_rows]);

  // Item Total calculations (DO_SUM)
  const itemTotals = useMemo(() => {
    if (!spec.item_grid?.field_catalog) return {};
    const sumMap: Record<string, number> = {};
    spec.item_grid.field_catalog.forEach((f) => {
      if (f.do_sum) {
        sumMap[f.fieldname] = (spec.item_grid?.mock_rows || []).reduce((acc, row) => {
          const val = Number(row[f.fieldname]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sumMap;
  }, [spec.item_grid]);

  // Synchronized Data Flow & Detailed Technical Specs (RFQ v1.23)
  const effectiveFlow = useMemo(() => getEffectiveDataFlow(spec), [spec]);
  const parsedFlow = useMemo(
    () => parseMermaidCode(effectiveFlow.mermaidCode),
    [effectiveFlow.mermaidCode]
  );
  const layoutedFlowNodes = useMemo(
    () => layoutMermaidDiagram(parsedFlow.nodes, parsedFlow.edges, parsedFlow.direction),
    [parsedFlow]
  );

  const formatPrintInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-slate-100 text-blue-800 px-1 py-0.2 rounded font-mono text-[11px] border border-slate-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const renderPrintMarkdown = (content: string) => {
    if (!content || !content.trim()) {
      return <p className="text-slate-400 italic text-xs">No detailed specification provided.</p>;
    }

    const lines = content.split('\n');
    return (
      <div className="space-y-1 text-xs text-slate-800 leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('# ')) {
            return (
              <h4 key={idx} className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-0.5 mt-2">
                {trimmed.substring(2)}
              </h4>
            );
          }
          if (trimmed.startsWith('## ')) {
            return (
              <h5 key={idx} className="text-xs font-bold text-blue-900 mt-1.5">
                {trimmed.substring(3)}
              </h5>
            );
          }
          if (trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
            const depth = trimmed.startsWith('#### ') ? 5 : 4;
            return (
              <h6 key={idx} className="text-xs font-semibold text-slate-900 mt-1">
                {trimmed.substring(depth)}
              </h6>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <li key={idx} className="ml-4 list-disc text-slate-700">
                {formatPrintInline(trimmed.substring(2))}
              </li>
            );
          }
          if (/^\d+\.\s/.test(trimmed)) {
            const numMatch = trimmed.match(/^\d+\.\s/);
            return (
              <li key={idx} className="ml-4 list-decimal text-slate-700">
                {formatPrintInline(trimmed.substring(numMatch![0].length))}
              </li>
            );
          }
          if (trimmed.startsWith('> ')) {
            return (
              <blockquote key={idx} className="pl-2 border-l-2 border-blue-500 text-slate-600 bg-blue-50/50 py-0.5 rounded-r">
                {formatPrintInline(trimmed.substring(2))}
              </blockquote>
            );
          }
          if (!trimmed) {
            return <div key={idx} className="h-1" />;
          }
          return (
            <p key={idx} className="text-slate-800">
              {formatPrintInline(line)}
            </p>
          );
        })}
      </div>
    );
  };

  // Active toolbar buttons
  const activeToolbarButtons =
    spec.toolbar_buttons && spec.toolbar_buttons.length > 0
      ? spec.toolbar_buttons.filter((b) => b.visible !== false)
      : [];

  // Download Markdown
  const handleDownloadMarkdown = () => {
    const md = generateSpecMarkdown(spec);
    downloadFile(`${spec.program_id}_SPECIFICATION.md`, md, 'text/markdown;charset=utf-8;');
  };

  // Download Field Catalog CSV
  const handleDownloadCsv = () => {
    const csv = exportFieldCatalogCsv(spec);
    downloadFile(`${spec.program_id}_FIELDCATALOG.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
  };

  // Download Word (.docx) Specification
  const handleDownloadDocx = async () => {
    if (isExportingDocx) return;
    setIsExportingDocx(true);
    try {
      const filename = await exportSpecificationDocx(spec);
      setCopiedNotice(`Exported Word (.docx): ${filename}`);
      setTimeout(() => setCopiedNotice(null), 4000);
    } catch (err) {
      console.error('DOCX export error:', err);
      setCopiedNotice('Failed to generate Word (.docx) file.');
      setTimeout(() => setCopiedNotice(null), 4000);
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Download Multi-Sheet Excel (.xlsx) Deliverable
  const handleDownloadXlsx = () => {
    try {
      const filename = exportSpecificationXlsx(spec);
      setCopiedNotice(`Exported Excel (.xlsx): ${filename}`);
      setTimeout(() => setCopiedNotice(null), 4000);
    } catch (err) {
      console.error('XLSX export error:', err);
      setCopiedNotice('Failed to generate Excel (.xlsx) file.');
      setTimeout(() => setCopiedNotice(null), 4000);
    }
  };

  // Export JSON
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(spec, null, 2);
    downloadFile(`${spec.program_id}_SPEC.json`, jsonStr, 'application/json');
  };

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportSpec) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.program_id && parsed.field_catalog) {
          onImportSpec(parsed);
          setCopiedNotice('Imported specification JSON successfully.');
          setTimeout(() => setCopiedNotice(null), 4000);
        }
      } catch (err) {
        console.warn('Invalid specification JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Trigger Print to PDF
  const handlePrint = () => {
    window.print();
  };

  // Reusable Running Header for Pages 2+
  const renderRunningHeader = (pageNo: number) => (
    <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b-2 border-slate-900 mb-4 font-mono shrink-0">
      <div className="flex items-center gap-2">
        <span className="font-bold text-blue-900 uppercase">SAP S/4HANA ERP IMPLEMENTATION</span>
        <span>|</span>
        <span className="font-semibold text-slate-800">
          [{spec.program_id}] {spec.title}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-bold">
          {spec.module} MODULE
        </span>
        <span className="text-[10px] text-slate-500">DOC-ID: FDD-{spec.module}-{spec.program_id}</span>
      </div>
    </div>
  );

  // Reusable Running Footer with accurate Page X of Y
  const renderRunningFooter = (pageNo: number) => (
    <footer className="border-t border-slate-300 pt-3 mt-4 text-[10px] text-slate-500 flex items-center justify-between font-mono shrink-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-700">SAP Functional Specification</span>
        <span>|</span>
        <span>FDD-{spec.module}-{spec.program_id}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          - {pageNo} / {totalPages} -
        </span>
      </div>
      <div>
        <span>CONFIDENTIAL - FOR INTERNAL USE ONLY</span>
      </div>
    </footer>
  );

  // Check if a page should be displayed on screen
  const isPageVisibleOnScreen = (pageNo: number) => {
    if (viewMode === 'all') return true;
    return currentPage === pageNo;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-900 font-sans select-text">
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL BAR (Hidden during Print)                                  */}
      {/* ========================================================================= */}
      <div className="no-print bg-slate-900 border-b border-slate-800 text-white px-4 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-md z-30">
        <div className="flex items-center gap-3">
          {onReturnToWorkspace && (
            <button
              onClick={onReturnToWorkspace}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Back to Workspace"
              aria-label="Back to Workspace"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dual View</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              {spec.module}
            </span>
            <div>
              <h2 className="text-xs font-bold text-white flex items-center gap-2">
                <span>SAP Functional Specification</span>
                <span className="text-[11px] font-mono text-slate-400">[{spec.program_id}]</span>
              </h2>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Section Visibility Toggles */}
          <div className="hidden 2xl:flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700/60 text-[11px] text-slate-300">
            <span className="text-slate-400 font-medium">Include:</span>
            <label className="flex items-center gap-1 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={includeApproval}
                onChange={(e) => setIncludeApproval(e.target.checked)}
                className="w-3 h-3 accent-blue-600 rounded"
              />
              <span>Approval</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={includeRevision}
                onChange={(e) => setIncludeRevision(e.target.checked)}
                className="w-3 h-3 accent-blue-600 rounded"
              />
              <span>Revision</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={includeDataFlow}
                onChange={(e) => setIncludeDataFlow(e.target.checked)}
                className="w-3 h-3 accent-blue-600 rounded"
              />
              <span>Flowchart</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={includeMockSnapshot}
                onChange={(e) => setIncludeMockSnapshot(e.target.checked)}
                className="w-3 h-3 accent-blue-600 rounded"
              />
              <span>Mock Data</span>
            </label>
          </div>

          {/* Primary Action: jsPDF Export */}
          <button
            onClick={() => setIsPdfModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-900/40 cursor-pointer border border-blue-400/30"
            title="Export PDF (jsPDF)"
            aria-label="Export PDF (jsPDF)"
          >
            <FileDown className="w-3.5 h-3.5 text-blue-200" />
            <span>Export PDF</span>
          </button>

          {/* Secondary Action: Browser Print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            title="Print (Ctrl+P)"
            aria-label="Print"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print</span>
          </button>

          {/* Word (.docx) Export */}
          <button
            onClick={handleDownloadDocx}
            disabled={isExportingDocx}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 rounded text-xs font-medium border border-sky-700/50 transition-colors cursor-pointer disabled:opacity-50"
            title="Export Word (.docx)"
            aria-label="Export Word (.docx)"
          >
            {isExportingDocx ? (
              <Loader2 className="w-3.5 h-3.5 text-sky-300 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-sky-300" />
            )}
            <span className="hidden sm:inline">.docx</span>
          </button>

          {/* Multi-Sheet Excel (.xlsx) Export */}
          <button
            onClick={handleDownloadXlsx}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-950/50 hover:bg-teal-900/60 text-teal-200 rounded text-xs font-medium border border-teal-700/50 transition-colors cursor-pointer"
            title="Export Excel (.xlsx)"
            aria-label="Export Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-300" />
            <span className="hidden sm:inline">.xlsx</span>
          </button>

          {/* Markdown Download */}
          <button
            onClick={handleDownloadMarkdown}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            title="Export Markdown (.md)"
            aria-label="Export Markdown (.md)"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">MD</span>
          </button>

          {/* Field Catalog CSV */}
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 rounded text-xs font-medium border border-emerald-700/50 transition-colors cursor-pointer"
            title="Export Field Catalog (.csv)"
            aria-label="Export Field Catalog (.csv)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* JSON Export */}
          <button
            onClick={handleExportJson}
            title="Export JSON"
            aria-label="Export JSON"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* JSON Import */}
          {onImportSpec && (
            <label
              title="Import JSON"
              aria-label="Import JSON"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. INTERACTIVE PAGE NAVIGATION & FLIPPING TOOLBAR                         */}
      {/* ========================================================================= */}
      <div className="no-print bg-slate-850 bg-[#162032] border-b border-slate-800 px-4 py-2 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-inner z-20 text-slate-200">
        {/* Left: View Mode Toggle (Page Flip vs All Pages) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700/80 text-xs">
            <button
              onClick={() => setViewMode('flip')}
              className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'flip'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Single-page flip view"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Page Flip</span>
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Continuous A4 page scroll"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Pages</span>
            </button>
          </div>

          <span className="hidden lg:inline text-[11px] text-slate-400 font-mono">
            Keys: <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">←</kbd>{' '}
            <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">→</kbd>
          </span>
        </div>

        {/* Center: Interactive Page Turner (Prev / Page Buttons / Next) */}
        <div className="flex items-center gap-1.5">
          {/* Previous Page Button */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-all cursor-pointer ${
              currentPage <= 1
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-500'
            }`}
            title="Previous Page (←)"
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Quick Page Jump Buttons */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700/80">
            {pageDefinitions.map((pDef) => {
              const isActive = currentPage === pDef.page;
              return (
                <button
                  key={pDef.page}
                  onClick={() => {
                    setCurrentPage(pDef.page);
                    if (viewMode === 'all') {
                      const el = document.getElementById(`sap-page-${pDef.page}`);
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all cursor-pointer flex items-center gap-1 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={`Page ${pDef.page}: ${pDef.title} (${pDef.sub})`}
                >
                  <span>{pDef.page}</span>
                  <span className="hidden xl:inline font-sans font-normal text-[10px] opacity-80">
                    {pDef.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Next Page Button */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-all cursor-pointer ${
              currentPage >= totalPages
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-500'
            }`}
            title="Next Page (→)"
            aria-label="Next Page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Page Counter Badge */}
          <div className="ml-1 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono font-semibold text-slate-300 tabular-nums">
            <span className="text-blue-400">{currentPage}</span> / {totalPages}
          </div>
        </div>

        {/* Right: Zoom Scale Controls */}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
            <button
              onClick={() => setZoomScale((z) => Math.max(0.7, Number((z - 0.1).toFixed(1))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-300 min-w-10 text-center tabular-nums">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale(1.0)}
              className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 rounded font-mono cursor-pointer tabular-nums"
              title="Reset 100%"
              aria-label="Reset 100%"
            >
              100%
            </button>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {copiedNotice && (
        <div className="no-print bg-emerald-600 text-white text-xs px-4 py-2 font-medium flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{copiedNotice}</span>
          </div>
          <button onClick={() => setCopiedNotice(null)} className="text-white hover:opacity-80">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. A4 PAGINATED VIEWPORT (Clean, separated A4 pages)                       */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#0a0f1d] flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
        <div
          className="transition-transform duration-200 origin-top flex flex-col items-center w-full print:transform-none"
          style={{ transform: `scale(${zoomScale})` }}
        >
          {/* ========================================================================= */}
          {/* PAGE 1: 표지, 결재선, 개정이력, 프로그램 기본 정보, 업무 개요           */}
          {/* ========================================================================= */}
          <div
            id="sap-page-1"
            className={`${
              isPageVisibleOnScreen(1) ? 'sap-a4-sheet' : 'hidden print:sap-a4-sheet'
            } ${viewMode === 'all' ? 'mb-8 print:mb-0' : ''}`}
          >
            {/* Top Page Content */}
            <div className="space-y-6">
              {/* Cover Document Header */}
              <header className="border-b-2 border-slate-900 pb-5">
                {/* Top Corporate Line */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-900 tracking-wider uppercase font-mono">
                      SAP S/4HANA ERP IMPLEMENTATION
                    </span>
                    <span>|</span>
                    <span>PROJECT DELIVERABLE</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-700 border border-slate-300">
                      CONFIDENTIAL
                    </span>
                    <span>DOC-ID: FDD-{spec.module}-{spec.program_id}</span>
                  </div>
                </div>

                {/* Document Title & Subtitle */}
                <div className="mt-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold font-mono">
                        {spec.module} MODULE
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {spec.program_type === 'REPORT' ? 'ALV Grid Report' : 'Online Transaction'}
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                      Functional Development Specification
                    </h1>
                    <p className="text-sm font-semibold text-blue-900 mt-1 font-mono">
                      [{spec.program_id}] {spec.title}
                    </p>
                  </div>

                  {/* Official 4-Tier Approval Sign-Off Matrix */}
                  {includeApproval && (
                    <div className="print-avoid-break shrink-0">
                      <table className="border-collapse border border-slate-600 text-center text-[10px] w-72 shadow-2xs font-sans">
                        <thead>
                          <tr className="bg-[#e9f0f8] border-b border-slate-600 text-slate-800 font-bold">
                            <th className="p-1 border-r border-slate-400 w-18">Author (FS)</th>
                            <th className="p-1 border-r border-slate-400 w-18">Review (Lead)</th>
                            <th className="p-1 border-r border-slate-400 w-18">Quality (QA)</th>
                            <th className="p-1 w-18">Approve (PM)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="h-12 border-b border-slate-300 bg-white">
                            <td className="p-1 border-r border-slate-400 align-bottom text-[10px] font-bold text-slate-800">
                              {spec.author.split(' ')[0] || 'Author'}
                            </td>
                            <td className="p-1 border-r border-slate-400 align-bottom text-[10px] text-slate-600 font-medium">
                              {spec.status && spec.status !== 'draft' ? 'Reviewed' : 'Pending'}
                            </td>
                            <td className="p-1 border-r border-slate-400 align-bottom text-[10px] font-medium text-slate-600">
                              {spec.status === 'qa_passed' ? 'QA Passed' : 'Pending'}
                            </td>
                            <td className={`p-1 align-bottom text-[10px] font-bold ${lifecycleMeta.cellColor}`}>
                              {spec.approved_by ? spec.approved_by.split(' ')[0] : lifecycleMeta.cellText}
                            </td>
                          </tr>
                          <tr className="bg-slate-50 text-[9px] text-slate-500 font-mono">
                            <td className="p-0.5 border-r border-slate-300">{spec.created_date}</td>
                            <td className="p-0.5 border-r border-slate-300">
                              {spec.status && spec.status !== 'draft' ? spec.created_date : '-'}
                            </td>
                            <td className="p-0.5 border-r border-slate-300">
                              {spec.status === 'qa_passed' ? (spec.approved_at?.slice(0, 10) || spec.created_date) : '-'}
                            </td>
                            <td className="p-0.5">
                              {spec.approved_at
                                ? spec.approved_at.slice(0, 10)
                                : spec.status === 'approved' || spec.status === 'developed' || spec.status === 'qa_passed'
                                ? spec.created_date
                                : '-'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </header>

              {/* Revision History */}
              {includeRevision && (
                <section className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-blue-700 rounded-full" />
                      Revision History
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Latest:{' '}
                      {spec.change_history && spec.change_history.length > 0
                        ? spec.change_history[0].version
                        : 'v1.0'}
                    </span>
                  </div>
                  <table className="w-full text-xs text-left border-collapse border border-slate-300">
                    <thead className="bg-[#f1f5f9] border-b border-slate-300 text-slate-700 font-semibold text-[11px]">
                      <tr>
                        <th className="p-1.5 border-r border-slate-300 w-16 text-center">Version</th>
                        <th className="p-1.5 border-r border-slate-300 w-28 text-center">Date</th>
                        <th className="p-1.5 border-r border-slate-300 w-28">Author</th>
                        <th className="p-1.5">Summary of Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {spec.change_history && spec.change_history.length > 0 ? (
                        spec.change_history.map((rev) => (
                          <tr key={rev.id}>
                            <td className="p-1.5 border-r border-slate-300 text-center font-mono font-bold text-blue-900">
                              {rev.version}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 text-center font-mono text-slate-600">
                              {rev.changed_at}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 font-semibold text-slate-800">
                              {rev.author}
                            </td>
                            <td className="p-1.5 text-slate-700">{rev.comment}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-1.5 border-r border-slate-300 text-center font-mono font-bold text-blue-900">
                            v1.0
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-center font-mono text-slate-600">
                            {spec.created_date}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 font-semibold text-slate-800">
                            {spec.author}
                          </td>
                          <td className="p-1.5 text-slate-700">
                            Initial functional specification, ALV Grid layout, field catalog, and data flow design.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              )}

              {/* SECTION 1: General Program Information */}
              <section className="print-avoid-break space-y-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800">
                  <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                    01
                  </span>
                  <span>1. General Program Information</span>
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-[#f8fafc] p-3 rounded border border-slate-300 text-xs">
                  <div className="border-r border-slate-200 pr-2">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      Program ID
                    </span>
                    <span className="font-mono font-bold text-blue-900 text-xs">
                      {spec.program_id}
                    </span>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      T-Code
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-blue-900 text-xs">{spec.tcode}</span>
                      {tcodeValidation.isValid ? (
                        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-sans font-semibold">
                          SAP Standard
                        </span>
                      ) : (
                        <span
                          className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-300 font-sans font-semibold"
                          title={tcodeValidation.message}
                        >
                          Non-Standard
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      SAP Module
                    </span>
                    <span className="font-bold text-slate-800 text-xs">{spec.module}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      Program Type
                    </span>
                    <span className="font-bold text-slate-800 text-xs">
                      {spec.program_type === 'REPORT'
                        ? 'ALV Report (CL_GUI_ALV_GRID)'
                        : 'Online Dialog'}
                    </span>
                  </div>

                  <div className="border-r border-slate-200 pr-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      Author / Consultant
                    </span>
                    <span className="font-semibold text-slate-800 text-xs">{spec.author}</span>
                  </div>
                  <div className="border-r border-slate-200 pr-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-semibold">Created Date</span>
                    <span className="font-mono text-slate-800 text-xs">{spec.created_date}</span>
                  </div>
                  <div className="border-r border-slate-200 pr-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      Target SAP Release
                    </span>
                    <span className="font-semibold text-slate-800 text-xs">
                      {spec.target_sap_release}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-semibold">
                      Status / Syntax / Message Class
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${lifecycleMeta.badgeClass}`}>
                        {lifecycleMeta.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-600">
                        {spec.abap_syntax_mode === 'modern_740' ? '7.40+' : 'Classic'} · {spec.message_class || 'Z01'}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 2: Business Requirements & Purpose */}
              <section className="print-avoid-break space-y-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800">
                  <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                    02
                  </span>
                  <span>2. Business Requirements & Purpose</span>
                </h2>
                <div className="p-4 bg-slate-50 rounded border border-slate-300 text-xs leading-relaxed whitespace-pre-line text-slate-800 shadow-2xs">
                  {spec.business_purpose}
                </div>
              </section>
            </div>

            {/* Page 1 Footer */}
            {renderRunningFooter(1)}
          </div>

          {/* ========================================================================= */}
          {/* PAGE 2: Selection Screen & ALV Header Layout / Field Catalog / Toolbar    */}
          {/* ========================================================================= */}
          <div
            id="sap-page-2"
            className={`${
              isPageVisibleOnScreen(2) ? 'sap-a4-sheet' : 'hidden print:sap-a4-sheet'
            } ${viewMode === 'all' ? 'mb-8 print:mb-0' : ''}`}
          >
            <div className="space-y-6">
              {renderRunningHeader(2)}

              {/* SECTION 3: Selection Screen */}
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800 print-avoid-break">
                  <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                    03
                  </span>
                  <span>3. Selection Screen Specification</span>
                </h2>

                <div className="border border-slate-300 rounded overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#e4edf7] border-b border-slate-300 text-slate-800 font-semibold text-[11px]">
                      <tr>
                        <th className="p-2 border-r border-slate-300 w-32">Block</th>
                        <th className="p-2 border-r border-slate-300 w-28">Kind</th>
                        <th className="p-2 border-r border-slate-300 w-24">Variable</th>
                        <th className="p-2 border-r border-slate-300">Selection Text</th>
                        <th className="p-2 border-r border-slate-300 w-24 text-center">Type/Len</th>
                        <th className="p-2 border-r border-slate-300 w-32">Ref / Group / F4</th>
                        <th className="p-2 border-r border-slate-300 w-14 text-center">Req</th>
                        <th className="p-2 w-20">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                      {spec.selection_params.map((p) => {
                        const kindLabel =
                          p.kind === 'SELECT_OPTION'
                            ? 'SELECT-OPTIONS'
                            : p.kind === 'RADIOBUTTON'
                            ? 'RADIOBUTTON'
                            : p.kind === 'CHECKBOX'
                            ? 'CHECKBOX'
                            : 'PARAMETERS';
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-2 border-r border-slate-200 font-sans text-[11px] text-slate-700">
                              {p.block_title ? (
                                <span className="font-semibold text-slate-800">
                                  {p.block_title}
                                  {p.block_id ? (
                                    <span className="ml-1 font-mono text-[10px] text-slate-400">
                                      ({p.block_id})
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-2 border-r border-slate-200 font-sans font-medium text-slate-600">
                              {kindLabel}
                            </td>
                            <td className="p-2 border-r border-slate-200 font-bold text-blue-900">
                              {p.name}
                            </td>
                            <td className="p-2 border-r border-slate-200 font-sans text-slate-800">
                              {p.text}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-center text-slate-700">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px]">
                                {p.datatype || 'CHAR'}({p.length || 10})
                              </span>
                            </td>
                            <td className="p-2 border-r border-slate-200 text-slate-600">
                              <div>
                                {p.kind === 'RADIOBUTTON' && p.radio_group
                                  ? `GROUP ${p.radio_group}`
                                  : p.ref_table
                                  ? `${p.ref_table}-${p.ref_field}`
                                  : '-'}
                              </div>
                              {p.matchcode_object && (
                                <span className="inline-block mt-0.5 px-1 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[9px] font-bold">
                                  F4: {p.matchcode_object}
                                </span>
                              )}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">
                              {p.obligatory ? (
                                <span className="text-red-600">Y</span>
                              ) : (
                                <span className="text-slate-400">N</span>
                              )}
                            </td>
                            <td className="p-2 text-slate-700">{p.default_val || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* SECTION 4: ALV Grid Specification */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800 print-avoid-break">
                  <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                    04
                  </span>
                  <span>
                    4. ALV Grid Layout & Field Catalog Specification
                  </span>
                </h2>

                {/* 4.1 Header ALV Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between print-avoid-break">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-blue-600 rounded-xs" />
                      <span>
                        4.1{' '}
                        {isMasterDetail
                          ? 'Header ALV Grid Specification'
                          : isTreeWithDetail
                          ? 'Tree Hierarchy Field Catalog (CL_GUI_ALV_TREE)'
                          : spec.sample_type === '04'
                          ? `ALV Pivot / IDA Field Catalog (${spec.cds_view_table || 'CDS/Table'})`
                          : 'ALV Grid Field Catalog (LVC_T_FCAT)'}
                      </span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                      {spec.field_catalog.length} fields | Title:{' '}
                      {spec.layout?.grid_title}
                    </span>
                  </div>

                  {/* Layout Properties Summary */}
                  <div className="bg-[#f8fafc] border border-slate-300 rounded p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] print-avoid-break">
                    <div>
                      <span className="text-slate-500 block text-[10px]">
                        GRID_TITLE
                      </span>
                      <span className="font-bold text-slate-800">
                        {spec.layout?.grid_title || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">
                        SEL_MODE
                      </span>
                      <span className="font-mono font-bold text-blue-900">
                        {spec.layout?.sel_mode || 'A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">
                        ZEBRA
                      </span>
                      <span className="font-bold text-slate-800">
                        {spec.layout?.zebra ? 'Enabled (X)' : 'Disabled'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">
                        CWIDTH_OPT
                      </span>
                      <span className="font-bold text-slate-800">
                        {spec.layout?.cwidth_opt ? 'Enabled (X)' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Conditional Tree or Pivot Config Summary */}
                  {spec.sample_type === '03' && spec.tree_config && (
                    <div className="bg-blue-50/70 border border-blue-200 rounded p-2.5 text-[11px] flex flex-wrap gap-4 print-avoid-break">
                      <span><strong className="text-blue-950">Tree Root:</strong> <code className="font-mono">{spec.tree_config.root_label || 'ROOT'}</code></span>
                      <span><strong className="text-blue-950">Group Field:</strong> <code className="font-mono">{spec.tree_config.group_field || '-'}</code></span>
                      <span><strong className="text-blue-950">Label Field:</strong> <code className="font-mono">{spec.tree_config.group_label_field || '-'}</code></span>
                    </div>
                  )}
                  {spec.sample_type === '04' && (spec.pivot_config || spec.cds_view_table) && (
                    <div className="bg-sky-50/70 border border-sky-200 rounded p-2.5 text-[11px] flex flex-wrap gap-4 print-avoid-break">
                      <span><strong className="text-sky-950">CDS / Source:</strong> <code className="font-mono">{spec.cds_view_table || spec.pivot_config?.source_table_or_cds || 'ACDOCA'}</code></span>
                      {spec.pivot_config?.default_dimensions?.length ? (
                        <span><strong className="text-sky-950">Default Dimensions:</strong> <code className="font-mono">{spec.pivot_config.default_dimensions.join(', ')}</code></span>
                      ) : null}
                      {spec.pivot_config?.default_measures?.length ? (
                        <span><strong className="text-sky-950">Measures:</strong> <code className="font-mono">{spec.pivot_config.default_measures.join(', ')}</code></span>
                      ) : null}
                    </div>
                  )}

                  {/* Field Catalog Table */}
                  <div className="border border-slate-300 rounded overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-[#e4edf7] border-b border-slate-300 text-slate-800 font-semibold text-[11px]">
                        <tr>
                          <th className="p-1.5 border-r border-slate-300 text-center w-8">No</th>
                          <th className="p-1.5 border-r border-slate-300 min-w-24">Field Name</th>
                          <th className="p-1.5 border-r border-slate-300 min-w-28">Column Label</th>
                          <th className="p-1.5 border-r border-slate-300 w-16">Type</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Len</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Just</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Key</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Link</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Edit</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-10">Sum</th>
                          <th className="p-1.5 border-r border-slate-300 text-center w-14">Color</th>
                          <th className="p-1.5 border-r border-slate-300 min-w-24">
                            Ref Table/Field
                          </th>
                          <th className="p-1.5 min-w-20">Drilldown</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                        {spec.field_catalog.map((f) => (
                          <tr key={f.fieldname} className="hover:bg-slate-50">
                            <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-bold">
                              {f.col_pos}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 font-bold text-slate-900">
                              {f.fieldname}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 font-sans text-slate-800">
                              {f.coltext}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-slate-600">
                              {f.datatype}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center">
                              {f.outputlen}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center">
                              {f.just}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center font-bold text-blue-700">
                              {f.key ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center font-bold text-indigo-700">
                              {f.hotspot ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center">
                              {f.edit ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center font-bold text-emerald-700">
                              {f.do_sum ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-center text-[10px]">
                              {f.emphasize ? (
                                <span className="font-bold text-amber-800">{f.emphasize}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-[10px] text-slate-500">
                              {f.ref_table ? `${f.ref_table}-${f.ref_field}` : '-'}
                            </td>
                            <td className="p-1.5 text-[10px] text-blue-700">
                              {f.drilldown_tcode || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4.3 ALV Toolbar Buttons (LVC_T_STB) */}
                {activeToolbarButtons.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 print-avoid-break">
                      <span className="w-2 h-2 bg-slate-600 rounded-xs" />
                      <span>4.3 ALV Toolbar Functions (LVC_T_STB)</span>
                    </h3>
                    <div className="border border-slate-300 rounded overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-[#f1f5f9] border-b border-slate-300 text-slate-700 font-semibold text-[11px]">
                          <tr>
                            <th className="p-1.5 border-r border-slate-300 w-12 text-center">No</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 font-mono">
                              Function Code
                            </th>
                            <th className="p-1.5 border-r border-slate-300 w-36">
                              Button Text
                            </th>
                            <th className="p-1.5 border-r border-slate-300">
                              Quickinfo
                            </th>
                            <th className="p-1.5 w-24 text-center">Button Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-[11px]">
                          {activeToolbarButtons.map((btn, idx) => (
                            <tr key={btn.id || idx}>
                              <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-blue-900">
                                {btn.function}
                              </td>
                              <td className="p-1.5 border-r border-slate-200 font-semibold text-slate-800">
                                {btn.text}
                              </td>
                              <td className="p-1.5 border-r border-slate-200 text-slate-600">
                                {btn.quickinfo || '-'}
                              </td>
                              <td className="p-1.5 text-center font-mono text-[10px]">
                                {btn.is_standard ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    SAP Std
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                                    Custom
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {renderRunningFooter(2)}
          </div>

          {/* ========================================================================= */}
          {/* PAGE 3 (Active when 02 Master-Detail or 03 Tree+Detail): DETAIL ALV GRID  */}
          {/* ========================================================================= */}
          {hasDetailGrid && spec.item_grid && (
            <div
              id="sap-page-3"
              className={`${
                isPageVisibleOnScreen(3) ? 'sap-a4-sheet' : 'hidden print:sap-a4-sheet'
              } ${viewMode === 'all' ? 'mb-8 print:mb-0' : ''}`}
            >
              <div className="space-y-6">
                {renderRunningHeader(3)}

                <section className="space-y-4">
                  <h2 className="text-sm font-bold text-indigo-950 flex items-center gap-2 pb-1 border-b-2 border-indigo-900 print-avoid-break">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-900 text-white font-mono text-[10px]">
                      04.2
                    </span>
                    <span>
                      {isTreeWithDetail
                        ? `4.2 Tree-Linked Detail ALV Grid (${spec.item_grid.grid_name || 'Detail ALV Grid'})`
                        : '4.2 Item ALV Grid Detail Specification'}
                    </span>
                  </h2>

                  <div className="bg-indigo-50/70 border border-indigo-200 rounded p-3 text-xs space-y-1 print-avoid-break">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-900">
                        {isTreeWithDetail ? 'Tree Node Link Key:' : 'Foreign Key:'}
                      </span>
                      <span className="font-mono px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded font-bold">
                        {spec.item_grid.foreign_key || spec.tree_config?.group_field || 'VBELN'}
                      </span>
                      <span className="text-slate-600 text-[11px]">
                        {isTreeWithDetail
                          ? '(Selecting a tree node filters the right detail ALV grid)'
                          : '(Clicking a header ALV row filters item rows by this key)'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 tabular-nums">
                      Layout:{' '}
                      <span className="font-bold text-slate-800">
                        {spec.item_grid.layout?.grid_title || 'Detail ALV Grid'}
                      </span>{' '}
                      | {spec.item_grid.field_catalog.length} fields
                    </div>
                  </div>

                  <div className="border border-indigo-200 rounded overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-[#eef2ff] border-b border-indigo-300 text-indigo-950 font-semibold text-[11px]">
                        <tr>
                          <th className="p-1.5 border-r border-indigo-200 text-center w-8">No</th>
                          <th className="p-1.5 border-r border-indigo-200 min-w-24">Field Name</th>
                          <th className="p-1.5 border-r border-indigo-200 min-w-28">Column Label</th>
                          <th className="p-1.5 border-r border-indigo-200 w-16">Type</th>
                          <th className="p-1.5 border-r border-indigo-200 text-center w-10">Len</th>
                          <th className="p-1.5 border-r border-indigo-200 text-center w-10">Just</th>
                          <th className="p-1.5 border-r border-indigo-200 text-center w-10">Key</th>
                          <th className="p-1.5 border-r border-indigo-200 text-center w-10">Sum</th>
                          <th className="p-1.5 min-w-28">Ref Table/Field</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100 font-mono text-[11px]">
                        {spec.item_grid.field_catalog.map((f) => (
                          <tr key={f.fieldname} className="hover:bg-indigo-50/40">
                            <td className="p-1.5 border-r border-indigo-100 text-center text-slate-500 font-bold">
                              {f.col_pos}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 font-bold text-indigo-950">
                              {f.fieldname}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 font-sans text-slate-800">
                              {f.coltext}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 text-slate-600">
                              {f.datatype}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 text-center">
                              {f.outputlen}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 text-center">
                              {f.just}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 text-center font-bold text-blue-700">
                              {f.key ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 border-r border-indigo-100 text-center font-bold text-emerald-700">
                              {f.do_sum ? 'O' : '-'}
                            </td>
                            <td className="p-1.5 text-[10px] text-slate-500">
                              {f.ref_table ? `${f.ref_table}-${f.ref_field}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {renderRunningFooter(3)}
            </div>
          )}

          {/* ========================================================================= */}
          {/* LOGIC & FLOWCHART PAGE (Page 3 or Page 4 for 02/03 Detail Grid)           */}
          {/* ========================================================================= */}
          {(() => {
            const pageNo = hasDetailGrid ? 4 : 3;
            return (
              <div
                id={`sap-page-${pageNo}`}
                className={`${
                  isPageVisibleOnScreen(pageNo) ? 'sap-a4-sheet' : 'hidden print:sap-a4-sheet'
                } ${viewMode === 'all' ? 'mb-8 print:mb-0' : ''}`}
              >
                <div className="space-y-5">
                  {renderRunningHeader(pageNo)}

                  {/* SECTION 5: 데이터 추출 및 업무 처리 로직 명세 */}
                  <section className="space-y-3">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800 print-avoid-break">
                      <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                        05
                      </span>
                      <span>
                        5. Data Extraction & Processing Logic
                      </span>
                    </h2>

                    {/* Code / Logic box: High contrast light format optimized for print ink */}
                    <div className="p-3.5 bg-slate-50 text-slate-900 rounded border border-slate-300 font-mono text-xs leading-relaxed whitespace-pre-line shadow-2xs">
                      {spec.data_extraction_logic}
                    </div>

                    {/* 5.1 Program Process Flow Diagram (Synchronized with Mermaid Flow Chart) */}
                    {includeDataFlow && (
                      <div className="space-y-2 pt-1 print-avoid-break">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-blue-600 rounded-xs" />
                            <span>5.1 Data Flow Diagram</span>
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500">
                            Vector Flowchart
                          </span>
                        </div>
                        <div className="border border-slate-300 rounded-lg p-3 bg-white flex justify-center overflow-x-auto print-avoid-break">
                          <MermaidFlowChartSvg
                            mermaidCode={effectiveFlow.mermaidCode}
                            nodeDetails={effectiveFlow.nodeDetails}
                            readOnly={true}
                            fitToWidth={true}
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* 5.2 Detailed Technical Specifications from Data Flow */}
                    {includeDataFlow && layoutedFlowNodes.length > 0 && (
                      <div className="space-y-3 pt-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200 print-avoid-break">
                          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-blue-600 rounded-xs" />
                            <span>5.2 Detailed Technical Specifications</span>
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500">
                            Step-by-Step Processing Logic
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {layoutedFlowNodes.map((node) => {
                            const detail = effectiveFlow.nodeDetails[node.id];
                            const md = detail?.markdown || '';
                            const label = detail?.label || node.label || node.id;
                            const shapeText =
                              node.shape === 'diamond'
                                ? 'Decision'
                                : node.shape === 'cylinder'
                                ? 'Database'
                                : node.shape === 'stadium'
                                ? 'Start / End'
                                : node.shape === 'round'
                                ? 'Screen'
                                : 'Process';

                            return (
                              <div
                                key={node.id}
                                className="border border-slate-300 rounded bg-white overflow-hidden shadow-2xs print-avoid-break"
                              >
                                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900">
                                      {label}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {shapeText}
                                  </span>
                                </div>
                                <div className="p-3 bg-white">
                                  {renderPrintMarkdown(md)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* 5.3 Governance & Performance */}
                    {((spec.authority_checks && spec.authority_checks.length > 0) ||
                      (spec.sap_messages && spec.sap_messages.length > 0) ||
                      spec.performance_config) && (
                      <div className="space-y-3 pt-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200 print-avoid-break">
                          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-indigo-600 rounded-xs" />
                            <span>5.3 SAP Security, Messages & Performance Governance</span>
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500">
                            Syntax: {spec.abap_syntax_mode === 'modern_740' ? '7.40+' : 'Classic'} | Msg: {spec.message_class || 'Z01'}
                          </span>
                        </div>

                        {spec.authority_checks && spec.authority_checks.length > 0 && (
                          <div className="border border-slate-300 rounded overflow-hidden">
                            <table className="w-full text-[11px] text-left border-collapse">
                              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                                <tr>
                                  <th className="p-1.5 border-r border-slate-300 w-28">Auth Object</th>
                                  <th className="p-1.5 border-r border-slate-300 w-36">Fields / Values</th>
                                  <th className="p-1.5 border-r border-slate-300 w-32">Trigger Point</th>
                                  <th className="p-1.5">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {spec.authority_checks.map((ac) => (
                                  <tr key={ac.id}>
                                    <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-blue-900">{ac.object}</td>
                                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{ac.fields}</td>
                                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-600">{ac.trigger_point}</td>
                                    <td className="p-1.5 text-slate-700">{ac.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {spec.sap_messages && spec.sap_messages.length > 0 && (
                          <div className="border border-slate-300 rounded overflow-hidden">
                            <table className="w-full text-[11px] text-left border-collapse">
                              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                                <tr>
                                  <th className="p-1.5 border-r border-slate-300 w-24">SE91 ID</th>
                                  <th className="p-1.5 border-r border-slate-300 w-14 text-center">Type</th>
                                  <th className="p-1.5 border-r border-slate-300">Message Text</th>
                                  <th className="p-1.5 w-36">Trigger Condition</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {spec.sap_messages.map((m) => (
                                  <tr key={m.id}>
                                    <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-slate-900">
                                      {m.msg_class}({m.msg_no})
                                    </td>
                                    <td className="p-1.5 border-r border-slate-200 text-center font-mono font-bold">{m.msg_type}</td>
                                    <td className="p-1.5 border-r border-slate-200 text-slate-800">{m.text}</td>
                                    <td className="p-1.5 font-mono text-slate-600">{m.trigger_condition}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {spec.performance_config && (
                          <div className="bg-slate-50 border border-slate-300 rounded p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] print-avoid-break">
                            <div>
                              <span className="text-slate-500 block text-[10px]">Expected Volume</span>
                              <span className="font-semibold text-slate-800">{spec.performance_config.expected_volume || '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Recommended Indexes</span>
                              <span className="font-mono text-slate-800">{spec.performance_config.recommended_indexes || '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Batch / Spool (SY-BATCH)</span>
                              <span className="font-semibold text-slate-800">
                                {spec.performance_config.batch_supported ? 'Supported' : 'Not Supported'}
                                {spec.performance_config.spool_output ? ' · Spool' : ''}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">S/4HANA Pushdown</span>
                              <span className="font-semibold text-slate-800">
                                {spec.performance_config.use_hana_pushdown ? 'CDS / AMDP' : 'Open SQL'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </div>

                {renderRunningFooter(pageNo)}
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* TESTING & MOCK RESULT PAGE (Page 4 or Page 5 for 02/03 Detail Grid)       */}
          {/* ========================================================================= */}
          {(() => {
            const pageNo = hasDetailGrid ? 5 : 4;
            return (
              <div
                id={`sap-page-${pageNo}`}
                className={`${
                  isPageVisibleOnScreen(pageNo) ? 'sap-a4-sheet' : 'hidden print:sap-a4-sheet'
                } ${viewMode === 'all' ? 'mb-8 print:mb-0' : ''}`}
              >
                <div className="space-y-5">
                  {renderRunningHeader(pageNo)}

                  {/* SECTION 6: 테스트 케이스 명세 */}
                  <section className="space-y-2">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800 print-avoid-break">
                      <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                        06
                      </span>
                      <span>
                        6. Unit & Integration Test Cases
                      </span>
                    </h2>
                    <div className="border border-slate-300 rounded overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-[#e4edf7] border-b border-slate-300 text-slate-800 font-semibold text-[11px]">
                          <tr>
                            <th className="p-2 border-r border-slate-300 text-center w-10">No</th>
                            <th className="p-2 border-r border-slate-300 w-44">Scenario</th>
                            <th className="p-2 border-r border-slate-300">Condition</th>
                            <th className="p-2">Expected Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-[11px]">
                          {spec.test_cases.map((tc, idx) => (
                            <tr key={tc.id}>
                              <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="p-2 border-r border-slate-200 font-semibold text-slate-900">
                                {tc.scenario}
                              </td>
                              <td className="p-2 border-r border-slate-200 text-slate-700">
                                {tc.condition}
                              </td>
                              <td className="p-2 font-semibold text-emerald-800">
                                {tc.expected}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* SECTION 7: Mock Data Snapshot */}
                  {includeMockSnapshot && (
                    <section className="space-y-3">
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-1 border-b-2 border-slate-800 print-avoid-break">
                        <span className="px-1.5 py-0.5 rounded bg-blue-800 text-white font-mono text-[10px]">
                          07
                        </span>
                        <span>
                          7. ALV Grid Mock Data Snapshot
                        </span>
                      </h2>

                      {/* 7.1 Header Mock Data Table */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 print-avoid-break tabular-nums">
                          <span>
                            7.1{' '}
                            {isMasterDetail
                              ? 'Header ALV Grid Mock Data'
                              : 'ALV Grid Output'}{' '}
                            ({spec.mock_rows?.length || 0} rows)
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            ZICON Status &amp; DO_SUM Verification
                          </span>
                        </div>

                        <div className="border border-slate-300 rounded overflow-x-auto">
                          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                            <thead className="bg-[#d8e4f0] border-b border-slate-300 text-slate-900 font-semibold text-[11px]">
                              <tr>
                                <th className="p-1.5 border-r border-slate-300 w-8 text-center bg-[#c8d8ea]">
                                  #
                                </th>
                                {spec.field_catalog.map((f) => (
                                  <th
                                    key={f.fieldname}
                                    className="p-1.5 border-r border-slate-300"
                                  >
                                    {f.coltext}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                              {(spec.mock_rows || []).slice(0, 8).map((row, rIdx) => {
                                const isZebra = !!spec.layout?.zebra && rIdx % 2 === 1;
                                return (
                                  <tr
                                    key={rIdx}
                                    className={isZebra ? 'bg-[#f8fafc]' : 'bg-white'}
                                  >
                                    <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-semibold bg-slate-100">
                                      {rIdx + 1}
                                    </td>
                                    {spec.field_catalog.map((f) => {
                                      const val = row[f.fieldname];
                                      const isStatusField =
                                        f.fieldname === 'ZICON' ||
                                        f.fieldname === 'STATUS' ||
                                        f.fieldname === 'LIGHTS' ||
                                        f.coltext === '상태';

                                      const cellStyle = getSapAlvCellStyle(
                                        f.emphasize,
                                        f.key,
                                        false,
                                        isZebra
                                      );

                                      return (
                                        <td
                                          key={f.fieldname}
                                          className={`p-1.5 border-r border-slate-200 ${
                                            f.just === 'R'
                                              ? 'text-right'
                                              : f.just === 'C'
                                              ? 'text-center'
                                              : 'text-left'
                                          } ${cellStyle.bg} ${cellStyle.text}`}
                                        >
                                          {isStatusField ||
                                          val === '1' ||
                                          val === '2' ||
                                          val === '3' ? (
                                            <div className="flex items-center justify-center">
                                              {val === '1' || val === 1 ? (
                                                <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />
                                              ) : val === '2' || val === 2 ? (
                                                <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />
                                              ) : (
                                                <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />
                                              )}
                                            </div>
                                          ) : (
                                            <span>
                                              {typeof val === 'number'
                                                ? val.toLocaleString()
                                                : val !== undefined && val !== null
                                                ? String(val)
                                                : ''}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>

                            {/* Header Total Row */}
                            {spec.field_catalog.some((f) => f.do_sum) && (
                              <tfoot className="bg-[#e4edf7] border-t-2 border-slate-400 font-bold text-slate-900">
                                <tr>
                                  <td className="p-1.5 border-r border-slate-300 text-center font-bold bg-[#c8d8ea]">
                                    Σ
                                  </td>
                                  {spec.field_catalog.map((f, idx) => {
                                    const hasSum = !!f.do_sum;
                                    const sumVal = headerTotals[f.fieldname];
                                    const isFirstCol =
                                      idx === 0 ||
                                      (idx === 1 &&
                                        (spec.field_catalog[0].fieldname === 'ZICON' ||
                                          spec.field_catalog[0].fieldname === 'STATUS'));
                                    return (
                                      <td
                                        key={f.fieldname}
                                        className={`p-1.5 border-r border-slate-300 font-mono ${
                                          hasSum
                                            ? 'text-right text-blue-900 font-extrabold bg-[#dbeafe]'
                                            : isFirstCol
                                            ? 'text-left text-slate-800'
                                            : 'text-center text-slate-400'
                                        }`}
                                      >
                                        {hasSum ? (
                                          <span>
                                            {Number(sumVal || 0).toLocaleString()}
                                          </span>
                                        ) : isFirstCol ? (
                                          <span>Total</span>
                                        ) : (
                                          ''
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>

                      {/* 7.2 Detail Mock Data Table (Sample 02 Master-Detail or Sample 03 Tree+Detail) */}
                      {hasDetailGrid &&
                        spec.item_grid &&
                        spec.item_grid.mock_rows && (
                          <div className="space-y-1.5 pt-2">
                            <div className="flex items-center justify-between text-xs font-bold text-indigo-950 print-avoid-break tabular-nums">
                              <span>
                                7.2 {spec.item_grid.grid_name || 'Item / Detail ALV Grid'} Mock Data ({spec.item_grid.mock_rows.length} rows)
                              </span>
                              <span className="text-[10px] font-mono text-indigo-700">
                                {isTreeWithDetail ? 'Tree-Linked Detail Schedule' : `Foreign Key: ${spec.item_grid.foreign_key || 'VBELN'}`}
                              </span>
                            </div>

                            <div className="border border-indigo-200 rounded overflow-x-auto">
                              <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                                <thead className="bg-[#e0e7ff] border-b border-indigo-200 text-indigo-950 font-semibold text-[11px]">
                                  <tr>
                                    <th className="p-1.5 border-r border-indigo-200 w-8 text-center bg-[#c7d2fe]">
                                      #
                                    </th>
                                    {spec.item_grid.field_catalog.map((f) => (
                                      <th
                                        key={f.fieldname}
                                        className="p-1.5 border-r border-indigo-200"
                                      >
                                        {f.coltext}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-indigo-100 font-mono text-[11px]">
                                  {spec.item_grid.mock_rows.slice(0, 6).map((row, rIdx) => {
                                    const isZebra =
                                      !!spec.item_grid?.layout?.zebra && rIdx % 2 === 1;
                                    return (
                                      <tr
                                        key={rIdx}
                                        className={isZebra ? 'bg-indigo-50/30' : 'bg-white'}
                                      >
                                        <td className="p-1.5 border-r border-indigo-100 text-center text-slate-500 font-semibold bg-indigo-50/60">
                                          {rIdx + 1}
                                        </td>
                                        {spec.item_grid!.field_catalog.map((f) => {
                                          const val = row[f.fieldname];
                                          const isStatusField =
                                            f.fieldname === 'ZICON' ||
                                            f.fieldname === 'STATUS' ||
                                            f.fieldname === 'LIGHTS' ||
                                            f.coltext === '상태';

                                          return (
                                            <td
                                              key={f.fieldname}
                                              className={`p-1.5 border-r border-indigo-100 ${
                                                f.just === 'R'
                                                  ? 'text-right'
                                                  : f.just === 'C'
                                                  ? 'text-center'
                                                  : 'text-left'
                                              }`}
                                            >
                                              {isStatusField ||
                                              val === '1' ||
                                              val === '2' ||
                                              val === '3' ? (
                                                <div className="flex items-center justify-center">
                                                  {val === '1' || val === 1 ? (
                                                    <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />
                                                  ) : val === '2' || val === 2 ? (
                                                    <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />
                                                  ) : (
                                                    <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />
                                                  )}
                                                </div>
                                              ) : (
                                                <span>
                                                  {typeof val === 'number'
                                                    ? val.toLocaleString()
                                                    : val !== undefined && val !== null
                                                    ? String(val)
                                                    : ''}
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>

                                {/* Item Total Row */}
                                {spec.item_grid.field_catalog.some((f) => f.do_sum) && (
                                  <tfoot className="bg-[#e0e7ff] border-t-2 border-indigo-300 font-bold text-indigo-950">
                                    <tr>
                                      <td className="p-1.5 border-r border-indigo-200 text-center font-bold bg-[#c7d2fe]">
                                        Σ
                                      </td>
                                      {spec.item_grid.field_catalog.map((f, idx) => {
                                        const hasSum = !!f.do_sum;
                                        const sumVal = itemTotals[f.fieldname];
                                        const isFirstCol =
                                          idx === 0 ||
                                          (idx === 1 &&
                                            (spec.item_grid!.field_catalog[0].fieldname ===
                                              'ZICON' ||
                                              spec.item_grid!.field_catalog[0].fieldname ===
                                                'STATUS'));
                                        return (
                                          <td
                                            key={f.fieldname}
                                            className={`p-1.5 border-r border-indigo-200 font-mono ${
                                              hasSum
                                                ? 'text-right text-indigo-950 font-extrabold bg-[#c7d2fe]'
                                                : isFirstCol
                                                ? 'text-left text-slate-800'
                                                : 'text-center text-slate-400'
                                            }`}
                                          >
                                            {hasSum ? (
                                              <span>
                                                {Number(sumVal || 0).toLocaleString()}
                                              </span>
                                            ) : isFirstCol ? (
                                              <span>Total</span>
                                            ) : (
                                              ''
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        )}
                    </section>
                  )}

                  {/* DOCUMENT COMPLIANCE & SIGN-OFF STATEMENT */}
                  <div className="border border-slate-300 bg-slate-50 p-3 rounded text-[11px] text-slate-600 space-y-1 print-avoid-break">
                    <p className="font-bold text-slate-800">
                      This functional specification complies with SAP S/4HANA development standards and unit test guidelines.
                    </p>
                    <p>
                      All ALV field attributes (LVC_T_FCAT) and domain types align with the SAP Data Dictionary (SE11) and are approved for production transport upon sign-off.
                    </p>
                  </div>
                </div>

                {renderRunningFooter(pageNo)}
              </div>
            );
          })()}
        </div>
      </div>

      {/* jsPDF Specification Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        spec={spec}
      />
    </div>
  );
};
