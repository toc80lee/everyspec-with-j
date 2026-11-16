import React, { useState, useMemo } from 'react';
import {
  Database,
  Table,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  RotateCcw,
  Layers,
  Key,
  Filter,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react';
import {
  SapDD02LTable,
  SapDD03LField,
  SapDataType,
} from '../types/sap';
import {
  getDD02LTables,
  getDD03LFields,
  upsertDD02LTable,
  deleteDD02LTable,
  upsertDD03LField,
  deleteDD03LField,
  resetDdicToStandard,
} from '../utils/sapDdicStorage';
import {
  syncCustomDdicTableToFirestore,
  deleteCustomDdicTableFromFirestore,
} from '../services/firestoreSync';
import { useLanguage } from '../contexts/LanguageContext';

interface SapDdicManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  initialTabname?: string;
}

export const SapDdicManagerModal: React.FC<SapDdicManagerModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
  initialTabname,
}) => {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'tables' | 'fields'>('tables');
  const [tables, setTables] = useState<SapDD02LTable[]>(() => getDD02LTables());
  const [fields, setFields] = useState<SapDD03LField[]>(() => getDD03LFields());
  const [selectedTabname, setSelectedTabname] = useState<string>(
    initialTabname ? initialTabname.toUpperCase() : (tables[0]?.tabname || 'VBAK')
  );

  const [tableSearch, setTableSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [fieldSearch, setFieldSearch] = useState('');

  // Table form state
  const [isEditingTable, setIsEditingTable] = useState(false);
  const [tableFormData, setTableFormData] = useState<Partial<SapDD02LTable>>({
    tabname: '',
    ddtext: '',
    module: 'SD',
    tabclass: 'TRANSP',
    description: '',
  });

  // Field form state
  const [isEditingField, setIsEditingField] = useState(false);
  const [fieldFormData, setFieldFormData] = useState<Partial<SapDD03LField>>({
    id: '',
    tabname: selectedTabname,
    fieldname: '',
    position: 1,
    keyflag: false,
    datatype: 'CHAR',
    leng: 10,
    scrtext_l: '',
    ddtext: '',
  });

  const notifyChange = () => {
    if (onDataChanged) onDataChanged();
  };

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchMod = moduleFilter === 'ALL' || t.module === moduleFilter;
      if (!matchMod) return false;
      if (!tableSearch.trim()) return true;
      const q = tableSearch.toLowerCase();
      return (
        t.tabname.toLowerCase().includes(q) ||
        t.ddtext.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    });
  }, [tables, moduleFilter, tableSearch]);

  // Fields for currently selected table
  const currentTableFields = useMemo(() => {
    const list = fields.filter((f) => f.tabname.toUpperCase() === selectedTabname.toUpperCase());
    if (!fieldSearch.trim()) return list;
    const q = fieldSearch.toLowerCase();
    return list.filter(
      (f) =>
        f.fieldname.toLowerCase().includes(q) ||
        f.scrtext_l.toLowerCase().includes(q) ||
        f.ddtext.toLowerCase().includes(q) ||
        f.datatype.toLowerCase().includes(q)
    );
  }, [fields, selectedTabname, fieldSearch]);

  // Handle open add table
  const handleOpenAddTable = () => {
    setTableFormData({
      tabname: '',
      ddtext: '',
      module: 'CUSTOM',
      tabclass: 'TRANSP',
      description: '',
      is_custom: true,
    });
    setIsEditingTable(true);
  };

  // Handle open edit table
  const handleOpenEditTable = (t: SapDD02LTable) => {
    setTableFormData({ ...t });
    setIsEditingTable(true);
  };

  // Save table
  const handleSaveTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableFormData.tabname?.trim() || !tableFormData.ddtext?.trim()) return;

    const cleanName = tableFormData.tabname.trim().toUpperCase();
    const newEntry: SapDD02LTable = {
      tabname: cleanName,
      ddtext: tableFormData.ddtext.trim(),
      module: (tableFormData.module as any) || 'CUSTOM',
      tabclass: tableFormData.tabclass || 'TRANSP',
      description: tableFormData.description || '',
      is_custom: tableFormData.is_custom ?? true,
    };

    const saved = upsertDD02LTable(newEntry);

    setTables(saved);
    setSelectedTabname(cleanName);
    setIsEditingTable(false);
    if (newEntry.is_custom) {
      const tableFields = fields.filter((f) => f.tabname.toUpperCase() === cleanName);
      syncCustomDdicTableToFirestore(newEntry, tableFields).catch(() => {});
    }
    notifyChange();
  };

  // Delete table
  const handleDeleteTable = (tabname: string) => {
    if (window.confirm(t(`Delete table '${tabname}' and all its DD03L fields?`, `테이블 '${tabname}' 및 모든 DD03L 필드를 삭제하시겠습니까?`))) {
      const { tables: upTables, fields: upFields } = deleteDD02LTable(tabname);
      setTables(upTables);
      setFields(upFields);
      if (selectedTabname.toUpperCase() === tabname.toUpperCase()) {
        setSelectedTabname(upTables[0]?.tabname || '');
      }
      deleteCustomDdicTableFromFirestore(tabname).catch(() => {});
      notifyChange();
    }
  };

  // Open add field
  const handleOpenAddField = () => {
    const nextPos = currentTableFields.length + 1;
    setFieldFormData({
      id: '',
      tabname: selectedTabname,
      fieldname: '',
      position: nextPos,
      keyflag: false,
      datatype: 'CHAR',
      leng: 10,
      scrtext_l: '',
      ddtext: '',
      is_custom: true,
    });
    setIsEditingField(true);
  };

  // Open edit field
  const handleOpenEditField = (f: SapDD03LField) => {
    setFieldFormData({ ...f });
    setIsEditingField(true);
  };

  // Save field
  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldFormData.fieldname?.trim() || !fieldFormData.scrtext_l?.trim()) return;

    const saved = upsertDD03LField({
      id: fieldFormData.id || `dd03l-${selectedTabname}-${fieldFormData.fieldname.trim().toUpperCase()}`,
      tabname: selectedTabname,
      fieldname: fieldFormData.fieldname.trim().toUpperCase(),
      position: Number(fieldFormData.position) || currentTableFields.length + 1,
      keyflag: !!fieldFormData.keyflag,
      datatype: (fieldFormData.datatype as SapDataType) || 'CHAR',
      leng: Number(fieldFormData.leng) || 10,
      decimals: fieldFormData.decimals ? Number(fieldFormData.decimals) : undefined,
      scrtext_l: fieldFormData.scrtext_l.trim(),
      ddtext: fieldFormData.ddtext?.trim() || fieldFormData.scrtext_l.trim(),
      is_custom: fieldFormData.is_custom ?? true,
    });

    setFields(saved);
    setIsEditingField(false);
    const parentTable = tables.find((t) => t.tabname.toUpperCase() === selectedTabname.toUpperCase());
    if (parentTable?.is_custom) {
      const updatedFields = saved.filter((f) => f.tabname.toUpperCase() === selectedTabname.toUpperCase());
      syncCustomDdicTableToFirestore(parentTable, updatedFields).catch(() => {});
    }
    notifyChange();
  };

  // Delete field
  const handleDeleteField = (id: string, name: string) => {
    if (window.confirm(t(`Delete field '${name}'?`, `필드 '${name}'을(를) 삭제하시겠습니까?`))) {
      const saved = deleteDD03LField(id);
      setFields(saved);
      const parentTable = tables.find((t) => t.tabname.toUpperCase() === selectedTabname.toUpperCase());
      if (parentTable?.is_custom) {
        const updatedFields = saved.filter((f) => f.tabname.toUpperCase() === selectedTabname.toUpperCase());
        syncCustomDdicTableToFirestore(parentTable, updatedFields).catch(() => {});
      }
      notifyChange();
    }
  };

  // Reset to SAP Standard
  const handleResetStandard = () => {
    if (window.confirm(t('Reset SAP standard DD02L tables and DD03L fields to defaults? Custom changes will be lost.', 'SAP 표준 DD02L 테이블 및 DD03L 필드를 기본값으로 초기화할까요? 사용자 정의 변경 사항은 사라집니다.'))) {
      const res = resetDdicToStandard();
      setTables(res.tables);
      setFields(res.fields);
      setSelectedTabname(res.tables[0]?.tabname || 'VBAK');
      notifyChange();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-5xl h-[680px] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  {t('SAP Data Dictionary (DDIC) Manager — DD02L & DD03L', 'SAP 데이터 딕셔너리 (DDIC) 관리 — DD02L & DD03L')}
                </h3>
                <span className="bg-blue-500/30 text-blue-300 border border-blue-400/40 text-[10px] font-mono px-2 py-0.5 rounded font-semibold">
                  T-Code: SE11 / SE80
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                {t('Manage DD02L table headers and DD03L field definitions.', 'DD02L 테이블 헤더 및 DD03L 필드 정의를 관리합니다.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('Close', '닫기')}
            aria-label={t('Close', '닫기')}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher & DB Global Actions */}
        <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('tables')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'tables'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{t(`DD02L: Tables (${tables.length})`, `DD02L: 테이블 (${tables.length})`)}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fields')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'fields'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t(`DD03L: Table Fields (${currentTableFields.length} in ${selectedTabname})`, `DD03L: 테이블 필드 (${selectedTabname}: ${currentTableFields.length}개)`)}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetStandard}
              title={t('Reset to SAP standard DDIC', 'SAP 표준 DDIC로 초기화')}
              aria-label={t('Reset to SAP standard DDIC', 'SAP 표준 DDIC로 초기화')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-200 border border-slate-300 rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('Reset to Standard', '표준으로 초기화')}</span>
            </button>
          </div>
        </div>

        {/* TAB 1: DD02L (Tables Management) */}
        {activeTab === 'tables' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white p-4 overflow-hidden">
            {/* Table Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder={t('Search table name / text...', '테이블명 / 설명 검색...')}
                    className="text-xs pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
                  />
                </div>

                {/* Module filter */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200 text-xs">
                  <span className="text-[11px] font-semibold text-slate-500 px-1">{t('Module:', '모듈:')}</span>
                  {['ALL', 'SD', 'MM', 'FI', 'CO', 'PP', 'CUSTOM'].map((mod) => (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => setModuleFilter(mod)}
                      className={`px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer ${
                        moduleFilter === mod ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mod}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenAddTable}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('Add Table', '테이블 추가')}</span>
              </button>
            </div>

            {/* Tables List Table */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-lg shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-2 px-3 w-12 text-center">#</th>
                    <th className="py-2 px-3 w-32 font-mono">TABNAME</th>
                    <th className="py-2 px-3 w-20 text-center">MODULE</th>
                    <th className="py-2 px-3 min-w-56">SHORT TEXT (DDTEXT)</th>
                    <th className="py-2 px-3 w-28">TYPE</th>
                    <th className="py-2 px-3 w-24 text-center">FIELDS</th>
                    <th className="py-2 px-3 w-28 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTables.map((tbl, idx) => {
                    const fieldCount = fields.filter((f) => f.tabname.toUpperCase() === tbl.tabname.toUpperCase()).length;
                    const isSelected = selectedTabname.toUpperCase() === tbl.tabname.toUpperCase();

                    return (
                      <tr
                        key={tbl.tabname}
                        onClick={() => setSelectedTabname(tbl.tabname)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-900 flex items-center gap-1.5">
                          <Table className="w-3.5 h-3.5 text-blue-600" />
                          <span>{tbl.tabname}</span>
                          {tbl.is_custom && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-amber-100 text-amber-800 border border-amber-300 rounded font-sans font-medium">
                              Custom
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-bold">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                            {tbl.module}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium">{tbl.ddtext}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{tbl.tabclass || 'TRANSP'}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTabname(tbl.tabname);
                              setActiveTab('fields');
                            }}
                            className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                          >
                            {fieldCount} {t('fields', '필드')} ➔
                          </button>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditTable(tbl);
                              }}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title={t('Edit Table', '테이블 수정')}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTable(tbl.tabname);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title={t('Delete Table', '테이블 삭제')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: DD03L (Fields Management) */}
        {activeTab === 'fields' && (
          <div className="flex-1 flex flex-col min-h-0 bg-white p-4 overflow-hidden">
            {/* Field Header / Table Selector */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold text-slate-700">{t('Target Table:', '대상 테이블:')}</span>
                  <select
                    value={selectedTabname}
                    onChange={(e) => setSelectedTabname(e.target.value)}
                    className="text-xs font-mono font-bold bg-white border border-slate-300 rounded px-2 py-1 text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {tables.map((tbl) => (
                      <option key={tbl.tabname} value={tbl.tabname}>
                        {tbl.tabname} — {tbl.ddtext}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder={t('Search field name / label...', '필드명 / 라벨 검색...')}
                    className="text-xs pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenAddField}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('Add Field', '필드 추가')}</span>
              </button>
            </div>

            {/* Field Table */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-lg shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-2 px-2 w-12 text-center">POS</th>
                    <th className="py-2 px-2 w-14 text-center">KEY</th>
                    <th className="py-2 px-3 w-32 font-mono">FIELDNAME</th>
                    <th className="py-2 px-3 min-w-48">FIELD LABEL (SCRTEXT_L)</th>
                    <th className="py-2 px-2 w-20 text-center">TYPE</th>
                    <th className="py-2 px-2 w-16 text-center">LENGTH</th>
                    <th className="py-2 px-3 min-w-48">DESCRIPTION (DDTEXT)</th>
                    <th className="py-2 px-2 w-24 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {currentTableFields.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        {t("No fields registered for this table. Click 'Add Field' above to create one.", "이 테이블에 등록된 필드가 없습니다. 상단의 '필드 추가' 버튼을 눌러 추가하세요.")}
                      </td>
                    </tr>
                  ) : (
                    currentTableFields.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-2 text-center font-mono text-slate-500 font-bold">{f.position}</td>
                        <td className="py-2 px-2 text-center">
                          {f.keyflag ? (
                            <span className="inline-flex items-center justify-center p-0.5 bg-amber-100 text-amber-800 rounded font-mono font-bold text-[10px]">
                              <Key className="w-3 h-3 text-amber-600" />
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-900">{f.fieldname}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{f.scrtext_l}</td>
                        <td className="py-2 px-2 text-center font-mono">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-bold text-slate-700 border border-slate-200">
                            {f.datatype}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600 font-bold">{f.leng}</td>
                        <td className="py-2 px-3 text-slate-600 truncate max-w-xs">{f.ddtext}</td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditField(f)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                              title={t('Edit Field', '필드 수정')}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteField(f.id, f.fieldname)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title={t('Delete Field', '필드 삭제')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Table Modal Drawer */}
        {isEditingTable && (
          <div className="fixed inset-0 bg-slate-900/40 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl border border-slate-300 w-full max-w-md p-5 animate-in zoom-in-95">
              <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-600" />
                <span>{t('Table Settings (DD02L Entry)', '테이블 설정 (DD02L 항목)')}</span>
              </h4>
              <form onSubmit={handleSaveTable} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Table Name', '테이블명')}</label>
                  <input
                    type="text"
                    required
                    value={tableFormData.tabname || ''}
                    onChange={(e) => setTableFormData({ ...tableFormData, tabname: e.target.value.toUpperCase() })}
                    placeholder="e.g. ZSDT0010, VBAK"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Short Text (DDTEXT)', '단문 설명 (DDTEXT)')}</label>
                  <input
                    type="text"
                    required
                    value={tableFormData.ddtext || ''}
                    onChange={(e) => setTableFormData({ ...tableFormData, ddtext: e.target.value })}
                    placeholder={t('e.g. Custom Sales Delivery Status Table', '예: 판매 납품 상태 관리 테이블')}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">{t('MODULE', '모듈')}</label>
                    <select
                      value={tableFormData.module || 'SD'}
                      onChange={(e) => setTableFormData({ ...tableFormData, module: e.target.value as any })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {['SD', 'MM', 'FI', 'CO', 'PP', 'PM', 'QM', 'COMMON', 'CUSTOM'].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">{t('TABLE TYPE', '테이블 유형')}</label>
                    <select
                      value={tableFormData.tabclass || 'TRANSP'}
                      onChange={(e) => setTableFormData({ ...tableFormData, tabclass: e.target.value as any })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="TRANSP">TRANSP (Transparent)</option>
                      <option value="VIEW">VIEW (Database View)</option>
                      <option value="INTTAB">INTTAB (Structure)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Description', '설명')}</label>
                  <textarea
                    rows={2}
                    value={tableFormData.description || ''}
                    onChange={(e) => setTableFormData({ ...tableFormData, description: e.target.value })}
                    placeholder={t('Describe table purpose and business process', '테이블 용도 및 업무 프로세스 설명')}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditingTable(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    {t('Cancel', '취소')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold cursor-pointer"
                  >
                    {t('Save', '저장')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Field Modal Drawer */}
        {isEditingField && (
          <div className="fixed inset-0 bg-slate-900/40 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl border border-slate-300 w-full max-w-md p-5 animate-in zoom-in-95">
              <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>{t(`Field Settings (DD03L Entry in ${selectedTabname})`, `필드 설정 (${selectedTabname} DD03L 항목)`)}</span>
              </h4>
              <form onSubmit={handleSaveField} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Field Name', '필드명')}</label>
                  <input
                    type="text"
                    required
                    value={fieldFormData.fieldname || ''}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, fieldname: e.target.value.toUpperCase() })}
                    placeholder="e.g. ZSTATUS, MATNR"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Field Label (SCRTEXT_L)', '필드 라벨 (SCRTEXT_L)')}</label>
                  <input
                    type="text"
                    required
                    value={fieldFormData.scrtext_l || ''}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, scrtext_l: e.target.value })}
                    placeholder={t('e.g. Progress Status', '예: 진행 상태')}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">{t('DATA TYPE', '데이터 유형')}</label>
                    <select
                      value={fieldFormData.datatype || 'CHAR'}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, datatype: e.target.value as SapDataType })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {['CHAR', 'NUMC', 'DATS', 'TIMS', 'CURR', 'DEC', 'UNIT', 'INT4', 'STRING'].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">{t('LENGTH', '길이')}</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={255}
                      value={fieldFormData.leng || 10}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, leng: parseInt(e.target.value, 10) || 1 })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">{t('POSITION', '순번')}</label>
                    <input
                      type="number"
                      min={1}
                      value={fieldFormData.position || 1}
                      onChange={(e) => setFieldFormData({ ...fieldFormData, position: parseInt(e.target.value, 10) || 1 })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="chkKeyflag"
                    checked={!!fieldFormData.keyflag}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, keyflag: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="chkKeyflag" className="text-slate-800 font-bold cursor-pointer">
                    {t("Primary Key Field (KEYFLAG = 'X')", "기본 키 필드 (KEYFLAG = 'X')")}
                  </label>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">{t('Description', '설명')}</label>
                  <input
                    type="text"
                    value={fieldFormData.ddtext || ''}
                    onChange={(e) => setFieldFormData({ ...fieldFormData, ddtext: e.target.value })}
                    placeholder={t('Field business meaning and definition', '필드 업무 의미 및 정의')}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditingField(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    {t('Cancel', '취소')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold cursor-pointer"
                  >
                    {t('Save', '저장')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div>
            {lang === 'ko' ? (
              <>변경 사항은 로컬에 저장되며 <strong>SAP 탐색 도움말(F4)</strong>에서 즉시 사용할 수 있습니다.</>
            ) : (
              <>Changes are saved locally and immediately available in <strong>SAP Search Help (F4)</strong>.</>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold cursor-pointer shadow-xs"
          >
            {t('Close', '닫기')}
          </button>
        </div>
      </div>
    </div>
  );
};
