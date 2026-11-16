import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  X,
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  Check,
  Eye,
  Bookmark,
  FileCode,
  Tag,
  ArrowRight,
  Sparkles,
  Info,
  Server,
  Database,
  Sliders,
} from 'lucide-react';
import {
  ProgramSpec,
  PredefinedTemplate,
  SavedUserTemplate,
  TemplateCategory,
} from '../types/sap';
import { PREDEFINED_TEMPLATES } from '../data/predefinedTemplates';
import {
  getSavedUserTemplates,
  saveSpecAsUserTemplate,
  deleteUserTemplate,
  exportTemplatesAsJson,
  importTemplateFromJson,
} from '../utils/templateStorage';
import { useLanguage } from '../contexts/LanguageContext';

interface ProgramTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpec: ProgramSpec;
  onSelectTemplate: (spec: ProgramSpec) => void;
}

export const ProgramTemplateModal: React.FC<ProgramTemplateModalProps> = ({
  isOpen,
  onClose,
  currentSpec,
  onSelectTemplate,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'predefined' | 'saved' | 'save_current'>('predefined');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedTemplates, setSavedTemplates] = useState<SavedUserTemplate[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<PredefinedTemplate | SavedUserTemplate | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Form state for saving current spec as new template
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<TemplateCategory>('Single-Table');
  const [newTemplateDesc, setNewTemplateDesc] = useState<string>('');
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Load saved user templates on mount and when modal opens
  useEffect(() => {
    if (isOpen) {
      setSavedTemplates(getSavedUserTemplates());
      // Pre-fill save form
      setNewTemplateName(`${currentSpec.program_id} - ${currentSpec.title}`);
      setNewTemplateCategory(
        currentSpec.sample_type === '02' || !!currentSpec.item_grid
          ? 'Header-Detail'
          : currentSpec.sample_type === '04'
          ? 'OData-based'
          : 'Single-Table'
      );
      setNewTemplateDesc(currentSpec.business_purpose || '');
      setSaveSuccessNotice(null);
    }
  }, [isOpen, currentSpec]);

  // Filter predefined templates
  const filteredPredefined = useMemo(() => {
    return PREDEFINED_TEMPLATES.filter((tmpl) => {
      const matchCat = selectedCategory === 'ALL' || tmpl.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.description.toLowerCase().includes(q) ||
        tmpl.module.toLowerCase().includes(q) ||
        tmpl.spec.program_id.toLowerCase().includes(q) ||
        tmpl.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [selectedCategory, searchQuery]);

  // Filter saved user templates
  const filteredSaved = useMemo(() => {
    return savedTemplates.filter((tmpl) => {
      const matchCat = selectedCategory === 'ALL' || tmpl.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.description.toLowerCase().includes(q) ||
        tmpl.module.toLowerCase().includes(q) ||
        tmpl.spec.program_id.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [savedTemplates, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  // Handle Save Spec
  const handleSaveCurrentSpec = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    const saved = saveSpecAsUserTemplate(
      newTemplateName,
      newTemplateCategory,
      newTemplateDesc,
      currentSpec
    );

    setSavedTemplates(getSavedUserTemplates());
    setSaveSuccessNotice(t(`Template "${saved.name}" successfully saved!`, `템플릿 "${saved.name}"이(가) 저장되었습니다!`));
    setTimeout(() => {
      setActiveTab('saved');
      setSaveSuccessNotice(null);
    }, 1200);
  };

  // Handle Delete Template (2-click inline confirmation)
  const handleDeleteSavedTemplate = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const updated = deleteUserTemplate(id);
    setSavedTemplates(updated);
    setConfirmDeleteId(null);
    if (previewTemplate?.id === id) {
      setPreviewTemplate(null);
    }
  };

  // Handle Import Template JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importTemplateFromJson(content);
      if (imported) {
        setSavedTemplates(getSavedUserTemplates());
        setActiveTab('saved');
        setImportError(null);
        setSaveSuccessNotice(t(`Successfully imported template: ${imported.name}`, `템플릿을 가져왔습니다: ${imported.name}`));
        setTimeout(() => setSaveSuccessNotice(null), 3000);
      } else {
        setImportError(t('Invalid template JSON file format.', '올바르지 않은 템플릿 JSON 파일 형식입니다.'));
        setTimeout(() => setImportError(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Category Badge Helper
  const renderCategoryBadge = (category: TemplateCategory) => {
    switch (category) {
      case 'Header-Detail':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
            {t('Header-Detail', '헤더-디테일')}
          </span>
        );
      case 'Single-Table':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
            {t('Single-Table', '단일 테이블')}
          </span>
        );
      case 'OData-based':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            {t('OData-based', 'OData 기반')}
          </span>
        );
      case 'Interface / Batch':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
            {t('Interface / Batch', '인터페이스 / 배치')}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            {t('Custom', '사용자 정의')}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shadow-inner">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {t('SAP Program Template Library', 'SAP 프로그램 템플릿 라이브러리')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {t('Predefined & Custom', '기본 제공 & 사용자 정의')}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {t(
                  'Load predefined SAP program blueprints (Header-Detail, Single-Table, OData-based, Interface) or save your own specifications as templates.',
                  '기본 SAP 프로그램 템플릿(헤더-디테일, 단일 테이블, OData, 인터페이스)을 불러오거나 현재 사양서를 템플릿으로 저장합니다.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={t('Close', '닫기')}
              aria-label={t('Close', '닫기')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Search Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('predefined')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'predefined'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{t('Predefined Blueprints', '기본 블루프린트')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                {PREDEFINED_TEMPLATES.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'saved'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('My Saved Templates', '내 저장 템플릿')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">
                {savedTemplates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('save_current')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'save_current'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-blue-700 bg-white/70'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('Save Current Spec as Template', '현재 사양을 템플릿으로 저장')}</span>
            </button>
          </div>

          {/* Import / Export Actions */}
          <div className="flex items-center gap-2">
            <label
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
              title={t('Import specification JSON file as template', '사양서 JSON 파일을 템플릿으로 가져오기')}
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('Import JSON', 'JSON 가져오기')}</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
            </label>

            <button
              type="button"
              onClick={() => exportTemplatesAsJson([...PREDEFINED_TEMPLATES, ...savedTemplates])}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
              title={t('Export all templates as a backup JSON file', '모든 템플릿을 백업 JSON 파일로 내보내기')}
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('Export All', '전체 내보내기')}</span>
            </button>
          </div>
        </div>

        {importError && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 font-semibold shrink-0">
            {importError}
          </div>
        )}

        {/* Filter Toolbar (Visible on Predefined & Saved tabs) */}
        {activeTab !== 'save_current' && (
          <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium">
              {[
                { id: 'ALL', label: t('All Architecture Types', '전체 아키텍처 유형') },
                { id: 'Single-Table', label: t('Single-Table', '단일 테이블') },
                { id: 'Header-Detail', label: t('Header-Detail', '헤더-디테일') },
                { id: 'OData-based', label: t('OData-based', 'OData 기반') },
                { id: 'Interface / Batch', label: t('Interface / Batch', '인터페이스 / 배치') },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Live Search */}
            <div className="relative min-w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search templates by title, code, module...', '템플릿 제목, 코드, 모듈 검색...')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Main Body Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {/* TAB 1: Predefined Templates */}
          {activeTab === 'predefined' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPredefined.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-blue-400 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Card Top Header */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {renderCategoryBadge(tmpl.category)}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {tmpl.module} {t('MODULE', '모듈')}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {tmpl.spec.program_id}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors mb-1.5">
                        {tmpl.name}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                        {tmpl.description}
                      </p>

                      {/* Architectural Metrics Badges */}
                      <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 mb-3 font-mono">
                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase">{t('Params', '조회 조건')}</span>
                          <span className="font-bold text-slate-800">
                            {t(`${tmpl.spec.selection_params.length} items`, `${tmpl.spec.selection_params.length}건`)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase">{t('Field Cat', '필드 카탈로그')}</span>
                          <span className="font-bold text-slate-800">
                            {t(`${tmpl.spec.field_catalog.length} fields`, `${tmpl.spec.field_catalog.length}개`)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase">{t('Target', '구조')}</span>
                          <span className="font-bold text-blue-900 truncate block">
                            {tmpl.spec.item_grid ? t('Dual Grid', '이중 그리드') : t('Single Grid', '단일 그리드')}
                          </span>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {tmpl.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setPreviewTemplate(tmpl)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t('Preview Spec', '미리보기')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectTemplate(tmpl.spec);
                          onClose();
                        }}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{t('Load Template', '템플릿 적용')}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: My Saved Templates */}
          {activeTab === 'saved' && (
            <div className="space-y-4">
              {filteredSaved.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
                  <Bookmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    {t('No custom templates saved yet', '저장된 사용자 템플릿이 없습니다')}
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">
                    {t(
                      'Save your current specification as a template or import an existing JSON blueprint to reuse it in future projects.',
                      '현재 작업 중인 사양서를 템플릿으로 저장하거나 기존 JSON 템플릿을 가져와 재사용할 수 있습니다.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('save_current')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('Save Current Spec as Template', '현재 사양을 템플릿으로 저장')}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSaved.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="bg-white rounded-xl border border-slate-200 hover:border-amber-400 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {renderCategoryBadge(tmpl.category)}
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {tmpl.module} {t('MODULE', '모듈')}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(tmpl.savedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Title & Description */}
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors mb-1.5">
                          {tmpl.name}
                        </h4>
                        <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                          {tmpl.description}
                        </p>

                        {/* Metrics */}
                        <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 mb-3 font-mono">
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase">Program ID</span>
                            <span className="font-bold text-slate-800 truncate block">
                              {tmpl.spec.program_id}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase">{t('Field Cat', '필드 카탈로그')}</span>
                            <span className="font-bold text-slate-800">
                              {t(`${tmpl.spec.field_catalog.length} fields`, `${tmpl.spec.field_catalog.length}개`)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 uppercase">{t('Type', '유형')}</span>
                            <span className="font-bold text-slate-800">
                              {tmpl.spec.item_grid ? t('Dual ALV', '이중 ALV') : t('Single ALV', '단일 ALV')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewTemplate(tmpl)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>{t('Preview', '미리보기')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => exportTemplatesAsJson([tmpl], `${tmpl.spec.program_id}_TEMPLATE.json`)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title={t('Export as JSON file', 'JSON 파일로 내보내기')}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteId === tmpl.id ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedTemplate(tmpl.id)}
                              className="px-2 py-1 text-[10px] font-bold bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer"
                            >
                              {t('Confirm?', '삭제 확인')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedTemplate(tmpl.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                              title={t('Delete template', '템플릿 삭제')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectTemplate(tmpl.spec);
                            onClose();
                          }}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{t('Load Template', '템플릿 적용')}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Save Current Specification as Template */}
          {activeTab === 'save_current' && (
            <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Bookmark className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {t('Save Current Workspace as Template', '현재 작업 사양을 템플릿으로 저장')}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {t(
                      'Create a reusable blueprint from your active specification (selection parameters, field catalogs, layout, mock test data).',
                      '현재 활성 사양서(조회 조건, 필드 카탈로그, 레이아웃, 테스트 데이터)로 재사용 가능한 템플릿을 만듭니다.'
                    )}
                  </p>
                </div>
              </div>

              {saveSuccessNotice && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>{saveSuccessNotice}</span>
                </div>
              )}

              <form onSubmit={handleSaveCurrentSpec} className="space-y-4 text-xs">
                {/* Template Name */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('Template Name', '템플릿 이름')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder={t('e.g. Sales Order Header-Item Monitoring Report', '예: 판매오더 헤더-아이템 현황 리포트')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Architecture Category */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('Architecture Category', '아키텍처 분류')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value as TemplateCategory)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium focus:bg-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Single-Table">{t('Single-Table (Standard ALV Grid)', '단일 테이블 (표준 ALV 그리드)')}</option>
                    <option value="Header-Detail">{t('Header-Detail (Master-Detail Dual ALV Grids)', '헤더-디테일 (마스터-디테일 이중 그리드)')}</option>
                    <option value="OData-based">{t('OData-based (SAP Gateway & RAP Service)', 'OData 기반 (SAP Gateway & RAP 서비스)')}</option>
                    <option value="Interface / Batch">{t('Interface / Batch (Mass Upload & BAPI Execution)', '인터페이스 / 배치 (대량 업로드 & BAPI 실행)')}</option>
                    <option value="Custom">{t('Custom Architecture', '사용자 정의 아키텍처')}</option>
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('Description & Architectural Purpose', '설명 및 설계 목적')}
                  </label>
                  <textarea
                    rows={3}
                    value={newTemplateDesc}
                    onChange={(e) => setNewTemplateDesc(e.target.value)}
                    placeholder={t('Briefly describe the business purpose, tables, and target release...', '업무 목적, 주요 테이블 및 대상 SAP 버전을 간략히 입력하세요...')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Snapshot Summary of Current Specification */}
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">
                    {t('Current Specification Snapshot', '현재 사양서 스냅샷')}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">PROGRAM ID</span>
                      <span className="font-bold text-blue-900">{currentSpec.program_id}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">{t('MODULE', '모듈')}</span>
                      <span className="font-bold text-slate-800">{currentSpec.module}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">{t('SELECTION PARAMS', '조회 조건')}</span>
                      <span className="font-bold text-slate-800">{t(`${currentSpec.selection_params.length} items`, `${currentSpec.selection_params.length}건`)}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">{t('FIELD CATALOG', '필드 카탈로그')}</span>
                      <span className="font-bold text-slate-800">
                        {t(`${currentSpec.field_catalog.length} fields`, `${currentSpec.field_catalog.length}개`)} {currentSpec.item_grid ? `(+${currentSpec.item_grid.field_catalog.length})` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('predefined')}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
                  >
                    {t('Cancel', '취소')}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4" />
                    <span>{t('Save Template', '템플릿 저장')}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              {t(
                'Templates include selection screen definitions, field catalog attributes, ALV layout modes, and mock test scenarios.',
                '템플릿에는 조회 조건, 필드 카탈로그 속성, ALV 레이아웃 설정 및 테스트 시나리오가 모두 포함됩니다.'
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold cursor-pointer"
          >
            {t('Close', '닫기')}
          </button>
        </div>
      </div>

      {/* Quick Template Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-bold text-white">
                  {t('Template Preview:', '템플릿 미리보기:')} {previewTemplate.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 font-mono font-bold text-blue-900">
                    <span>{previewTemplate.spec.program_id}</span>
                    <span>|</span>
                    <span>{previewTemplate.spec.tcode}</span>
                  </div>
                  {renderCategoryBadge(previewTemplate.category)}
                </div>
                <p className="text-slate-600 mt-1">{previewTemplate.description}</p>
              </div>

              {/* Selection Parameters */}
              <div>
                <h5 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t(`Selection Parameters (${previewTemplate.spec.selection_params.length})`, `조회 조건 파라미터 (${previewTemplate.spec.selection_params.length})`)}</span>
                </h5>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] text-slate-600 font-bold uppercase">
                      <tr>
                        <th className="p-2">{t('Kind', '유형')}</th>
                        <th className="p-2">{t('Field Name', '필드명')}</th>
                        <th className="p-2">{t('Label', '라벨')}</th>
                        <th className="p-2">{t('Type', '타입')}</th>
                        <th className="p-2">{t('Ref Table', '참조 테이블')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                      {previewTemplate.spec.selection_params.map((p) => (
                        <tr key={p.id}>
                          <td className="p-2 font-bold text-slate-700">{p.kind}</td>
                          <td className="p-2 font-bold text-blue-900">{p.name}</td>
                          <td className="p-2 font-sans">{p.text}</td>
                          <td className="p-2">{p.datatype}({p.length})</td>
                          <td className="p-2 text-slate-500">{p.ref_table || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Field Catalog */}
              <div>
                <h5 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t(`Field Catalog (${previewTemplate.spec.field_catalog.length} fields)`, `필드 카탈로그 (${previewTemplate.spec.field_catalog.length}개 필드)`)}</span>
                </h5>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] text-slate-600 font-bold uppercase sticky top-0">
                      <tr>
                        <th className="p-2">POS</th>
                        <th className="p-2">Fieldname</th>
                        <th className="p-2">{t('Column Text', '컬럼명')}</th>
                        <th className="p-2">{t('Type', '타입')}</th>
                        <th className="p-2">Key</th>
                        <th className="p-2">Hotspot</th>
                        <th className="p-2">Sum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                      {previewTemplate.spec.field_catalog.map((f) => (
                        <tr key={f.id || f.fieldname}>
                          <td className="p-2 text-slate-400">{f.col_pos}</td>
                          <td className="p-2 font-bold text-blue-900">{f.fieldname}</td>
                          <td className="p-2 font-sans">{f.coltext}</td>
                          <td className="p-2">{f.datatype}({f.outputlen})</td>
                          <td className="p-2">{f.key ? '✓' : '-'}</td>
                          <td className="p-2">{f.hotspot ? '✓' : '-'}</td>
                          <td className="p-2">{f.do_sum ? 'Σ' : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Master-Detail Note */}
              {previewTemplate.spec.item_grid && (
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span className="text-[11px]">
                    {t(
                      `Includes synchronized Item ALV Grid (${previewTemplate.spec.item_grid.field_catalog.length} item fields linked by foreign key ${previewTemplate.spec.item_grid.foreign_key || 'VBELN'}).`,
                      `연동 아이템 ALV 그리드 포함 (외래키 ${previewTemplate.spec.item_grid.foreign_key || 'VBELN'}로 연결된 ${previewTemplate.spec.item_grid.field_catalog.length}개 아이템 필드).`
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded font-semibold cursor-pointer"
              >
                {t('Back', '뒤로')}
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectTemplate(previewTemplate.spec);
                  setPreviewTemplate(null);
                  onClose();
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>{t('Load This Template', '이 템플릿 적용')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
