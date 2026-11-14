import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  ProgramSpec,
  SpecReviewComment,
  SpecReviewSection,
  UserProjectRole,
} from '../types/sap';
import { useAuth } from '../contexts/AuthContext';
import { subscribeSpecReviewComments } from '../services/firestoreSync';
import {
  addReviewComment,
  addReviewCommentReply,
  deleteReviewComment,
  getReviewCommentsForSpec,
  mergeRemoteReviewComments,
  toggleResolveReviewComment,
} from '../utils/reviewCommentStorage';
import { COMMON_PROJECT_CODE } from '../utils/projectStorage';

interface SpecReviewCommentsPanelProps {
  spec: ProgramSpec;
  currentUserName: string;
  currentUserId?: string;
  projectRole: UserProjectRole;
  isReadOnly: boolean;
  onCommentsUpdated?: () => void;
  onNotify?: (message: string) => void;
}

const SECTION_LABELS: Record<SpecReviewSection, string> = {
  general: 'General',
  selection: 'Selection Screen',
  field_catalog: 'Field Catalog',
  data_logic: 'Data Logic',
  governance: 'Governance / Perf',
};

const ALL_SECTIONS: SpecReviewSection[] = [
  'general',
  'selection',
  'field_catalog',
  'data_logic',
  'governance',
];

function formatShortTimestamp(iso: string): string {
  if (!iso) return '-';
  if (iso.includes('T')) {
    return iso.replace('T', ' ').slice(0, 16);
  }
  return iso.slice(0, 16);
}

export const SpecReviewCommentsPanel: React.FC<SpecReviewCommentsPanelProps> = ({
  spec,
  currentUserName,
  currentUserId,
  projectRole,
  isReadOnly,
  onCommentsUpdated,
  onNotify,
}) => {
  const { isFirebaseAuthenticated } = useAuth();
  const projectCode = (spec.project_code || 'TEMP').toUpperCase();

  const [comments, setComments] = useState<SpecReviewComment[]>(() =>
    getReviewCommentsForSpec(projectCode, spec.id)
  );
  const [sectionFilter, setSectionFilter] = useState<'ALL' | SpecReviewSection>('ALL');
  const [showResolved, setShowResolved] = useState<boolean>(true);
  const [newSection, setNewSection] = useState<SpecReviewSection>('general');
  const [newBody, setNewBody] = useState<string>('');
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<string>('');

  // Load local comments when spec changes
  useEffect(() => {
    setComments(getReviewCommentsForSpec(projectCode, spec.id));
    setReplyOpenId(null);
    setReplyBody('');
  }, [projectCode, spec.id]);

  // Real-time Firestore comments subscription when authenticated
  useEffect(() => {
    if (!isFirebaseAuthenticated || !spec.id || projectCode === COMMON_PROJECT_CODE) return;
    const unsubscribe = subscribeSpecReviewComments(projectCode, spec.id, (remote) => {
      const merged = mergeRemoteReviewComments(projectCode, spec.id, remote);
      setComments(merged);
      onCommentsUpdated?.();
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirebaseAuthenticated, projectCode, spec.id]);

  const unresolvedCount = useMemo(
    () => comments.filter((c) => !c.resolved).length,
    [comments]
  );

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (sectionFilter !== 'ALL' && c.section !== sectionFilter) return false;
      if (!showResolved && c.resolved) return false;
      return true;
    });
  }, [comments, sectionFilter, showResolved]);

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBody.trim();
    if (!trimmed || isReadOnly) return;
    addReviewComment({
      project_code: projectCode,
      spec_id: spec.id,
      section: newSection,
      author_id: currentUserId,
      author_name: currentUserName,
      author_role: projectRole,
      body: trimmed,
    });
    setComments(getReviewCommentsForSpec(projectCode, spec.id));
    setNewBody('');
    onCommentsUpdated?.();
    onNotify?.('Review comment posted.');
  };

  const handleSubmitReply = (commentId: string) => {
    const trimmed = replyBody.trim();
    if (!trimmed || isReadOnly) return;
    addReviewCommentReply(commentId, {
      author_name: currentUserName,
      author_role: projectRole,
      body: trimmed,
    });
    setComments(getReviewCommentsForSpec(projectCode, spec.id));
    setReplyBody('');
    setReplyOpenId(null);
    onCommentsUpdated?.();
  };

  const handleToggleResolve = (commentId: string) => {
    if (isReadOnly) return;
    const updated = toggleResolveReviewComment(commentId, currentUserName);
    setComments(getReviewCommentsForSpec(projectCode, spec.id));
    onCommentsUpdated?.();
    if (updated) {
      onNotify?.(updated.resolved ? 'Marked comment as resolved.' : 'Reopened review comment.');
    }
  };

  const handleDelete = (commentId: string) => {
    if (isReadOnly) return;
    deleteReviewComment(commentId);
    setComments(getReviewCommentsForSpec(projectCode, spec.id));
    onCommentsUpdated?.();
    onNotify?.('Review comment deleted.');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Section Review Comments
          </h4>
          <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-600">
            Open {unresolvedCount} / Total {comments.length}
          </span>
        </div>

        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          <span>Show Resolved</span>
        </label>
      </div>

      {/* Section Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSectionFilter('ALL')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            sectionFilter === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All ({comments.length})
        </button>
        {ALL_SECTIONS.map((sec) => {
          const cnt = comments.filter((c) => c.section === sec && !c.resolved).length;
          return (
            <button
              key={sec}
              type="button"
              onClick={() => setSectionFilter(sec)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sectionFilter === sec
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {SECTION_LABELS[sec]}
              {cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>

      {/* New Comment Form */}
      {!isReadOnly ? (
        <form onSubmit={handleSubmitComment} className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              aria-label="Review target section"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value as SpecReviewSection)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-800 cursor-pointer sm:w-44"
            >
              {ALL_SECTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  Target: {SECTION_LABELS[sec]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Add review comment or question for functional/ABAP team..."
              className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newBody.trim()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Post Comment</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Review comments are disabled on read-only COMM samples. Copy to a project to start a review.
        </div>
      )}

      {/* Comment Thread List */}
      {filteredComments.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-400">
          {comments.length === 0
            ? 'No design review comments yet.'
            : 'No comments match the selected filter.'}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {filteredComments.map((cmt) => {
            const canDelete =
              !isReadOnly &&
              (cmt.author_name === currentUserName ||
                projectRole === 'PM' ||
                projectRole === 'ADMIN');

            return (
              <div
                key={cmt.id}
                className={`p-3 space-y-2 ${cmt.resolved ? 'bg-slate-50/60 opacity-80' : 'bg-white'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-mono font-bold text-blue-700">
                      [{SECTION_LABELS[cmt.section] || cmt.section}]
                    </span>
                    <span className="font-semibold text-slate-900">{cmt.author_name}</span>
                    {cmt.author_role && (
                      <span className="font-mono text-[10px] text-slate-500">
                        ({cmt.author_role})
                      </span>
                    )}
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {formatShortTimestamp(cmt.created_at)}
                    </span>
                    {cmt.resolved && (
                      <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <CheckCircle2 className="w-3 h-3" />
                        Resolved ({cmt.resolved_by || '-'})
                      </span>
                    )}
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyOpenId((prev) => (prev === cmt.id ? null : cmt.id));
                          setReplyBody('');
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleResolve(cmt.id)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                          cmt.resolved
                            ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {cmt.resolved ? (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Reopen</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Resolve</span>
                          </>
                        )}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(cmt.id)}
                          title="Delete comment"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p
                  className={`text-xs leading-relaxed whitespace-pre-wrap ${
                    cmt.resolved ? 'line-through text-slate-500' : 'text-slate-800'
                  }`}
                >
                  {cmt.body}
                </p>

                {/* Replies */}
                {cmt.replies && cmt.replies.length > 0 && (
                  <div className="pl-4 pt-1.5 space-y-1.5 border-t border-slate-100">
                    {cmt.replies.map((rep) => (
                      <div key={rep.id} className="flex items-start gap-2 text-xs">
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">{rep.author_name}</span>
                            {rep.author_role && (
                              <span className="font-mono text-[10px]">({rep.author_role})</span>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatShortTimestamp(rep.created_at)}
                            </span>
                          </div>
                          <div className="text-slate-700 mt-0.5">{rep.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Reply Input */}
                {replyOpenId === cmt.id && !isReadOnly && (
                  <div className="pl-4 pt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmitReply(cmt.id);
                        }
                      }}
                      placeholder="Write a reply and press Enter..."
                      autoFocus
                      className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:border-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!replyBody.trim()}
                      onClick={() => handleSubmitReply(cmt.id)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Post
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
