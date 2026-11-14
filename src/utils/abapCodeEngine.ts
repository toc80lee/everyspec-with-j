import {
  AbapSyntaxMode,
  AlvField,
  AlvSortField,
  ProgramSourceCodeTabs,
  ProgramSpec,
  ProjectAbapStandards,
  SelectionParameter,
} from '../types/sap';

export interface AbapEngineOptions {
  syntaxMode?: AbapSyntaxMode;
  standards?: ProjectAbapStandards;
}

const DEFAULT_STANDARDS: Required<ProjectAbapStandards> = {
  common_top_include: 'zcommtop',
  common_form_include: 'zcommf01',
  grid_class_name: 'cl_gui_alv_grid',
  message_class: 'Z01',
  default_syntax_mode: 'modern_740',
  program_prefix: '',
  tcode_pattern: '',
  dev_package: '$TMP',
};

export function resolveStandards(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): Required<ProjectAbapStandards> {
  return {
    common_top_include:
      opt?.standards?.common_top_include?.trim().toLowerCase() || DEFAULT_STANDARDS.common_top_include,
    common_form_include:
      opt?.standards?.common_form_include?.trim().toLowerCase() || DEFAULT_STANDARDS.common_form_include,
    grid_class_name:
      opt?.standards?.grid_class_name?.trim().toLowerCase() || DEFAULT_STANDARDS.grid_class_name,
    message_class:
      (spec.message_class || opt?.standards?.message_class || DEFAULT_STANDARDS.message_class)
        .trim()
        .toUpperCase()
        .slice(0, 20),
    default_syntax_mode:
      opt?.syntaxMode ||
      spec.abap_syntax_mode ||
      opt?.standards?.default_syntax_mode ||
      'modern_740',
    program_prefix: opt?.standards?.program_prefix?.trim().toUpperCase() || '',
    tcode_pattern: opt?.standards?.tcode_pattern?.trim().toUpperCase() || '',
    dev_package: opt?.standards?.dev_package?.trim().toUpperCase() || '$TMP',
  };
}

/**
 * Preserve user-written code blocks marked with:
 * *&--- BEGIN USER LOGIC (<TAG>)
 * ...
 * *&--- END USER LOGIC (<TAG>)
 */
export function mergeUserLogicRegions(generated: string, previous?: string): string {
  if (!previous) return generated;
  const blockRegex =
    /(\*&--- BEGIN USER LOGIC \(([^)]+)\)[^\n]*\n)([\s\S]*?)(\*&--- END USER LOGIC \(\2\))/g;
  const preserved = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(previous)) !== null) {
    preserved.set(match[2], match[3]);
  }
  if (preserved.size === 0) return generated;

  return generated.replace(
    /(\*&--- BEGIN USER LOGIC \(([^)]+)\)[^\n]*\n)([\s\S]*?)(\*&--- END USER LOGIC \(\2\))/g,
    (full, startTag, tagName, defaultBody, endTag) => {
      const customBody = preserved.get(tagName);
      return customBody !== undefined ? `${startTag}${customBody}${endTag}` : full;
    }
  );
}

function buildAbapFieldType(f: AlvField): string {
  if (f.ref_table && f.ref_field) {
    return `${f.ref_table.toLowerCase()}-${f.ref_field.toLowerCase()}`;
  }
  switch (f.datatype) {
    case 'CHAR':
      return `c LENGTH ${f.outputlen || 10}`;
    case 'NUMC':
      return `n LENGTH ${f.outputlen || 4}`;
    case 'DATS':
      return 'd';
    case 'TIMS':
      return 't';
    case 'CURR':
      return `p LENGTH 8 DECIMALS ${f.decimals ?? 2}`;
    case 'DEC':
      return `p LENGTH ${Math.max(4, Math.ceil((f.outputlen || 10) / 2))} DECIMALS ${f.decimals ?? 2}`;
    case 'UNIT':
      return 'meins';
    case 'CUKY':
      return 'waers';
    case 'INT4':
      return 'i';
    case 'STRING':
      return 'string';
    default:
      return 'string';
  }
}

function buildStructFields(fields: AlvField[]): string {
  if (!fields || fields.length === 0) {
    return `    zicon     TYPE icon-id,
    doc_no    TYPE c LENGTH 12,
    doc_date  TYPE d,
    amount    TYPE p LENGTH 8 DECIMALS 2,
    currency  TYPE waers,`;
  }
  return fields
    .map((f) => {
      const fname = f.fieldname.toLowerCase();
      if (fname === 'zicon' || fname === 'lights') {
        return `    ${fname.padEnd(14)}TYPE c LENGTH 1,          " Exception / Status Icon`;
      }
      if (fname === 'checkbox') {
        return `    ${fname.padEnd(14)}TYPE c LENGTH 1,          " Row Checkbox`;
      }
      const abapType = buildAbapFieldType(f);
      return `    ${fname.padEnd(14)}TYPE ${abapType},  " ${f.coltext || f.fieldname}`;
    })
    .join('\n');
}

function formatSelectionParameterLine(p: SelectionParameter, indent: string): string {
  const safeName = (p.name || 'P_PARAM').trim().toLowerCase().slice(0, 8);
  const oblig = p.obligatory ? ' OBLIGATORY' : '';
  const def = p.default_val ? ` DEFAULT '${p.default_val.replace(/'/g, "''")}'` : '';
  const mem = p.memory_id ? ` MEMORY ID ${p.memory_id.toUpperCase()}` : '';
  const matchcode = p.matchcode_object ? ` MATCHCODE OBJECT ${p.matchcode_object.toLowerCase()}` : '';

  if (p.kind === 'RADIOBUTTON') {
    const grp = (p.radio_group || 'R1').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 4) || 'r1';
    const rDef = p.default_val?.toUpperCase() === 'X' ? ` DEFAULT 'X'` : '';
    return `${indent}PARAMETERS: ${safeName} RADIOBUTTON GROUP ${grp}${rDef}. " ${p.text}`;
  }
  if (p.kind === 'CHECKBOX') {
    const cDef = p.default_val?.toUpperCase() === 'X' ? ` DEFAULT 'X'` : '';
    return `${indent}PARAMETERS: ${safeName} AS CHECKBOX${cDef}. " ${p.text}`;
  }

  const abapType =
    p.datatype === 'DATS'
      ? 'TYPE d'
      : p.datatype === 'TIMS'
      ? 'TYPE t'
      : p.datatype === 'INT4'
      ? 'TYPE i'
      : p.datatype === 'NUMC'
      ? `TYPE n LENGTH ${p.length || 4}`
      : p.datatype === 'CURR' || p.datatype === 'DEC'
      ? 'TYPE p LENGTH 8 DECIMALS 2'
      : p.datatype === 'STRING'
      ? 'TYPE string'
      : `TYPE c LENGTH ${p.length || 10}`;

  if (p.kind === 'PARAMETER') {
    const typeClause =
      p.ref_table && p.ref_field
        ? `TYPE ${p.ref_table.toLowerCase()}-${p.ref_field.toLowerCase()}`
        : abapType;
    return `${indent}PARAMETERS: ${safeName} ${typeClause}${oblig}${def}${mem}${matchcode}. " ${p.text}`;
  }

  // SELECT_OPTION
  if (p.ref_table && p.ref_field) {
    return `${indent}SELECT-OPTIONS: ${safeName} FOR ${p.ref_table.toLowerCase()}-${p.ref_field.toLowerCase()}${oblig}${def}${mem}${matchcode}. " ${p.text}`;
  }
  const forTarget = p.datatype === 'DATS' ? 'sy-datum' : `${safeName}_val`;
  const varDecl = p.datatype === 'DATS' ? '' : `${indent}DATA: ${safeName}_val ${abapType}.\n`;
  return `${varDecl}${indent}SELECT-OPTIONS: ${safeName} FOR ${forTarget}${oblig}${def}${matchcode}. " ${p.text}`;
}

export function generateProgramInclude(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): string {
  const std = resolveStandards(spec, opt);
  const progId = (spec.program_id || 'ZRALV0010').trim().toUpperCase();
  const progLower = progId.toLowerCase();
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const f4Params = (spec.selection_params || []).filter((p) => p.f4_custom_logic?.trim());

  const valueRequestEvents = f4Params
    .map(
      (p) =>
        `AT SELECTION-SCREEN ON VALUE-REQUEST FOR ${p.name.toLowerCase().slice(0, 8)}${
          p.kind === 'SELECT_OPTION' ? '-low' : ''
        }.\n  PERFORM f4_${p.name.toLowerCase().slice(0, 8)}.`
    )
    .join('\n\n');

  return `************************************************************************
* Module(Sub)  : ${spec.module || 'SD'}
* Package      : ${std.dev_package}
* Program ID   : ${progId}
* Program Name : ${spec.title || 'ALV Report'}
* Type         : ${spec.program_type || 'REPORT'} (Sample Type ${spec.sample_type || '01'})
* T-Code       : ${(spec.tcode || progId).toUpperCase()}
* Syntax Mode  : ${std.default_syntax_mode === 'modern_740' ? 'ABAP 7.40+ Modern' : 'Classic ABAP'}
* Author       : ${spec.author || 'Josh Lee'}
* Create Date  : ${spec.created_date?.replace(/-/g, '.') || today}
************************************************************************
REPORT ${progLower}
       MESSAGE-ID ${std.message_class.toLowerCase()}
       NO STANDARD PAGE HEADING
       LINE-SIZE 255.

*----------------------------------------------------------------------*
* INCLUDE MODULES
*----------------------------------------------------------------------*
* INCLUDE ${std.common_top_include}. " Project Common Top (optional)
* INCLUDE ${std.common_form_include}. " Project Common Subroutines (optional)
INCLUDE ${progLower}top.
INCLUDE ${progLower}s01.
INCLUDE ${progLower}c01.
INCLUDE ${progLower}mod.
INCLUDE ${progLower}f01.

*----------------------------------------------------------------------*
* INITIALIZATION
*----------------------------------------------------------------------*
INITIALIZATION.
  PERFORM set_init.

*----------------------------------------------------------------------*
* AT SELECTION-SCREEN
*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
  PERFORM validate_selection.

${valueRequestEvents ? `${valueRequestEvents}\n\n` : ''}*----------------------------------------------------------------------*
* START-OF-SELECTION
*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM check_authority.
  PERFORM get_data.
  PERFORM process_data.

*----------------------------------------------------------------------*
* END-OF-SELECTION
*----------------------------------------------------------------------*
END-OF-SELECTION.
  PERFORM end_of_selection.
`;
}

export function generateTopInclude(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): string {
  const std = resolveStandards(spec, opt);
  const sampleType = spec.sample_type || '01';
  const tablesSet = new Set<string>(['sscrfields']);
  (spec.selection_params || []).forEach((p) => {
    if (p.ref_table && p.ref_table !== 'SY') tablesSet.add(p.ref_table.toLowerCase());
  });

  const headerFieldsBlock = buildStructFields(spec.field_catalog || []);
  const itemFieldsBlock = buildStructFields(spec.item_grid?.field_catalog || []);

  let containerDeclarations = '';
  if (sampleType === '02') {
    containerDeclarations = `
" Master-Detail Dual Splitter ALV Objects
DATA: go_container TYPE REF TO cl_gui_custom_container,
      go_splitter  TYPE REF TO cl_gui_splitter_container,
      go_cont_hdr  TYPE REF TO cl_gui_container,
      go_cont_itm  TYPE REF TO cl_gui_container,
      go_grid_hdr  TYPE REF TO ${std.grid_class_name},
      go_grid_itm  TYPE REF TO ${std.grid_class_name},
      go_evt_hdr   TYPE REF TO lcl_event_receiver,
      go_evt_itm   TYPE REF TO lcl_event_receiver.

TYPES: BEGIN OF ty_hdr,
${headerFieldsBlock}
    rowcolor      TYPE c LENGTH 4,
    cellstyle     TYPE lvc_t_styl,
  END OF ty_hdr,
  BEGIN OF ty_itm,
${itemFieldsBlock}
    rowcolor      TYPE c LENGTH 4,
    cellstyle     TYPE lvc_t_styl,
  END OF ty_itm.

DATA: gt_hdr TYPE STANDARD TABLE OF ty_hdr WITH DEFAULT KEY,
      gs_hdr TYPE ty_hdr,
      gt_itm TYPE STANDARD TABLE OF ty_itm WITH DEFAULT KEY,
      gt_itm_disp TYPE STANDARD TABLE OF ty_itm WITH DEFAULT KEY,
      gs_itm TYPE ty_itm.

DATA: gt_fcat_hdr TYPE lvc_t_fcat,
      gt_fcat_itm TYPE lvc_t_fcat,
      gs_layo_hdr TYPE lvc_s_layo,
      gs_layo_itm TYPE lvc_s_layo,
      gt_sort_hdr TYPE lvc_t_sort,
      gt_sort_itm TYPE lvc_t_sort.`;
  } else if (sampleType === '03') {
    containerDeclarations = `
" Tree Hierarchy + Detail ALV Objects
DATA: go_container TYPE REF TO cl_gui_custom_container,
      go_splitter  TYPE REF TO cl_gui_splitter_container,
      go_cont_tree TYPE REF TO cl_gui_container,
      go_cont_grid TYPE REF TO cl_gui_container,
      go_tree      TYPE REF TO cl_gui_alv_tree,
      go_grid      TYPE REF TO ${std.grid_class_name},
      go_event_rcv TYPE REF TO lcl_event_receiver.

TYPES: BEGIN OF ty_tree_data,
${headerFieldsBlock}
  END OF ty_tree_data,
  BEGIN OF ty_alv,
${spec.item_grid?.field_catalog?.length ? itemFieldsBlock : headerFieldsBlock}
    rowcolor      TYPE c LENGTH 4,
    cellstyle     TYPE lvc_t_styl,
  END OF ty_alv.

DATA: gt_tree_empty TYPE STANDARD TABLE OF ty_tree_data,
      gt_alv        TYPE STANDARD TABLE OF ty_alv WITH DEFAULT KEY,
      gt_alv_disp   TYPE STANDARD TABLE OF ty_alv WITH DEFAULT KEY,
      gs_alv        TYPE ty_alv,
      gt_fcat       TYPE lvc_t_fcat,
      gt_fcat_tree  TYPE lvc_t_fcat,
      gs_layo       TYPE lvc_s_layo,
      gt_sort       TYPE lvc_t_sort.`;
  } else if (sampleType === '04') {
    const cdsSource = (spec.cds_view_table || spec.pivot_config?.source_table_or_cds || 'ACDOCA').toUpperCase();
    containerDeclarations = `
" S/4HANA Analytic Pivot / IDA Objects (${cdsSource})
CONSTANTS: gc_cds_source TYPE string VALUE '${cdsSource}'.

DATA: go_ida_grid  TYPE REF TO if_salv_gui_table_ida,
      go_container TYPE REF TO cl_gui_custom_container.

TYPES: BEGIN OF ty_alv,
${headerFieldsBlock}
  END OF ty_alv.

DATA: gt_alv      TYPE STANDARD TABLE OF ty_alv WITH DEFAULT KEY,
      gs_alv      TYPE ty_alv.`;
  } else {
    containerDeclarations = `
" Single ALV Grid Objects
DATA: go_container TYPE REF TO cl_gui_custom_container,
      go_grid      TYPE REF TO ${std.grid_class_name},
      go_event_rcv TYPE REF TO lcl_event_receiver.

TYPES: BEGIN OF ty_alv,
${headerFieldsBlock}
    rowcolor      TYPE c LENGTH 4,
    cellstyle     TYPE lvc_t_styl,
  END OF ty_alv.

DATA: gt_alv      TYPE STANDARD TABLE OF ty_alv WITH DEFAULT KEY,
      gs_alv      TYPE ty_alv,
      gt_fcat     TYPE lvc_t_fcat,
      gs_fcat     TYPE lvc_s_fcat,
      gs_layo     TYPE lvc_s_layo,
      gt_sort     TYPE lvc_t_sort,
      gs_variant  TYPE disvariant.`;
  }

  return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}TOP
************************************************************************
CLASS lcl_event_receiver DEFINITION DEFERRED.

TABLES: ${Array.from(tablesSet).join(', ')}.

DATA: ok_code TYPE sy-ucomm,
      save_ok TYPE sy-ucomm,
      gs_variant_std TYPE disvariant.
${containerDeclarations}

*&--- BEGIN USER LOGIC (TOP_CUSTOM_DATA)
" Add custom global variables or types here
*&--- END USER LOGIC (TOP_CUSTOM_DATA)
`;
}

export function generateS01Include(spec: Partial<ProgramSpec>): string {
  const params = spec.selection_params || [];
  if (params.length === 0) {
    return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}S01 : Selection Screen
************************************************************************
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  " No selection parameters configured yet
SELECTION-SCREEN END OF BLOCK b1.
`;
  }

  type Group = { isBox: boolean; blockId: string; title: string; items: SelectionParameter[] };
  const groups: Group[] = [];
  const boxMap = new Map<string, Group>();

  params.forEach((p) => {
    const rawId = p.block_id?.trim();
    const rawTitle = p.block_title?.trim();
    if (rawId || rawTitle) {
      const key = rawId || `box_${rawTitle}`;
      if (!boxMap.has(key)) {
        const g: Group = {
          isBox: true,
          blockId: (rawId || `b${boxMap.size + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 8) || `b${boxMap.size + 1}`,
          title: rawTitle || rawId || '조회 조건',
          items: [],
        };
        boxMap.set(key, g);
        groups.push(g);
      }
      boxMap.get(key)!.items.push(p);
    } else {
      const last = groups[groups.length - 1];
      if (last && !last.isBox) last.items.push(p);
      else groups.push({ isBox: false, blockId: '', title: '', items: [p] });
    }
  });

  let idx = 1;
  const blocks: string[] = [];
  const textSymbols: string[] = [];

  groups.forEach((grp) => {
    if (grp.isBox) {
      const tNo = String(idx).padStart(3, '0');
      textSymbols.push(`*   TEXT-${tNo} = '${grp.title.replace(/'/g, "''")}'.`);
      blocks.push(
        [
          `SELECTION-SCREEN BEGIN OF BLOCK ${grp.blockId} WITH FRAME TITLE TEXT-${tNo}. " ${grp.title}`,
          ...grp.items.map((p) => formatSelectionParameterLine(p, '  ')),
          `SELECTION-SCREEN END OF BLOCK ${grp.blockId}.`,
        ].join('\n')
      );
      idx += 1;
    } else {
      blocks.push(grp.items.map((p) => formatSelectionParameterLine(p, '')).join('\n'));
    }
  });

  return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}S01 : Selection Screen
************************************************************************
${blocks.join('\n\n')}

${textSymbols.length > 0 ? `* Text Symbols for Frame Titles:\n${textSymbols.join('\n')}` : ''}
`;
}

export function generateC01Include(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): string {
  const std = resolveStandards(spec, opt);
  const sampleType = spec.sample_type || '01';
  const gridClass = std.grid_class_name;

  if (sampleType === '03') {
    const groupField = (spec.tree_config?.group_field || 'CARRID').toLowerCase();
    return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}C01 : Tree & ALV Event Class
************************************************************************
CLASS lcl_event_receiver DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS:
      handle_node_double_click FOR EVENT node_double_click OF cl_gui_alv_tree
        IMPORTING node_key,
      handle_hotspot_click FOR EVENT hotspot_click OF ${gridClass}
        IMPORTING e_row_id e_column_id,
      handle_toolbar FOR EVENT toolbar OF ${gridClass}
        IMPORTING e_object e_interactive,
      handle_user_command FOR EVENT user_command OF ${gridClass}
        IMPORTING e_ucomm.
ENDCLASS.

CLASS lcl_event_receiver IMPLEMENTATION.
  METHOD handle_node_double_click.
    " Filter detail grid rows matching selected tree node (${groupField})
    PERFORM filter_grid_by_node USING node_key.
  ENDMETHOD.

  METHOD handle_hotspot_click.
    PERFORM on_hotspot_click USING e_row_id-index e_column_id-fieldname.
  ENDMETHOD.

  METHOD handle_toolbar.
    PERFORM on_toolbar CHANGING e_object->mt_toolbar.
  ENDMETHOD.

  METHOD handle_user_command.
    PERFORM on_user_command USING e_ucomm.
  ENDMETHOD.
ENDCLASS.
`;
  }

  return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}C01 : Local Event Receiver Class
************************************************************************
CLASS lcl_event_receiver DEFINITION FINAL.
  PUBLIC SECTION.
    DATA: mv_grid_id TYPE char30.
    METHODS:
      constructor
        IMPORTING iv_grid_id TYPE char30 DEFAULT 'HDR',
      handle_hotspot_click
        FOR EVENT hotspot_click OF ${gridClass}
        IMPORTING e_row_id e_column_id,
      handle_double_click
        FOR EVENT double_click OF ${gridClass}
        IMPORTING e_row e_column,
      handle_toolbar
        FOR EVENT toolbar OF ${gridClass}
        IMPORTING e_object e_interactive,
      handle_user_command
        FOR EVENT user_command OF ${gridClass}
        IMPORTING e_ucomm,
      handle_data_changed
        FOR EVENT data_changed OF ${gridClass}
        IMPORTING er_data_changed.
ENDCLASS.

CLASS lcl_event_receiver IMPLEMENTATION.
  METHOD constructor.
    mv_grid_id = iv_grid_id.
  ENDMETHOD.

  METHOD handle_hotspot_click.
    PERFORM on_hotspot_click USING mv_grid_id e_row_id-index e_column_id-fieldname.
  ENDMETHOD.

  METHOD handle_double_click.
    PERFORM on_double_click USING mv_grid_id e_row-index e_column-fieldname.
  ENDMETHOD.

  METHOD handle_toolbar.
    PERFORM on_toolbar USING mv_grid_id CHANGING e_object->mt_toolbar.
  ENDMETHOD.

  METHOD handle_user_command.
    PERFORM on_user_command USING mv_grid_id e_ucomm.
  ENDMETHOD.

  METHOD handle_data_changed.
    PERFORM on_data_changed USING mv_grid_id er_data_changed.
  ENDMETHOD.
ENDCLASS.
`;
}

export function generateModInclude(spec: Partial<ProgramSpec>): string {
  const sampleType = spec.sample_type || '01';
  const title = spec.title || 'ALV Report';

  const initCall =
    sampleType === '02'
      ? `  IF go_container IS INITIAL.
    PERFORM init_splitter_alv.
  ELSE.
    PERFORM refresh_dual_alv.
  ENDIF.`
      : sampleType === '03'
      ? `  IF go_container IS INITIAL.
    PERFORM init_tree_alv.
  ELSE.
    PERFORM refresh_single_alv.
  ENDIF.`
      : sampleType === '04'
      ? `  IF go_container IS INITIAL.
    PERFORM init_ida_or_pivot_alv.
  ENDIF.`
      : `  IF go_container IS INITIAL.
    PERFORM init_single_alv.
  ELSE.
    PERFORM refresh_single_alv.
  ENDIF.`;

  return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}MOD : PBO / PAI Modules
************************************************************************
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'STATUS_0100'.
  SET TITLEBAR  'TITLE_0100' WITH '${title.replace(/'/g, "''")}'.

${initCall}
ENDMODULE.

MODULE user_command_0100 INPUT.
  save_ok = ok_code.
  CLEAR ok_code.

  CASE save_ok.
    WHEN 'BACK' OR 'CANC'.
      LEAVE TO SCREEN 0.
    WHEN 'EXIT'.
      LEAVE PROGRAM.
    WHEN 'REFRESH'.
      PERFORM get_data.
      PERFORM process_data.
  ENDCASE.
ENDMODULE.
`;
}

function buildSortLines(sortFields: AlvSortField[] | undefined, tableVar: string, isModern: boolean): string {
  if (!sortFields || sortFields.length === 0) return `  " No default LVC_T_SORT entries configured`;
  return sortFields
    .slice()
    .sort((a, b) => a.spos - b.spos)
    .map((s) => {
      if (isModern) {
        return `  APPEND VALUE #( spos = ${s.spos} fieldname = '${s.fieldname.toUpperCase()}' up = '${
          s.up ? 'X' : ''
        }' down = '${s.down ? 'X' : ''}' subtot = '${s.subtot || s.subtotal ? 'X' : ''}' expa = '${
          s.expa ? 'X' : ''
        }' ) TO ${tableVar}.`;
      }
      return `  APPEND INITIAL LINE TO ${tableVar} ASSIGNING FIELD-SYMBOL(<ls_sort>).
  <ls_sort>-spos      = ${s.spos}.
  <ls_sort>-fieldname = '${s.fieldname.toUpperCase()}'.
  <ls_sort>-up        = '${s.up ? 'X' : ''}'.
  <ls_sort>-down      = '${s.down ? 'X' : ''}'.
  <ls_sort>-subtot    = '${s.subtot || s.subtotal ? 'X' : ''}'.`;
    })
    .join('\n');
}

function buildFcatLines(fields: AlvField[], tableVar: string, isModern: boolean): string {
  if (!fields || fields.length === 0) return `  " Empty Field Catalog`;
  return fields
    .map((f) => {
      const fn = f.fieldname.toUpperCase();
      const txt = (f.coltext || fn).replace(/'/g, "''");
      if (isModern) {
        const extras: string[] = [];
        if (f.cfieldname) extras.push(`cfieldname = '${f.cfieldname.toUpperCase()}'`);
        if (f.qfieldname) extras.push(`qfieldname = '${f.qfieldname.toUpperCase()}'`);
        if (f.ref_table) extras.push(`ref_table = '${f.ref_table.toUpperCase()}'`);
        if (f.ref_field) extras.push(`ref_field = '${f.ref_field.toUpperCase()}'`);
        if (f.emphasize) extras.push(`emphasize = '${f.emphasize}'`);
        return `    VALUE #( col_pos = ${f.col_pos} fieldname = '${fn}' coltext = '${txt}' key = '${
          f.key ? 'X' : ''
        }' hotspot = '${f.hotspot ? 'X' : ''}' checkbox = '${f.checkbox ? 'X' : ''}' edit = '${
          f.edit ? 'X' : ''
        }' do_sum = '${f.do_sum ? 'X' : ''}' just = '${f.just}' outputlen = ${f.outputlen}${
          extras.length ? ' ' + extras.join(' ') : ''
        } )`;
      }
      return `  CLEAR ls_fcat.
  ls_fcat-col_pos   = ${f.col_pos}.
  ls_fcat-fieldname = '${fn}'.
  ls_fcat-coltext   = '${txt}'.
  ls_fcat-key       = '${f.key ? 'X' : ''}'.
  ls_fcat-hotspot   = '${f.hotspot ? 'X' : ''}'.
  ls_fcat-checkbox  = '${f.checkbox ? 'X' : ''}'.
  ls_fcat-edit      = '${f.edit ? 'X' : ''}'.
  ls_fcat-do_sum    = '${f.do_sum ? 'X' : ''}'.
  ls_fcat-just      = '${f.just}'.
  ls_fcat-outputlen = ${f.outputlen}.${
        f.cfieldname ? `\n  ls_fcat-cfieldname = '${f.cfieldname.toUpperCase()}'.` : ''
      }${f.qfieldname ? `\n  ls_fcat-qfieldname = '${f.qfieldname.toUpperCase()}'.` : ''}${
        f.emphasize ? `\n  ls_fcat-emphasize = '${f.emphasize}'.` : ''
      }
  APPEND ls_fcat TO ${tableVar}.`;
    })
    .join('\n');
}

function buildLayoutLines(spec: Partial<ProgramSpec>, layoVar: string, isModern: boolean): string {
  const l = spec.layout;
  const title = (l?.grid_title || spec.title || '').replace(/'/g, "''");
  if (isModern) {
    return `  ${layoVar} = VALUE #(
    grid_title = '${title}'
    zebra      = '${l?.zebra ? 'X' : ''}'
    cwidth_opt = '${l?.cwidth_opt ? 'X' : ''}'
    sel_mode   = '${l?.sel_mode || 'A'}'${l?.excp_fname ? `\n    excp_fname = '${l.excp_fname}' excp_led = 'X'` : ''}${
      l?.info_fname ? `\n    info_fname = '${l.info_fname}'` : ''
    }${l?.no_toolbar ? `\n    no_toolbar = 'X'` : ''}
  ).`;
  }
  return `  CLEAR ${layoVar}.
  ${layoVar}-grid_title = '${title}'.
  ${layoVar}-zebra      = '${l?.zebra ? 'X' : ''}'.
  ${layoVar}-cwidth_opt = '${l?.cwidth_opt ? 'X' : ''}'.
  ${layoVar}-sel_mode   = '${l?.sel_mode || 'A'}'.${
    l?.excp_fname ? `\n  ${layoVar}-excp_fname = '${l.excp_fname}'.\n  ${layoVar}-excp_led = 'X'.` : ''
  }`;
}

export function generateF01Include(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): string {
  const std = resolveStandards(spec, opt);
  const isModern = std.default_syntax_mode === 'modern_740';
  const sampleType = spec.sample_type || '01';
  const msgClass = std.message_class.toLowerCase();

  // Authority checks from FS/TS Governance
  const authChecks = spec.authority_checks || [];
  const authLines =
    authChecks.length > 0
      ? authChecks
          .map(
            (ac) =>
              `  " ${ac.description} (${ac.trigger_point})\n  AUTHORITY-CHECK OBJECT '${ac.object.toUpperCase()}'\n    ID 'ACTVT' FIELD '03'.\n  IF sy-subrc <> 0.\n    MESSAGE e003(${msgClass}) WITH '${ac.object.toUpperCase()}'.\n  ENDIF.`
          )
          .join('\n\n')
      : `  " No specific AUTHORITY-CHECK objects declared in FS/TS governance`;

  // Sort & Field Catalog definitions
  const headerFcatCode = isModern
    ? `  gt_fcat${sampleType === '02' ? '_hdr' : ''} = VALUE #(\n${buildFcatLines(
        spec.field_catalog || [],
        '',
        true
      )}\n  ).`
    : `  DATA ls_fcat TYPE lvc_s_fcat.\n  CLEAR gt_fcat${sampleType === '02' ? '_hdr' : ''}.\n${buildFcatLines(
        spec.field_catalog || [],
        sampleType === '02' ? 'gt_fcat_hdr' : 'gt_fcat',
        false
      )}`;

  const headerSortCode = buildSortLines(
    spec.sort_fields,
    sampleType === '02' ? 'gt_sort_hdr' : 'gt_sort',
    isModern
  );

  // Hotspot drilldown branches
  const hotspotFields = (spec.field_catalog || []).filter((f) => f.hotspot && f.drilldown_tcode);
  const hotspotCases =
    hotspotFields.length > 0
      ? hotspotFields
          .map(
            (f) => `      WHEN '${f.fieldname.toUpperCase()}'.
        SET PARAMETER ID '${
          f.fieldname === 'VBELN' ? 'AUN' : f.fieldname === 'EBELN' ? 'BES' : f.fieldname === 'BELNR' ? 'BLN' : 'MAT'
        }' FIELD <ls_row>-${f.fieldname.toLowerCase()}.
        CALL TRANSACTION '${f.drilldown_tcode!.toUpperCase()}' AND SKIP FIRST SCREEN.`
          )
          .join('\n')
      : `      WHEN OTHERS.\n        MESSAGE s000(${msgClass}) WITH 'Hotspot clicked:' iv_fieldname.`;

  // Custom Toolbar buttons
  const customBtns = [
    ...(spec.toolbar_buttons?.filter((b) => !b.is_standard && b.visible !== false) || []),
    ...(spec.custom_toolbar || []).filter((cb) => !spec.toolbar_buttons?.some((tb) => tb.function === cb.function)),
  ];

  const toolbarAppend = customBtns
    .map((tb) =>
      isModern
        ? `  APPEND VALUE #( function = '${tb.function}' icon = icon_execute_object quickinfo = '${tb.quickinfo}' text = '${tb.text}' ) TO ct_toolbar.`
        : `  CLEAR ls_btn.\n  ls_btn-function = '${tb.function}'.\n  ls_btn-icon = icon_execute_object.\n  ls_btn-text = '${tb.text}'.\n  APPEND ls_btn TO ct_toolbar.`
    )
    .join('\n');

  const userCmdCases = customBtns
    .map((tb) => `    WHEN '${tb.function}'.\n      PERFORM do_${tb.function.toLowerCase()}.`)
    .join('\n');

  const customSubroutines = customBtns
    .map(
      (tb) => `FORM do_${tb.function.toLowerCase()}.
*&--- BEGIN USER LOGIC (CUSTOM_CMD_${tb.function.toUpperCase()})
  MESSAGE s000(${msgClass}) WITH '${tb.text} 실행'.
*&--- END USER LOGIC (CUSTOM_CMD_${tb.function.toUpperCase()})
ENDFORM.`
    )
    .join('\n\n');

  // F4 Value Request forms
  const f4Forms = (spec.selection_params || [])
    .filter((p) => p.f4_custom_logic?.trim())
    .map(
      (p) => `FORM f4_${p.name.toLowerCase().slice(0, 8)}.
  " ${p.f4_custom_logic}
  " CALL FUNCTION 'F4IF_INT_TABLE_VALUE_REQUEST' ...
ENDFORM.`
    )
    .join('\n\n');

  // Batch / Performance logic
  const batchHandling = spec.performance_config?.batch_supported
    ? `  IF sy-batch = 'X'.
    " Background Job (SM36/SM37) Spool Output Path
    PERFORM write_batch_spool.
    RETURN.
  ENDIF.`
    : '';

  // Type-specific display routines
  let displaySubroutines = '';
  if (sampleType === '02') {
    const itemFcatCode = isModern
      ? `  gt_fcat_itm = VALUE #(\n${buildFcatLines(spec.item_grid?.field_catalog || [], '', true)}\n  ).`
      : `  CLEAR gt_fcat_itm.\n${buildFcatLines(spec.item_grid?.field_catalog || [], 'gt_fcat_itm', false)}`;
    const fkField = (spec.item_grid?.foreign_key || spec.field_catalog?.[0]?.fieldname || 'VBELN').toLowerCase();

    displaySubroutines = `FORM init_splitter_alv.
${
  isModern
    ? `  go_container = NEW cl_gui_custom_container( container_name = 'CC_ALV' ).
  go_splitter  = NEW cl_gui_splitter_container( parent = go_container rows = 2 columns = 1 ).
  go_cont_hdr  = go_splitter->get_container( row = 1 column = 1 ).
  go_cont_itm  = go_splitter->get_container( row = 2 column = 1 ).
  go_grid_hdr  = NEW ${std.grid_class_name}( i_parent = go_cont_hdr ).
  go_grid_itm  = NEW ${std.grid_class_name}( i_parent = go_cont_itm ).
  go_evt_hdr   = NEW lcl_event_receiver( iv_grid_id = 'HDR' ).
  go_evt_itm   = NEW lcl_event_receiver( iv_grid_id = 'ITM' ).`
    : `  CREATE OBJECT go_container EXPORTING container_name = 'CC_ALV'.
  CREATE OBJECT go_splitter EXPORTING parent = go_container rows = 2 columns = 1.
  CALL METHOD go_splitter->get_container EXPORTING row = 1 column = 1 RECEIVING container = go_cont_hdr.
  CALL METHOD go_splitter->get_container EXPORTING row = 2 column = 1 RECEIVING container = go_cont_itm.
  CREATE OBJECT go_grid_hdr EXPORTING i_parent = go_cont_hdr.
  CREATE OBJECT go_grid_itm EXPORTING i_parent = go_cont_itm.
  CREATE OBJECT go_evt_hdr EXPORTING iv_grid_id = 'HDR'.
  CREATE OBJECT go_evt_itm EXPORTING iv_grid_id = 'ITM'.`
}

${headerFcatCode}
${itemFcatCode}
${buildLayoutLines(spec, 'gs_layo_hdr', isModern)}
${buildLayoutLines(spec, 'gs_layo_itm', isModern)}
${headerSortCode}

  SET HANDLER go_evt_hdr->handle_double_click FOR go_grid_hdr.
  SET HANDLER go_evt_hdr->handle_hotspot_click FOR go_grid_hdr.
  SET HANDLER go_evt_hdr->handle_toolbar FOR go_grid_hdr.
  SET HANDLER go_evt_hdr->handle_user_command FOR go_grid_hdr.

  CALL METHOD go_grid_hdr->set_table_for_first_display
    EXPORTING is_layout = gs_layo_hdr
    CHANGING it_outtab = gt_hdr it_fieldcatalog = gt_fcat_hdr it_sort = gt_sort_hdr.

  CALL METHOD go_grid_itm->set_table_for_first_display
    EXPORTING is_layout = gs_layo_itm
    CHANGING it_outtab = gt_itm_disp it_fieldcatalog = gt_fcat_itm.
ENDFORM.

FORM refresh_dual_alv.
  CALL METHOD go_grid_hdr->refresh_table_display.
  CALL METHOD go_grid_itm->refresh_table_display.
ENDFORM.

FORM filter_item_by_header USING iv_row_idx TYPE i.
  READ TABLE gt_hdr INTO gs_hdr INDEX iv_row_idx.
  IF sy-subrc = 0.
    gt_itm_disp = gt_itm.
    DELETE gt_itm_disp WHERE ${fkField} <> gs_hdr-${fkField}.
    CALL METHOD go_grid_itm->refresh_table_display.
  ENDIF.
ENDFORM.`;
  } else if (sampleType === '03') {
    const groupCol = (spec.tree_config?.group_field || 'CARRID').toLowerCase();
    const rootLbl = (spec.tree_config?.root_label || 'ROOT').replace(/'/g, "''");
    displaySubroutines = `FORM init_tree_alv.
${
  isModern
    ? `  go_container = NEW cl_gui_custom_container( container_name = 'CC_ALV' ).
  go_splitter  = NEW cl_gui_splitter_container( parent = go_container rows = 1 columns = 2 ).
  go_splitter->set_column_width( id = 1 width = 28 ).
  go_cont_tree = go_splitter->get_container( row = 1 column = 1 ).
  go_cont_grid = go_splitter->get_container( row = 1 column = 2 ).
  go_tree      = NEW cl_gui_alv_tree( parent = go_cont_tree node_selection_mode = cl_gui_column_tree=>node_sel_mode_single ).
  go_grid      = NEW ${std.grid_class_name}( i_parent = go_cont_grid ).
  go_event_rcv = NEW lcl_event_receiver( ).`
    : `  CREATE OBJECT go_container EXPORTING container_name = 'CC_ALV'.
  CREATE OBJECT go_splitter EXPORTING parent = go_container rows = 1 columns = 2.
  CALL METHOD go_splitter->set_column_width EXPORTING id = 1 width = 28.
  CALL METHOD go_splitter->get_container EXPORTING row = 1 column = 1 RECEIVING container = go_cont_tree.
  CALL METHOD go_splitter->get_container EXPORTING row = 1 column = 2 RECEIVING container = go_cont_grid.
  CREATE OBJECT go_tree EXPORTING parent = go_cont_tree node_selection_mode = cl_gui_column_tree=>node_sel_mode_single.
  CREATE OBJECT go_grid EXPORTING i_parent = go_cont_grid.
  CREATE OBJECT go_event_rcv.`
}

${headerFcatCode}
${buildLayoutLines(spec, 'gs_layo', isModern)}
  PERFORM build_tree_hierarchy.
  SET HANDLER go_event_rcv->handle_node_double_click FOR go_tree.
  SET HANDLER go_event_rcv->handle_hotspot_click FOR go_grid.
  CALL METHOD go_grid->set_table_for_first_display
    EXPORTING is_layout = gs_layo
    CHANGING it_outtab = gt_alv_disp it_fieldcatalog = gt_fcat.
ENDFORM.

FORM build_tree_hierarchy.
  " Build Tree Hierarchy grouped by ${groupCol} under root '${rootLbl}'
  DATA: lv_root_key TYPE lvc_nkey.
  CALL METHOD go_tree->add_node
    EXPORTING i_relat_node_key = space
              i_relationship   = cl_gui_column_tree=>relat_last_child
              i_node_text      = '${rootLbl}'
    IMPORTING e_new_node_key   = lv_root_key.
  " Loop over distinct ${groupCol} values and add child nodes
  CALL METHOD go_tree->expand_tree EXPORTING i_level = 2.
ENDFORM.

FORM filter_grid_by_node USING iv_node_key TYPE lvc_nkey.
  gt_alv_disp = gt_alv.
  " Apply node filter for ${groupCol}
  CALL METHOD go_grid->refresh_table_display.
ENDFORM.

FORM refresh_single_alv.
  CALL METHOD go_grid->refresh_table_display.
ENDFORM.`;
  } else if (sampleType === '04') {
    const cdsSource = (spec.cds_view_table || spec.pivot_config?.source_table_or_cds || 'ACDOCA').toUpperCase();
    displaySubroutines = `FORM init_ida_or_pivot_alv.
  " S/4HANA ALV with Integrated Data Access (IDA) / Dynamic Group By Pushdown
  TRY.
${
  isModern
    ? `      go_container = NEW cl_gui_custom_container( container_name = 'CC_ALV' ).
      go_ida_grid = cl_salv_gui_table_ida=>create_for_cds_view(
        iv_cds_view_name = '${cdsSource}'
        io_gui_container = go_container
      ).`
    : `      CREATE OBJECT go_container EXPORTING container_name = 'CC_ALV'.
      CALL METHOD cl_salv_gui_table_ida=>create_for_cds_view
        EXPORTING iv_cds_view_name = '${cdsSource}'
                  io_gui_container = go_container
        RECEIVING ro_alv_gui_table_ida = go_ida_grid.`
}
      go_ida_grid->fullscreen( )->display( ).
    CATCH cx_salv_db_connection cx_salv_db_table_not_supported INTO DATA(lx_ida).
      MESSAGE lx_ida->get_text( ) TYPE 'I'.
  ENDTRY.
ENDFORM.`;
  } else {
    displaySubroutines = `FORM init_single_alv.
${
  isModern
    ? `  go_container = NEW cl_gui_custom_container( container_name = 'CC_ALV' ).
  go_grid      = NEW ${std.grid_class_name}( i_parent = go_container ).
  go_event_rcv = NEW lcl_event_receiver( ).`
    : `  CREATE OBJECT go_container EXPORTING container_name = 'CC_ALV'.
  CREATE OBJECT go_grid EXPORTING i_parent = go_container.
  CREATE OBJECT go_event_rcv.`
}

${headerFcatCode}
${buildLayoutLines(spec, 'gs_layo', isModern)}
${headerSortCode}

  SET HANDLER:
    go_event_rcv->handle_hotspot_click FOR go_grid,
    go_event_rcv->handle_double_click  FOR go_grid,
    go_event_rcv->handle_toolbar       FOR go_grid,
    go_event_rcv->handle_user_command  FOR go_grid,
    go_event_rcv->handle_data_changed  FOR go_grid.

  CALL METHOD go_grid->register_edit_event
    EXPORTING i_event_id = cl_gui_alv_grid=>mc_evt_modified.

  CALL METHOD go_grid->set_table_for_first_display
    EXPORTING is_layout = gs_layo
              is_variant = gs_variant_std
              i_save     = 'A'
    CHANGING  it_outtab = gt_alv
              it_fieldcatalog = gt_fcat
              it_sort = gt_sort.
ENDFORM.

FORM refresh_single_alv.
  DATA ls_stable TYPE lvc_s_stbl VALUE 'XX'.
  CALL METHOD go_grid->refresh_table_display
    EXPORTING is_stable = ls_stable.
ENDFORM.`;
  }

  return `************************************************************************
* INCLUDE ${(spec.program_id || 'ZRALV0010').toUpperCase()}F01 : Subroutines (FORM Logic)
************************************************************************

FORM set_init.
  gs_variant_std-report = sy-repid.
ENDFORM.

FORM validate_selection.
*&--- BEGIN USER LOGIC (VALIDATE_SELECTION)
  " Selection Screen input validation rules
*&--- END USER LOGIC (VALIDATE_SELECTION)
ENDFORM.

FORM check_authority.
${authLines}
ENDFORM.

FORM get_data.
  " Data Extraction Logic Specification:
  " ${(spec.data_extraction_logic || '').replace(/\n/g, '\n  " ')}
*&--- BEGIN USER LOGIC (GET_DATA)
  " Write ABAP Open SQL / CDS Select statements here
*&--- END USER LOGIC (GET_DATA)
ENDFORM.

FORM process_data.
*&--- BEGIN USER LOGIC (PROCESS_DATA)
  " Calculate exception lights, status icons, and totals here
*&--- END USER LOGIC (PROCESS_DATA)
ENDFORM.

FORM end_of_selection.
${batchHandling ? batchHandling + '\n' : ''}  IF ${sampleType === '02' ? 'gt_hdr' : 'gt_alv'} IS INITIAL.
    MESSAGE s004(${msgClass}) WITH '조회된 데이터가 없습니다.' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  CALL SCREEN 0100.
ENDFORM.

${displaySubroutines}

FORM on_hotspot_click USING iv_grid TYPE char30 iv_row TYPE i iv_fieldname TYPE lvc_fname.
  FIELD-SYMBOLS <ls_row> TYPE ${sampleType === '02' ? 'ty_hdr' : 'ty_alv'}.
  READ TABLE ${sampleType === '02' ? 'gt_hdr' : 'gt_alv'} ASSIGNING <ls_row> INDEX iv_row.
  IF sy-subrc = 0.
    CASE iv_fieldname.
${hotspotCases}
    ENDCASE.
  ENDIF.
ENDFORM.

FORM on_double_click USING iv_grid TYPE char30 iv_row TYPE i iv_fieldname TYPE lvc_fname.
${
  sampleType === '02'
    ? `  IF iv_grid = 'HDR'.\n    PERFORM filter_item_by_header USING iv_row.\n  ENDIF.`
    : `  MESSAGE s000(${msgClass}) WITH 'Row double-clicked:' iv_row.`
}
ENDFORM.

FORM on_toolbar USING iv_grid TYPE char30 CHANGING ct_toolbar TYPE ttb_button.
  DATA ls_btn TYPE stb_button.
${toolbarAppend || `  " Standard ALV toolbar active`}
ENDFORM.

FORM on_user_command USING iv_grid TYPE char30 iv_ucomm TYPE sy-ucomm.
  CASE iv_ucomm.
${userCmdCases || `    WHEN OTHERS.`}
  ENDCASE.
ENDFORM.

FORM on_data_changed USING iv_grid TYPE char30 ir_changed TYPE REF TO cl_alv_data_changed_protocol.
  MESSAGE s000(${msgClass}) WITH 'ALV data modification validated.'.
ENDFORM.

${spec.performance_config?.batch_supported ? `FORM write_batch_spool.\n  WRITE: / 'Batch Spool Output:', sy-repid, sy-datum.\nENDFORM.\n\n` : ''}${f4Forms ? f4Forms + '\n\n' : ''}${customSubroutines}
`;
}

export function generateAllIncludes(
  spec: Partial<ProgramSpec>,
  opt?: AbapEngineOptions
): Required<ProgramSourceCodeTabs> {
  return {
    program: mergeUserLogicRegions(generateProgramInclude(spec, opt), spec.source_code?.program),
    top: mergeUserLogicRegions(generateTopInclude(spec, opt), spec.source_code?.top),
    s01: mergeUserLogicRegions(generateS01Include(spec), spec.source_code?.s01),
    c01: mergeUserLogicRegions(generateC01Include(spec, opt), spec.source_code?.c01),
    mod: mergeUserLogicRegions(generateModInclude(spec), spec.source_code?.mod),
    f01: mergeUserLogicRegions(generateF01Include(spec, opt), spec.source_code?.f01),
  };
}

export function assembleUnifiedAbapProgram(
  spec: ProgramSpec,
  opt?: AbapEngineOptions
): string {
  const defaults = generateAllIncludes(spec, opt);
  const src = spec.source_code || {};

  const progTab = src.program !== undefined && src.program.trim() ? src.program : defaults.program;
  const topTab = src.top !== undefined && src.top.trim() ? src.top : defaults.top;
  const s01Tab = src.s01 !== undefined && src.s01.trim() ? src.s01 : defaults.s01;
  const c01Tab = src.c01 !== undefined && src.c01.trim() ? src.c01 : defaults.c01;
  const modTab = src.mod !== undefined && src.mod.trim() ? src.mod : defaults.mod;
  const f01Tab = src.f01 !== undefined && src.f01.trim() ? src.f01 : defaults.f01;

  return `${progTab}

*&=====================================================================*
*& [TOP] Global Types & Variables
*&=====================================================================*
${topTab}

*&=====================================================================*
*& [S01] Selection Screen
*&=====================================================================*
${s01Tab}

*&=====================================================================*
*& [C01] Local Event Receiver Class
*&=====================================================================*
${c01Tab}

*&=====================================================================*
*& [MOD] PBO / PAI Screen Modules
*&=====================================================================*
${modTab}

*&=====================================================================*
*& [F01] Form Subroutines
*&=====================================================================*
${f01Tab}
`;
}

export interface AbapTextSymbolEntry {
  symbol: string;
  usage: string;
  text: string;
  maxLen: number;
}

export function extractTextSymbolsTable(spec: Partial<ProgramSpec>): AbapTextSymbolEntry[] {
  const entries: AbapTextSymbolEntry[] = [];
  const params = spec.selection_params || [];
  const seenBlocks = new Set<string>();
  let idx = 1;

  params.forEach((p) => {
    const rawId = p.block_id?.trim();
    const rawTitle = p.block_title?.trim();
    if (rawId || rawTitle) {
      const key = rawId || `box_${rawTitle}`;
      if (!seenBlocks.has(key)) {
        seenBlocks.add(key);
        const sym = `TEXT-${String(idx).padStart(3, '0')}`;
        const label = rawTitle || rawId || '조회 조건';
        entries.push({
          symbol: sym,
          usage: `SELECTION-SCREEN BLOCK (${rawId || `b${idx}`})`,
          text: label,
          maxLen: Math.max(20, label.length * 2),
        });
        idx += 1;
      }
    }
  });

  if (entries.length === 0) {
    entries.push({
      symbol: 'TEXT-001',
      usage: 'SELECTION-SCREEN BLOCK (b1)',
      text: '조회 조건',
      maxLen: 20,
    });
  }

  return entries;
}

export interface AbapPfStatusFunctionEntry {
  fcode: string;
  source: 'GUI Status (0100)' | 'ALV Custom Toolbar';
  text: string;
  shortcut: string;
  description: string;
}

export function extractPfStatusFunctionsTable(spec: Partial<ProgramSpec>): AbapPfStatusFunctionEntry[] {
  const list: AbapPfStatusFunctionEntry[] = [
    {
      fcode: 'BACK',
      source: 'GUI Status (0100)',
      text: '뒤로',
      shortcut: 'F3',
      description: '이전 화면(Selection Screen 1000)으로 복귀',
    },
    {
      fcode: 'EXIT',
      source: 'GUI Status (0100)',
      text: '종료',
      shortcut: 'Shift+F3',
      description: '프로그램 즉시 종료',
    },
    {
      fcode: 'CANC',
      source: 'GUI Status (0100)',
      text: '취소',
      shortcut: 'F12',
      description: '현재 화면 작업 취소',
    },
    {
      fcode: 'REFRESH',
      source: 'GUI Status (0100)',
      text: '새로고침',
      shortcut: 'F8 / Ctrl+R',
      description: 'DB 재조회 및 ALV 그리드 갱신',
    },
  ];

  const customBtns = [
    ...(spec.toolbar_buttons?.filter((b) => !b.is_standard && b.visible !== false) || []),
    ...(spec.custom_toolbar || []).filter(
      (cb) => !spec.toolbar_buttons?.some((tb) => tb.function === cb.function)
    ),
  ];

  customBtns.forEach((btn) => {
    list.push({
      fcode: btn.function,
      source: 'ALV Custom Toolbar',
      text: btn.text || btn.function,
      shortcut: '-',
      description: btn.quickinfo || `${btn.text || btn.function} 사용자 이벤트 (FORM do_${btn.function.toLowerCase()})`,
    });
  });

  return list;
}

