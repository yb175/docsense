import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';
import { PdfViewer } from '../components/PdfViewer';
import { workspaceComments, workspaceSummary } from '../mocks/workspace.mock';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

type Document = { filename: string };
type ChatMessage = { from: 'you' | 'ai'; text: string };

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { from: 'you', text: 'Does Section 14.2 allow Stripe to terminate for convenience without cause?' },
    { from: 'ai', text: 'According to Section 14.2, termination for convenience requires 90 days prior written notice and settlement of outstanding milestone fees.' },
  ]);
  const [notice, setNotice] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const isOwner = accessKind === 'owner';
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

  const addComment = (event: FormEvent) => {
    event.preventDefault();
    if (!commentInput.trim()) return;
    setCommentInput('');
    setNotice('Comment saved locally until comments are connected.');
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
          <div className="inspector-tabs" role="tablist" aria-label="Document collaboration"><button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><span className="material-symbols-outlined">auto_awesome</span>AI Assistant</button><button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'active comments' : ''} onClick={() => setTab('comments')}><span className="material-symbols-outlined">forum</span>Comments <b>8</b></button></div>
          {tab === 'chat' ? <div className="chat-pane"><div className="chat-feed">{chatMessages.map((message, index) => <div className={`chat-message ${message.from}`} key={`${message.text}-${index}`}>{message.from === 'ai' && <strong><span className="material-symbols-outlined">bolt</span>DocSense Neural Analyst</strong>}<p>{message.text}</p>{message.from === 'ai' && <small>Confidence 99.4% · Mock response</small>}</div>)}<div className="typing-state"><i /><i /><i />Ready to answer questions about this PDF</div></div><form className="chat-form" onSubmit={sendChat}><span className="material-symbols-outlined">smart_toy</span><input aria-label="Ask about this PDF" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about this PDF…" /><button aria-label="Send message"><span className="material-symbols-outlined">arrow_upward</span></button></form></div> : <div className="comments-pane"><div className="comments-heading"><strong>Clause Redlines &amp; Mentions</strong><span>3 Unresolved</span></div><div className="comments-list">{workspaceComments.map((comment) => <article className="comment-card" key={comment.name}><div className="comment-author"><span className={`comment-avatar ${comment.tone}`}>{comment.initials}</span><div><strong>{comment.name}</strong><small>{comment.role}</small></div><time>{comment.time}</time></div><p>“{comment.text}”</p><div className={`comment-status ${comment.tone}`}><span className="material-symbols-outlined">{comment.tone === 'risk' ? 'flag' : 'check_circle'}</span>{comment.status}<button onClick={() => setNotice('Reply composer is mocked until comments are connected.')}>Reply</button></div></article>)}</div><form className="comment-form" onSubmit={addComment}><input aria-label="Add a document comment" value={commentInput} onChange={(event) => setCommentInput(event.target.value)} placeholder="Add a document note…" /><button aria-label="Add comment"><span className="material-symbols-outlined">add_comment</span></button></form></div>}
        </aside>
      </div>
    </section>
    {notice && <p className="toast-message" role="status">{notice}</p>}
  </main>;
}
