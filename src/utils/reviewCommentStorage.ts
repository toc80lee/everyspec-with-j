import {
  SpecReviewComment,
  SpecReviewReply,
  SpecReviewSection,
  UserProjectRole,
} from '../types/sap';
import { getProjectByCode, normalizeLegacyProjectCode } from './projectStorage';
import {
  deleteReviewCommentFromFirestore,
  syncReviewCommentToFirestore,
} from '../services/firestoreSync';

const REVIEW_COMMENTS_KEY = 'sap_spec_review_comments_v1';

function readAllComments(): SpecReviewComment[] {
  try {
    const raw = localStorage.getItem(REVIEW_COMMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load review comments:', err);
    return [];
  }
}

function writeAllComments(comments: SpecReviewComment[]) {
  try {
    localStorage.setItem(REVIEW_COMMENTS_KEY, JSON.stringify(comments));
  } catch (err) {
    console.error('Failed to persist review comments:', err);
  }
}

export function getReviewCommentsForSpec(
  projectCode: string | undefined,
  specId: string
): SpecReviewComment[] {
  const cleanProj = normalizeLegacyProjectCode(projectCode || 'TEMP');
  const cleanSpec = (specId || '').trim();
  if (!cleanSpec) return [];
  return readAllComments()
    .filter(
      (c) =>
        normalizeLegacyProjectCode(c.project_code || 'TEMP') === cleanProj &&
        c.spec_id === cleanSpec
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getUnresolvedCommentCountsMap(
  projectCode?: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  const cleanProj = projectCode ? normalizeLegacyProjectCode(projectCode) : null;
  for (const c of readAllComments()) {
    if (c.resolved) continue;
    if (cleanProj && normalizeLegacyProjectCode(c.project_code || 'TEMP') !== cleanProj) continue;
    counts[c.spec_id] = (counts[c.spec_id] || 0) + 1;
  }
  return counts;
}

export function addReviewComment(params: {
  project_code: string;
  spec_id: string;
  section: SpecReviewSection;
  author_id?: string;
  author_name: string;
  author_role?: UserProjectRole;
  body: string;
}): SpecReviewComment {
  const now = new Date().toISOString();
  const comment: SpecReviewComment = {
    id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    project_code: normalizeLegacyProjectCode(params.project_code || 'TEMP'),
    spec_id: params.spec_id,
    section: params.section,
    author_id: params.author_id,
    author_name: params.author_name || 'SAP User',
    author_role: params.author_role,
    body: params.body.trim(),
    resolved: false,
    replies: [],
    created_at: now,
    updated_at: now,
  };

  const all = readAllComments();
  writeAllComments([...all, comment]);

  const proj = getProjectByCode(comment.project_code);
  syncReviewCommentToFirestore(comment, proj).catch((err) =>
    console.warn('Firestore comment sync deferred:', err)
  );

  return comment;
}

export function addReviewCommentReply(
  commentId: string,
  replyInput: {
    author_name: string;
    author_role?: UserProjectRole;
    body: string;
  }
): SpecReviewComment | null {
  const all = readAllComments();
  const idx = all.findIndex((c) => c.id === commentId);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  const reply: SpecReviewReply = {
    id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    author_name: replyInput.author_name || 'SAP User',
    author_role: replyInput.author_role,
    body: replyInput.body.trim(),
    created_at: now,
  };

  const updated: SpecReviewComment = {
    ...all[idx],
    replies: [...(all[idx].replies || []), reply],
    updated_at: now,
  };

  all[idx] = updated;
  writeAllComments(all);

  const proj = getProjectByCode(updated.project_code);
  syncReviewCommentToFirestore(updated, proj).catch((err) =>
    console.warn('Firestore comment reply sync deferred:', err)
  );

  return updated;
}

export function toggleResolveReviewComment(
  commentId: string,
  actorName: string
): SpecReviewComment | null {
  const all = readAllComments();
  const idx = all.findIndex((c) => c.id === commentId);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  const nextResolved = !all[idx].resolved;
  const updated: SpecReviewComment = {
    ...all[idx],
    resolved: nextResolved,
    resolved_by: nextResolved ? actorName : undefined,
    resolved_at: nextResolved ? now : undefined,
    updated_at: now,
  };

  all[idx] = updated;
  writeAllComments(all);

  const proj = getProjectByCode(updated.project_code);
  syncReviewCommentToFirestore(updated, proj).catch((err) =>
    console.warn('Firestore comment resolve sync deferred:', err)
  );

  return updated;
}

export function deleteReviewComment(commentId: string): boolean {
  const all = readAllComments();
  const target = all.find((c) => c.id === commentId);
  if (!target) return false;

  writeAllComments(all.filter((c) => c.id !== commentId));

  deleteReviewCommentFromFirestore(
    target.project_code,
    target.spec_id,
    target.id
  ).catch((err) => console.warn('Firestore comment delete deferred:', err));

  return true;
}

export function mergeRemoteReviewComments(
  projectCode: string,
  specId: string,
  remoteComments: SpecReviewComment[]
): SpecReviewComment[] {
  const cleanProj = normalizeLegacyProjectCode(projectCode || 'TEMP');
  const all = readAllComments();
  const others = all.filter(
    (c) =>
      !(
        normalizeLegacyProjectCode(c.project_code || 'TEMP') === cleanProj &&
        c.spec_id === specId
      )
  );
  const localForSpec = all.filter(
    (c) =>
      normalizeLegacyProjectCode(c.project_code || 'TEMP') === cleanProj &&
      c.spec_id === specId
  );

  const mergedMap = new Map<string, SpecReviewComment>();
  for (const item of localForSpec) {
    mergedMap.set(item.id, item);
  }
  for (const remote of remoteComments) {
    const existing = mergedMap.get(remote.id);
    if (!existing || remote.updated_at >= existing.updated_at) {
      mergedMap.set(remote.id, remote);
    }
  }

  const mergedSpecComments = Array.from(mergedMap.values()).sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  writeAllComments([...others, ...mergedSpecComments]);
  return mergedSpecComments;
}
