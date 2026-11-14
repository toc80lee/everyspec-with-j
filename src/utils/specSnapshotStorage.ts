import { ProgramSpec, SpecChangeHistoryItem, SpecLifecycleStatus } from '../types/sap';
import {
  fetchSnapshotsFromFirestore,
  syncSnapshotToFirestore,
} from '../services/firestoreSync';
import { auth } from '../lib/firebase';

const SNAPSHOT_STORAGE_KEY = 'sap_spec_revision_snapshots_v1';

export interface SpecSnapshotRecord {
  snapshotId: string;
  programId: string;
  projectCode: string;
  version: string;
  changedAt: string;
  author: string;
  comment: string;
  status: SpecLifecycleStatus;
  spec: ProgramSpec;
}

export interface SpecDiffField {
  section: string;
  label: string;
  before: string;
  after: string;
}

function readAllLocalSnapshots(): Record<string, SpecSnapshotRecord[]> {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function writeAllLocalSnapshots(map: Record<string, SpecSnapshotRecord[]>): void {
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function getSnapshotsForSpec(programId: string): SpecSnapshotRecord[] {
  const key = (programId || '').trim().toUpperCase();
  const map = readAllLocalSnapshots();
  return (map[key] || []).slice().sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

export async function createRevisionSnapshot(
  spec: ProgramSpec,
  comment: string,
  author: string,
  overrideVersion?: string
): Promise<{ snapshot: SpecSnapshotRecord; historyItem: SpecChangeHistoryItem }> {
  const cleanId = (spec.program_id || 'ZPROG01').trim().toUpperCase();
  const cleanProj = (spec.project_code || 'TEMP').trim().toUpperCase();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const existing = getSnapshotsForSpec(cleanId);
  const prevHistory = spec.change_history || [];

  let nextVer = overrideVersion;
  if (!nextVer) {
    const lastVer = existing[0]?.version || prevHistory[prevHistory.length - 1]?.version || 'v1.0';
    const match = lastVer.match(/v(\d+)\.(\d+)/i);
    if (match) {
      nextVer = `v${parseInt(match[1], 10)}.${parseInt(match[2], 10) + 1}`;
    } else {
      nextVer = `v1.${existing.length + 1}`;
    }
  }

  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const status: SpecLifecycleStatus = spec.status || 'draft';

  // Deep clone cleanly excluding nested snapshot blobs
  const clonedSpec: ProgramSpec = JSON.parse(
    JSON.stringify({
      ...spec,
      change_history: prevHistory.map(({ snapshot_spec: _omit, ...rest }) => rest),
    })
  );

  const snapshot: SpecSnapshotRecord = {
    snapshotId,
    programId: cleanId,
    projectCode: cleanProj,
    version: nextVer,
    changedAt: now,
    author: author || spec.author || 'Josh Lee',
    comment: comment.trim() || `Saved ${nextVer} snapshot`,
    status,
    spec: clonedSpec,
  };

  const map = readAllLocalSnapshots();
  const currentList = map[cleanId] || [];
  // Keep latest 25 snapshots per spec in localStorage to respect storage limits
  map[cleanId] = [snapshot, ...currentList].slice(0, 25);
  writeAllLocalSnapshots(map);

  if (auth.currentUser && auth.currentUser.emailVerified) {
    try {
      await syncSnapshotToFirestore(clonedSpec, {
        snapshotId,
        version: nextVer,
        comment: snapshot.comment,
        author: snapshot.author,
        status,
      });
    } catch (err) {
      console.warn('Firestore snapshot sync notice:', err);
    }
  }

  const historyItem: SpecChangeHistoryItem = {
    id: `h-${snapshotId}`,
    version: nextVer,
    changed_at: now,
    author: snapshot.author,
    comment: snapshot.comment,
    status,
    snapshot_id: snapshotId,
  };

  return { snapshot, historyItem };
}

export async function loadMergedSnapshotsForSpec(spec: ProgramSpec): Promise<SpecSnapshotRecord[]> {
  const local = getSnapshotsForSpec(spec.program_id);
  if (!auth.currentUser) return local;

  try {
    const remote = await fetchSnapshotsFromFirestore(spec.project_code || 'TEMP', spec.id || spec.program_id);
    const byId = new Map<string, SpecSnapshotRecord>();
    local.forEach((s) => byId.set(s.snapshotId, s));
    remote.forEach((r) => {
      if (!byId.has(r.snapshotId)) {
        byId.set(r.snapshotId, {
          snapshotId: r.snapshotId,
          programId: spec.program_id,
          projectCode: spec.project_code || 'TEMP',
          version: r.version,
          changedAt: r.specSnapshot?.created_date || '',
          author: r.author,
          comment: r.comment,
          status: r.status,
          spec: r.specSnapshot,
        });
      }
    });
    return Array.from(byId.values()).sort((a, b) => b.version.localeCompare(a.version));
  } catch {
    return local;
  }
}

export function computeSpecDiff(base: ProgramSpec, target: ProgramSpec): SpecDiffField[] {
  const diffs: SpecDiffField[] = [];

  const compareScalar = (section: string, label: string, a: unknown, b: unknown) => {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    if (sa !== sb) {
      diffs.push({ section, label, before: sa || '(None)', after: sb || '(None)' });
    }
  };

  compareScalar('General', 'Program Title', base.title, target.title);
  compareScalar('General', 'T-Code', base.tcode, target.tcode);
  compareScalar('General', 'Module', base.module, target.module);
  compareScalar('General', 'Lifecycle Status', base.status || 'draft', target.status || 'draft');
  compareScalar('General', 'ABAP Syntax Mode', base.abap_syntax_mode || 'modern_740', target.abap_syntax_mode || 'modern_740');
  compareScalar('Logic', 'Business Purpose', base.business_purpose, target.business_purpose);
  compareScalar('Logic', 'Data Extraction Logic', base.data_extraction_logic, target.data_extraction_logic);

  const selA = (base.selection_params || []).map((p) => `${p.name}(${p.kind})`).join(', ');
  const selB = (target.selection_params || []).map((p) => `${p.name}(${p.kind})`).join(', ');
  if (selA !== selB) {
    diffs.push({
      section: 'Selection Screen',
      label: `Parameters (${base.selection_params.length} → ${target.selection_params.length})`,
      before: selA || '(None)',
      after: selB || '(None)',
    });
  }

  const fcatA = (base.field_catalog || []).map((f) => `${f.fieldname}:${f.datatype}(${f.outputlen})`).join(', ');
  const fcatB = (target.field_catalog || []).map((f) => `${f.fieldname}:${f.datatype}(${f.outputlen})`).join(', ');
  if (fcatA !== fcatB) {
    diffs.push({
      section: 'Field Catalog',
      label: `Columns (${base.field_catalog.length} → ${target.field_catalog.length})`,
      before: fcatA || '(None)',
      after: fcatB || '(None)',
    });
  }

  const authA = (base.authority_checks || []).map((a) => a.object).join(', ');
  const authB = (target.authority_checks || []).map((a) => a.object).join(', ');
  if (authA !== authB) {
    diffs.push({
      section: 'FS/TS Governance',
      label: 'Authority Objects (AUTHORITY-CHECK)',
      before: authA || '(None)',
      after: authB || '(None)',
    });
  }

  const msgA = (base.sap_messages || []).map((m) => `${m.msg_class}-${m.msg_no}`).join(', ');
  const msgB = (target.sap_messages || []).map((m) => `${m.msg_class}-${m.msg_no}`).join(', ');
  if (msgA !== msgB) {
    diffs.push({
      section: 'FS/TS Governance',
      label: 'SE91 Messages',
      before: msgA || '(None)',
      after: msgB || '(None)',
    });
  }

  if (JSON.stringify(base.performance_config || {}) !== JSON.stringify(target.performance_config || {})) {
    diffs.push({
      section: 'FS/TS Governance',
      label: 'Batch / Performance / HANA Config',
      before: JSON.stringify(base.performance_config || {}),
      after: JSON.stringify(target.performance_config || {}),
    });
  }

  if (JSON.stringify(base.test_cases || []) !== JSON.stringify(target.test_cases || [])) {
    diffs.push({
      section: 'QA',
      label: `Unit Test Cases (${base.test_cases.length} → ${target.test_cases.length})`,
      before: `${base.test_cases.length}`,
      after: `${target.test_cases.length}`,
    });
  }

  return diffs;
}
