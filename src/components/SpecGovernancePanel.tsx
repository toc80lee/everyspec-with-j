import React, { useMemo, useState } from 'react';
import {
  AlvField,
  ProgramSpec,
  SapAuthorityCheckItem,
  SapMessageDefinition,
  SapPerformanceConfig,
  SapPivotConfig,
  SapTreeConfig,
  SelectionParameter,
} from '../types/sap';
import {
  SpecValidationIssue,
  analyzeS4HanaCompatibility,
  suggestAbapSelectionName,
  validateFullProgramSpec,
  validateProjectNamingStandards,
} from '../utils/sapValidation';
import { COMMON_PROJECT_CODE, getProjectAbapStandards } from '../utils/projectStorage';
import { InspectableSelect } from './InspectableSelect';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Info,
  MessageSquareCode,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  TreeDeciduous,
  Table2,
  Wand2,
} from 'lucide-react';

interface SpecGovernancePanelProps {
  spec: ProgramSpec;
  isReadOnly: boolean;
  onChange: (updated: ProgramSpec) => void;
}

export const SpecGovernancePanel: React.FC<SpecGovernancePanelProps> = ({
  spec,
  isReadOnly,
  onChange,
}) => {
  const [expandedDiagId, setExpandedDiagId] = useState<string | null>(null);
  const projectStandards = useMemo(
    () => getProjectAbapStandards(spec.project_code),
    [spec.project_code]
  );

  const report = useMemo(() => {
    const base = validateFullProgramSpec(spec);
    const namingIssues =
      spec.project_code && spec.project_code !== COMMON_PROJECT_CODE
        ? validateProjectNamingStandards(spec, projectStandards)
        : [];
    const mergedIssues = [...namingIssues, ...base.issues];
    return {
      ...base,
      issues: mergedIssues,
      errorCount: mergedIssues.filter((i) => i.severity === 'error').length,
      warningCount: mergedIssues.filter((i) => i.severity === 'warning').length,
    };
  }, [spec, projectStandards]);

  const s4Diagnostics = useMemo(() => analyzeS4HanaCompatibility(spec), [spec]);

  const handleAutoFix = (issue: SpecValidationIssue) => {
    if (isReadOnly || !issue.targetField || !issue.suggestedValue) return;
    if (issue.targetField === 'program_id') {
      onChange({ ...spec, program_id: issue.suggestedValue });
      return;
    }
    if (issue.targetField === 'tcode') {
      onChange({ ...spec, tcode: issue.suggestedValue });
      return;
    }
    if (issue.targetField.startsWith('sel:')) {
      const paramId = issue.targetField.slice(4);
      const nextParams: SelectionParameter[] = (spec.selection_params || []).map((p) =>
        p.id === paramId
          ? { ...p, name: suggestAbapSelectionName(p.name, p.kind) }
          : p
      );
      onChange({ ...spec, selection_params: nextParams });
    }
  };

  // Authority checks helpers
  const authChecks = spec.authority_checks || [];
  const handleAddAuth = () => {
    const newItem: SapAuthorityCheckItem = {
      id: `auth-${Date.now()}`,
      object: spec.module === 'FI' ? 'F_BKPF_BUK' : spec.module === 'MM' ? 'M_BEST_WRK' : 'V_VBAK_VKO',
      description: 'Org / Company code view authority check',
      fields: "ACTVT = '03'",
      trigger_point: 'START-OF-SELECTION',
    };
    onChange({ ...spec, authority_checks: [...authChecks, newItem] });
  };

  const handleUpdateAuth = (id: string, patch: Partial<SapAuthorityCheckItem>) => {
    onChange({
      ...spec,
      authority_checks: authChecks.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };

  const handleDeleteAuth = (id: string) => {
    onChange({ ...spec, authority_checks: authChecks.filter((a) => a.id !== id) });
  };

  // SE91 Message helpers
  const sapMessages = spec.sap_messages || [];
  const handleAddMessage = () => {
    const nextNo = String(sapMessages.length + 1).padStart(3, '0');
    const newItem: SapMessageDefinition = {
      id: `msg-${Date.now()}`,
      msg_class: spec.message_class || 'Z01',
      msg_no: nextNo,
      msg_type: 'E',
      text: 'No data found matching &1.',
      trigger_condition: 'END-OF-SELECTION (gt_alv IS INITIAL)',
    };
    onChange({ ...spec, sap_messages: [...sapMessages, newItem] });
  };

  const handleUpdateMessage = (id: string, patch: Partial<SapMessageDefinition>) => {
    onChange({
      ...spec,
      sap_messages: sapMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };

  const handleDeleteMessage = (id: string) => {
    onChange({ ...spec, sap_messages: sapMessages.filter((m) => m.id !== id) });
  };

  // Performance config helper
  const perf: SapPerformanceConfig = spec.performance_config || {};
  const updatePerf = (patch: Partial<SapPerformanceConfig>) => {
    onChange({ ...spec, performance_config: { ...perf, ...patch } });
  };

  // Tree & Pivot configs
  const treeCfg: SapTreeConfig = spec.tree_config || {};
  const updateTreeCfg = (patch: Partial<SapTreeConfig>) => {
    onChange({ ...spec, tree_config: { ...treeCfg, ...patch } });
  };

  const pivotCfg: SapPivotConfig = spec.pivot_config || {};
  const updatePivotCfg = (patch: Partial<SapPivotConfig>) => {
    onChange({ ...spec, pivot_config: { ...pivotCfg, ...patch } });
  };

  // Non-ZICON fields for selector suggestions
  const candidateFields: AlvField[] = (spec.field_catalog || []).filter((f) => f.fieldname !== 'ZICON');

  return (
    <div className="space-y-4">
      {/* 1. Real-Time SAP Validation Diagnostics */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {report.errorCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            ) : report.warningCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <h4 className="text-xs font-bold text-slate-800">
              SAP Compliance Diagnostics
            </h4>
            <span
              title="Validates Z/Y naming rules, 8-char selection names, CFIELDNAME/QFIELDNAME references, and foreign keys in real time."
              className="text-slate-400 hover:text-slate-600 cursor-help"
            >
              <Info className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
            {report.issues.length === 0 ? (
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                All Passed
              </span>
            ) : (
              <>
                {report.errorCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    Errors {report.errorCount}
                  </span>
                )}
                {report.warningCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Warnings {report.warningCount}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {report.issues.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {report.issues.map((issue) => (
              <div
                key={issue.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  issue.severity === 'error'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : issue.severity === 'warning'
                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                    : 'bg-blue-50/70 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 rounded bg-white/80 border border-current/20 text-[10px] font-bold shrink-0">
                    {issue.section}
                  </span>
                  <span className="truncate sm:whitespace-normal">{issue.message}</span>
                </div>
                {!isReadOnly && issue.autoFixLabel && issue.targetField && (
                  <button
                    type="button"
                    onClick={() => handleAutoFix(issue)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3 text-blue-600" />
                    {issue.autoFixLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 1B. S/4HANA Simplification & Performance Diagnostics */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-800">
              S/4HANA Compatibility & Performance
            </h4>
            <span
              title="Detects legacy ECC tables (BSEG, KONV, MKPF/MSEG, VBUK, etc.) and recommends S/4HANA replacements (ACDOCA, PRCD_ELEMENTS, MATDOC) and CDS Views."
              className="text-slate-400 hover:text-slate-600 cursor-help"
            >
              <Info className="w-3.5 h-3.5" />
            </span>
          </div>
          {s4Diagnostics.length === 0 ? (
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-semibold">
              Compatible
            </span>
          ) : (
            <span className="font-mono tabular-nums text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              {s4Diagnostics.length} Advisories
            </span>
          )}
        </div>

        {s4Diagnostics.length > 0 && (
          <div className="space-y-1.5">
            {s4Diagnostics.map((diag) => {
              const isOpen = expandedDiagId === diag.id;
              return (
                <div
                  key={diag.id}
                  className={`px-3 py-2 rounded-lg border text-xs ${
                    diag.severity === 'warning'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedDiagId(isOpen ? null : diag.id)}
                    className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="font-bold flex items-center gap-2 min-w-0">
                      <span className="font-mono text-indigo-700 shrink-0">{diag.detectedTable}</span>
                      <span className="truncate">{diag.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] font-semibold text-emerald-700">
                        → {diag.s4Replacement}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5 pt-1.5 border-t border-slate-200/70">
                      {diag.recommendation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. ABAP Syntax & SE91 Class + HANA Performance Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <Cpu className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            ABAP Syntax · Batch (SY-BATCH) · S/4HANA Performance
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              ABAP Syntax Mode
            </label>
            <InspectableSelect
              isReadOnly={isReadOnly}
              aria-label="ABAP Syntax Mode"
              value={spec.abap_syntax_mode || 'modern_740'}
              onChange={(e) => {
                if (!isReadOnly) {
                  onChange({ ...spec, abap_syntax_mode: e.target.value as 'classic' | 'modern_740' });
                }
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="classic">Classic ABAP (ECC 6.0 Compatible)</option>
              <option value="modern_740">Modern ABAP 7.40+ (INLINE / VALUE #)</option>
            </InspectableSelect>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Message Class (SE91)
            </label>
            <input
              type="text"
              readOnly={isReadOnly}
              value={spec.message_class || 'Z01'}
              onChange={(e) => {
                if (!isReadOnly) {
                  onChange({ ...spec, message_class: e.target.value.toUpperCase().slice(0, 20) });
                }
              }}
              placeholder="e.g., Z01, ZSD01"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Estimated Data Volume
            </label>
            <input
              type="text"
              readOnly={isReadOnly}
              value={perf.expected_volume || ''}
              onChange={(e) => {
                if (!isReadOnly) updatePerf({ expected_volume: e.target.value });
              }}
              placeholder="e.g., 50K rows/day · 1.5M/month"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Recommended DB Index / Keys
            </label>
            <input
              type="text"
              readOnly={isReadOnly}
              value={perf.recommended_indexes || ''}
              onChange={(e) => {
                if (!isReadOnly) updatePerf({ recommended_indexes: e.target.value });
              }}
              placeholder="e.g., BSEG~Z01 (BUKRS, GJAHR, BUDAT)"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              CDS View / AMDP Pushdown Notes
            </label>
            <input
              type="text"
              readOnly={isReadOnly}
              value={perf.cds_or_amdp_notes || ''}
              onChange={(e) => {
                if (!isReadOnly) updatePerf({ cds_or_amdp_notes: e.target.value });
              }}
              placeholder="e.g., HANA pushdown aggregation via I_JournalEntryItem"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={isReadOnly}
              checked={Boolean(perf.batch_supported)}
              onChange={(e) => updatePerf({ batch_supported: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            Background Batch Execution (SM36/SM37)
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={isReadOnly}
              checked={Boolean(perf.spool_output)}
              onChange={(e) => updatePerf({ spool_output: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            Spool List Output on SY-BATCH = 'X'
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={isReadOnly}
              checked={Boolean(perf.use_hana_pushdown)}
              onChange={(e) => updatePerf({ use_hana_pushdown: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            S/4HANA Code-to-Data (CDS/AMDP Pushdown)
          </label>
        </div>
      </div>

      {/* 3. Sample 03 / 04 Specialized Dynamic Config */}
      {spec.sample_type === '03' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <TreeDeciduous className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Sample 03 · Tree ALV Hierarchy Config (CL_GUI_ALV_TREE)
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Root Node Label
              </label>
              <input
                type="text"
                readOnly={isReadOnly}
                value={treeCfg.root_label || ''}
                onChange={(e) => {
                  if (!isReadOnly) updateTreeCfg({ root_label: e.target.value });
                }}
                placeholder="e.g., All Orgs / AIRPLANE"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Group Field
              </label>
              <InspectableSelect
                isReadOnly={isReadOnly}
                aria-label="Group Field"
                value={treeCfg.group_field || ''}
                onChange={(e) => {
                  if (!isReadOnly) updateTreeCfg({ group_field: e.target.value });
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Auto (First Key Field)</option>
                {candidateFields.map((f) => (
                  <option key={f.id} value={f.fieldname}>
                    {f.fieldname} ({f.coltext})
                  </option>
                ))}
              </InspectableSelect>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Group Label Field (Optional)
              </label>
              <InspectableSelect
                isReadOnly={isReadOnly}
                aria-label="Group Label Field"
                value={treeCfg.group_label_field || ''}
                onChange={(e) => {
                  if (!isReadOnly) updateTreeCfg({ group_label_field: e.target.value });
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">(Show Key Code As-Is)</option>
                {candidateFields.map((f) => (
                  <option key={f.id} value={f.fieldname}>
                    {f.fieldname} ({f.coltext})
                  </option>
                ))}
              </InspectableSelect>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Node Icon Style
              </label>
              <InspectableSelect
                isReadOnly={isReadOnly}
                aria-label="Node Icon Style"
                value={treeCfg.node_icon || 'folder'}
                onChange={(e) => {
                  if (!isReadOnly) {
                    updateTreeCfg({
                      node_icon: e.target.value as 'plane' | 'folder' | 'building' | 'doc',
                    });
                  }
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="folder">Folder</option>
                <option value="building">Org / Plant (Building)</option>
                <option value="doc">Document</option>
                <option value="plane">Airline / Logistics (Plane)</option>
              </InspectableSelect>
            </div>
          </div>
        </div>
      )}

      {spec.sample_type === '04' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Table2 className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Sample 04 · Pivot Browser Config (Pivot / CDS Engine)
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Source CDS View / Table
              </label>
              <input
                type="text"
                readOnly={isReadOnly}
                value={pivotCfg.source_table_or_cds || spec.cds_view_table || ''}
                onChange={(e) => {
                  if (isReadOnly) return;
                  const val = e.target.value.toUpperCase();
                  onChange({
                    ...spec,
                    cds_view_table: val,
                    pivot_config: { ...pivotCfg, source_table_or_cds: val },
                  });
                }}
                placeholder="e.g., I_JOURNALENTRYITEM, ACDOCA"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Default Dimensions (comma-separated)
              </label>
              <input
                type="text"
                readOnly={isReadOnly}
                value={(pivotCfg.default_dimensions || []).join(', ')}
                onChange={(e) => {
                  if (isReadOnly) return;
                  updatePivotCfg({
                    default_dimensions: e.target.value
                      .split(',')
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean),
                  });
                }}
                placeholder="e.g., RBUKRS, GJAHR, RACCT"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Default Measures (comma-separated)
              </label>
              <input
                type="text"
                readOnly={isReadOnly}
                value={(pivotCfg.default_measures || []).join(', ')}
                onChange={(e) => {
                  if (isReadOnly) return;
                  updatePivotCfg({
                    default_measures: e.target.value
                      .split(',')
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean),
                  });
                }}
                placeholder="e.g., HSL, KSL, MENGE"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. AUTHORITY-CHECK Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Authority Check Objects (AUTHORITY-CHECK)
            </h4>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddAuth}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Object
            </button>
          )}
        </div>

        {authChecks.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            No authority check objects defined. (e.g., F_BKPF_BUK, V_VBAK_VKO, M_BEST_WRK)
          </p>
        ) : (
          <div className="space-y-2">
            {authChecks.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2"
              >
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={item.object}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateAuth(item.id, { object: e.target.value.toUpperCase() });
                  }}
                  placeholder="Auth Object (F_BKPF_BUK)"
                  className="md:col-span-3 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono uppercase read-only:bg-slate-100 read-only:text-slate-600"
                />
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={item.fields}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateAuth(item.id, { fields: e.target.value });
                  }}
                  placeholder="Fields (BUKRS = P_BUKRS, ACTVT = '03')"
                  className="md:col-span-4 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono read-only:bg-slate-100 read-only:text-slate-600"
                />
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={item.trigger_point}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateAuth(item.id, { trigger_point: e.target.value });
                  }}
                  placeholder="Trigger Point"
                  className="md:col-span-2 bg-white border border-slate-300 rounded px-2 py-1 text-xs read-only:bg-slate-100 read-only:text-slate-600"
                />
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={item.description}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateAuth(item.id, { description: e.target.value });
                  }}
                  placeholder="Description"
                  className="md:col-span-2 bg-white border border-slate-300 rounded px-2 py-1 text-xs read-only:bg-slate-100 read-only:text-slate-600"
                />
                <div className="md:col-span-1 flex justify-end">
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAuth(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. SE91 Messages Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareCode className="w-4 h-4 text-violet-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Message Definitions (SE91 Message Class)
            </h4>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddMessage}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Message
            </button>
          )}
        </div>

        {sapMessages.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            No SE91 error or info messages defined.
          </p>
        ) : (
          <div className="space-y-2">
            {sapMessages.map((msg) => (
              <div
                key={msg.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2"
              >
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={msg.msg_class}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateMessage(msg.id, { msg_class: e.target.value.toUpperCase() });
                  }}
                  placeholder="Z01"
                  className="md:col-span-2 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono uppercase read-only:bg-slate-100 read-only:text-slate-600"
                />
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={msg.msg_no}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateMessage(msg.id, { msg_no: e.target.value.slice(0, 3) });
                  }}
                  placeholder="001"
                  className="md:col-span-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono text-center read-only:bg-slate-100 read-only:text-slate-600"
                />
                <div className="md:col-span-1">
                  <InspectableSelect
                    isReadOnly={isReadOnly}
                    aria-label="Message Type"
                    value={msg.msg_type}
                    onChange={(e) => {
                      if (!isReadOnly) {
                        handleUpdateMessage(msg.id, { msg_type: e.target.value as 'E' | 'W' | 'I' | 'S' });
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold"
                  >
                    <option value="E">E</option>
                    <option value="W">W</option>
                    <option value="I">I</option>
                    <option value="S">S</option>
                  </InspectableSelect>
                </div>
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={msg.text}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateMessage(msg.id, { text: e.target.value });
                  }}
                  placeholder="Message text (&1 placeholder supported)"
                  className="md:col-span-5 bg-white border border-slate-300 rounded px-2 py-1 text-xs read-only:bg-slate-100 read-only:text-slate-600"
                />
                <input
                  type="text"
                  readOnly={isReadOnly}
                  value={msg.trigger_condition}
                  onChange={(e) => {
                    if (!isReadOnly) handleUpdateMessage(msg.id, { trigger_condition: e.target.value });
                  }}
                  placeholder="Trigger Condition"
                  className="md:col-span-2 bg-white border border-slate-300 rounded px-2 py-1 text-xs read-only:bg-slate-100 read-only:text-slate-600"
                />
                <div className="md:col-span-1 flex justify-end">
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
