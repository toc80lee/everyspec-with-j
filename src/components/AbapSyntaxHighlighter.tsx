import React from 'react';
import { SapGuiTheme } from '../data/sapGuiThemes';

export type AbapSyntaxThemeId =
  | 'se38_light'
  | 'vscode_dark'
  | 'monokai'
  | 'solarized_light'
  | 'solarized_dark';

export type AbapSyntaxTheme = AbapSyntaxThemeId | 'light' | 'dark';

export type AbapTokenType =
  | 'whitespace'
  | 'comment'
  | 'banner_comment'
  | 'user_logic_marker'
  | 'keyword'
  | 'builtin'
  | 'type'
  | 'sysvar'
  | 'string'
  | 'number'
  | 'field_symbol'
  | 'variable'
  | 'operator'
  | 'punctuation'
  | 'plain';

export interface AbapToken {
  type: AbapTokenType;
  value: string;
}

/**
 * ABAP Keywords and syntax highlighting categories matching SAP GUI ABAP Editor (SE38/SE80) & ADT
 */
const ABAP_KEYWORDS = new Set([
  'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'TYPE-POOL', 'CLASS-POOL',
  'INCLUDE', 'TABLES', 'TYPES', 'DATA', 'CONSTANTS', 'STATICS', 'FIELD-SYMBOLS', 'FIELD-SYMBOL',
  'PARAMETERS', 'SELECT-OPTIONS', 'SELECTION-SCREEN', 'BEGIN', 'END', 'OF', 'BLOCK', 'FRAME',
  'TITLE', 'COMMENT', 'LINE', 'PUSHBUTTON', 'USER-COMMAND', 'MODIF', 'ID', 'OBLIGATORY',
  'NO-EXTENSION', 'NO-DISPLAY', 'INTERVALS', 'VISIBLE', 'LENGTH', 'RADIOBUTTON', 'GROUP',
  'AS', 'CHECKBOX', 'LISTBOX', 'DEFAULT', 'MATCHCODE', 'MEMORY',
  'INITIALIZATION', 'AT', 'START-OF-SELECTION', 'END-OF-SELECTION',
  'TOP-OF-PAGE', 'END-OF-PAGE', 'LOAD-OF-PROGRAM',
  'PERFORM', 'FORM', 'ENDFORM', 'USING', 'CHANGING',
  'MODULE', 'ENDMODULE', 'OUTPUT', 'INPUT',
  'FUNCTION', 'ENDFUNCTION',
  'METHOD', 'ENDMETHOD', 'CLASS', 'ENDCLASS', 'INTERFACE', 'ENDINTERFACE', 'INTERFACES', 'ALIASES',
  'SELECT', 'ENDSELECT', 'SINGLE', 'DISTINCT', 'FROM', 'WHERE', 'INTO', 'CORRESPONDING', 'FIELDS',
  'TABLE', 'APPENDING', 'INNER', 'LEFT', 'OUTER', 'RIGHT', 'JOIN', 'ON', 'ORDER', 'BY', 'GROUP',
  'HAVING', 'UP', 'TO', 'ROWS', 'PACKAGE', 'SIZE', 'FOR', 'ALL', 'ENTRIES', 'IN', 'CLIENT', 'SPECIFIED',
  'APPEND', 'INSERT', 'MODIFY', 'DELETE', 'UPDATE', 'READ', 'WITH', 'KEY', 'BINARY', 'SEARCH',
  'TRANSPORTING', 'NO', 'COMPARING', 'INDEX', 'ASSIGNING', 'REFERENCE', 'INITIAL', 'LINE',
  'CLEAR', 'REFRESH', 'FREE', 'SORT', 'DESCENDING', 'ASCENDING', 'STABLE', 'COLLECT',
  'IF', 'ELSE', 'ELSEIF', 'ENDIF', 'CASE', 'WHEN', 'OTHERS', 'ENDCASE',
  'DO', 'ENDDO', 'TIMES', 'WHILE', 'ENDWHILE', 'LOOP', 'ENDLOOP', 'WHERE', 'ASSIGN', 'UNASSIGN',
  'CHECK', 'EXIT', 'CONTINUE', 'RETURN', 'LEAVE', 'LIST-PROCESSING', 'PROGRAM', 'SCREEN', 'STOP',
  'CALL', 'TRANSACTION', 'AND', 'SKIP', 'FIRST', 'AUTHORITY-CHECK', 'OBJECT', 'DUMMY',
  'CREATE', 'OBJECT', 'SET', 'GET', 'HANDLER', 'ACTIVATION', 'PF-STATUS', 'TITLEBAR', 'EXCLUDING',
  'EXPORTING', 'IMPORTING', 'CHANGING', 'EXCEPTIONS', 'RECEIVING', 'PARAMETER', 'FIELD', 'VALUE',
  'RAISE', 'MESSAGE', 'RAISING', 'DISPLAY', 'LIKE', 'TRY', 'CATCH', 'CLEANUP', 'ENDTRY', 'RESUMABLE',
  'TYPE', 'REF', 'STRUCTURE', 'DECIMALS', 'DEFINITION', 'IMPLEMENTATION', 'PUBLIC', 'PROTECTED',
  'PRIVATE', 'SECTION', 'DEFERRED', 'FINAL', 'ABSTRACT', 'EVENT', 'EVENTS', 'SENDER', 'IMPORT', 'EXPORT',
  'HEADER', 'NOT', 'OR', 'XOR', 'EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'CO', 'CN', 'CA', 'NA', 'CS', 'NS', 'CP', 'NP',
  'BETWEEN', 'IS', 'BOUND', 'ASSIGNED', 'REQUESTED', 'SUPPLIED', 'INITIAL',
  'COND', 'SWITCH', 'CONV', 'CAST', 'EXACT', 'REDUCE', 'FILTER', 'LET', 'BASE', 'OPTIONAL', 'NEW',
  'CONCATENATE', 'SEPARATED', 'SPLIT', 'SHIFT', 'REPLACE', 'CONDENSE', 'TRANSLATE', 'FIND', 'WRITE',
  'FORMAT', 'SUBMIT', 'VIA', 'WITH-SELECTION-TABLE', 'DESCRIBING', 'DESCRIBE', 'LINES', 'OCCURS',
  'WORK', 'COMMIT', 'ROLLBACK', 'WAIT', 'SECONDS', 'UP',
  'ALV', 'GRID', 'EXCEPTIONS',
]);

const ABAP_BUILTINS = new Set([
  'lines', 'strlen', 'xstrlen', 'numofchar', 'condense', 'to_upper', 'to_lower', 'to_mixed',
  'shift_left', 'shift_right', 'substring', 'substring_before', 'substring_after', 'replace',
  'concat_lines_of', 'boolc', 'xsdbool', 'line_exists', 'line_index', 'abs', 'sign', 'ceil', 'floor',
  'trunc', 'frac', 'round', 'nmax', 'nmin', 'ipow', 'sqrt',
]);

const SAP_TYPES = new Set([
  'c', 'n', 'i', 'p', 'f', 'd', 't', 'x', 'string', 'xstring', 'abap_bool', 'flag', 'xfeld',
  'numc', 'numc3', 'numc4', 'numc10', 'dats', 'tims', 'dec', 'curr', 'quan', 'int1', 'int2', 'int4', 'int8',
  'char1', 'char2', 'char3', 'char4', 'char5', 'char8', 'char10', 'char12', 'char20', 'char30', 'char40', 'char50', 'char70', 'char100', 'char255',
  'icon-id', 'icon_id', 'txt40', 'text40', 'dd02l', 'dd03l', 't001', 't001w', 'mara', 'marc', 'makt', 'vbak', 'vbap', 'likp', 'lips', 'ekko', 'ekpo', 'bkpf', 'bseg', 'acdoca', 'kna1', 'lfa1', 'csks', 'cepc',
  'cl_gui_docking_container', 'cl_gui_alv_grid', 'cl_gui_custom_container', 'cl_gui_container', 'cl_salv_table',
  'cl_abap_typedescr', 'cl_abap_structdescr', 'cl_abap_tabledescr', 'cx_root', 'cx_sy_itab_line_not_found',
  'lvc_s_fcat', 'lvc_t_fcat', 'lvc_s_layo', 'lvc_s_sort', 'lvc_t_sort', 'lvc_s_filt', 'lvc_t_filt', 'lvc_s_roid', 'lvc_s_row', 'lvc_s_col',
  'disvariant', 'ui_functions', 'ui_func', 'stb_button', 'ttb_button', 'slis_t_fieldcat_alv', 'slis_layout_alv',
  'ddshretval', 'rsparams', 'rsparams_tt', 'bapiret2', 'bapiret2_t',
]);

const SAP_SYSVARS_AND_CONSTANTS = new Set([
  'sy-ucomm', 'sy-subrc', 'sy-tabix', 'sy-datum', 'sy-uzeit', 'sy-title', 'sy-repid', 'sy-cprog',
  'sy-uname', 'sy-langu', 'sy-batch', 'sy-mandt', 'sy-index', 'sy-dbcnt', 'sy-pagno', 'sy-linct',
  'sy-msgty', 'sy-msgid', 'sy-msgno', 'sy-msgv1', 'sy-msgv2', 'sy-msgv3', 'sy-msgv4',
  'abap_true', 'abap_false', 'abap_on', 'abap_off', 'abap_undefined', 'space',
]);

const VARIABLE_PREFIX_RE = /^(gv_|gs_|gt_|go_|gc_|gr_|p_|s_|lv_|ls_|lt_|lo_|lc_|lr_|iv_|is_|it_|io_|ev_|es_|et_|eo_|cv_|cs_|ct_|co_|mv_|ms_|mt_|mo_|mc_|mr_)/i;

function classifyIdentifier(word: string, nextChar?: string): AbapTokenType {
  const upper = word.toUpperCase();
  const lower = word.toLowerCase();

  if (nextChar === '(' && ABAP_BUILTINS.has(lower)) return 'builtin';
  if (ABAP_KEYWORDS.has(upper)) return 'keyword';
  if (SAP_SYSVARS_AND_CONSTANTS.has(lower)) return 'sysvar';
  if (SAP_TYPES.has(lower) || /^(ty_|tt_|z[a-z0-9_]*_t$|cl_gui_|cl_salv_|cl_abap_|cx_|lvc_|bapi)/i.test(lower)) {
    return 'type';
  }
  if (ABAP_BUILTINS.has(lower)) return 'builtin';
  if (VARIABLE_PREFIX_RE.test(word)) return 'variable';
  return 'plain';
}

/**
 * Tokenizes a single ABAP source line accurately without breaking on quotes inside strings,
 * multi-word string literals, field-symbols (<fs>), host variables (@DATA), or -> / => operators.
 */
export function tokenizeAbapLine(line: string): AbapToken[] {
  if (!line) return [];

  const trimmed = line.trim();

  // Check special USER LOGIC region markers first
  if (/^\*+[-=&*\s]*(BEGIN|END)\s+USER\s+LOGIC/i.test(trimmed)) {
    return [{ type: 'user_logic_marker', value: line }];
  }

  // ABAP full-line comment: * in column 1, or line starting with "
  if (line.startsWith('*') || trimmed.startsWith('"')) {
    const isBanner = /^\*{3,}|^\*={3,}|^\*-{3,}|^"{3,}/.test(trimmed);
    return [{ type: isBanner ? 'banner_comment' : 'comment', value: line }];
  }

  const tokens: AbapToken[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const ch = line[i];

    // 1. Whitespace
    if (/\s/.test(ch)) {
      let end = i + 1;
      while (end < len && /\s/.test(line[end])) end++;
      tokens.push({ type: 'whitespace', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // 2. Inline comment starting with " (only outside strings)
    if (ch === '"') {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // 3. Single-quoted string literal '...' (handles escaped '' inside)
    if (ch === "'") {
      let end = i + 1;
      while (end < len) {
        if (line[end] === "'") {
          if (end + 1 < len && line[end + 1] === "'") {
            end += 2;
            continue;
          }
          end++;
          break;
        }
        end++;
      }
      tokens.push({ type: 'string', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // 4. Backtick string literal `...`
    if (ch === '`') {
      let end = i + 1;
      while (end < len) {
        if (line[end] === '`') {
          if (end + 1 < len && line[end + 1] === '`') {
            end += 2;
            continue;
          }
          end++;
          break;
        }
        end++;
      }
      tokens.push({ type: 'string', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // 5. ABAP 7.40+ String Template |...| with { expr } interpolation
    if (ch === '|') {
      let segStart = i;
      i++;
      while (i < len) {
        if (line[i] === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (line[i] === '|') {
          i++;
          tokens.push({ type: 'string', value: line.slice(segStart, i) });
          segStart = -1;
          break;
        }
        if (line[i] === '{') {
          if (i > segStart) {
            tokens.push({ type: 'string', value: line.slice(segStart, i) });
          }
          tokens.push({ type: 'operator', value: '{' });
          i++;
          // Read inside { ... } until matching }
          const exprStart = i;
          let depth = 1;
          while (i < len && depth > 0) {
            if (line[i] === '{') depth++;
            else if (line[i] === '}') depth--;
            if (depth > 0) i++;
          }
          const innerExpr = line.slice(exprStart, i);
          if (innerExpr) {
            tokens.push(...tokenizeAbapLine(innerExpr));
          }
          if (i < len && line[i] === '}') {
            tokens.push({ type: 'operator', value: '}' });
            i++;
          }
          segStart = i;
          continue;
        }
        i++;
      }
      if (segStart !== -1 && segStart < len) {
        tokens.push({ type: 'string', value: line.slice(segStart) });
      }
      continue;
    }

    // 6. Field-Symbol <fs_name>
    if (ch === '<') {
      const match = line.slice(i).match(/^<[A-Za-z_][A-Za-z0-9_]*>/);
      if (match) {
        tokens.push({ type: 'field_symbol', value: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // 7. Object / static operators (->, =>) or comparison operators (<>, <=, >=, **, ?+)
    if (
      (ch === '-' && line[i + 1] === '>') ||
      (ch === '=' && line[i + 1] === '>') ||
      (ch === '<' && (line[i + 1] === '>' || line[i + 1] === '=')) ||
      (ch === '>' && line[i + 1] === '=') ||
      (ch === '*' && line[i + 1] === '*')
    ) {
      tokens.push({ type: 'operator', value: line.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // 8. OpenSQL host variable prefix @ or constructor #
    if (ch === '@' || ch === '#') {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    // 9. Numeric literal
    if (/\d/.test(ch)) {
      let end = i + 1;
      while (end < len && /[\d.]/.test(line[end])) {
        // Don't consume trailing period if it ends an ABAP statement
        if (line[end] === '.' && (end + 1 >= len || !/\d/.test(line[end + 1]))) {
          break;
        }
        end++;
      }
      tokens.push({ type: 'number', value: line.slice(i, end) });
      i = end;
      continue;
    }

    // 10. Identifiers / Hyphenated Keywords / System Variables / Struct-Fields
    if (/[A-Za-z_]/.test(ch)) {
      let end = i + 1;
      while (end < len && /[A-Za-z0-9_-]/.test(line[end])) {
        // Stop before '->' operator
        if (line[end] === '-' && line[end + 1] === '>') break;
        end++;
      }
      const rawWord = line.slice(i, end);
      let lookahead = end;
      while (lookahead < len && /\s/.test(line[lookahead])) lookahead++;
      const nextChar = line[lookahead];
      const directType = classifyIdentifier(rawWord, nextChar);

      if (directType !== 'plain' || !rawWord.includes('-')) {
        tokens.push({ type: directType, value: rawWord });
      } else {
        // Split structure-field tokens like ls_out-matnr or p_bukrs-low
        const parts = rawWord.split('-');
        parts.forEach((part, idx) => {
          if (part) {
            tokens.push({
              type: classifyIdentifier(part, idx === parts.length - 1 ? nextChar : undefined),
              value: part,
            });
          }
          if (idx < parts.length - 1) {
            tokens.push({ type: 'punctuation', value: '-' });
          }
        });
      }
      i = end;
      continue;
    }

    // 11. Operators & Punctuation
    if (/[+\-*/=<>~]/.test(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    if (/[.,:()\[\]{}]/.test(ch)) {
      tokens.push({ type: 'punctuation', value: ch });
      i++;
      continue;
    }

    // Fallback single char
    tokens.push({ type: 'plain', value: ch });
    i++;
  }

  return tokens;
}

export interface AbapSyntaxThemeSurface {
  canvasClass: string;
  editGutterClass: string;
  gutterClass: string;
  gutterSelectedClass: string;
  gutterMatchClass: string;
  rowHoverClass: string;
  rowSelectedClass: string;
  rowMatchClass: string;
  userLogicRowClass: string;
  caretSelectionClass: string;
  searchMarkClass: string;
}

export interface AbapSyntaxThemeDefinition {
  id: AbapSyntaxThemeId;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  isDark: boolean;
  swatches: [string, string, string, string];
  surface: AbapSyntaxThemeSurface;
  tokens: Record<AbapTokenType, string>;
}

export const ABAP_SYNTAX_THEMES: Record<AbapSyntaxThemeId, AbapSyntaxThemeDefinition> = {
  se38_light: {
    id: 'se38_light',
    name: 'SAP SE38 Light',
    nameKo: 'SAP SE38 라이트',
    description: 'Classic SAP GUI ABAP Workbench light editor',
    descriptionKo: '클래식 SAP GUI ABAP 워크벤치 라이트 편집기',
    isDark: false,
    swatches: ['#ffffff', '#0000cc', '#b71c1c', '#00796b'],
    surface: {
      canvasClass: 'bg-white text-slate-900',
      editGutterClass: 'bg-[#f8fafc] border-slate-200 text-slate-400',
      gutterClass: 'bg-[#f8fafc] text-slate-400 border-slate-200',
      gutterSelectedClass: 'bg-blue-100 text-blue-700 border-blue-200',
      gutterMatchClass: 'bg-amber-100 text-amber-800 border-amber-200',
      rowHoverClass: 'hover:bg-blue-50/50',
      rowSelectedClass: 'bg-blue-50/90',
      rowMatchClass: 'bg-amber-100/80',
      userLogicRowClass: 'bg-emerald-50/70 border-l-2 border-emerald-500',
      caretSelectionClass: 'caret-slate-900 selection:bg-blue-200/80 selection:text-blue-900',
      searchMarkClass: 'bg-yellow-300 text-slate-950 rounded-xs px-0.5 font-bold',
    },
    tokens: {
      whitespace: '',
      comment: 'text-[#2e7d32] italic',
      banner_comment: 'text-[#1b5e20] font-semibold italic',
      user_logic_marker: 'text-emerald-700 font-bold bg-emerald-100/80 px-0.5 rounded-xs',
      keyword: 'text-[#0000cc] font-bold',
      builtin: 'text-[#0277bd] font-semibold',
      type: 'text-[#00796b] font-semibold',
      sysvar: 'text-[#6a1b9a] font-semibold',
      string: 'text-[#b71c1c]',
      number: 'text-[#d84315]',
      field_symbol: 'text-[#880e4f] font-semibold',
      variable: 'text-[#4a148c] font-medium',
      operator: 'text-[#334155] font-semibold',
      punctuation: 'text-slate-600',
      plain: 'text-[#1e293b]',
    },
  },
  vscode_dark: {
    id: 'vscode_dark',
    name: 'VS Code Dark+',
    nameKo: 'VS Code 다크+',
    description: 'Modern dark IDE matched to SAP Quartz & ADT',
    descriptionKo: 'SAP Quartz 및 ADT에 어울리는 모던 다크 IDE',
    isDark: true,
    swatches: ['#1e1e1e', '#569cd6', '#ce9178', '#4ec9b0'],
    surface: {
      canvasClass: 'bg-[#1e1e1e] text-[#d4d4d4]',
      editGutterClass: 'bg-[#1e1e1e] border-[#2d2d30] text-[#858585]',
      gutterClass: 'bg-[#1e1e1e] text-[#858585] border-[#2d2d30]',
      gutterSelectedClass: 'bg-[#264f78]/70 text-[#d4d4d4] border-[#3b6a9a]',
      gutterMatchClass: 'bg-[#623315] text-[#ffd580] border-[#96501f]',
      rowHoverClass: 'hover:bg-[#2a2d2e]',
      rowSelectedClass: 'bg-[#264f78]/40',
      rowMatchClass: 'bg-[#613214]/55',
      userLogicRowClass: 'bg-[#1b3a2b]/65 border-l-2 border-[#4ec9b0]',
      caretSelectionClass: 'caret-white selection:bg-[#264f78]/75 selection:text-white',
      searchMarkClass: 'bg-amber-400 text-slate-950 rounded-xs px-0.5 font-bold',
    },
    tokens: {
      whitespace: '',
      comment: 'text-[#6a9955] italic',
      banner_comment: 'text-[#7ab862] font-semibold italic',
      user_logic_marker: 'text-[#4ec9b0] font-bold bg-[#4ec9b0]/15 px-0.5 rounded-xs',
      keyword: 'text-[#569cd6] font-bold',
      builtin: 'text-[#dcdcaa] font-semibold',
      type: 'text-[#4ec9b0] font-semibold',
      sysvar: 'text-[#4fc1ff] font-semibold',
      string: 'text-[#ce9178]',
      number: 'text-[#b5cea8]',
      field_symbol: 'text-[#c586c0] font-semibold',
      variable: 'text-[#9cdcfe] font-medium',
      operator: 'text-[#d4d4d4] font-semibold',
      punctuation: 'text-[#9ca3af]',
      plain: 'text-[#d4d4d4]',
    },
  },
  monokai: {
    id: 'monokai',
    name: 'Monokai',
    nameKo: '모노카이 (Monokai)',
    description: 'High-contrast charcoal palette with vibrant accents',
    descriptionKo: '선명한 포인트 컬러의 고대비 차콜 팔레트',
    isDark: true,
    swatches: ['#272822', '#f92672', '#e6db74', '#a6e22e'],
    surface: {
      canvasClass: 'bg-[#272822] text-[#f8f8f2]',
      editGutterClass: 'bg-[#2f302a] border-[#3e3d32] text-[#90908a]',
      gutterClass: 'bg-[#272822] text-[#90908a] border-[#3e3d32]',
      gutterSelectedClass: 'bg-[#49483e] text-[#f8f8f2] border-[#75715e]',
      gutterMatchClass: 'bg-[#5a4a1b] text-[#e6db74] border-[#8b7427]',
      rowHoverClass: 'hover:bg-[#32332c]',
      rowSelectedClass: 'bg-[#49483e]/70',
      rowMatchClass: 'bg-[#5a4a1b]/60',
      userLogicRowClass: 'bg-[#333c24]/80 border-l-2 border-[#a6e22e]',
      caretSelectionClass: 'caret-[#f8f8f0] selection:bg-[#49483e] selection:text-white',
      searchMarkClass: 'bg-[#e6db74] text-[#272822] rounded-xs px-0.5 font-bold',
    },
    tokens: {
      whitespace: '',
      comment: 'text-[#75715e] italic',
      banner_comment: 'text-[#9b9680] font-semibold italic',
      user_logic_marker: 'text-[#a6e22e] font-bold bg-[#a6e22e]/15 px-0.5 rounded-xs',
      keyword: 'text-[#f92672] font-bold',
      builtin: 'text-[#66d9ef] font-semibold',
      type: 'text-[#66d9ef] font-semibold italic',
      sysvar: 'text-[#ae81ff] font-semibold',
      string: 'text-[#e6db74]',
      number: 'text-[#ae81ff]',
      field_symbol: 'text-[#fd971f] font-semibold',
      variable: 'text-[#a6e22e] font-medium',
      operator: 'text-[#f92672] font-semibold',
      punctuation: 'text-[#cfcfc2]',
      plain: 'text-[#f8f8f2]',
    },
  },
  solarized_light: {
    id: 'solarized_light',
    name: 'Solarized Light',
    nameKo: '솔라라이즈드 라이트',
    description: 'Low-glare warm cream theme matched to SAP Belize',
    descriptionKo: 'SAP Belize에 어울리는 눈이 편안한 크림 톤 테마',
    isDark: false,
    swatches: ['#fdf6e3', '#859900', '#2aa198', '#268bd2'],
    surface: {
      canvasClass: 'bg-[#fdf6e3] text-[#586e75]',
      editGutterClass: 'bg-[#eee8d5] border-[#ddd6c1] text-[#93a1a1]',
      gutterClass: 'bg-[#eee8d5] text-[#93a1a1] border-[#ddd6c1]',
      gutterSelectedClass: 'bg-[#e4dec8] text-[#073642] border-[#cbc3a9]',
      gutterMatchClass: 'bg-[#f5e1a4] text-[#805500] border-[#d6b763]',
      rowHoverClass: 'hover:bg-[#eee8d5]/60',
      rowSelectedClass: 'bg-[#eee8d5]',
      rowMatchClass: 'bg-[#b58900]/15',
      userLogicRowClass: 'bg-[#859900]/12 border-l-2 border-[#859900]',
      caretSelectionClass: 'caret-[#073642] selection:bg-[#eee8d5] selection:text-[#073642]',
      searchMarkClass: 'bg-[#b58900] text-[#fdf6e3] rounded-xs px-0.5 font-bold',
    },
    tokens: {
      whitespace: '',
      comment: 'text-[#93a1a1] italic',
      banner_comment: 'text-[#657b83] font-semibold italic',
      user_logic_marker: 'text-[#859900] font-bold bg-[#859900]/15 px-0.5 rounded-xs',
      keyword: 'text-[#859900] font-bold',
      builtin: 'text-[#268bd2] font-semibold',
      type: 'text-[#b58900] font-semibold',
      sysvar: 'text-[#6c71c4] font-semibold',
      string: 'text-[#2aa198]',
      number: 'text-[#d33682]',
      field_symbol: 'text-[#cb4b16] font-semibold',
      variable: 'text-[#268bd2] font-medium',
      operator: 'text-[#657b83] font-semibold',
      punctuation: 'text-[#839496]',
      plain: 'text-[#586e75]',
    },
  },
  solarized_dark: {
    id: 'solarized_dark',
    name: 'Solarized Dark',
    nameKo: '솔라라이즈드 다크',
    description: 'Deep teal-slate night palette with balanced contrast',
    descriptionKo: '균형 잡힌 대비의 딥 틸 슬레이트 다크 팔레트',
    isDark: true,
    swatches: ['#002b36', '#859900', '#2aa198', '#268bd2'],
    surface: {
      canvasClass: 'bg-[#002b36] text-[#93a1a1]',
      editGutterClass: 'bg-[#073642] border-[#0b4453] text-[#586e75]',
      gutterClass: 'bg-[#002b36] text-[#586e75] border-[#073642]',
      gutterSelectedClass: 'bg-[#073642] text-[#eee8d5] border-[#115061]',
      gutterMatchClass: 'bg-[#594300] text-[#fde68a] border-[#8a6800]',
      rowHoverClass: 'hover:bg-[#073642]/70',
      rowSelectedClass: 'bg-[#073642]',
      rowMatchClass: 'bg-[#b58900]/20',
      userLogicRowClass: 'bg-[#0d4034]/75 border-l-2 border-[#2aa198]',
      caretSelectionClass: 'caret-[#eee8d5] selection:bg-[#073642] selection:text-[#fdf6e3]',
      searchMarkClass: 'bg-[#b58900] text-[#002b36] rounded-xs px-0.5 font-bold',
    },
    tokens: {
      whitespace: '',
      comment: 'text-[#586e75] italic',
      banner_comment: 'text-[#839496] font-semibold italic',
      user_logic_marker: 'text-[#2aa198] font-bold bg-[#2aa198]/20 px-0.5 rounded-xs',
      keyword: 'text-[#859900] font-bold',
      builtin: 'text-[#268bd2] font-semibold',
      type: 'text-[#b58900] font-semibold',
      sysvar: 'text-[#6c71c4] font-semibold',
      string: 'text-[#2aa198]',
      number: 'text-[#d33682]',
      field_symbol: 'text-[#cb4b16] font-semibold',
      variable: 'text-[#268bd2] font-medium',
      operator: 'text-[#93a1a1] font-semibold',
      punctuation: 'text-[#657b83]',
      plain: 'text-[#93a1a1]',
    },
  },
};

export const ABAP_SYNTAX_THEME_LIST: AbapSyntaxThemeDefinition[] = [
  ABAP_SYNTAX_THEMES.se38_light,
  ABAP_SYNTAX_THEMES.vscode_dark,
  ABAP_SYNTAX_THEMES.monokai,
  ABAP_SYNTAX_THEMES.solarized_light,
  ABAP_SYNTAX_THEMES.solarized_dark,
];

export const SAP_GUI_MATCHED_SYNTAX_THEME: Record<SapGuiTheme, AbapSyntaxThemeId> = {
  blue_crystal: 'se38_light',
  belize: 'solarized_light',
  quartz: 'vscode_dark',
};

export function normalizeAbapSyntaxTheme(theme?: AbapSyntaxTheme | string | null): AbapSyntaxThemeId {
  if (theme === 'light' || theme === 'se38_light') return 'se38_light';
  if (theme === 'dark' || theme === 'vscode_dark') return 'vscode_dark';
  if (theme === 'monokai') return 'monokai';
  if (theme === 'solarized_light') return 'solarized_light';
  if (theme === 'solarized_dark') return 'solarized_dark';
  return 'se38_light';
}

export function resolveAbapThemeForSapGui(sapTheme: SapGuiTheme): AbapSyntaxThemeId {
  return SAP_GUI_MATCHED_SYNTAX_THEME[sapTheme] || 'se38_light';
}

function renderTokenTextWithSearch(
  text: string,
  searchQuery?: string,
  searchMarkClass: string = ABAP_SYNTAX_THEMES.se38_light.surface.searchMarkClass
): React.ReactNode {
  const q = searchQuery?.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  if (!lowerText.includes(lowerQ)) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIdx = lowerText.indexOf(lowerQ, cursor);
  let keyCounter = 0;

  while (matchIdx !== -1) {
    if (matchIdx > cursor) {
      parts.push(text.slice(cursor, matchIdx));
    }
    parts.push(
      <mark key={`m-${keyCounter++}`} className={searchMarkClass}>
        {text.slice(matchIdx, matchIdx + q.length)}
      </mark>
    );
    cursor = matchIdx + q.length;
    matchIdx = lowerText.indexOf(lowerQ, cursor);
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

export interface HighlightedAbapLineProps {
  line: string;
  theme?: AbapSyntaxTheme;
  searchQuery?: string;
}

/**
 * Renders a single ABAP line with lightweight SAP SE38 / ADT syntax highlighting.
 */
export const HighlightedAbapLine: React.FC<HighlightedAbapLineProps> = ({
  line,
  theme = 'se38_light',
  searchQuery,
}) => {
  const tokens = React.useMemo(() => tokenizeAbapLine(line), [line]);
  const themeDef = ABAP_SYNTAX_THEMES[normalizeAbapSyntaxTheme(theme)];
  const palette = themeDef.tokens;

  return (
    <span className="font-mono">
      {tokens.map((tok, idx) => {
        if (tok.type === 'whitespace') {
          return <span key={idx}>{tok.value}</span>;
        }
        return (
          <span key={idx} className={palette[tok.type]}>
            {renderTokenTextWithSearch(tok.value, searchQuery, themeDef.surface.searchMarkClass)}
          </span>
        );
      })}
    </span>
  );
};
