import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';
import { documentSummaries } from '../mocks/dashboard.mock';

type Document = { id: string; filename: string; sizeBytes: number; createdAt: string; updatedAt: string };
type User = { id: string; name: string; email: string };
type Share = { id: string; inviteeEmail: string; inviteeName: string; status: string; expiresAt: string | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...(init?.headers ?? {}) }, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
  const profileRef = useRef<HTMLDivElement>(null);

  const load = async () => { try { setDocuments((await api<{ documents: Document[] }>('/api/documents')).documents); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load documents'); } };
  useEffect(() => {
    void api<{ user: User }>('/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load account'));
    void load();
  }, []);
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
      <label className="upload-zone"><span className="upload-button"><span className="material-symbols-outlined">upload_file</span>Upload PDF<input type="file" accept="application/pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { await api('/api/documents', { method: 'POST', body: form }); await load(); setMessage('PDF uploaded.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed'); } }} /></span><p>or drag and drop here</p></label>
      <div className="reports-heading" data-reveal><h2>Recent Intelligence Reports</h2></div>
      <div className="document-grid">{visibleDocuments.length ? visibleDocuments.map((document, index) => <article className="document-card" data-reveal key={document.id}><div><div className="document-card-title"><span className="pdf-icon"><span className="material-symbols-outlined">picture_as_pdf</span></span><div><h3>{document.filename}</h3><p>Uploaded {new Date(document.updatedAt).toLocaleDateString()}</p></div></div><div className="summary-block"><p>{documentSummaries[index % documentSummaries.length]}</p></div></div><div className="card-actions"><button className="primary-button" onClick={() => goTo(`/documents/${document.id}`)}>Open Workspace <span className="material-symbols-outlined">arrow_forward</span></button><button className="round-action" onClick={() => void openShare(document)} aria-label={`Share ${document.filename}`}><span className="material-symbols-outlined">share</span></button></div></article>) : <div className="empty-state"><strong>Your library is ready.</strong><span>Upload a PDF to start reviewing.</span></div>}</div>
    </section>
    {message && <p className="toast-message" role="status">{message}</p>}{error && <p className="toast-error" role="alert">{error}</p>}
    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="share-modal"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><span className="material-symbols-outlined">close</span></button><p className="eyebrow">SHARE DOCUMENT</p><h2>{selected.filename}</h2><p className="subtle">The invitee must verify the invited email before access is granted.</p><form onSubmit={createShare} className="share-form"><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alice Morgan" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alice@firm.com" /></label><button className="primary-button" type="submit">Send invitation</button></form><div className="share-list">{shares.map((share) => <div className="share-row" key={share.id}><span><strong>{share.inviteeName}</strong><small>{share.inviteeEmail}</small></span><span className={`status status-${share.status.toLowerCase()}`}>{share.status}</span><button onClick={() => void api(`/api/documents/${selected.id}/shares/${share.id}`, { method: 'DELETE' }).then(() => void openShare(selected))}>Revoke</button></div>)}</div></section></div>}
  </main>;
}
