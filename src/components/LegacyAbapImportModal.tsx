import React, { useState } from 'react';
import { ProgramSpec } from '../types/sap';
import { requestLegacyAbapImport } from '../utils/aiLogicGenerator';
import { Code2, FileUp, Loader2, Sparkles, X, CheckCircle2, ShieldAlert } from 'lucide-react';

interface LegacyAbapImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRelease: string;
  currentProjectCode: string;
  currentUserName: string;
  onImportSpec: (importedSpec: ProgramSpec) => void;
}

const SAMPLE_LEGACY_ABAP = `REPORT zr_sd_backlog_rep.
TABLES: vbak, vbap, kna1.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_vkorg TYPE vbak-vkorg OBLIGATORY DEFAULT '1000'.
SELECT-OPTIONS: s_vbeln FOR vbak-vbeln,
                s_erdat FOR vbak-erdat OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD p_vkorg
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e001(z01) WITH p_vkorg.
  ENDIF.

  SELECT a~vbeln a~erdat a~kunnr a~netwr a~waerk b~name1
    INTO CORRESPONDING FIELDS OF TABLE gt_alv
    FROM vbak AS a
    INNER JOIN kna1 AS b ON a~kunnr = b~kunnr
    WHERE a~vkorg = p_vkorg
      AND a~vbeln IN s_vbeln
      AND a~erdat IN s_erdat.`;

export const LegacyAbapImportModal: React.FC<LegacyAbapImportModalProps> = ({
  isOpen,
  onClose,
  targetRelease,
  currentProjectCode,
  currentUserName,
  onImportSpec,
}) => {
  const [abapSource, setAbapSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    spec: ProgramSpec;
    detectedTables: string[];
    source: 'ai' | 'fallback';
  } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAbapSource(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!abapSource.trim()) {
      setErrorMsg('Please enter ABAP source code or SE11 structure to analyze.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await requestLegacyAbapImport(abapSource, targetRelease);
      setPreviewResult({
        spec: {
          ...res.spec,
          project_code: currentProjectCode === 'COMMON' || currentProjectCode === 'COMM' ? 'TEMP' : currentProjectCode,
          author: currentUserName,
          status: 'draft',
        },
        detectedTables: res.detectedTables,
        source: res.source,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse legacy ABAP source.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">Reverse Import Legacy ABAP / SE11</h3>
              <p className="text-[11px] text-slate-300">
                Paste REPORT, TOP, SELECT-OPTIONS, or AUTHORITY-CHECK code to extract a Program Spec.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" />
                Upload .abap / .txt
                <input
                  type="file"
                  accept=".abap,.txt,.inc"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setAbapSource(SAMPLE_LEGACY_ABAP)}
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200"
              >
                Load Sample ABAP
              </button>
            </div>

            <button
              type="button"
              disabled={loading || !abapSource.trim()}
              onClick={handleAnalyze}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? 'Analyzing ABAP...' : 'Extract Spec'}
            </button>
          </div>

          <textarea
            value={abapSource}
            onChange={(e) => setAbapSource(e.target.value)}
            rows={10}
            placeholder="Paste ABAP source (REPORT z..., PARAMETERS: ..., SELECT-OPTIONS: ..., SELECT ... FROM ...)."
            className="w-full bg-slate-950 text-emerald-200 font-mono text-xs p-3.5 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {previewResult && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Extraction Complete ({previewResult.source === 'ai' ? 'AI Parser' : 'Deterministic Parser'})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {previewResult.detectedTables.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[10.5px] font-bold"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500">Program ID</div>
                  <div className="font-mono font-bold text-slate-800">{previewResult.spec.program_id}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500">Selection Params</div>
                  <div className="font-mono font-bold text-blue-700 tabular-nums">
                    {previewResult.spec.selection_params.length}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500">ALV Field Catalog</div>
                  <div className="font-mono font-bold text-emerald-700 tabular-nums">
                    {previewResult.spec.field_catalog.length}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500">Authority Checks</div>
                  <div className="font-mono font-bold text-violet-700 tabular-nums">
                    {(previewResult.spec.authority_checks || []).length}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!previewResult}
            onClick={() => {
              if (!previewResult) return;
              onImportSpec(previewResult.spec);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
          >
            Create Program from Spec
          </button>
        </div>
      </div>
    </div>
  );
};
