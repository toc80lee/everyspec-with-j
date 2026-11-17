import { SapDD02LTable, SapDD03LField, SapDataType } from '../types/sap';
import { SAP_SEARCH_HELP_TABLES } from '../data/sapSearchHelpData';

const DD02L_STORAGE_KEY = 'sap_ddic_dd02l_tables';
const DD03L_STORAGE_KEY = 'sap_ddic_dd03l_fields';
export const SAP_DDIC_UPDATED_EVENT = 'sap-ddic-updated';

const PENDING_DDIC_WRITE_TTL_MS = 8000;
const pendingDdicWrites = new Map<string, number>();

export function markDdicPendingWrite(tabname?: string): void {
  const clean = (tabname || '').trim().toUpperCase();
  if (!clean) return;
  pendingDdicWrites.set(clean, Date.now() + PENDING_DDIC_WRITE_TTL_MS);
}

function isDdicWritePending(tabname?: string): boolean {
  const clean = (tabname || '').trim().toUpperCase();
  if (!clean) return false;
  const exp = pendingDdicWrites.get(clean);
  if (!exp) return false;
  if (exp > Date.now()) return true;
  pendingDdicWrites.delete(clean);
  return false;
}

function emitDdicUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAP_DDIC_UPDATED_EVENT));
  }
}

// Build initial default seed data from SAP_SEARCH_HELP_TABLES
function buildInitialDdicSeed(): { tables: SapDD02LTable[]; fields: SapDD03LField[] } {
  const tables: SapDD02LTable[] = [];
  const fields: SapDD03LField[] = [];

  SAP_SEARCH_HELP_TABLES.forEach((t) => {
    tables.push({
      tabname: t.table,
      ddtext: t.name,
      module: t.module,
      tabclass: 'TRANSP',
      description: t.description,
      is_custom: false,
    });

    t.fields.forEach((f, idx) => {
      fields.push({
        id: `dd03l-${t.table}-${f.field}`,
        tabname: t.table,
        fieldname: f.field,
        position: idx + 1,
        keyflag: !!f.isKey,
        datatype: f.datatype,
        leng: f.length,
        scrtext_l: f.label,
        ddtext: f.description,
        is_custom: false,
      });
    });
  });

  return { tables, fields };
}

export function getDD02LTables(): SapDD02LTable[] {
  try {
    const raw = localStorage.getItem(DD02L_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read DD02L from storage', e);
  }

  const { tables, fields } = buildInitialDdicSeed();
  saveDD02LTables(tables);
  saveDD03LFields(fields);
  return tables;
}

export function saveDD02LTables(tables: SapDD02LTable[]) {
  try {
    localStorage.setItem(DD02L_STORAGE_KEY, JSON.stringify(tables));
  } catch (e) {
    console.error('Failed to save DD02L to storage', e);
  }
}

export function getDD03LFields(filterTabname?: string): SapDD03LField[] {
  let allFields: SapDD03LField[] = [];
  try {
    const raw = localStorage.getItem(DD03L_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allFields = parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read DD03L from storage', e);
  }

  if (allFields.length === 0) {
    const { fields } = buildInitialDdicSeed();
    allFields = fields;
    saveDD03LFields(fields);
  }

  if (filterTabname) {
    return allFields
      .filter((f) => f.tabname.toUpperCase() === filterTabname.toUpperCase())
      .sort((a, b) => a.position - b.position);
  }

  return allFields.sort((a, b) => {
    if (a.tabname !== b.tabname) return a.tabname.localeCompare(b.tabname);
    return a.position - b.position;
  });
}

export function saveDD03LFields(fields: SapDD03LField[]) {
  try {
    localStorage.setItem(DD03L_STORAGE_KEY, JSON.stringify(fields));
  } catch (e) {
    console.error('Failed to save DD03L to storage', e);
  }
}

// Save or update a single table in DD02L
export function upsertDD02LTable(table: SapDD02LTable): SapDD02LTable[] {
  const current = getDD02LTables();
  const cleanName = table.tabname.trim().toUpperCase();
  const index = current.findIndex((t) => t.tabname.toUpperCase() === cleanName);
  let updated: SapDD02LTable[];

  const newEntry: SapDD02LTable = {
    ...table,
    tabname: cleanName,
    created_at: table.created_at || new Date().toISOString().split('T')[0],
  };

  if (index >= 0) {
    updated = current.map((t, i) => (i === index ? newEntry : t));
  } else {
    updated = [...current, newEntry];
  }

  if (newEntry.is_custom) markDdicPendingWrite(cleanName);
  saveDD02LTables(updated);
  emitDdicUpdated();
  return updated;
}

// Delete a table from DD02L and its associated fields from DD03L
export function deleteDD02LTable(tabname: string): {
  tables: SapDD02LTable[];
  fields: SapDD03LField[];
} {
  const cleanName = tabname.trim().toUpperCase();
  const currentTables = getDD02LTables();
  const currentFields = getDD03LFields();

  const updatedTables = currentTables.filter((t) => t.tabname.toUpperCase() !== cleanName);
  const updatedFields = currentFields.filter((f) => f.tabname.toUpperCase() !== cleanName);

  pendingDdicWrites.delete(cleanName);
  saveDD02LTables(updatedTables);
  saveDD03LFields(updatedFields);
  emitDdicUpdated();

  return { tables: updatedTables, fields: updatedFields };
}

// Save or update a single field in DD03L
export function upsertDD03LField(field: SapDD03LField): SapDD03LField[] {
  const allFields = getDD03LFields();
  const cleanTab = field.tabname.trim().toUpperCase();
  const cleanField = field.fieldname.trim().toUpperCase();
  const index = allFields.findIndex(
    (f) => f.id === field.id || (f.tabname.toUpperCase() === cleanTab && f.fieldname.toUpperCase() === cleanField)
  );

  const newEntry: SapDD03LField = {
    ...field,
    id: field.id || `dd03l-${cleanTab}-${cleanField}`,
    tabname: cleanTab,
    fieldname: cleanField,
  };

  let updated: SapDD03LField[];
  if (index >= 0) {
    updated = allFields.map((f, i) => (i === index ? newEntry : f));
  } else {
    updated = [...allFields, newEntry];
  }

  markDdicPendingWrite(cleanTab);
  saveDD03LFields(updated);
  emitDdicUpdated();
  return updated;
}

// Delete a field from DD03L
export function deleteDD03LField(fieldId: string): SapDD03LField[] {
  const allFields = getDD03LFields();
  const target = allFields.find((f) => f.id === fieldId);
  if (target) markDdicPendingWrite(target.tabname);
  const updated = allFields.filter((f) => f.id !== fieldId);
  saveDD03LFields(updated);
  emitDdicUpdated();
  return updated;
}

// Reconcile shared custom DDIC tables & fields from Firestore
export function reconcileCustomDdicFromRemote(
  remoteEntries: { table: SapDD02LTable; fields: SapDD03LField[] }[]
): { tables: SapDD02LTable[]; fields: SapDD03LField[] } {
  const currentTables = getDD02LTables();
  const currentFields = getDD03LFields();

  const remoteByTab = new Map<string, { table: SapDD02LTable; fields: SapDD03LField[] }>();
  remoteEntries.forEach((entry) => {
    const clean = entry.table?.tabname?.trim().toUpperCase();
    if (clean) {
      remoteByTab.set(clean, {
        table: { ...entry.table, tabname: clean, is_custom: true },
        fields: (entry.fields || []).map((f, idx) => ({
          ...f,
          id: f.id || `dd03l-${clean}-${f.fieldname}`,
          tabname: clean,
          position: f.position || idx + 1,
          is_custom: true,
        })),
      });
    }
  });

  const nextTables: SapDD02LTable[] = [];
  const nextFields: SapDD03LField[] = [];
  const handledCustomTabs = new Set<string>();

  // Preserve standard tables and pending local custom tables; replace/prune synced custom tables
  for (const t of currentTables) {
    const clean = t.tabname.trim().toUpperCase();
    if (!t.is_custom) {
      nextTables.push(t);
      continue;
    }
    const remote = remoteByTab.get(clean);
    if (isDdicWritePending(clean)) {
      nextTables.push(t);
      nextFields.push(...currentFields.filter((f) => f.tabname.trim().toUpperCase() === clean));
      handledCustomTabs.add(clean);
    } else if (remote) {
      nextTables.push(remote.table);
      nextFields.push(...remote.fields);
      handledCustomTabs.add(clean);
    }
    // else: custom table deleted remotely -> omit
  }

  // Keep fields belonging to non-custom tables
  const standardTabSet = new Set(
    nextTables.filter((t) => !t.is_custom).map((t) => t.tabname.trim().toUpperCase())
  );
  for (const f of currentFields) {
    const cleanTab = f.tabname.trim().toUpperCase();
    if (standardTabSet.has(cleanTab)) {
      nextFields.push(f);
    }
  }

  // Append newly received remote custom tables
  for (const [clean, entry] of remoteByTab.entries()) {
    if (handledCustomTabs.has(clean)) continue;
    nextTables.push(entry.table);
    nextFields.push(...entry.fields);
  }

  saveDD02LTables(nextTables);
  saveDD03LFields(nextFields);
  emitDdicUpdated();
  return { tables: nextTables, fields: nextFields };
}

// Reset DDIC database to standard SAP dictionary presets
export function resetDdicToStandard(): { tables: SapDD02LTable[]; fields: SapDD03LField[] } {
  const seed = buildInitialDdicSeed();
  pendingDdicWrites.clear();
  saveDD02LTables(seed.tables);
  saveDD03LFields(seed.fields);
  emitDdicUpdated();
  return seed;
}
