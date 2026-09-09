import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';
import { PdfViewer } from '../components/PdfViewer';
import { getConversationMessages, getSummary, streamChat } from '../services/chatApi';
import { commentBody, insertComment, useComments } from '../hooks/useComments';
import type { Comment, CommentContent, CommentSpan } from '../hooks/useComments';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, credentials: 'include', headers: { ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

type Document = { filename: string };
const log = (step: string, documentId: string, detail = '') => console.info(`[docsense:web] ${step} document=${documentId}${detail ? ` ${detail}` : ''}`);
type ChatMessage = { id: string; from: 'you' | 'ai'; text: string };

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

function AssistantEmptyState({ onQuestion, active }: { onQuestion: (question: string) => void; active: boolean }) {
  return <div className={`assistant-empty-state${active ? ' is-active' : ''}`}>
    <div className="intelligence-orbit" aria-hidden="true"><span className="orbit-dot orbit-dot-one" /><span className="orbit-dot orbit-dot-two" /><span className="orbit-dot orbit-dot-three" /><div className="intelligence-mark"><span className="material-symbols-outlined">auto_awesome</span></div></div>
    <strong>{active ? 'Analyzing your document' : 'Ready to analyze your document'}</strong>
    <span>{active ? 'The assistant is preparing a grounded response.' : 'Ask anything about the content, clauses, or key details.'}</span>
    {!active && <div className="suggested-questions" aria-label="Suggested questions">
      {['Summarize this document', 'What are the key risks?', 'Explain this document simply'].map((question) => <button type="button" key={question} onClick={() => onQuestion(question)}>{question}</button>)}
    </div>}
  </div>;
}

function AnalysisGate({ failed, onReturn }: { failed: boolean; onReturn: () => void }) {
  return <main className="analysis-gate" aria-busy={!failed}>
    <div className="analysis-gate-card">
      <div className="analysis-gate-brand"><span className="brand-mark-small">D</span><span>DocSense</span></div>
      {failed ? <><p className="eyebrow">ANALYSIS INTERRUPTED</p><h1>We couldn’t prepare this PDF.</h1><p className="subtle">Return to your dashboard and re-upload the document to try again.</p><button className="primary-button" onClick={onReturn}>Return to dashboard</button></> : <div className="skeleton-stack" aria-label="Preparing document intelligence"><span className="skeleton-line skeleton-kicker" /><span className="skeleton-line skeleton-title" /><span className="skeleton-line skeleton-copy" /><span className="skeleton-line skeleton-copy short" /><div className="skeleton-panel"><span className="skeleton-line" /><span className="skeleton-line short" /><span className="skeleton-line" /></div></div>}
    </div>
  </main>;
}

export function SharedDocumentPage({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [accessKind, setAccessKind] = useState<'owner' | 'guest'>('guest');
  const [contentUrl, setContentUrl] = useState('');
  const [contentError, setContentError] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'chat' | 'comments'>('chat');
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState('PENDING');
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [conversationId, setConversationId] = useState<string>();
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const chatGeneration = useRef(0);
  const chatAbort = useRef<AbortController | null>(null);
  const isOwner = accessKind === 'owner';
  const { comments, setComments, error: commentsError } = useComments(documentId);
  const onPdfError = useCallback((message: string) => setContentError(message), []);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setDocument(null);
    setSummary(null);
    setSummaryStatus('PENDING');
    setContentUrl('');
    setContentError('');
    setAuthError('');
    setChatMessages([]);
    void (async () => {
      let metadataLoaded = false;
      try {
        log('workspace:start', documentId);
        const data = await request<{ document: Document; access: 'owner' | 'guest' }>(`/api/documents/${documentId}`);
        metadataLoaded = true;
        if (!active) return;
        setDocument(data.document);
        setAccessKind(data.access);
        log('summary:start', documentId);
        const summaryResult = await getSummary(documentId);
        const status = summaryResult.processingStatus ?? 'PENDING';
        if (!active) return;
        setSummary(summaryResult.summary);
        setSummaryStatus(status);
        log('summary:status', documentId, `status=${status} visible=${Boolean(summaryResult.summary)}`);
        if (status === 'FAILED') throw new Error('AI analysis failed. Please re-upload this PDF.');
        if (status !== 'COMPLETED' || !summaryResult.summary) {
          log('pdf:deferred', documentId, `status=${status}`);
          setContentError('AI analysis is still processing. The PDF will open when its summary is ready.');
          return;
        }
        const history = await getConversationMessages(documentId);
        if (!active) return;
        setConversationId(history.conversationId);
        setChatMessages(history.messages.map((message) => ({ id: message.id, from: message.role === 'USER' ? 'you' : 'ai', text: message.content })));
        log('pdf:start', documentId);
        const response = await fetch(`${API}/api/documents/${documentId}/content`, { credentials: 'include' });
        if (!response.ok) throw new Error('Unable to retrieve PDF from storage');
        objectUrl = URL.createObjectURL(await response.blob());
        if (!active) return URL.revokeObjectURL(objectUrl);
        setContentUrl(objectUrl);
        log('pdf:ready', documentId);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Unable to access document';
        const status = cause instanceof Error && 'status' in cause ? (cause as Error & { status?: number }).status : undefined;
        log('workspace:failed', documentId, message);
        if (status === 401 || status === 403) setAuthError(message);
        else if (metadataLoaded) {
          setSummaryStatus('FAILED');
          setContentError(`${message} Please retry or return to the dashboard.`);
        } else setAuthError(message);
      }
    })();
    return () => {
      active = false;
      chatGeneration.current += 1;
      chatAbort.current?.abort();
      chatAbort.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, analysisVersion]);

  useEffect(() => {
    if (summaryStatus !== 'PENDING' && summaryStatus !== 'PROCESSING') return;
    let active = true;
    const poll = () => void getSummary(documentId).then((result) => {
      if (!active) return;
      const status = result.processingStatus ?? 'PENDING';
      if (status === 'FAILED') {
        setSummaryStatus(status);
        setContentError('AI analysis failed. Please re-upload this PDF.');
      } else if (status === 'COMPLETED' && result.summary) {
        setSummary(result.summary);
        setSummaryStatus(status);
        setContentError('');
        setAnalysisVersion((version) => version + 1);
      }
    }).catch(() => {
      if (!active) return;
      setSummaryStatus('FAILED');
      setContentError('Unable to check analysis status. Please retry or return to the dashboard.');
    });
    const interval = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [documentId, summaryStatus]);

  const askSuggestedQuestion = (question: string) => {
    setChatInput(question);
    chatInputRef.current?.focus();
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const value = chatInput.trim();
    if (!value || isChatLoading) return;
    setChatInput('');
    setNotice('');
    setIsChatLoading(true);
    const generation = ++chatGeneration.current;
    const controller = new AbortController();
    chatAbort.current?.abort();
    chatAbort.current = controller;
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    setChatMessages((messages) => [...messages, { id: userMessageId, from: 'you', text: value }, { id: assistantMessageId, from: 'ai', text: '' }]);
    try {
      const nextConversationId = await streamChat(documentId, value, conversationId, (streamEvent) => {
        if (generation !== chatGeneration.current || streamEvent.event === 'message.error') {
          if (streamEvent.event === 'message.error') throw new Error(typeof streamEvent.data.message === 'string' ? streamEvent.data.message : 'Chat generation failed');
          return;
        }
        if (streamEvent.event === 'message.start' && typeof streamEvent.data.conversationId === 'string') {
          setConversationId(streamEvent.data.conversationId);
        }
        if (streamEvent.event === 'message.token' && typeof streamEvent.data.token === 'string') {
          setChatMessages((messages) => {
            const next = [...messages];
            const index = next.findIndex((message) => message.id === assistantMessageId);
            const last = next[index];
            if (last?.from === 'ai') next[index] = { ...last, text: last.text + streamEvent.data.token };
            return next;
          });
        }
      }, controller.signal);
      if (nextConversationId) setConversationId(nextConversationId);
    } catch (cause) {
      if (generation !== chatGeneration.current) return;
      setChatMessages((messages) => messages.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId));
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setNotice(cause instanceof Error ? cause.message : 'Unable to answer this question');
    } finally {
      if (generation === chatGeneration.current) setIsChatLoading(false);
    }
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

  const lastChatMessage = chatMessages.at(-1);
  const showAssistantAtmosphere = chatMessages.length === 0 || lastChatMessage?.from === 'you' || (lastChatMessage?.from === 'ai' && !lastChatMessage.text);

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
  if (!document || summaryStatus !== 'COMPLETED' || !summary) return <AnalysisGate failed={summaryStatus === 'FAILED'} onReturn={() => goTo(isOwner ? '/authenticated' : '/')} />;

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
          <div className="summary-ribbon"><button aria-expanded={summaryOpen} onClick={() => setSummaryOpen((value) => !value)}><span><span className="material-symbols-outlined">auto_awesome</span>AI Summary</span><span className="material-symbols-outlined">{summaryOpen ? 'expand_less' : 'expand_more'}</span></button>{summaryOpen && (summary ? <p>{summary}</p> : <div className="summary-buffer" role="status" aria-live="polite"><span>{summaryStatus === 'FAILED' ? 'Summary unavailable. Please re-upload the PDF.' : 'Building grounded summary…'}</span><i /><i /><i /></div>)}</div>
          <div className="pdf-stage">{contentError ? <div className="empty-state pdf-error"><strong>{summaryStatus === 'PENDING' ? 'Preparing document intelligence' : 'Unable to open PDF preview'}</strong><span>{contentError}</span><button className="primary-button" onClick={() => goTo(isOwner ? '/authenticated' : '/')}>{isOwner ? 'Return to dashboard' : 'Return to home'}</button></div> : contentUrl ? <PdfViewer url={contentUrl} filename={document?.filename ?? 'PDF'} onError={onPdfError} isFullscreen={isFullscreen} onToggleFullscreen={() => void toggleWorkspaceFullscreen()} /> : <div className="empty-state pdf-loading-panel"><span>Loading secure document stream…</span></div>}</div>
        </section>
        <aside className="inspector-panel">
          <div className="inspector-tabs" role="tablist" aria-label="Document collaboration"><button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><span className="material-symbols-outlined">auto_awesome</span>AI Assistant</button><button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'active comments' : ''} onClick={() => setTab('comments')}><span className="material-symbols-outlined">forum</span>Comments <b>{comments.length}</b></button></div>
          {tab === 'chat' ? <div className="chat-pane"><div className="chat-feed">{chatMessages.map((message) => (message.from === 'you' || message.text) && <div className={`chat-message ${message.from}`} key={message.id}>{message.from === 'ai' && <strong><span className="material-symbols-outlined">bolt</span>DocSense Neural Analyst</strong>}<p>{message.text}</p>{message.from === 'ai' && message.text && <small>Grounded in this document</small>}</div>)}{showAssistantAtmosphere && <AssistantEmptyState active={isChatLoading} onQuestion={askSuggestedQuestion} />}<div className="typing-state"><i /><i /><i />{isChatLoading ? 'Generating grounded answer…' : 'Ready to answer questions about this PDF'}</div></div><form className="chat-form" onSubmit={sendChat}><span className="material-symbols-outlined assistant-mark" aria-hidden="true">auto_awesome</span><input ref={chatInputRef} aria-label="Ask about this PDF" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about this PDF…" /><button aria-label="Send message" disabled={isChatLoading}><span className="material-symbols-outlined">arrow_upward</span></button></form></div> : <div className="comments-pane">{commentsError && <p className="comments-error" role="alert">{commentsError}</p>}<div className="comments-list">{comments.map((comment) => <div className="comment-thread" key={comment.id}><CommentCard comment={comment} onReply={setReplyTo} />{comment.replies.map((reply) => <CommentCard key={reply.id} comment={reply} onReply={setReplyTo} />)}</div>)}</div><form className={`comment-form${replyTo ? ' has-reply' : ''}`} onSubmit={(event) => void addComment(event)}>{replyTo && <div className="reply-context"><div className="reply-context-heading"><span><span className="material-symbols-outlined">reply</span>Replying to {replyTo.author.name ?? 'Guest reviewer'}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button></div><p>“{commentPreview(replyTo)}”</p></div>}<div className="comment-input-row"><input aria-label={replyTo ? 'Add a reply' : 'Add a document comment'} value={commentInput} onChange={(event) => setCommentInput(event.target.value)} placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'} /><button aria-label={replyTo ? 'Add reply' : 'Add comment'}><span className="material-symbols-outlined">{replyTo ? 'reply' : 'add_comment'}</span></button></div></form></div>}
        </aside>
      </div>
    </section>
    {notice && <p className="toast-message" role="status">{notice}</p>}
  </main>;
}
