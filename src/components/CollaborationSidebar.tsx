import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Brain, Clipboard, MessageCircle, Send, Trash2 } from 'lucide-react';
import type { ActivityItem, AISummaryRecord, ChatMessage, ObjectComment, SummaryType } from '../types';

type SidebarTab = 'chat' | 'comments' | 'activity' | 'ai';

type CollaborationSidebarProps = {
  currentUserId: string;
  currentRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  selectedObjectId: string | null;
  canSendChat: boolean;
  canComment: boolean;
  chatMessages: ChatMessage[];
  comments: ObjectComment[];
  activityItems: ActivityItem[];
  aiSummaries: AISummaryRecord[];
  canGenerateAISummary: boolean;
  aiSummaryLoading: boolean;
  aiSummaryError: string | null;
  onSendChat: (message: string) => void;
  onAddComment: (objectId: string, message: string) => void;
  onResolveComment: (commentId: string, resolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onGenerateAISummary: (summaryType: SummaryType) => void;
};

function CollaborationSidebar({
  currentUserId,
  currentRole,
  selectedObjectId,
  canSendChat,
  canComment,
  chatMessages,
  comments,
  activityItems,
  aiSummaries,
  canGenerateAISummary,
  aiSummaryLoading,
  aiSummaryError,
  onSendChat,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onGenerateAISummary,
}: CollaborationSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [chatDraft, setChatDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [summaryType, setSummaryType] = useState<SummaryType>('MEETING_NOTES');
  const [copiedSummaryId, setCopiedSummaryId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const selectedComments = useMemo(
    () => comments.filter((comment) => comment.objectId === selectedObjectId),
    [comments, selectedObjectId],
  );
  const isOwner = currentRole === 'OWNER';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages.length, activeTab]);

  const submitChat = () => {
    const trimmed = chatDraft.trim();
    if (!trimmed || !canSendChat) return;
    onSendChat(trimmed);
    setChatDraft('');
  };

  const submitComment = () => {
    const trimmed = commentDraft.trim();
    if (!trimmed || !selectedObjectId || !canComment) return;
    onAddComment(selectedObjectId, trimmed);
    setCommentDraft('');
  };

  return (
    <aside className="min-h-[68vh] rounded-2xl border border-slate-200 bg-white shadow-board">
      <div className="grid grid-cols-4 border-b border-slate-200">
        <TabButton active={activeTab === 'chat'} icon={<MessageCircle size={16} />} label="Chat" onClick={() => setActiveTab('chat')} />
        <TabButton active={activeTab === 'comments'} icon={<MessageCircle size={16} />} label="Comments" onClick={() => setActiveTab('comments')} />
        <TabButton active={activeTab === 'activity'} icon={<Activity size={16} />} label="Activity" onClick={() => setActiveTab('activity')} />
        <TabButton active={activeTab === 'ai'} icon={<Brain size={16} />} label="AI" onClick={() => setActiveTab('ai')} />
      </div>

      {activeTab === 'chat' ? (
        <div className="flex h-[68vh] flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {chatMessages.length === 0 ? (
              <EmptyState title="No messages yet" detail="Start the room conversation from here." />
            ) : (
              chatMessages.map((message) => (
                <div key={message.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{message.userName}</p>
                    <time className="text-[11px] font-medium text-slate-400">{formatTime(message.createdAt)}</time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{message.message}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitChat();
                }}
                disabled={!canSendChat}
                maxLength={1000}
                placeholder={canSendChat ? 'Send a message' : 'Chat is read-only'}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
              <button
                type="button"
                onClick={submitChat}
                disabled={!canSendChat || chatDraft.trim().length === 0}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                title="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'comments' ? (
        <div className="flex h-[68vh] flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {!selectedObjectId ? (
              <EmptyState title="Select an object" detail="Object comments appear after selecting a shape, stroke, or text item." />
            ) : selectedComments.length === 0 ? (
              <EmptyState title="No comments" detail="Add the first note for the selected object." />
            ) : (
              selectedComments.map((comment) => (
                <div
                  key={comment.id}
                  className={[
                    'rounded-xl border px-3 py-2',
                    comment.resolved ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{comment.userName}</p>
                      <time className="text-[11px] font-medium text-slate-400">{formatTime(comment.createdAt)}</time>
                    </div>
                    <div className="flex items-center gap-1">
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => onResolveComment(comment.id, !comment.resolved)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          {comment.resolved ? 'Unresolve' : 'Resolve'}
                        </button>
                      ) : null}
                      {isOwner || comment.userId === currentUserId ? (
                        <button
                          type="button"
                          onClick={() => onDeleteComment(comment.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                          title="Delete comment"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{comment.message}</p>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-slate-200 p-3">
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              disabled={!selectedObjectId || !canComment}
              maxLength={1000}
              placeholder={!selectedObjectId ? 'Select an object to comment' : canComment ? 'Add an object comment' : 'Comments are disabled'}
              className="min-h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <button
              type="button"
              onClick={submitComment}
              disabled={!selectedObjectId || !canComment || commentDraft.trim().length === 0}
              className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add comment
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'activity' ? (
        <div className="h-[68vh] space-y-3 overflow-auto p-4">
          {activityItems.length === 0 ? (
            <EmptyState title="No activity yet" detail="Room changes will appear here as the team works." />
          ) : (
            activityItems
              .slice()
              .reverse()
              .map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm leading-relaxed text-slate-700">{item.message}</p>
                  <time className="mt-1 block text-[11px] font-medium text-slate-400">{formatTime(item.createdAt)}</time>
                </div>
              ))
          )}
        </div>
      ) : null}

      {activeTab === 'ai' ? (
        <div className="flex h-[68vh] flex-col">
          <div className="border-b border-slate-200 p-4">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Summary type</label>
            <select
              value={summaryType}
              onChange={(event) => setSummaryType(event.target.value as SummaryType)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="MEETING_NOTES">Meeting notes</option>
              <option value="ACTION_ITEMS">Action items</option>
              <option value="CLASS_NOTES">Class notes</option>
              <option value="MIND_MAP">Mind map</option>
            </select>
            <button
              type="button"
              onClick={() => onGenerateAISummary(summaryType)}
              disabled={!canGenerateAISummary || aiSummaryLoading}
              className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {aiSummaryLoading ? 'Generating...' : 'Generate summary'}
            </button>
            {!canGenerateAISummary ? <p className="mt-2 text-xs text-slate-500">AI generation is disabled for your role.</p> : null}
            {aiSummaryError ? <p className="mt-2 text-xs font-semibold text-red-600">{aiSummaryError}</p> : null}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {aiSummaries.length === 0 ? (
              <EmptyState title="No summaries yet" detail="Generate a board summary from objects, chat, comments, and activity." />
            ) : (
              aiSummaries.map((item) => {
                const content = item.summary;
                const createdAt = item.generatedAt ?? item.createdAt;
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatSummaryType(item.summaryType)}</p>
                        <time className="text-[11px] font-medium text-slate-400">{formatTime(createdAt)}</time>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(summaryToText(content));
                          setCopiedSummaryId(item.id);
                          window.setTimeout(() => setCopiedSummaryId(null), 1400);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
                        title="Copy summary"
                      >
                        <Clipboard size={15} />
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{content.summary || 'No summary text returned.'}</p>
                    <SummaryList title="Key points" items={content.keyPoints} />
                    <SummaryList title="Action items" items={content.actionItems} />
                    <SummaryList title="Decisions" items={content.decisions} />
                    <SummaryList title="Open questions" items={content.openQuestions} />
                    <SummaryList title="Next steps" items={content.nextSteps} />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                      >
                        Saved
                      </button>
                      {copiedSummaryId === item.id ? <span className="text-xs font-semibold text-blue-600">Copied</span> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition',
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="text-sm leading-relaxed text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const formatSummaryType = (value: SummaryType) =>
  value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');

const summaryToText = (summary: AISummaryRecord['summary']) =>
  [
    summary.summary,
    listToText('Key points', summary.keyPoints),
    listToText('Action items', summary.actionItems),
    listToText('Decisions', summary.decisions),
    listToText('Open questions', summary.openQuestions),
    listToText('Next steps', summary.nextSteps),
  ]
    .filter(Boolean)
    .join('\n\n');

const listToText = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((item) => `- ${item}`).join('\n')}` : '');

export default CollaborationSidebar;
