import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';

type Document = { id: string; filename: string; sizeBytes: number; createdAt: string; updatedAt: string; processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; aiSummary: string | null };
type User = { id: string; name: string; email: string };
type Share = { id: string; inviteeEmail: string; inviteeName: string; status: string; expiresAt: string | null };
const log = (step: string, detail = '') => console.info(`[docsense:web] ${step}${detail ? ` ${detail}` : ''}`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...(init?.headers ?? {}) }, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function DocumentSummary({ document }: { document: Document }) {
  const ready = document.processingStatus === 'COMPLETED' && Boolean(document.aiSummary);
  return <div className={`summary-block${ready ? ' is-ready' : ' is-processing'}`} aria-live="polite">
    {ready ? <p>{document.aiSummary}</p> : <div className="summary-skeleton"><span className="summary-status">{document.processingStatus === 'FAILED' ? 'Analysis unavailable' : 'Analyzing document…'}</span><i /><i /><i /></div>}
  </div>;
}

export function AuthenticatedPage() {
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const load = async () => { try { const next = (await api<{ documents: Document[] }>('/api/documents')).documents; setDocuments(next); return next; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load documents'); return []; } };
  useEffect(() => {
    void api<{ user: User }>('/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load account'));
    void load();
  }, []);
  useEffect(() => {
    if (!documents.some((document) => document.processingStatus === 'PROCESSING' || document.processingStatus === 'PENDING')) return;
    const interval = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(interval);
  }, [documents]);
  useEffect(() => {
    const updateScrollChrome = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty('--scroll-progress', `${max > 0 ? (window.scrollY / max) * 100 : 0}%`);
      document.querySelector('.dashboard-header')?.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    updateScrollChrome();
    window.addEventListener('scroll', updateScrollChrome, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollChrome);
  }, []);
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>('.dashboard-content [data-reveal]');
    if (!('IntersectionObserver' in window)) { cards.forEach((card) => card.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [documents.length]);

  const visibleDocuments = useMemo(() => documents.filter((document) => document.filename.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  const openShare = async (document: Document) => { setSelected(document); setMessage(''); setError(''); try { setShares((await api<{ shares: Share[] }>(`/api/documents/${document.id}/shares`)).shares); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load shares'); } };
  const createShare = async (event: FormEvent) => { event.preventDefault(); if (!selected) return; try { await api(`/api/documents/${selected.id}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteeEmail: email, inviteeName: name }) }); setEmail(''); setName(''); setMessage('Invitation sent.'); void openShare(selected); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create invitation'); } };
  useEffect(() => {
    const closeProfile = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', closeProfile);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeProfile); document.removeEventListener('keydown', closeOnEscape); };
  }, []);

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      const response = await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Unable to sign out');
      goTo('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out');
      setIsLoggingOut(false);
    }
  };

  return <main className="dashboard-shell">
    <div className="scroll-progress" aria-hidden="true" />
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="clay-header dashboard-header">
      <button className="brand-lockup" onClick={() => goTo('/authenticated')}><span className="brand-mark-small">D</span><span>DocSense</span></button>
      <nav className="dashboard-nav"><button className="nav-pill active">Dashboard</button><button className="nav-pill" onClick={() => setMessage('Open a document to enter the workspace.')}>Workspace</button><button className="nav-pill" onClick={() => setMessage('Activity tracking is coming soon.')}>Activity</button></nav>
      <div className="header-actions"><label className="search-pill"><span className="material-symbols-outlined">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." /></label><button className="round-action" onClick={() => setMessage('Select Share on a document to invite a collaborator.')} aria-label="Share"><span className="material-symbols-outlined">share</span></button><div className="profile-menu" ref={profileRef}><button className="avatar" onClick={() => setProfileOpen((open) => !open)} aria-label={`Open profile menu${user ? ` for ${user.name}` : ''}`} aria-expanded={profileOpen} title={user?.email}>{user ? user.name.split(/\s+/u).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : '•'}</button>{profileOpen && <div className="profile-popup"><button className="sign-out-button" disabled={isLoggingOut} onClick={() => void logout()}><span className="material-symbols-outlined">{isLoggingOut ? 'progress_activity' : 'logout'}</span>{isLoggingOut ? 'Signing out…' : 'Sign Out'}</button></div>}</div></div>
    </header>
    <section className="dashboard-content">
      <div className="dashboard-greeting"><div><h1>{user ? `Welcome back, ${user.name}.` : 'Welcome back.'}</h1><p>Your tactile document intelligence hub &amp; semantic legal analysis library.</p></div></div>
      <label className={`upload-zone${isUploading ? ' is-uploading' : ''}`}><span className="upload-button"><span className="material-symbols-outlined">{isUploading ? 'progress_activity' : 'upload_file'}</span>{isUploading ? 'Uploading PDF…' : 'Upload PDF'}<input type="file" accept="application/pdf" disabled={isUploading} onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); setIsUploading(true); setError(''); setMessage(''); log('upload:start', `filename=${file.name} bytes=${file.size}`); try { const uploaded = await api<{ id: string }>('/api/documents', { method: 'POST', body: form }); await load(); setMessage('PDF uploaded. AI analysis is processing before the workspace opens.'); log('upload:complete', `document=${uploaded.id}`); } catch (cause) { input.value = ''; log('upload:failed'); setError(`${cause instanceof Error ? cause.message : 'Upload failed'} Upload canceled. Please re-upload the PDF.`); } finally { setIsUploading(false); } }} /></span><p>{isUploading ? 'Keep this window open while the upload completes.' : 'or drag and drop here'}</p></label>
      <div className="reports-heading" data-reveal><h2>Recent Intelligence Reports</h2></div>
      <div className={`document-grid${visibleDocuments.length ? '' : ' is-empty'}`}>{visibleDocuments.length ? visibleDocuments.map((document) => <article className="document-card" data-reveal key={document.id}><div><div className="document-card-title"><span className="pdf-icon"><span className="material-symbols-outlined">picture_as_pdf</span></span><div><h3>{document.filename}</h3><p>Uploaded {new Date(document.updatedAt).toLocaleDateString()}</p></div></div><DocumentSummary document={document} /></div><div className="card-actions"><button className="primary-button" onClick={() => goTo(`/documents/${document.id}`)}>Open Workspace <span className="material-symbols-outlined">arrow_forward</span></button><button className="round-action" onClick={() => void openShare(document)} aria-label={`Share ${document.filename}`}><span className="material-symbols-outlined">share</span></button></div></article>) : <div className="empty-state dashboard-empty-state"><span className="empty-state-icon"><span className="material-symbols-outlined">description</span></span><strong>No documents yet</strong><span>Your library is ready for its first PDF.</span><small>Upload a document above to start reviewing and analyzing it.</small></div>}</div>
    </section>
    {message && <p className="toast-message" role="status">{message}</p>}{error && <p className="toast-error" role="alert">{error}</p>}
    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="share-modal"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><span className="material-symbols-outlined">close</span></button><p className="eyebrow">SHARE DOCUMENT</p><h2>{selected.filename}</h2><p className="subtle">The invitee must verify the invited email before access is granted.</p><form onSubmit={createShare} className="share-form"><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alice Morgan" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alice@firm.com" /></label><button className="primary-button" type="submit">Send invitation</button></form><div className="share-list">{shares.map((share) => <div className="share-row" key={share.id}><span><strong>{share.inviteeName}</strong><small>{share.inviteeEmail}</small></span><span className={`status status-${share.status.toLowerCase()}`}>{share.status}</span><button onClick={() => void api(`/api/documents/${selected.id}/shares/${share.id}`, { method: 'DELETE' }).then(() => void openShare(selected))}>Revoke</button></div>)}</div></section></div>}
  </main>;
}
