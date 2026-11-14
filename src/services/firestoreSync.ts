import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ProgramSpec,
  ProjectMeetingMinute,
  SapDD02LTable,
  SapDD03LField,
  SapProject,
  SpecLifecycleStatus,
  SpecReviewComment,
} from '../types/sap';

import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  normalizeLegacyProjectCode,
} from '../utils/projectStorage';

function sanitizeId(raw: string): string {
  const cleaned = (raw || 'DOC_01').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.slice(0, 128) || 'DOC_01';
}

function sanitizeProjectCode(raw?: string): string {
  const mapped = normalizeLegacyProjectCode(raw || TEMP_PROJECT_CODE);
  const cleaned = mapped
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  return cleaned.slice(0, 4).padEnd(4, '_').replace(/^_+$/, TEMP_PROJECT_CODE) || TEMP_PROJECT_CODE;
}

function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (val && typeof val === 'object') {
    const out: Record<string, any> = {};
    Object.entries(val as Record<string, any>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return val;
}

export async function syncProjectToFirestore(project: SapProject): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const projectId = sanitizeProjectCode(project.code);
  const path = `projects/${projectId}`;
  const ref = doc(db, 'projects', projectId);

  try {
    const existingSnap = await getDoc(ref);
    const memberUids = Array.from(
      new Set([...(project.memberUids || []), project.ownerId || user.uid, user.uid].filter(Boolean))
    ).slice(0, 50);

    const payload: Record<string, any> = {
      code: projectId,
      name: (project.name || projectId).slice(0, 120),
      description: (project.description || '').slice(0, 1000),
      visibility: project.visibility || 'project',
      target_sap_release: (project.target_sap_release || 'SAP S/4HANA 2023').slice(0, 80),
      start_date: (project.start_date || '').slice(0, 20),
      end_date: (project.end_date || '').slice(0, 20),
      ownerId: existingSnap.exists()
        ? existingSnap.data().ownerId || user.uid
        : project.ownerId || user.uid,
      ownerName: (project.owner || user.displayName || 'Josh Lee').slice(0, 80),
      memberUids,
      memberNames: (project.members || []).slice(0, 50),
      modules: (project.modules && project.modules.length > 0 ? project.modules : ['SD']).slice(0, 10),
      is_system: Boolean(project.is_system),
      created_date: (project.created_date || new Date().toISOString().split('T')[0]).slice(0, 30),
      updatedAt: serverTimestamp(),
    };

    if (project.abap_standards) {
      payload.abap_standards = stripUndefinedDeep(project.abap_standards);
    }

    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSpecToFirestore(
  spec: ProgramSpec,
  project?: SapProject
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const projectId = sanitizeProjectCode(spec.project_code);
  const specId = sanitizeId(spec.id || spec.program_id);
  const path = `projects/${projectId}/specs/${specId}`;
  const ref = doc(db, 'projects', projectId, 'specs', specId);

  try {
    // Ensure parent project doc exists first for Master Gate integrity
    const projRef = doc(db, 'projects', projectId);
    const projSnap = await getDoc(projRef);
    const projVisibility =
      project?.visibility ||
      (projectId === COMMON_PROJECT_CODE ? 'common' : projectId === TEMP_PROJECT_CODE ? 'temp' : 'project');

    if (!projSnap.exists()) {
      await syncProjectToFirestore(
        project || {
          code: projectId,
          name: projectId === TEMP_PROJECT_CODE ? 'Personal Workspace (TEMP)' : projectId,
          description: 'Auto-synchronized workspace project',
          visibility: projVisibility,
          target_sap_release: spec.target_sap_release || 'SAP S/4HANA 2023',
          owner: spec.author || user.displayName || 'User',
          ownerId: user.uid,
          members: [spec.author || user.displayName || 'User'],
          memberUids: [user.uid],
          modules: [spec.module || 'SD'],
          is_system: projectId === TEMP_PROJECT_CODE || projectId === COMMON_PROJECT_CODE,
          created_date: spec.created_date || new Date().toISOString().split('T')[0],
        }
      );
    }

    const latestProjSnap = await getDoc(projRef);
    const memberUids: string[] = Array.from(
      new Set([
        ...(latestProjSnap.exists() ? latestProjSnap.data().memberUids || [] : []),
        user.uid,
      ])
    ).slice(0, 50);

    const existingSnap = await getDoc(ref);
    const status: SpecLifecycleStatus = spec.status || 'draft';

    // Strip embedded snapshot_spec copies inside change_history to stay well below 1MB doc limit;
    // full snapshots are persisted in /snapshots subcollection
    const compactSpec: ProgramSpec = stripUndefinedDeep({
      ...spec,
      change_history: (spec.change_history || []).map(({ snapshot_spec: _omit, ...rest }) => rest),
    });

    const payload: Record<string, any> = {
      id: specId,
      project_code: projectId,
      projectVisibility: latestProjSnap.exists()
        ? latestProjSnap.data().visibility
        : projVisibility,
      projectMemberUids: memberUids,
      program_id: (spec.program_id || 'ZPROG01').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40),
      tcode: (spec.tcode || 'ZREP01').toUpperCase().slice(0, 20),
      title: (spec.title || 'SAP ALV Report').slice(0, 200),
      module: spec.module || 'SD',
      sample_type: (['01', '02', '03', '04'].includes(spec.sample_type || '') ? spec.sample_type : '01') as '01' | '02' | '03' | '04',
      authorId: existingSnap.exists() ? existingSnap.data().authorId : spec.author_id || user.uid,
      author: (spec.author || user.displayName || 'SAP User').slice(0, 80),
      status,
      specData: compactSpec,
      updatedAt: serverTimestamp(),
    };

    if (spec.approved_by) payload.approvedBy = spec.approved_by.slice(0, 80);
    if (spec.approved_at) payload.approvedAt = spec.approved_at.slice(0, 40);

    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSnapshotToFirestore(
  spec: ProgramSpec,
  meta: {
    snapshotId: string;
    version: string;
    comment: string;
    author: string;
    status: SpecLifecycleStatus;
  }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const projectId = sanitizeProjectCode(spec.project_code);
  const specId = sanitizeId(spec.id || spec.program_id);
  const snapshotId = sanitizeId(meta.snapshotId);
  const path = `projects/${projectId}/specs/${specId}/snapshots/${snapshotId}`;
  const ref = doc(db, 'projects', projectId, 'specs', specId, 'snapshots', snapshotId);

  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const projVisibility = projSnap.exists()
      ? projSnap.data().visibility
      : projectId === 'TEMP'
      ? 'temp'
      : 'project';
    const memberUids: string[] = Array.from(
      new Set([...(projSnap.exists() ? projSnap.data().memberUids || [] : []), user.uid])
    ).slice(0, 50);

    const compactSnapshot = stripUndefinedDeep({
      ...spec,
      change_history: (spec.change_history || []).map(({ snapshot_spec: _omit, ...rest }) => rest),
    });

    await setDoc(ref, {
      snapshotId,
      project_code: projectId,
      projectVisibility: projVisibility,
      projectMemberUids: memberUids,
      version: meta.version.slice(0, 20),
      authorId: user.uid,
      author: (meta.author || user.displayName || 'SAP User').slice(0, 80),
      comment: (meta.comment || '').slice(0, 400),
      status: meta.status,
      specSnapshot: compactSnapshot,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function fetchSnapshotsFromFirestore(
  projectCode: string,
  specId: string
): Promise<
  {
    snapshotId: string;
    version: string;
    author: string;
    comment: string;
    status: SpecLifecycleStatus;
    specSnapshot: ProgramSpec;
  }[]
> {
  const user = auth.currentUser;
  if (!user) return [];

  const cleanProj = sanitizeProjectCode(projectCode);
  const cleanSpec = sanitizeId(specId);
  const colPath = `projects/${cleanProj}/specs/${cleanSpec}/snapshots`;

  try {
    const q =
      cleanProj === 'TEMP'
        ? query(collection(db, colPath), where('authorId', '==', user.uid))
        : query(
            collection(db, colPath),
            where('projectMemberUids', 'array-contains', user.uid)
          );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as any);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }
}

export async function syncMeetingMinuteToFirestore(minute: ProjectMeetingMinute): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const projectId = sanitizeProjectCode(minute.project_code);
  const minuteId = sanitizeId(minute.id);
  const path = `projects/${projectId}/meetings/${minuteId}`;
  const ref = doc(db, 'projects', projectId, 'meetings', minuteId);

  try {
    const projRef = doc(db, 'projects', projectId);
    const projSnap = await getDoc(projRef);
    const memberUids: string[] = Array.from(
      new Set([...(projSnap.exists() ? projSnap.data().memberUids || [] : []), user.uid])
    ).slice(0, 50);
    const existingSnap = await getDoc(ref);

    const payload: Record<string, any> = {
      id: minuteId,
      project_code: projectId,
      projectVisibility: projSnap.exists() ? projSnap.data().visibility : projectId === 'TEMP' ? 'temp' : 'project',
      projectMemberUids: memberUids,
      title: (minute.title || 'SAP Meeting Minutes').slice(0, 200),
      authorId: existingSnap.exists() ? existingSnap.data().authorId : user.uid,
      author: (minute.author || user.displayName || 'SAP User').slice(0, 80),
      status: minute.status || 'recording',
      minuteData: stripUndefinedDeep(minute),
      updatedAt: serverTimestamp(),
    };
    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncCustomDdicTableToFirestore(
  table: SapDD02LTable,
  fields: SapDD03LField[]
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !table.is_custom) return;

  const tableId = table.tabname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30);
  const path = `ddic_tables/${tableId}`;
  const ref = doc(db, 'ddic_tables', tableId);

  try {
    const existingSnap = await getDoc(ref);
    const payload: Record<string, any> = {
      tabname: tableId,
      ddtext: (table.ddtext || tableId).slice(0, 120),
      module: table.module || 'CUSTOM',
      tabclass: table.tabclass || 'TRANSP',
      description: (table.description || '').slice(0, 500),
      ownerId: existingSnap.exists() ? existingSnap.data().ownerId : user.uid,
      is_custom: true,
      fields: stripUndefinedDeep(fields.slice(0, 200)),
      updatedAt: serverTimestamp(),
    };
    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCustomDdicTableFromFirestore(tabname: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const tableId = tabname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30);
  const path = `ddic_tables/${tableId}`;
  try {
    await deleteDoc(doc(db, 'ddic_tables', tableId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeProjectSpecs(
  projectCode: string,
  onData: (specs: ProgramSpec[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const cleanProj = sanitizeProjectCode(projectCode);
  const colPath = `projects/${cleanProj}/specs`;
  const q =
    cleanProj === TEMP_PROJECT_CODE
      ? query(collection(db, colPath), where('authorId', '==', user.uid))
      : cleanProj === COMMON_PROJECT_CODE
      ? query(collection(db, colPath), where('projectVisibility', '==', 'common'))
      : query(collection(db, colPath), where('projectMemberUids', 'array-contains', user.uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ProgramSpec[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.specData) {
          list.push({
            ...(data.specData as ProgramSpec),
            status: data.status || data.specData.status || 'draft',
            approved_by: data.approvedBy || data.specData.approved_by,
            approved_at: data.approvedAt || data.specData.approved_at,
          });
        }
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  );
}

export async function syncReviewCommentToFirestore(
  comment: SpecReviewComment,
  project?: SapProject
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const projectId = sanitizeProjectCode(comment.project_code);
  const specId = sanitizeId(comment.spec_id);
  const commentId = sanitizeId(comment.id);
  const path = `projects/${projectId}/specs/${specId}/comments/${commentId}`;
  const ref = doc(db, 'projects', projectId, 'specs', specId, 'comments', commentId);

  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const projVisibility = projSnap.exists()
      ? projSnap.data().visibility
      : project?.visibility || (projectId === COMMON_PROJECT_CODE ? 'common' : projectId === TEMP_PROJECT_CODE ? 'temp' : 'project');
    const memberUids: string[] = Array.from(
      new Set([
        ...(projSnap.exists() ? projSnap.data().memberUids || [] : project?.memberUids || []),
        user.uid,
      ])
    ).slice(0, 50);

    const existingSnap = await getDoc(ref);
    const payload: Record<string, any> = {
      id: commentId,
      project_code: projectId,
      spec_id: specId,
      projectVisibility: projVisibility,
      projectMemberUids: memberUids,
      section: comment.section,
      authorId: existingSnap.exists() ? existingSnap.data().authorId : comment.author_id || user.uid,
      authorName: (comment.author_name || user.displayName || 'SAP User').slice(0, 80),
      authorRole: comment.author_role || 'FUNC',
      body: (comment.body || '').slice(0, 1500),
      resolved: Boolean(comment.resolved),
      replies: stripUndefinedDeep((comment.replies || []).slice(0, 50)),
      updatedAt: serverTimestamp(),
    };
    if (comment.resolved_by) payload.resolvedBy = comment.resolved_by.slice(0, 80);
    if (comment.resolved_at) payload.resolvedAt = comment.resolved_at.slice(0, 40);

    if (!existingSnap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteReviewCommentFromFirestore(
  projectCode: string,
  specId: string,
  commentId: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const cleanProj = sanitizeProjectCode(projectCode);
  const cleanSpec = sanitizeId(specId);
  const cleanComment = sanitizeId(commentId);
  const path = `projects/${cleanProj}/specs/${cleanSpec}/comments/${cleanComment}`;
  try {
    await deleteDoc(doc(db, 'projects', cleanProj, 'specs', cleanSpec, 'comments', cleanComment));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeSpecReviewComments(
  projectCode: string,
  specId: string,
  onData: (comments: SpecReviewComment[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const cleanProj = sanitizeProjectCode(projectCode);
  const cleanSpec = sanitizeId(specId);
  const colPath = `projects/${cleanProj}/specs/${cleanSpec}/comments`;
  const q =
    cleanProj === TEMP_PROJECT_CODE
      ? query(collection(db, colPath), where('authorId', '==', user.uid))
      : cleanProj === COMMON_PROJECT_CODE
      ? query(collection(db, colPath), where('projectVisibility', '==', 'common'))
      : query(collection(db, colPath), where('projectMemberUids', 'array-contains', user.uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SpecReviewComment[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d) return;
        const createdIso = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString();
        const updatedIso = d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : createdIso;
        list.push({
          id: d.id || docSnap.id,
          project_code: d.project_code || cleanProj,
          spec_id: d.spec_id || cleanSpec,
          section: d.section || 'general',
          author_id: d.authorId,
          author_name: d.authorName || 'SAP User',
          author_role: d.authorRole,
          body: d.body || '',
          resolved: Boolean(d.resolved),
          resolved_by: d.resolvedBy,
          resolved_at: d.resolvedAt,
          replies: Array.isArray(d.replies) ? d.replies : [],
          created_at: createdIso,
          updated_at: updatedIso,
        });
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  );
}

