import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Wand2,
  X,
  Loader2,
  CheckCircle2,
  Database,
  Sliders,
  Table,
  Layers,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ProgramSpec, SapModule } from '../types/sap';
import { DEFAULT_ALV_TOOLBAR_BUTTONS } from '../data/defaultToolbarButtons';
import {
  requestAiFullSpecDraft,
  FullSpecDraftResponse,
  requestAiPatchSpec,
  applyAiPatchToSpec,
  AiSpecPatchResult,
} from '../utils/aiLogicGenerator';

interface AiSpecCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpec: ProgramSpec;
  onApplySpec: (generatedSpec: ProgramSpec) => void;
}

const QUICK_PROMPTS: {
  label: string;
  module: SapModule;
  sampleType: string;
  prompt: string;
}[] = [
  {
    label: 'SD Sales Order Delivery Delay',
    module: 'SD',
    sampleType: '01',
    prompt:
      'Query sales orders by sales org, document date, order number, and delivery status radio button (All/Open Only) displaying customer delivery status traffic lights, net value totals, and VA03 drilldown.',
  },
  {
    label: 'MM Purchase Order Master-Detail',
    module: 'MM',
    sampleType: '02',
    prompt:
      'Display PO headers (EKKO) in top grid by company code, plant, and PO date; row click loads PO items (EKPO) with open GR quantity and a custom MIGO goods receipt toolbar button.',
  },
  {
    label: 'FI Open AR Aging Analysis',
    module: 'FI',
    sampleType: '01',
    prompt:
      'Query open AR documents (BSID/BKPF/KNA1) by company code, posting date, and customer with overdue traffic-light alerts, local currency totals, FB03 drilldown, and batch clearing.',
  },
  {
    label: 'CO Cost Center Plan vs Actual',
    module: 'CO',
    sampleType: '04',
    prompt:
      'Analyze cost center plan vs actual amounts and variance % across cost elements (CSKS/COEP/COSP) by controlling area (KOKRS), fiscal year (GJAHR), and period (PERIO) in a pivot grid.',
  },
];

export const AiSpecCopilotModal: React.FC<AiSpecCopilotModalProps> = ({
  isOpen,
  onClose,
  currentSpec,
  onApplySpec,
}) => {
  const [copilotMode, setCopilotMode] = useState<'full' | 'patch'>('full');
  const [requirementPrompt, setRequirementPrompt] = useState('');
  const [selectedModule, setSelectedModule] = useState<SapModule | 'AUTO'>('AUTO');
  const [sampleType, setSampleType] = useState<string>(currentSpec.sample_type || '01');
  const [programId, setProgramId] = useState('');
  const [tcode, setTcode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<FullSpecDraftResponse | null>(null);
  const [patchResult, setPatchResult] = useState<{ patch: AiSpecPatchResult; source: 'ai' | 'fallback' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSampleType(currentSpec.sample_type || '01');
    }
  }, [isOpen, currentSpec.sample_type]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!requirementPrompt.trim()) {
      setErrorMsg(
        copilotMode === 'patch'
          ? 'Please enter modification instructions for the existing specification.'
          : 'Please enter business requirements for the SAP program.'
      );
      return;
    }
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      if (copilotMode === 'patch') {
        const res = await requestAiPatchSpec(requirementPrompt.trim(), currentSpec);
        setPatchResult({ patch: res.patch, source: res.source });
      } else {
        const targetProjectCode =
          currentSpec.project_code &&
          currentSpec.project_code !== 'COMMON' &&
          currentSpec.project_code !== 'COMM'
            ? currentSpec.project_code
            : 'TEMP';
        const res = await requestAiFullSpecDraft({
          requirementPrompt: requirementPrompt.trim(),
          module: selectedModule,
          sampleType,
          targetSapRelease: currentSpec.target_sap_release || 'SAP S/4HANA 2023 / ECC 6.0',
          programId: programId.trim() || undefined,
          tcode: tcode.trim() || undefined,
          projectCode: targetProjectCode,
        });
        setDraftResult(res);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to generate program specification.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPatch = () => {
    if (!patchResult?.patch) return;
    const patched = applyAiPatchToSpec(currentSpec, patchResult.patch);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    onApplySpec({
      ...patched,
      source_code: undefined,
      change_history: [
        ...(currentSpec.change_history || []),
        {
          id: `hist-patch-${Date.now()}`,
          version: `v1.${(currentSpec.change_history?.length || 0) + 1}`,
          changed_at: nowStr,
          author: currentSpec.author || 'Josh Lee',
          comment: `AI incremental patch: ${patchResult.patch.summary}`,
        },
      ],
    });
    onClose();
  };

  const handleApplyDraft = () => {
    if (!draftResult?.spec) return;
    const d = draftResult.spec;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const targetProjectCode =
      currentSpec.project_code &&
      currentSpec.project_code !== 'COMMON' &&
      currentSpec.project_code !== 'COMM'
        ? currentSpec.project_code
        : d.project_code && d.project_code !== 'COMMON' && d.project_code !== 'COMM'
        ? d.project_code
        : 'TEMP';
    const mergedSpec: ProgramSpec = {
      ...d,
      id: currentSpec.id,
      project_code: targetProjectCode,
      author: currentSpec.author || d.author,
      toolbar_buttons:
        d.toolbar_buttons && d.toolbar_buttons.length > 0
          ? d.toolbar_buttons
          : DEFAULT_ALV_TOOLBAR_BUTTONS.map((b) => ({ ...b })),
      source_code: undefined,
      change_history: [
        ...(currentSpec.change_history || []),
        {
          id: `hist-ai-${Date.now()}`,
          version: `v${((currentSpec.change_history?.length || 0) + 1).toFixed(1)}`,
          changed_at: nowStr,
          author: currentSpec.author || 'Josh Lee',
          comment: `AI Spec Copilot draft (${d.program_id} / ${d.module})`,
        },
      ],
    };
    onApplySpec(mergedSpec);
    onClose();
  };

  const draft = draftResult?.spec;
  const distinctBoxes = draft
    ? Array.from(new Set(draft.selection_params.map((p) => p.block_title).filter(Boolean)))
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">
                AI Spec Copilot (Requirements → Full Spec Draft)
              </h3>
              <p className="text-[11px] text-slate-300">
                Generates selection parameters, field catalog, extraction logic, data flow, and mock data from requirements.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Copilot Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setCopilotMode('full');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                copilotMode === 'full'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Draft
            </button>
            <button
              type="button"
              onClick={() => {
                setCopilotMode('patch');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                copilotMode === 'patch'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Incremental Patch
            </button>
          </div>

          {copilotMode === 'patch' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[11.5px] text-emerald-900">
              <b>Incremental Patch ({currentSpec.program_id})</b>: Preserves existing selection parameters, field catalog, and logic while appending requested items.
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  'Add Plant (S_WERKS) and Material Group (S_MATKL) to Selection Screen',
                  'Add Net Price (NETPR), Currency (WAERS), and Batch Approve toolbar button',
                  'Add V_VBAK_VKO authority check and SE91 no-data error message',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setRequirementPrompt(sample)}
                    className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 border border-emerald-300 text-[10.5px] text-emerald-800 cursor-pointer"
                  >
                    + {sample}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Presets (Full Mode) */}
          {copilotMode === 'full' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Quick Examples (Click to Populate)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      setRequirementPrompt(q.prompt);
                      setSelectedModule(q.module);
                      setSampleType(q.sampleType);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    [{q.module}] {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Requirement Input + Options */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1">
                Business Requirements <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={requirementPrompt}
                onChange={(e) => setRequirementPrompt(e.target.value)}
                placeholder="e.g., Design an ALV report displaying overdue purchase orders by company code, plant, and PO date with red traffic-light indicators and ME23N drilldown."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
              />
            </div>

            {copilotMode === 'full' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SAP Module</label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value as SapModule | 'AUTO')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="AUTO">Auto Detect</option>
                    <option value="SD">SD (Sales & Distribution)</option>
                    <option value="MM">MM (Materials Management)</option>
                    <option value="FI">FI (Financial Accounting)</option>
                    <option value="CO">CO (Controlling)</option>
                    <option value="PP">PP (Production Planning)</option>
                    <option value="HR">HR (Human Resources)</option>
                    <option value="QM">QM (Quality Management)</option>
                    <option value="PM">PM (Plant Maintenance)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Screen Pattern</label>
                  <select
                    value={sampleType}
                    onChange={(e) => setSampleType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="01">01 (Single ALV Grid)</option>
                    <option value="02">02 (Master-Detail ALV)</option>
                    <option value="03">03 (Tree ALV Grid)</option>
                    <option value="04">04 (Pivot Browser)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Program ID (Optional)</label>
                  <input
                    type="text"
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value.toUpperCase())}
                    placeholder="Auto (Z...)"
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">T-Code (Optional)</label>
                  <input
                    type="text"
                    value={tcode}
                    onChange={(e) => setTcode(e.target.value.toUpperCase())}
                    placeholder="Auto (Z...)"
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                {copilotMode === 'patch'
                  ? 'Review the incremental patch preview below before merging into the current spec.'
                  : 'Preview the generated spec below before applying it to the current program.'}
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{copilotMode === 'patch' ? 'Analyzing patch...' : 'Generating draft...'}</span>
                  </>
                ) : copilotMode === 'patch' ? (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>Generate Patch</span>
                  </>
                ) : draft ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Regenerate Draft</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>Generate Full Draft</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Generated Draft Preview */}
          {copilotMode === 'patch' && patchResult && (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900">{patchResult.patch.summary}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">
                  {patchResult.source === 'ai' ? 'AI Patch' : 'Deterministic Patch'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">Added Selection:</span>{' '}
                  <b>{patchResult.patch.add_selection_params?.length || 0}</b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">Added ALV Columns:</span>{' '}
                  <b>{patchResult.patch.add_field_catalog?.length || 0}</b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">Auth / Messages:</span>{' '}
                  <b>
                    {(patchResult.patch.add_authority_checks?.length || 0) +
                      (patchResult.patch.add_messages?.length || 0)}
                  </b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">Added Toolbar:</span>{' '}
                  <b>{patchResult.patch.add_toolbar_buttons?.length || 0}</b>
                </div>
              </div>
              {patchResult.patch.data_extraction_logic_append && (
                <pre className="bg-white border border-slate-200 rounded p-2.5 text-[11px] font-mono whitespace-pre-wrap text-slate-700">
                  {patchResult.patch.data_extraction_logic_append}
                </pre>
              )}
            </div>
          )}

          {copilotMode === 'full' && draft && (
            <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 text-sm">{draft.title}</span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-300 rounded text-blue-900">
                    {draft.program_id} / {draft.tcode}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded">
                    {draft.module} · Type {draft.sample_type}
                  </span>
                </div>
                {draftResult.detectedTables.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Database className="w-3.5 h-3.5 text-slate-500" />
                    {draftResult.detectedTables.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-blue-600" />
                    <span>Selection Screen</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.selection_params.length} fields ({distinctBoxes.length} boxes)
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Table className="w-3 h-3 text-indigo-600" />
                    <span>ALV Field Catalog</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.field_catalog.length} columns
                    {draft.item_grid ? ` + ${draft.item_grid.field_catalog.length} items` : ''}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-emerald-600" />
                    <span>Mock Data & Tests</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.mock_rows.length} rows · {draft.test_cases.length} TCs
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Custom Toolbar</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.custom_toolbar.length} custom buttons
                  </div>
                </div>
              </div>

              {/* Detail Preview Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                    Generated Selection Parameters
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {draft.selection_params.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded border border-slate-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] font-bold px-1 py-0.2 rounded bg-blue-100 text-blue-800 shrink-0">
                            {p.kind === 'SELECT_OPTION'
                              ? 'S-OPT'
                              : p.kind === 'RADIOBUTTON'
                              ? 'RADIO'
                              : p.kind === 'CHECKBOX'
                              ? 'CHK'
                              : 'PARAM'}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">{p.name}</span>
                          <span className="text-slate-600 truncate">{p.text}</span>
                        </div>
                        {p.block_title && (
                          <span className="text-[10px] text-slate-400 shrink-0 ml-2">{p.block_title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                    Generated ALV Columns (Field Catalog)
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {draft.field_catalog.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded border border-slate-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] text-slate-400 w-4 shrink-0">
                            {f.col_pos}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">
                            {f.fieldname}
                          </span>
                          <span className="text-slate-600 truncate">{f.coltext}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2 font-mono text-[10px]">
                          {f.key && <span className="px-1 bg-amber-100 text-amber-800 rounded font-bold">KEY</span>}
                          {f.hotspot && (
                            <span className="px-1 bg-indigo-100 text-indigo-800 rounded font-bold">
                              {f.drilldown_tcode || 'HOT'}
                            </span>
                          )}
                          {f.do_sum && <span className="px-1 bg-emerald-100 text-emerald-800 rounded font-bold">Σ</span>}
                          <span className="text-slate-500">{f.datatype}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-md font-semibold cursor-pointer"
          >
            Cancel
          </button>
          {copilotMode === 'patch' ? (
            <button
              type="button"
              disabled={!patchResult}
              onClick={handleApplyPatch}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-md font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Merge Patch</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!draft}
              onClick={handleApplyDraft}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-md font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Draft</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
