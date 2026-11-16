import React from 'react';
import { ExternalLink, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  tcode: string;
  fieldValue: string;
  fieldName: string;
  fieldLabel: string;
  rowRecord: Record<string, any>;
}

export const DrilldownModal: React.FC<DrilldownModalProps> = ({
  isOpen,
  onClose,
  tcode,
  fieldValue,
  fieldName,
  fieldLabel,
  rowRecord,
}) => {
  const { lang, t } = useLanguage();
  if (!isOpen) return null;

  const tcodeDescriptions: Record<string, string> = {
    VA03: t('Display Sales Order', '판매오더 조회'),
    VA02: t('Change Sales Order', '판매오더 변경'),
    ME23N: t('Display Purchase Order', '구매오더 조회'),
    ME22N: t('Change Purchase Order', '구매오더 변경'),
    XD03: t('Display Customer Master', '고객 마스터 조회'),
    XK03: t('Display Vendor Master', '공급업체 마스터 조회'),
    MM03: t('Display Material Master', '자재 마스터 조회'),
    FB03: t('Display Financial Document', '회계전표 조회'),
    FS03: t('Display G/L Account', 'G/L 계정 조회'),
    MIGO: t('Goods Movement', '자재 입출고 (MIGO)'),
  };

  const desc = tcodeDescriptions[tcode] || t(`${tcode} Transaction Screen`, `${tcode} 트랜잭션 화면`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded border border-slate-300 bg-white shadow-2xl overflow-hidden text-slate-800 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-indigo-800 px-4 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-sky-300" />
            <span className="font-semibold text-sm">{t('SAP Drilldown Simulation (Hotspot Navigation)', 'SAP 드릴다운 시뮬레이션 (Hotspot 이동)')}</span>
          </div>
          <button onClick={onClose} title={t('Close', '닫기')} aria-label={t('Close', '닫기')} className="rounded p-1 hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-blue-900">
                {t('Call Transaction:', '호출 트랜잭션:')} <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded border border-blue-300">{tcode}</span>
              </div>
              <div className="text-xs text-blue-800">{desc}</div>
              <p className="text-[11px] text-blue-700">
                {lang === 'ko' ? (
                  <>ALV 그리드에서 <span className="font-semibold">{fieldLabel}</span> ({fieldName}) 값 <span className="font-mono font-bold text-blue-900">"{fieldValue}"</span>을(를) 클릭하면 해당 SAP 표준 트랜잭션으로 이동합니다.</>
                ) : (
                  <>Clicking <span className="font-semibold">{fieldLabel}</span> ({fieldName}) with value <span className="font-mono font-bold text-blue-900">"{fieldValue}"</span> in the ALV grid navigates to this SAP standard transaction.</>
                )}
              </p>
            </div>
          </div>

          {/* ABAP Code snippet being executed */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('Executed ABAP Event Handler Logic', '실행된 ABAP 이벤트 핸들러 로직')}
            </div>
            <div className="p-3 bg-slate-900 text-slate-100 rounded font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800">
              <span className="text-blue-400">METHOD</span> handle_hotspot_click.<br />
              &nbsp;&nbsp;<span className="text-blue-400">CASE</span> e_column_id-fieldname.<br />
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-blue-400">WHEN</span> <span className="text-emerald-400">'{fieldName}'</span>.<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-slate-400">" Set SAP Memory ID parameter</span><br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-amber-300">SET PARAMETER ID</span> <span className="text-emerald-400">'{fieldName === 'VBELN' ? 'AUN' : fieldName === 'EBELN' ? 'BES' : fieldName === 'BELNR' ? 'BLN' : 'MAT'}'</span> <span className="text-amber-300">FIELD</span> <span className="text-sky-300">'{fieldValue}'</span>.<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-amber-300">CALL TRANSACTION</span> <span className="text-emerald-400">'{tcode}'</span> <span className="text-amber-300">AND SKIP FIRST SCREEN</span>.<br />
              &nbsp;&nbsp;<span className="text-blue-400">ENDCASE</span>.<br />
              <span className="text-blue-400">ENDMETHOD</span>.
            </div>
          </div>

          {/* Current Row Values */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('Selected Record Context', '선택된 레코드 컨텍스트')}
            </div>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px]">
              {Object.entries(rowRecord).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center px-1">
                  <span className="text-slate-500 font-mono">{k}:</span>
                  <span className="font-semibold text-slate-800 truncate ml-2">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
          >
            <span>{t('Done', '완료')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
