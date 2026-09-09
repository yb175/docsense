import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';
import { PdfViewer } from '../components/PdfViewer';
import { workspaceSummary } from '../mocks/workspace.mock';
import { commentBody, insertComment, useComments } from '../hooks/useComments';
import type { Comment, CommentContent, CommentSpan } from '../hooks/useComments';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, credentials: 'include', headers: { ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

type Document = { filename: string };
type ChatMessage = { from: 'you' | 'ai'; text: string };

function RichText({ content }: { content: CommentContent }) {
  return <>{content.blocks.map((block, index) => block.type === 'bulletList'
    ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText spans={item} /></li>)}</ul>
    : <p key={index}><InlineText spans={block.content} /></p>)}</>;
}

function InlineText({ spans }: { spans: CommentSpan[] }) {
  return <>{spans.map((span, index) => {
    const text = span.text;
    const italic = span.marks.includes('italic');
    const bold = span.marks.includes('bold');
    const value = italic ? <em>{text}</em> : text;
    return bold ? <strong key={index}>{value}</strong> : <span key={index}>{value}</span>;
  })}</>;
}

function commentPreview(comment: Comment) {
  return comment.content.blocks.flatMap((block) => block.type === 'bulletList'
    ? block.items.flatMap((item) => item.map((span) => span.text))
    : block.content.map((span) => span.text)).join(' ').trim();
}

function CommentCard({ comment, onReply }: { comment: Comment; onReply: (comment: Comment) => void }) {
  const author = comment.author.name ?? 'Guest';
  return <article className={`comment-card${comment.parentId ? ' comment-reply' : ''}`}>
    <div className="comment-author"><span className="comment-avatar success">{author.slice(0, 2).toUpperCase()}</span><div><strong>{author}</strong><small>{comment.author.type === 'guest' ? 'Guest reviewer' : 'Collaborator'}</small></div><time>{new Date(comment.createdAt).toLocaleString()}</time></div>
    <div className="comment-rich-text"><RichText content={comment.content} /></div>
    {!comment.parentId && <div className="comment-status success"><span className="material-symbols-outlined">forum</span><span>Comment</span><button onClick={() => onReply(comment)}>Reply</button></div>}
  </article>;
}

export function SharedDocumentPage({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [accessKind, setAccessKind] = useState<'owner' | 'guest'>('guest');
  const [contentUrl, setContentUrl] = useState('');
  const [contentError, setContentError] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'chat' | 'comments'>('chat');
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { from: 'you', text: 'Does Section 14.2 allow Stripe to terminate for convenience without cause?' },
    { from: 'ai', text: 'According to Section 14.2, termination for convenience requires 90 days prior written notice and settlement of outstanding milestone fees.' },
  ]);
  const [notice, setNotice] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isOwner = accessKind === 'owner';
  const { comments, setComments, error: commentsError } = useComments(documentId);
  const onPdfError = useCallback((message: string) => setContentError(message), []);

  useEffect(() => {
    let objectUrl = '';
    void (async () => {
      let metadataLoaded = false;
      try {
        const data = await request<{ document: Document; access: 'owner' | 'guest' }>(`/api/documents/${documentId}`);
        metadataLoaded = true;
        setDocument(data.document);
        setAccessKind(data.access);
        const response = await fetch(`${API}/api/documents/${documentId}/content`, { credentials: 'include' });
        if (!response.ok) throw new Error('Unable to retrieve PDF from storage');
        objectUrl = URL.createObjectURL(await response.blob());
        setContentUrl(objectUrl);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Unable to access document';
        if (metadataLoaded) setContentError(message); else setAuthError(message);
      }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId]);

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const value = chatInput.trim();
    if (!value) return;
    setChatMessages((messages) => [...messages, { from: 'you', text: value }]);
    setChatInput('');
    setNotice('AI response is mocked until the chat API is connected.');
  };
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(window.document.fullscreenElement === workspaceRef.current);
    window.document.addEventListener('fullscreenchange', syncFullscreen);
    return () => window.document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleWorkspaceFullscreen = async () => {
    if (window.document.fullscreenElement) await window.document.exitFullscreen();
    else await workspaceRef.current?.requestFullscreen();
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    const text = commentInput.trim();
    if (!text) return;
    try {
      const response = await request<{ comment: Omit<Comment, 'replies'> }>(`/api/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: replyTo?.id ?? null, content: commentBody(text) }),
      });
      setComments((current) => insertComment(current, { ...response.comment, replies: [] }));
      setCommentInput('');
      setReplyTo(null);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Unable to save comment');
    }
  };

  if (authError) return <main className="access-page"><section className="access-card"><span className="brand-mark-small">D</span><p className="eyebrow">ACCESS RESTRICTED</p><h1>{authError}</h1><p className="subtle">If you received an invitation link, please verify your email first.</p><button className="primary-button" onClick={() => goTo('/')}>Return to Home</button></section></main>;

  return <main className="workspace-shell">
    <header className="clay-header workspace-header">
      <button className="brand-lockup" onClick={() => isOwner && goTo('/authenticated')}><span className="brand-mark-small">D</span><span>DocSense</span></button>
      <div className="workspace-header-actions">
        {isOwner && <button className="workspace-back" onClick={() => goTo('/authenticated')}><span className="material-symbols-outlined">arrow_back</span> Back to workspace</button>}
        <button className="share-header-button" onClick={() => setNotice('Use Share from Dashboard to invite collaborators.')}><span className="material-symbols-outlined">share</span>Share</button>
      </div>
    </header>
    <section className="workspace-content">
      <div className="workspace-grid-modern" ref={workspaceRef}>
        <section className="pdf-panel">
          <div className="pdf-toolbar"><div className="document-meta"><span className="pdf-icon large"><span className="material-symbols-outlined">picture_as_pdf</span></span><strong>{document?.filename ?? 'Loading document…'}</strong></div></div>
          <div className="summary-ribbon"><button aria-expanded={summaryOpen} onClick={() => setSummaryOpen((value) => !value)}><span><span className="material-symbols-outlined">auto_awesome</span>AI Summary</span><span className="material-symbols-outlined">{summaryOpen ? 'expand_less' : 'expand_more'}</span></button>{summaryOpen && <p>{workspaceSummary}</p>}</div>
          <div className="pdf-stage">{contentError ? <div className="empty-state pdf-error"><strong>Unable to render PDF preview</strong><span>{contentError}</span></div> : contentUrl ? <PdfViewer url={contentUrl} filename={document?.filename ?? 'PDF'} onError={onPdfError} isFullscreen={isFullscreen} onToggleFullscreen={() => void toggleWorkspaceFullscreen()} /> : <div className="empty-state pdf-loading-panel"><span>Loading secure document stream…</span></div>}</div>
        </section>
        <aside className="inspector-panel">
          <div className="inspector-tabs" role="tablist" aria-label="Document collaboration"><button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><span className="material-symbols-outlined">auto_awesome</span>AI Assistant</button><button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'active comments' : ''} onClick={() => setTab('comments')}><span className="material-symbols-outlined">forum</span>Comments <b>{comments.length}</b></button></div>
          {tab === 'chat' ? <div className="chat-pane"><div className="chat-feed">{chatMessages.map((message, index) => <div className={`chat-message ${message.from}`} key={`${message.text}-${index}`}>{message.from === 'ai' && <strong><span className="material-symbols-outlined">bolt</span>DocSense Neural Analyst</strong>}<p>{message.text}</p>{message.from === 'ai' && <small>Confidence 99.4% · Mock response</small>}</div>)}<div className="typing-state"><i /><i /><i />Ready to answer questions about this PDF</div></div><form className="chat-form" onSubmit={sendChat}><span className="material-symbols-outlined">smart_toy</span><input aria-label="Ask about this PDF" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about this PDF…" /><button aria-label="Send message"><span className="material-symbols-outlined">arrow_upward</span></button></form></div> : <div className="comments-pane">{commentsError && <p className="comments-error" role="alert">{commentsError}</p>}<div className="comments-list">{comments.map((comment) => <div className="comment-thread" key={comment.id}><CommentCard comment={comment} onReply={setReplyTo} />{comment.replies.map((reply) => <CommentCard key={reply.id} comment={reply} onReply={setReplyTo} />)}</div>)}</div><form className={`comment-form${replyTo ? ' has-reply' : ''}`} onSubmit={(event) => void addComment(event)}>{replyTo && <div className="reply-context"><div className="reply-context-heading"><span><span className="material-symbols-outlined">reply</span>Replying to {replyTo.author.name ?? 'Guest reviewer'}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button></div><p>“{commentPreview(replyTo)}”</p></div>}<div className="comment-input-row"><input aria-label={replyTo ? 'Add a reply' : 'Add a document comment'} value={commentInput} onChange={(event) => setCommentInput(event.target.value)} placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'} /><button aria-label={replyTo ? 'Add reply' : 'Add comment'}><span className="material-symbols-outlined">{replyTo ? 'reply' : 'add_comment'}</span></button></div></form></div>}
        </aside>
      </div>
    </section>
    {notice && <p className="toast-message" role="status">{notice}</p>}
  </main>;
}
