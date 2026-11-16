import React, { useState, useMemo, useEffect } from 'react';
import {
  Workflow,
  Sparkles,
  FileCode,
  RotateCcw,
  Info,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Check,
} from 'lucide-react';
import { DataFlowDiagramConfig, ProgramSpec } from '../types/sap';
import { MarkdownFieldEditor } from './MarkdownFieldEditor';
import { InspectableSelect } from './InspectableSelect';
import { useLanguage } from '../contexts/LanguageContext';
import {
  MermaidFlowChartSvg,
  MERMAID_TEMPLATES,
  parseMermaidCode,
  layoutMermaidDiagram,
  ParsedMermaidNode,
  ParsedMermaidEdge,
  LayoutedNode,
} from './MermaidFlowChartSvg';

export {
  MERMAID_TEMPLATES,
  parseMermaidCode,
  layoutMermaidDiagram,
};
export type { ParsedMermaidNode, ParsedMermaidEdge, LayoutedNode };

interface MermaidDataFlowEditorProps {
  spec: ProgramSpec;
  config?: DataFlowDiagramConfig;
  onChange: (updated: DataFlowDiagramConfig) => void;
  isReadOnly?: boolean;
}

export const MermaidDataFlowEditor: React.FC<MermaidDataFlowEditorProps> = ({
  spec,
  config,
  onChange,
  isReadOnly = false,
}) => {
  const { t } = useLanguage();
  // Initial default Mermaid code
  const initialCode = useMemo(() => {
    if (config?.mermaid_code && config.mermaid_code.trim()) {
      return config.mermaid_code;
    }
    if (spec.sample_type === '02') {
      return MERMAID_TEMPLATES.sample_02_master_detail.code;
    }
    if (spec.sample_type === '04') {
      return MERMAID_TEMPLATES.sample_04_cds_pivot.code;
    }
    return MERMAID_TEMPLATES.basic_condition.code;
  }, [config?.mermaid_code, spec.sample_type]);

  const [mermaidText, setMermaidText] = useState<string>(initialCode);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    config?.active_node_id || 'A'
  );
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof MERMAID_TEMPLATES>(
    spec.sample_type === '02'
      ? 'sample_02_master_detail'
      : spec.sample_type === '04'
      ? 'sample_04_cds_pivot'
      : 'sample_01_standard'
  );

  // Box Collapse/Expand states (RFQ v1.23: applied to all 3 sections)
  const [isCodeCollapsed, setIsCodeCollapsed] = useState<boolean>(false);
  const [isFlowChartCollapsed, setIsFlowChartCollapsed] = useState<boolean>(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);

  // Full Screen Modal State (RFQ v1.23)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // ESC key handler for full screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Parse Mermaid code
  const parsed = useMemo(() => {
    return parseMermaidCode(mermaidText);
  }, [mermaidText]);

  // Layout nodes
  const layoutedNodes = useMemo(() => {
    return layoutMermaidDiagram(parsed.nodes, parsed.edges, parsed.direction);
  }, [parsed]);

  // Ensure active node exists, default to first node if selected one is deleted
  const activeNode = useMemo(() => {
    const found = layoutedNodes.find((n) => n.id === selectedNodeId);
    if (found) return found;
    return layoutedNodes[0] || null;
  }, [layoutedNodes, selectedNodeId]);

  // Node details map (ID -> { label, markdown })
  const nodeDetails: Record<string, { label?: string; markdown: string }> = useMemo(() => {
    return (config?.node_details ||
      (spec.sample_type === '02'
        ? MERMAID_TEMPLATES.sample_02_master_detail.node_details
        : spec.sample_type === '04'
        ? MERMAID_TEMPLATES.sample_04_cds_pivot.node_details
        : MERMAID_TEMPLATES.basic_condition.node_details)) as Record<
      string,
      { label?: string; markdown: string }
    >;
  }, [config?.node_details, spec.sample_type]);

  // Sync mermaidText and selectedNodeId when switching between specs
  useEffect(() => {
    setMermaidText(initialCode);
    setSelectedNodeId(config?.active_node_id || 'A');
  }, [spec.id, initialCode, config?.active_node_id]);

  // Sync changes up to parent ProgramSpec
  const handleMermaidCodeChange = (newCode: string) => {
    if (isReadOnly) return;
    setMermaidText(newCode);
    onChange({
      ...(config || {}),
      mermaid_code: newCode,
      active_node_id: selectedNodeId,
    });
  };

  // Node Markdown update
  const handleNodeMarkdownChange = (nodeId: string, newMarkdown: string) => {
    if (isReadOnly) return;
    const node = layoutedNodes.find((n) => n.id === nodeId);
    const updatedDetails = {
      ...nodeDetails,
      [nodeId]: {
        label: node?.label || nodeId,
        markdown: newMarkdown,
      },
    };

    onChange({
      ...(config || {}),
      mermaid_code: mermaidText,
      node_details: updatedDetails,
      active_node_id: nodeId,
    });
  };

  // Select a preset template
  const applyTemplate = (templateKey: keyof typeof MERMAID_TEMPLATES) => {
    if (isReadOnly) return;
    const tpl = MERMAID_TEMPLATES[templateKey];
    setMermaidText(tpl.code);
    const firstNodeId = Object.keys(tpl.node_details)[0] || 'A';
    setSelectedNodeId(firstNodeId);

    onChange({
      ...(config || {}),
      mermaid_code: tpl.code,
      node_details: tpl.node_details,
      active_node_id: firstNodeId,
    });
  };

  // Quick append snippet
  const insertSnippet = (snippet: string) => {
    if (isReadOnly) return;
    const updated = mermaidText.trim() ? `${mermaidText}\n  ${snippet}` : snippet;
    handleMermaidCodeChange(updated);
  };

  const currentNodeMarkdown =
    activeNode && nodeDetails[activeNode.id]?.markdown !== undefined
      ? nodeDetails[activeNode.id].markdown
      : `### ${activeNode?.label || activeNode?.id || 'Step'} Detail Spec\n- **Purpose**: Describe business logic and processing scope for this step\n- **Inputs**: Selection parameters or upstream internal tables\n- **Outputs**: Downstream data or screen display updates`;

  return (
    <div className="space-y-3">
      {/* ========================================================================= */}
      {/* 1. Editor Box (RFQ v1.23: Title renamed to 'Editor', with Collapse/Expand) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden">
        {/* Unified Header */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCodeCollapsed(!isCodeCollapsed)}
              className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center font-bold text-xs shadow-xs transition-all cursor-pointer group"
              title={isCodeCollapsed ? t('Expand Editor', '에디터 펼치기') : t('Collapse Editor', '에디터 접기')}
            >
              <FileCode className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            </button>
            <div
              onClick={() => setIsCodeCollapsed(!isCodeCollapsed)}
              className="flex items-center gap-1.5 cursor-pointer select-none group"
              title={isCodeCollapsed ? t('Expand Editor', '에디터 펼치기') : t('Collapse Editor', '에디터 접기')}
            >
              <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Editor
              </h3>
              <span className="text-[11px] text-slate-500 font-normal tabular-nums">
                ({t(`${layoutedNodes.length} nodes, ${parsed.edges.length} edges`, `${layoutedNodes.length}개 노드, ${parsed.edges.length}개 연결`)})
              </span>
            </div>
          </div>

          {/* Template Selector List Box & Apply Button */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-600">{t('Template:', '템플릿:')}</span>
            <div className="w-44">
              <InspectableSelect
                isReadOnly={isReadOnly}
                value={selectedTemplate}
                onChange={(e) =>
                  setSelectedTemplate(e.target.value as keyof typeof MERMAID_TEMPLATES)
                }
                aria-label={t('Select Flow Chart template', '흐름도 템플릿 선택')}
                className="w-full px-2 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="basic_condition">{t('Basic Branching', '기본 분기형')}</option>
                <option value="sample_01_standard">{t('Type 01 (10 Steps)', 'Type 01 (10단계)')}</option>
                <option value="sample_02_master_detail">{t('Type 02 (Header / Item)', 'Type 02 (Header / Item)')}</option>
                {spec.sample_type === '04' && (
                  <option value="sample_04_cds_pivot">{t('Type 04 (CDS Pivot)', 'Type 04 (CDS 피벗)')}</option>
                )}
              </InspectableSelect>
            </div>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => applyTemplate(selectedTemplate)}
              title={isReadOnly ? t('Apply Template (Read-only)', '템플릿 적용 (읽기 전용)') : t('Apply Template', '템플릿 적용')}
              aria-label={t('Apply Template', '템플릿 적용')}
              className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Editor Body */}
        {!isCodeCollapsed && (
          <>
            {/* Quick Syntax Toolbar */}
            <div className="px-3 py-1.5 bg-slate-50/60 border-b border-slate-200 flex items-center gap-1.5 flex-wrap text-slate-700">
              <span className="text-[11px] font-semibold text-slate-400">{t('Quick Insert:', '빠른 삽입:')}</span>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => insertSnippet('A([Start])')}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded shadow-2xs cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('Start / End stadium node', '시작 / 종료 타원 노드')}
              >
                {t('+ Pill ([Start])', '+ 타원 ([시작])')}
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => insertSnippet('B[Process Task]')}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded shadow-2xs cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('Standard process rectangle node', '일반 처리 사각형 노드')}
              >
                {t('+ Rect [Task]', '+ 사각 [작업]')}
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => insertSnippet('C{Condition} -->|Yes| D[Success]')}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded shadow-2xs cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('Decision diamond branch node', '조건 분기 마름모 노드')}
              >
                {t('+ Diamond {Check}', '+ 마름모 {조건}')}
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => insertSnippet('E[(DB Table)]')}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded shadow-2xs cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('Database cylinder node', '데이터베이스 원통 노드')}
              >
                {t('+ Cylinder [(DB)]', '+ 원통 [(DB)]')}
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => insertSnippet('-->|Result| ')}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white hover:bg-slate-100 border border-slate-200 rounded shadow-2xs cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('Labeled arrow connector', '라벨 화살표 연결')}
              >
                {t('+ Arrow (-->)', '+ 화살표 (-->)')}
              </button>
            </div>

            {/* Monospace Pure White Textarea */}
            <div className="p-2.5 bg-white">
              <textarea
                value={mermaidText}
                readOnly={isReadOnly}
                onChange={(e) => handleMermaidCodeChange(e.target.value)}
                rows={5}
                className={`w-full text-slate-800 font-mono text-xs leading-relaxed p-2.5 border border-slate-200 rounded focus:border-blue-500 focus:outline-none resize-y selection:bg-blue-100 shadow-inner ${
                  isReadOnly ? 'bg-slate-50/50' : 'bg-white'
                }`}
                placeholder="graph TD;&#10;  A[Start] --> B{Condition};&#10;  B -->|Yes| C[Process];&#10;  B -->|No| D[Alternative];&#10;  C --> E[End];&#10;  D --> E;"
              />
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. Flow Chart Diagram (RFQ v1.23: Icon, Full Screen View & Collapse/Expand) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          {/* Left Title with Icon */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFlowChartCollapsed(!isFlowChartCollapsed)}
              className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center font-bold text-xs shadow-xs transition-all cursor-pointer group"
              title={isFlowChartCollapsed ? t('Expand Flow Chart', '흐름도 펼치기') : t('Collapse Flow Chart', '흐름도 접기')}
            >
              <Workflow className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            </button>
            <div
              onClick={() => setIsFlowChartCollapsed(!isFlowChartCollapsed)}
              className="flex items-center gap-1.5 cursor-pointer select-none group"
              title={isFlowChartCollapsed ? t('Expand Flow Chart', '흐름도 펼치기') : t('Collapse Flow Chart', '흐름도 접기')}
            >
              <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                {t('Flow Chart', '흐름도')}
              </span>
              <span className="text-[11px] text-slate-500 font-normal tabular-nums">
                ({t(`${layoutedNodes.length} steps`, `${layoutedNodes.length}개 단계`)})
              </span>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Full Screen Button (Icon-only) */}
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setIsFullscreen(true);
              }}
              className="p-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
              title={t('Full Screen', '전체 화면')}
              aria-label={t('Full Screen', '전체 화면')}
            >
              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
            </button>
          </div>
        </div>

        {/* SVG Canvas Area (Collapsible) */}
        {!isFlowChartCollapsed && (
          <div className="p-3 bg-[#fdfdfd] overflow-auto min-h-[360px] max-h-[500px]">
            <MermaidFlowChartSvg
              mermaidCode={mermaidText}
              nodeDetails={nodeDetails}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. Detailed Specification Box (RFQ v1.23: Collapse/Expand)                */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
              className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center font-mono font-bold text-xs shadow-xs transition-all cursor-pointer group"
              title={isDetailCollapsed ? t('Expand Detail Spec', '상세 사양서 펼치기') : t('Collapse Detail Spec', '상세 사양서 접기')}
            >
              <span className="group-hover:scale-110 transition-transform">
                {activeNode?.id || 'A'}
              </span>
            </button>
            <div
              onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
              className="cursor-pointer select-none group"
              title={isDetailCollapsed ? t('Expand Detail Spec', '상세 사양서 펼치기') : t('Collapse Detail Spec', '상세 사양서 접기')}
            >
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {t(`Node [${activeNode?.id || 'A'}] Detail Spec`, `노드 [${activeNode?.id || 'A'}] 상세 사양서`)}
                </h4>
              </div>
              <p className="text-[11px] text-slate-600 font-medium truncate max-w-[220px]">
                {activeNode?.label || t('Selected Step', '선택된 단계')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick SAP Event Template button (Icon-only) */}
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => {
                if (!activeNode || isReadOnly) return;
                const template = `### [${activeNode.id}] ${activeNode.label} Processing Spec\n\n#### 1. Event / Processing Purpose\n- Key trigger conditions and business logic for ${activeNode.label}\n\n#### 2. Database & Internal Tables\n- Source Tables: \`VBAK\`, \`VBAP\`\n- Target Internal Table: \`GT_DATA\`\n\n#### 3. Validation & Exception Handling\n- Trigger \`MESSAGE E001\` when mandatory criteria fail\n- Position cursor: \`SET CURSOR FIELD 'PA_BUKRS'\``;
                handleNodeMarkdownChange(activeNode.id, template);
              }}
              className="p-1.5 text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded flex items-center justify-center shadow-2xs cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title={isReadOnly ? t('Insert Standard Template (Read-only)', '표준 템플릿 삽입 (읽기 전용)') : t('Insert Standard Template', '표준 템플릿 삽입')}
              aria-label={t('Insert Standard Template', '표준 템플릿 삽입')}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            </button>
          </div>
        </div>

        {/* Collapsible content */}
        {!isDetailCollapsed && (
          <>
            {/* Description banner */}
            <div className="px-3 py-1.5 bg-blue-50/60 border-b border-blue-100 flex items-center gap-1.5 text-[11px] text-blue-900">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                {isReadOnly
                  ? t(
                      'Select a node above to inspect its step-level logic (read-only).',
                      '상단 다이어그램에서 노드를 선택하면 단계별 로직을 확인할 수 있습니다 (읽기 전용).'
                    )
                  : t(
                      'Synced with the selected node in the diagram above to document step logic independently.',
                      '상단 다이어그램의 선택된 노드와 연동되어 해당 단계의 로직 사양을 독립적으로 작성합니다.'
                    )}
              </span>
            </div>

            {/* Markdown Field Editor with 100% White Background */}
            <div className="p-3 bg-white flex-1 min-h-[380px]">
              {activeNode ? (
                <MarkdownFieldEditor
                  key={activeNode.id}
                  isReadOnly={isReadOnly}
                  value={currentNodeMarkdown}
                  onChange={(newVal) => handleNodeMarkdownChange(activeNode.id, newVal)}
                  rows={12}
                  minHeight="320px"
                  placeholder={t(
                    `Document business logic, tables, and exception handling for Node [${activeNode.id}] ${activeNode.label} in Markdown (# Heading, - List, **Bold**, \`Code\`)...`,
                    `노드 [${activeNode.id}] ${activeNode.label}의 업무 로직, 테이블, 예외 처리를 마크다운으로 작성하세요 (# 제목, - 목록, **굵게**, \`코드\`)...`
                  )}
                  aiContext={{
                    section: 'data_flow_node',
                    sectionTitle: `Node [${activeNode.id}] ${activeNode.label}`,
                    spec,
                    nodeInfo: {
                      id: activeNode.id,
                      label: activeNode.label,
                      shape: activeNode.shape,
                      prevNodes: parsed.edges
                        .filter((e) => e.to === activeNode.id)
                        .map((e) => {
                          const src = layoutedNodes.find((n) => n.id === e.from);
                          return `${e.from}: ${src?.label || e.from}${e.label ? ` (${e.label})` : ''}`;
                        }),
                      nextNodes: parsed.edges
                        .filter((e) => e.from === activeNode.id)
                        .map((e) => {
                          const dst = layoutedNodes.find((n) => n.id === e.to);
                          return `${e.to}: ${dst?.label || e.to}${e.label ? ` (${e.label})` : ''}`;
                        }),
                    },
                  }}
                />
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {t('Select a node in the diagram above.', '상단 다이어그램에서 노드를 선택하세요.')}
                </div>
              )}
            </div>

            {/* Footer note */}
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {isReadOnly
                  ? t(
                      'Read-only mode: copy to a project to edit node specs.',
                      '읽기 전용 모드: 프로젝트로 복사 후 노드 사양을 수정할 수 있습니다.'
                    )
                  : t(
                      'Node specs are auto-saved to Program Spec in real time.',
                      '노드별 사양서는 실시간으로 Program Spec에 자동 저장됩니다.'
                    )}
              </span>
              <span className="font-medium text-slate-700 tabular-nums">
                {t(
                  `${Object.keys(nodeDetails).length} node specs documented`,
                  `${Object.keys(nodeDetails).length}개 노드 사양 작성됨`
                )}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. Fullscreen Flow Chart Modal (RFQ v1.23)                                 */}
      {/* ========================================================================= */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full h-full max-w-[96vw] max-h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Workflow className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{t('Flow Chart', '흐름도')}</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      {t('Fullscreen', '전체 화면')}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      'Click a node to select or inspect its specification. (Press ESC or click Close)',
                      '노드를 클릭해 선택하거나 상세 사양을 확인하세요. (ESC 또는 닫기 클릭)'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center bg-white border border-slate-300 rounded-md px-1.5 py-0.5 shadow-2xs text-xs">
                  <button
                    type="button"
                    onClick={() => setZoomScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}
                    className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors cursor-pointer"
                    title={t('Zoom Out', '축소')}
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-mono text-[11px] font-semibold text-slate-700 min-w-[50px] text-center tabular-nums">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))}
                    className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors cursor-pointer"
                    title={t('Zoom In', '확대')}
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-600 ml-1 border-l border-slate-200 transition-colors cursor-pointer"
                    title={t('Reset Zoom (100%)', '배율 초기화 (100%)')}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>

                {/* Close Fullscreen Button */}
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>{t('Close Fullscreen', '전체 화면 닫기')}</span>
                </button>
              </div>
            </div>

            {/* Modal Body: Large Scrollable Canvas */}
            <div className="flex-1 bg-[#fcfcfc] overflow-auto p-8 flex justify-center items-start">
              <MermaidFlowChartSvg
                mermaidCode={mermaidText}
                nodeDetails={nodeDetails}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                scale={zoomScale}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
