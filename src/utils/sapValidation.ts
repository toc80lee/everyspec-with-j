/**
 * SAP Naming Convention Validation Utility
 *
 * Enforces standard SAP ERP / S/4HANA governance and corporate naming standards:
 * - SAP Customer Namespace: All custom developments (CBO: Custom Business Objects,
 *   Reports, Dialog Programs, and Transaction Codes) MUST begin with 'Z' or 'Y'.
 * - Transaction Code (T-Code):
 *   - Stored in SAP table TSTC (field TCODE, CHAR 20)
 *   - Must begin with 'Z' or 'Y' (case-insensitive input, canonical uppercase)
 *   - Length: between 2 and 20 characters (typically 4-20)
 *   - Characters: only alphanumeric characters (A-Z, 0-9) and underscore (_)
 *   - Must not collide with reserved SAP standard transactions (e.g., VA01, MM03, SE38)
 */

import { AlvField, SapDataType } from '../types/sap';

export type SapValidationSeverity = 'success' | 'warning' | 'error' | 'info';

export type SapTCodeValidationStatus =
  | 'valid'
  | 'invalid_prefix'
  | 'reserved_sap_standard'
  | 'invalid_chars'
  | 'too_long'
  | 'too_short'
  | 'empty';

export interface SapTCodeValidationResult {
  isValid: boolean;
  severity: SapValidationSeverity;
  status: SapTCodeValidationStatus;
  message: string;
  details: string;
  suggestedTCode?: string;
  ruleName: string;
}

// Well-known standard SAP transactions to prevent accidental conflict/overwrite
export const RESERVED_SAP_STANDARD_TCODES: Record<string, string> = {
  VA01: 'Create Sales Order (SD)',
  VA02: 'Change Sales Order (SD)',
  VA03: 'Display Sales Order (SD)',
  VL01N: 'Create Outbound Delivery (LE)',
  VL02N: 'Change Outbound Delivery (LE)',
  VL03N: 'Display Outbound Delivery (LE)',
  VF01: 'Create Billing Document (SD)',
  VF02: 'Change Billing Document (SD)',
  VF03: 'Display Billing Document (SD)',
  MM01: 'Create Material Master (MM)',
  MM02: 'Change Material Master (MM)',
  MM03: 'Display Material Master (MM)',
  ME21N: 'Create Purchase Order (MM)',
  ME22N: 'Change Purchase Order (MM)',
  ME23N: 'Display Purchase Order (MM)',
  FB01: 'Post Financial Document (FI)',
  FB02: 'Change Financial Document (FI)',
  FB03: 'Display Financial Document (FI)',
  FS00: 'G/L Account Master Record (FI)',
  FS03: 'Display G/L Account (FI)',
  FBL1N: 'Vendor Line Items (FI-AP)',
  FBL3N: 'G/L Account Line Items (FI-GL)',
  FBL5N: 'Customer Line Items (FI-AR)',
  KS01: 'Create Cost Center (CO)',
  KS03: 'Display Cost Center (CO)',
  KAH1: 'Create Cost Element Group (CO)',
  KAH3: 'Display Cost Element Group (CO)',
  SE38: 'ABAP Editor (Basis)',
  SE80: 'Object Navigator (Basis)',
  SE11: 'ABAP Dictionary (Basis)',
  SE16: 'Data Browser (Basis)',
  SE16N: 'General Table Display (Basis)',
  SE24: 'Class Builder (Basis)',
  SE37: 'Function Builder (Basis)',
  SM30: 'Table View Maintenance (Basis)',
  SM50: 'Work Process Overview (Basis)',
  ST05: 'Performance Trace (Basis)',
  SPRO: 'Customizing: Implementation Guide (IMG)',
};

/**
 * Generates a compliant SAP customer T-Code based on the input
 */
export function suggestCustomerTCode(input: string, preferredPrefix: 'Z' | 'Y' = 'Z'): string {
  if (!input || !input.trim()) {
    return `${preferredPrefix}ALV01`;
  }

  // Clean invalid characters and uppercase
  let cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

  if (!cleaned) {
    return `${preferredPrefix}ALV01`;
  }

  // If it already starts with Z or Y, keep it
  if (cleaned.startsWith('Z') || cleaned.startsWith('Y')) {
    return cleaned.slice(0, 20);
  }

  // Otherwise prefix with Z (or Y)
  const candidate = `${preferredPrefix}${cleaned}`;
  return candidate.slice(0, 20);
}

/**
 * Validates a Transaction Code according to SAP corporate development standards
 */
export function validateSapTCode(tcode: string): SapTCodeValidationResult {
  const trimmed = (tcode || '').trim();
  const upper = trimmed.toUpperCase();

  // 1. Empty Check
  if (!trimmed) {
    return {
      isValid: false,
      severity: 'error',
      status: 'empty',
      ruleName: 'SAP_TCODE_MANDATORY',
      message: 'Transaction Code is required.',
      details: 'Every SAP dialog or report program requires a unique Transaction Code to be executed from the SAP Easy Access menu or command bar.',
      suggestedTCode: 'ZREP01',
    };
  }

  // 2. Length Check (Max 20 chars in SAP TSTC table)
  if (upper.length > 20) {
    return {
      isValid: false,
      severity: 'error',
      status: 'too_long',
      ruleName: 'SAP_TCODE_LENGTH_MAX',
      message: `Transaction Code length exceeds SAP 20-character limit (${upper.length}/20).`,
      details: 'The SAP table TSTC (Transaction Codes) defines the TCODE field as CHAR 20. Longer codes cannot be registered in SAP systems.',
      suggestedTCode: suggestCustomerTCode(upper.slice(0, 20)),
    };
  }

  // 3. Length Check (Min 2 chars)
  if (upper.length < 2) {
    return {
      isValid: false,
      severity: 'warning',
      status: 'too_short',
      ruleName: 'SAP_TCODE_LENGTH_MIN',
      message: 'Transaction Code should be at least 2 characters long.',
      details: 'SAP transaction codes typically consist of 4 to 20 characters representing module and function (e.g., ZSD01, ZRALV0010).',
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  // 4. Character Set Check (Only A-Z, 0-9, and underscore)
  const validCharRegex = /^[A-Z0-9_]+$/;
  if (!validCharRegex.test(upper)) {
    return {
      isValid: false,
      severity: 'error',
      status: 'invalid_chars',
      ruleName: 'SAP_TCODE_CHARSET',
      message: 'Transaction Code contains invalid characters.',
      details: 'SAP Transaction Codes may only contain alphanumeric characters (A-Z, 0-9) and underscores (_). Spaces, hyphens, and special symbols are disallowed.',
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  // 5. Reserved SAP Standard Transaction Check
  if (RESERVED_SAP_STANDARD_TCODES[upper]) {
    const desc = RESERVED_SAP_STANDARD_TCODES[upper];
    return {
      isValid: false,
      severity: 'error',
      status: 'reserved_sap_standard',
      ruleName: 'SAP_STANDARD_NAMESPACE_COLLISION',
      message: `'${upper}' is an existing SAP standard transaction (${desc}).`,
      details: `SAP standard transactions cannot be overridden for custom developments. Corporate ERP policy requires all custom programs and transactions to reside within the customer namespace (Z* or Y*).`,
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  // 6. SAP Customer Namespace Prefix Check (Z... or Y...) - CORE USER REQUIREMENT
  const firstChar = upper.charAt(0);
  if (firstChar !== 'Z' && firstChar !== 'Y') {
    return {
      isValid: false,
      severity: 'warning',
      status: 'invalid_prefix',
      ruleName: 'SAP_CUSTOMER_NAMESPACE_VIOLATION',
      message: `Transaction Code '${upper}' deviates from standard SAP corporate conventions (must start with 'Z' or 'Y').`,
      details: `According to SAP governance and corporate standards, all custom development (CBO, reports, dialog transactions) must reside in the SAP customer namespace beginning with 'Z' or 'Y'. Standard namespace prefixes (A-X except Y, Z) are strictly reserved for SAP standard applications.`,
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  // 7. Success - Fully Compliant with SAP Corporate Standards
  return {
    isValid: true,
    severity: 'success',
    status: 'valid',
    ruleName: 'SAP_CORPORATE_STANDARD_COMPLIANT',
    message: `Valid SAP customer Transaction Code (${firstChar}-namespace).`,
    details: `Conforms to SAP customer development namespace conventions and corporate governance guidelines.`,
  };
}

/**
 * Validates SAP Program ID (Must start with Z or Y, max 40 chars in TRDIR)
 */
export function validateSapProgramId(programId: string): SapTCodeValidationResult {
  const trimmed = (programId || '').trim();
  const upper = trimmed.toUpperCase();

  if (!trimmed) {
    return {
      isValid: false,
      severity: 'error',
      status: 'empty',
      ruleName: 'SAP_PROGRAM_MANDATORY',
      message: 'Program ID is required.',
      details: 'An ABAP report or module pool program requires a Program ID (TRDIR-NAME).',
      suggestedTCode: 'ZR_SALES_REPORT',
    };
  }

  if (upper.length > 40) {
    return {
      isValid: false,
      severity: 'error',
      status: 'too_long',
      ruleName: 'SAP_PROGRAM_LENGTH_MAX',
      message: `Program ID exceeds SAP limit of 40 characters (${upper.length}/40).`,
      details: 'ABAP repository program names in TRDIR are limited to CHAR 40.',
      suggestedTCode: suggestCustomerTCode(upper.slice(0, 40)),
    };
  }

  const validCharRegex = /^[A-Z0-9_]+$/;
  if (!validCharRegex.test(upper)) {
    return {
      isValid: false,
      severity: 'error',
      status: 'invalid_chars',
      ruleName: 'SAP_PROGRAM_CHARSET',
      message: 'Program ID contains invalid characters (only A-Z, 0-9, and _ allowed).',
      details: 'ABAP program names cannot contain spaces or special characters.',
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  const firstChar = upper.charAt(0);
  if (firstChar !== 'Z' && firstChar !== 'Y') {
    return {
      isValid: false,
      severity: 'warning',
      status: 'invalid_prefix',
      ruleName: 'SAP_PROGRAM_CUSTOMER_NAMESPACE',
      message: `Program ID '${upper}' deviates from SAP standard (must start with 'Z' or 'Y').`,
      details: `Custom ABAP programs must start with 'Z' or 'Y' to prevent collisions with SAP standard programs during upgrades or support packages.`,
      suggestedTCode: suggestCustomerTCode(upper),
    };
  }

  return {
    isValid: true,
    severity: 'success',
    status: 'valid',
    ruleName: 'SAP_PROGRAM_COMPLIANT',
    message: `Valid SAP customer Program ID (${firstChar}-namespace).`,
    details: 'Conforms to SAP customer development naming standards.',
  };
}

// ============================================================================
// SAP ALV Field Catalog (LVC_T_FCAT) Real-Time Validation Layer
// ============================================================================

export const VALID_SAP_FIELD_TYPES: readonly SapDataType[] = [
  'CHAR',
  'NUMC',
  'DATS',
  'TIMS',
  'CURR',
  'DEC',
  'UNIT',
  'INT4',
  'STRING',
  'CUKY',
] as const;

export const VALID_SAP_FIELD_TYPE_SET = new Set<string>(VALID_SAP_FIELD_TYPES);

export function isValidSapFieldType(datatype: string | undefined | null): boolean {
  if (!datatype || typeof datatype !== 'string') return false;
  return VALID_SAP_FIELD_TYPE_SET.has(datatype.trim().toUpperCase());
}

export interface FieldCatalogRowValidation {
  invalidDatatype: boolean;
  datatypeMessage?: string;
  duplicateColPos: boolean;
  invalidColPos: boolean;
  colPosMessage?: string;
  duplicateFieldname: boolean;
  fieldnameMessage?: string;
  hasAnyIssue: boolean;
}

export interface FieldCatalogValidationIssue {
  rowIndex: number;
  fieldname: string;
  category: 'invalid_type' | 'duplicate_pos' | 'invalid_pos' | 'duplicate_fieldname';
  message: string;
}

export interface FieldCatalogValidationSummary {
  isValid: boolean;
  totalIssueCount: number;
  rowErrors: Record<number, FieldCatalogRowValidation>;
  issues: FieldCatalogValidationIssue[];
  invalidTypeRows: number[];
  duplicateColPosValues: number[];
  invalidColPosRows: number[];
  duplicateFieldnames: string[];
}

/**
 * Validates an ALV Field Catalog (LVC_T_FCAT) in real time:
 * - Checks for invalid or unrecognized SAP DDIC field types
 * - Checks for duplicate or invalid (<= 0 / missing) column positions (COL_POS)
 * - Checks for duplicate technical fieldnames
 */
export function validateFieldCatalog(fields: AlvField[]): FieldCatalogValidationSummary {
  const rowErrors: Record<number, FieldCatalogRowValidation> = {};
  const issues: FieldCatalogValidationIssue[] = [];
  const invalidTypeRows: number[] = [];
  const invalidColPosRows: number[] = [];

  // Track col_pos occurrences -> row indices
  const posOccurrences = new Map<number, number[]>();
  // Track fieldname occurrences -> row indices
  const nameOccurrences = new Map<string, number[]>();

  fields.forEach((field, idx) => {
    const pos = field.col_pos;
    if (typeof pos === 'number' && Number.isInteger(pos) && pos >= 1) {
      const list = posOccurrences.get(pos) || [];
      list.push(idx);
      posOccurrences.set(pos, list);
    }

    const name = (field.fieldname || '').trim().toUpperCase();
    if (name) {
      const list = nameOccurrences.get(name) || [];
      list.push(idx);
      nameOccurrences.set(name, list);
    }
  });

  const duplicateColPosValues: number[] = [];
  posOccurrences.forEach((indices, pos) => {
    if (indices.length > 1) {
      duplicateColPosValues.push(pos);
    }
  });
  duplicateColPosValues.sort((a, b) => a - b);

  const duplicateFieldnames: string[] = [];
  nameOccurrences.forEach((indices, name) => {
    if (indices.length > 1) {
      duplicateFieldnames.push(name);
    }
  });

  fields.forEach((field, idx) => {
    const displayFieldname = field.fieldname?.trim() || `Row ${idx + 1}`;
    const rawType = (field.datatype ?? '').toString().trim().toUpperCase();
    const invalidDatatype = !isValidSapFieldType(rawType);

    let datatypeMessage: string | undefined;
    if (invalidDatatype) {
      invalidTypeRows.push(idx);
      datatypeMessage = rawType
        ? `Invalid SAP field type '${rawType}'. Valid types: ${VALID_SAP_FIELD_TYPES.join(', ')}.`
        : `SAP field type is required. Valid types: ${VALID_SAP_FIELD_TYPES.join(', ')}.`;
      issues.push({
        rowIndex: idx,
        fieldname: displayFieldname,
        category: 'invalid_type',
        message: `Row ${idx + 1} (${displayFieldname}): ${datatypeMessage}`,
      });
    }

    const pos = field.col_pos;
    const invalidColPos = typeof pos !== 'number' || isNaN(pos) || !Number.isInteger(pos) || pos < 1;
    const posConflictingRows = !invalidColPos ? (posOccurrences.get(pos) || []) : [];
    const duplicateColPos = !invalidColPos && posConflictingRows.length > 1;

    let colPosMessage: string | undefined;
    if (invalidColPos) {
      invalidColPosRows.push(idx);
      colPosMessage = 'Column position (COL_POS) must be a positive integer >= 1.';
      issues.push({
        rowIndex: idx,
        fieldname: displayFieldname,
        category: 'invalid_pos',
        message: `Row ${idx + 1} (${displayFieldname}): ${colPosMessage}`,
      });
    } else if (duplicateColPos) {
      const otherRowLabels = posConflictingRows
        .filter((r) => r !== idx)
        .map((r) => `#${r + 1} (${fields[r]?.fieldname?.trim() || 'unnamed'})`)
        .join(', ');
      colPosMessage = `Duplicate column position (COL_POS = ${pos}) conflicts with row ${otherRowLabels}.`;
      issues.push({
        rowIndex: idx,
        fieldname: displayFieldname,
        category: 'duplicate_pos',
        message: `Row ${idx + 1} (${displayFieldname}): ${colPosMessage}`,
      });
    }

    const upperName = (field.fieldname || '').trim().toUpperCase();
    const nameConflictingRows = upperName ? (nameOccurrences.get(upperName) || []) : [];
    const duplicateFieldname = nameConflictingRows.length > 1;
    let fieldnameMessage: string | undefined;
    if (duplicateFieldname) {
      const otherRows = nameConflictingRows
        .filter((r) => r !== idx)
        .map((r) => `#${r + 1}`)
        .join(', ');
      fieldnameMessage = `Duplicate fieldname '${upperName}' (also in row ${otherRows}).`;
      issues.push({
        rowIndex: idx,
        fieldname: displayFieldname,
        category: 'duplicate_fieldname',
        message: `Row ${idx + 1} (${upperName}): ${fieldnameMessage}`,
      });
    }

    rowErrors[idx] = {
      invalidDatatype,
      datatypeMessage,
      duplicateColPos,
      invalidColPos,
      colPosMessage,
      duplicateFieldname,
      fieldnameMessage,
      hasAnyIssue: invalidDatatype || duplicateColPos || invalidColPos || duplicateFieldname,
    };
  });

  return {
    isValid: issues.length === 0,
    totalIssueCount: issues.length,
    rowErrors,
    issues,
    invalidTypeRows,
    duplicateColPosValues,
    invalidColPosRows,
    duplicateFieldnames,
  };
}

// ============================================================================
// SAP ABAP Selection Screen & Cross-Reference Integrity Validation
// ============================================================================

import type { ProgramSpec, ProjectAbapStandards, SelectionParameter } from '../types/sap';

export interface SelectionParamValidationIssue {
  paramId: string;
  paramName: string;
  severity: SapValidationSeverity;
  category:
    | 'name_too_long'
    | 'invalid_name_chars'
    | 'duplicate_name'
    | 'radio_group_size'
    | 'radio_default_conflict'
    | 'radio_group_id_long';
  message: string;
  suggestedName?: string;
}

export function suggestAbapSelectionName(name: string, kind: SelectionParameter['kind']): string {
  const clean = (name || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!clean) {
    return kind === 'SELECT_OPTION' ? 'S_PARAM' : 'P_PARAM';
  }
  if (clean.length <= 8 && /^[A-Z]/.test(clean)) return clean;
  const prefix = clean.startsWith('S_') || clean.startsWith('P_') || clean.startsWith('R_') || clean.startsWith('C_')
    ? clean.slice(0, 2)
    : kind === 'SELECT_OPTION'
    ? 'S_'
    : kind === 'RADIOBUTTON'
    ? 'R_'
    : kind === 'CHECKBOX'
    ? 'C_'
    : 'P_';
  const body = clean.replace(/^(P|S|R|C)_/, '').replace(/_/g, '');
  return `${prefix}${body}`.slice(0, 8);
}

export function validateSelectionParameters(
  params: SelectionParameter[]
): SelectionParamValidationIssue[] {
  const issues: SelectionParamValidationIssue[] = [];
  const seenNames = new Map<string, number>();
  const radioGroups = new Map<string, SelectionParameter[]>();

  params.forEach((p) => {
    const cleanName = (p.name || '').trim().toUpperCase();
    seenNames.set(cleanName, (seenNames.get(cleanName) || 0) + 1);

    if (!cleanName) {
      issues.push({
        paramId: p.id,
        paramName: '(Empty)',
        severity: 'error',
        category: 'invalid_name_chars',
        message: 'Selection parameter name is required (max 8 ABAP characters).',
        suggestedName: suggestAbapSelectionName('', p.kind),
      });
    } else {
      if (!/^[A-Z][A-Z0-9_]*$/.test(cleanName)) {
        issues.push({
          paramId: p.id,
          paramName: cleanName,
          severity: 'error',
          category: 'invalid_name_chars',
          message: `Selection parameter '${cleanName}' must start with A-Z and contain only A-Z, 0-9, or _.`,
          suggestedName: suggestAbapSelectionName(cleanName, p.kind),
        });
      }
      if (cleanName.length > 8) {
        issues.push({
          paramId: p.id,
          paramName: cleanName,
          severity: 'error',
          category: 'name_too_long',
          message: `ABAP 8-char limit exceeded on '${cleanName}' (${cleanName.length}/8 chars). PARAMETERS/SELECT-OPTIONS compile fails over 8 chars.`,
          suggestedName: suggestAbapSelectionName(cleanName, p.kind),
        });
      }
    }

    if (p.kind === 'RADIOBUTTON') {
      const grp = (p.radio_group || 'R1').trim().toUpperCase();
      if (grp.length > 4) {
        issues.push({
          paramId: p.id,
          paramName: cleanName,
          severity: 'error',
          category: 'radio_group_id_long',
          message: `RADIOBUTTON GROUP '${grp}' exceeds SAP 4-char limit (${grp.length}/4).`,
        });
      }
      const list = radioGroups.get(grp) || [];
      list.push(p);
      radioGroups.set(grp, list);
    }
  });

  seenNames.forEach((count, name) => {
    if (name && count > 1) {
      const dup = params.find((p) => (p.name || '').trim().toUpperCase() === name);
      issues.push({
        paramId: dup?.id || name,
        paramName: name,
        severity: 'error',
        category: 'duplicate_name',
        message: `Duplicate selection screen identifier '${name}' (${count} occurrences).`,
      });
    }
  });

  radioGroups.forEach((members, grp) => {
    if (members.length < 2) {
      issues.push({
        paramId: members[0].id,
        paramName: members[0].name,
        severity: 'warning',
        category: 'radio_group_size',
        message: `RADIOBUTTON GROUP '${grp}' has only ${members.length} button (SAP recommends at least 2 mutually exclusive options).`,
      });
    }
    const defaults = members.filter((m) => (m.default_val || '').trim().toUpperCase() === 'X');
    if (defaults.length > 1) {
      issues.push({
        paramId: defaults[1].id,
        paramName: defaults[1].name,
        severity: 'error',
        category: 'radio_default_conflict',
        message: `RADIOBUTTON GROUP '${grp}' has ${defaults.length} items with DEFAULT 'X'. Only one default is allowed per group.`,
      });
    }
  });

  return issues;
}

export interface SpecValidationIssue {
  id: string;
  section: 'General' | 'Selection Screen' | 'Field Catalog' | 'Item Grid' | 'FS/TS Governance';
  severity: SapValidationSeverity;
  message: string;
  autoFixLabel?: string;
  targetField?: string;
  suggestedValue?: string;
}

export function validateFieldCatalogReferences(
  fields: AlvField[],
  section: 'Field Catalog' | 'Item Grid' = 'Field Catalog'
): SpecValidationIssue[] {
  const issues: SpecValidationIssue[] = [];
  const fieldNames = new Set(fields.map((f) => (f.fieldname || '').trim().toUpperCase()).filter(Boolean));
  const hasCukyField = fields.some(
    (f) => f.datatype === 'CUKY' || ['WAERS', 'WAERK', 'CURRENCY', 'HWAER'].includes((f.fieldname || '').toUpperCase())
  );
  const hasUnitField = fields.some(
    (f) => f.datatype === 'UNIT' || ['MEINS', 'VRKME', 'GEWEI', 'UNIT'].includes((f.fieldname || '').toUpperCase())
  );

  fields.forEach((f) => {
    const fn = (f.fieldname || '').trim().toUpperCase();
    if (!fn) return;

    if (f.cfieldname) {
      const cRef = f.cfieldname.trim().toUpperCase();
      if (!fieldNames.has(cRef)) {
        issues.push({
          id: `ref-cuky-${section}-${fn}`,
          section,
          severity: 'error',
          message: `${fn}: Currency reference field (CFIELDNAME = '${cRef}') does not exist in ${section}.`,
        });
      }
    } else if (f.datatype === 'CURR' && !hasCukyField) {
      issues.push({
        id: `warn-cuky-${section}-${fn}`,
        section,
        severity: 'warning',
        message: `${fn} (CURR): No currency key column (CUKY / WAERK / WAERS) or CFIELDNAME found in ${section}.`,
      });
    }

    if (f.qfieldname) {
      const qRef = f.qfieldname.trim().toUpperCase();
      if (!fieldNames.has(qRef)) {
        issues.push({
          id: `ref-unit-${section}-${fn}`,
          section,
          severity: 'error',
          message: `${fn}: Quantity unit reference field (QFIELDNAME = '${qRef}') does not exist in ${section}.`,
        });
      }
    } else if (
      ['MENGE', 'KWMENG', 'LFIMG', 'FKIMG'].includes(fn) &&
      !hasUnitField
    ) {
      issues.push({
        id: `warn-unit-${section}-${fn}`,
        section,
        severity: 'warning',
        message: `${fn}: Quantity field has no UNIT column (MEINS / VRKME) or QFIELDNAME in ${section}.`,
      });
    }

    if (f.hotspot && f.drilldown_tcode && !/^[A-Z0-9_]{2,20}$/.test(f.drilldown_tcode.trim().toUpperCase())) {
      issues.push({
        id: `ref-tcode-${section}-${fn}`,
        section,
        severity: 'warning',
        message: `${fn}: Hotspot drilldown T-Code '${f.drilldown_tcode}' has invalid SAP T-Code format.`,
      });
    }
  });

  return issues;
}

export interface FullSpecValidationReport {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  issues: SpecValidationIssue[];
}

export function validateFullProgramSpec(spec: ProgramSpec): FullSpecValidationReport {
  const issues: SpecValidationIssue[] = [];

  // 1. General Naming Conventions
  const progCheck = validateSapProgramId(spec.program_id);
  if (!progCheck.isValid) {
    issues.push({
      id: 'gen-program-id',
      section: 'General',
      severity: progCheck.severity,
      message: progCheck.message,
      autoFixLabel: progCheck.suggestedTCode ? `Apply (${progCheck.suggestedTCode})` : undefined,
      targetField: 'program_id',
      suggestedValue: progCheck.suggestedTCode,
    });
  }

  const tcodeCheck = validateSapTCode(spec.tcode);
  if (!tcodeCheck.isValid) {
    issues.push({
      id: 'gen-tcode',
      section: 'General',
      severity: tcodeCheck.severity,
      message: tcodeCheck.message,
      autoFixLabel: tcodeCheck.suggestedTCode ? `Apply (${tcodeCheck.suggestedTCode})` : undefined,
      targetField: 'tcode',
      suggestedValue: tcodeCheck.suggestedTCode,
    });
  }

  // 2. Selection Parameters
  const selIssues = validateSelectionParameters(spec.selection_params || []);
  selIssues.forEach((si) => {
    issues.push({
      id: `sel-${si.category}-${si.paramId}`,
      section: 'Selection Screen',
      severity: si.severity,
      message: si.message,
      autoFixLabel: si.suggestedName ? `Fix to 8 chars (${si.suggestedName})` : undefined,
      targetField: `sel:${si.paramId}`,
      suggestedValue: si.suggestedName,
    });
  });

  // 3. Header Field Catalog & Reference Integrity
  const headerFcatSummary = validateFieldCatalog(spec.field_catalog || []);
  headerFcatSummary.issues.forEach((fi, idx) => {
    issues.push({
      id: `fcat-${idx}-${fi.fieldname}`,
      section: 'Field Catalog',
      severity: 'error',
      message: fi.message,
    });
  });
  issues.push(...validateFieldCatalogReferences(spec.field_catalog || [], 'Field Catalog'));

  // 4. Item Grid & Foreign Key Link Integrity (Sample 02 / 03)
  if ((spec.sample_type === '02' || spec.sample_type === '03') && spec.item_grid) {
    const itemSummary = validateFieldCatalog(spec.item_grid.field_catalog || []);
    itemSummary.issues.forEach((fi, idx) => {
      issues.push({
        id: `item-fcat-${idx}-${fi.fieldname}`,
        section: 'Item Grid',
        severity: 'error',
        message: `[Item Grid] ${fi.message}`,
      });
    });
    issues.push(...validateFieldCatalogReferences(spec.item_grid.field_catalog || [], 'Item Grid'));

    const fk = (spec.item_grid.foreign_key || '').trim().toUpperCase();
    if (spec.sample_type === '02' && fk) {
      const inHeader = (spec.field_catalog || []).some((f) => f.fieldname.toUpperCase() === fk);
      const inItem = (spec.item_grid.field_catalog || []).some((f) => f.fieldname.toUpperCase() === fk);
      if (!inHeader || !inItem) {
        issues.push({
          id: `item-fk-${fk}`,
          section: 'Item Grid',
          severity: 'error',
          message: `Header-Item Foreign Key '${fk}' must exist in both Header (${inHeader ? 'OK' : 'Missing'}) and Item (${inItem ? 'OK' : 'Missing'}) field catalogs.`,
        });
      }
    }
  }

  // 5. FS/TS Governance checks
  if (
    spec.target_sap_release?.includes('S/4HANA') &&
    (!spec.authority_checks || spec.authority_checks.length === 0)
  ) {
    issues.push({
      id: 'gov-auth-recommended',
      section: 'FS/TS Governance',
      severity: 'info',
      message: 'No AUTHORITY-CHECK objects defined. S/4HANA standards recommend specifying at least one authorization object.',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    isValid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  };
}

// ============================================================================
// S/4HANA Compatibility & Performance Advisory Diagnostics
// ============================================================================

export interface S4HanaDiagnosticItem {
  id: string;
  detectedTable: string;
  severity: 'warning' | 'info' | 'error';
  category: 'simplification' | 'performance_key' | 'cds_pushdown';
  title: string;
  recommendation: string;
  s4Replacement: string;
}

interface LegacyTableRule {
  pattern: RegExp;
  tableName: string;
  severity: 'warning' | 'info' | 'error';
  title: string;
  s4Replacement: string;
  recommendation: string;
}

const S4HANA_SIMPLIFICATION_RULES: LegacyTableRule[] = [
  {
    pattern: /\bBSEG\b/i,
    tableName: 'BSEG',
    severity: 'warning',
    title: 'Direct bulk query on FI line-item table (BSEG)',
    s4Replacement: 'ACDOCA / I_JournalEntryItem',
    recommendation:
      'In S/4HANA, use the Universal Journal (ACDOCA) or CDS View I_JournalEntryItem. When querying BSEG directly, specify index keys BUKRS, BELNR, and GJAHR.',
  },
  {
    pattern: /\bKONV\b/i,
    tableName: 'KONV',
    severity: 'error',
    title: 'Pricing table KONV is obsolete in S/4HANA',
    s4Replacement: 'PRCD_ELEMENTS / I_PricingConditionRecord',
    recommendation:
      'In S/4HANA, KONV is a compatibility view without new records. Migrate queries to PRCD_ELEMENTS (joined via KNUMV).',
  },
  {
    pattern: /\b(MKPF|MSEG)\b/i,
    tableName: 'MKPF / MSEG',
    severity: 'warning',
    title: 'Legacy material document tables (MKPF/MSEG) detected',
    s4Replacement: 'MATDOC / NSDM_E_MSEG',
    recommendation:
      'Under S/4HANA MM-IM simplification, MKPF/MSEG are consolidated into MATDOC. Query MATDOC or standard CDS views directly for large volumes.',
  },
  {
    pattern: /\b(VBUK|VBUP)\b/i,
    tableName: 'VBUK / VBUP',
    severity: 'warning',
    title: 'SD status tables (VBUK/VBUP) merged into document tables',
    s4Replacement: 'VBAK / VBAP / LIKP / LIPS / VBRK (embedded status)',
    recommendation:
      'Status fields from VBUK/VBUP are embedded directly in VBAK, LIKP, and VBRK in S/4HANA. Remove status-table joins and read status fields directly.',
  },
  {
    pattern: /\b(BSID|BSIK|BSAD|BSAK|BSIS|BSAS)\b/i,
    tableName: 'BSID/BSIK/BSAD/BSAK/BSIS/BSAS',
    severity: 'warning',
    title: 'FI secondary index tables (BS*) are compatibility views',
    s4Replacement: 'ACDOCA (or I_OperationalAcctgDocItem)',
    recommendation:
      'Open/cleared item index tables are replaced by ACDOCA-backed CDS views in S/4HANA. Query ACDOCA or standard FI CDS views for new reports.',
  },
  {
    pattern: /\b(CSKS|COEP|COSP|COSS)\b/i,
    tableName: 'COEP / COSP / COSS',
    severity: 'info',
    title: 'CO actual cost tables (COEP/COSP/COSS) consolidated',
    s4Replacement: 'ACDOCA / I_JournalEntryItem',
    recommendation:
      'Actual cost and controlling postings are unified into ACDOCA in S/4HANA. Use ACDOCA for actuals (and ACDOCP for plan data).',
  },
];

export function analyzeS4HanaCompatibility(spec: ProgramSpec): S4HanaDiagnosticItem[] {
  const diagnostics: S4HanaDiagnosticItem[] = [];

  const textCorpusParts: string[] = [
    spec.data_extraction_logic || '',
    spec.cds_view_table || '',
    spec.pivot_config?.source_table_or_cds || '',
    ...(spec.selection_params || []).map((p) => `${p.ref_table || ''} ${p.name || ''}`),
    ...(spec.field_catalog || []).map((f) => `${f.ref_table || ''} ${f.fieldname || ''}`),
    ...(spec.item_grid?.field_catalog || []).map((f) => `${f.ref_table || ''} ${f.fieldname || ''}`),
  ];
  const corpus = textCorpusParts.join(' ');

  for (const rule of S4HANA_SIMPLIFICATION_RULES) {
    if (rule.pattern.test(corpus)) {
      diagnostics.push({
        id: `s4-${rule.tableName.replace(/[^A-Z0-9]/gi, '_')}`,
        detectedTable: rule.tableName,
        severity: rule.severity,
        category: 'simplification',
        title: rule.title,
        recommendation: rule.recommendation,
        s4Replacement: rule.s4Replacement,
      });
    }
  }

  // Performance key check for large FI tables (ACDOCA or BSEG)
  const usesLargeFiLedger = /\b(ACDOCA|BSEG)\b/i.test(corpus);
  if (usesLargeFiLedger) {
    const selCorpus = (spec.selection_params || [])
      .map((p) => `${p.name || ''} ${p.ref_field || ''}`)
      .join(' ')
      .toUpperCase();
    const hasBukrs = /\b(P_BUKRS|S_BUKRS|BUKRS|RBUKRS)\b/.test(selCorpus);
    const hasGjahrOrBudat = /\b(P_GJAHR|S_GJAHR|GJAHR|P_BUDAT|S_BUDAT|BUDAT)\b/.test(selCorpus);

    if (!hasBukrs || !hasGjahrOrBudat) {
      const missing: string[] = [];
      if (!hasBukrs) missing.push('BUKRS (Company Code)');
      if (!hasGjahrOrBudat) missing.push('GJAHR (Fiscal Year) or BUDAT (Posting Date)');
      diagnostics.push({
        id: 's4-perf-fi-keys',
        detectedTable: 'ACDOCA / BSEG',
        severity: 'warning',
        category: 'performance_key',
        title: 'Missing index keys for large FI ledger table',
        s4Replacement: 'Add mandatory BUKRS + GJAHR/BUDAT filters to Selection Screen',
        recommendation: `No ${missing.join(', ')} filter detected in Selection Screen. Mark Company Code and Period keys as OBLIGATORY to avoid full table scans.`,
      });
    }
  }

  // HANA Pushdown advisory when sample_type 04 or S/4HANA release without pushdown flag
  if (
    spec.target_sap_release?.includes('S/4HANA') &&
    !spec.performance_config?.use_hana_pushdown &&
    /\bSELECT\b/i.test(spec.data_extraction_logic || '')
  ) {
    diagnostics.push({
      id: 's4-hana-pushdown-tip',
      detectedTable: 'OPEN SQL',
      severity: 'info',
      category: 'cds_pushdown',
      title: 'Consider S/4HANA Code-to-Data (HANA Pushdown)',
      s4Replacement: 'ABAP 7.40+ Inline SQL aggregation or CDS View',
      recommendation:
        'Pushing aggregations and joins down to the DB layer (CDS View / GROUP BY / CASE) instead of ABAP loops significantly improves performance on large datasets.',
    });
  }

  return diagnostics;
}

// ============================================================================
// Project Naming Standards Validation & Suggestions
// ============================================================================

export function suggestCompliantIdsForProject(
  baseProgramId: string,
  baseTCode: string,
  module: string,
  standards?: ProjectAbapStandards
): { program_id: string; tcode: string } {
  const cleanMod = (module || 'SD').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'CM';
  const rawProg = (baseProgramId || `Z${cleanMod}R0010`).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const rawTCode = (baseTCode || `Z${cleanMod}01`).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

  let nextProg = rawProg;
  const prefix = (standards?.program_prefix || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (prefix) {
    const stripped = rawProg.replace(/^[ZY][A-Z0-9]{0,4}_?/, '');
    nextProg = `${prefix}${stripped || 'RPT01'}`.slice(0, 40);
  } else if (!nextProg.startsWith('Z') && !nextProg.startsWith('Y')) {
    nextProg = `Z${nextProg}`.slice(0, 40);
  }

  let nextTCode = rawTCode;
  const tcodePat = (standards?.tcode_pattern || '').trim().toUpperCase().replace(/\*+$/g, '').replace(/[^A-Z0-9_]/g, '');
  if (tcodePat) {
    if (!rawTCode.startsWith(tcodePat)) {
      const suffix = rawTCode.replace(/^[A-Z]+/, '') || '01';
      nextTCode = `${tcodePat}${suffix}`.slice(0, 20);
    }
  } else if (!nextTCode.startsWith('Z') && !nextTCode.startsWith('Y')) {
    nextTCode = `Z${nextTCode}`.slice(0, 20);
  }

  return { program_id: nextProg, tcode: nextTCode };
}

export function validateProjectNamingStandards(
  spec: ProgramSpec,
  standards?: ProjectAbapStandards
): SpecValidationIssue[] {
  if (!standards) return [];
  const issues: SpecValidationIssue[] = [];

  const progPrefix = (standards.program_prefix || '').trim().toUpperCase().replace(/\*+$/g, '');
  if (progPrefix) {
    const pid = (spec.program_id || '').trim().toUpperCase();
    if (!pid.startsWith(progPrefix)) {
      const suggested = suggestCompliantIdsForProject(pid, spec.tcode, spec.module, standards).program_id;
      issues.push({
        id: 'proj-std-program-prefix',
        section: 'General',
        severity: 'warning',
        message: `Program ID does not match project prefix '${progPrefix}' (current: ${pid || 'Unassigned'}).`,
        autoFixLabel: `Apply prefix (${suggested})`,
        targetField: 'program_id',
        suggestedValue: suggested,
      });
    }
  }

  const tcodePrefix = (standards.tcode_pattern || '').trim().toUpperCase().replace(/\*+$/g, '');
  if (tcodePrefix) {
    const tc = (spec.tcode || '').trim().toUpperCase();
    if (!tc.startsWith(tcodePrefix)) {
      const suggested = suggestCompliantIdsForProject(spec.program_id, tc, spec.module, standards).tcode;
      issues.push({
        id: 'proj-std-tcode-pattern',
        section: 'General',
        severity: 'warning',
        message: `T-Code does not match project pattern '${standards.tcode_pattern}' (current: ${tc || 'Unassigned'}).`,
        autoFixLabel: `Apply pattern (${suggested})`,
        targetField: 'tcode',
        suggestedValue: suggested,
      });
    }
  }

  return issues;
}


