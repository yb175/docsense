import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';

const API = '';
type Document = { id: string; filename: string; sizeBytes: number; createdAt: string; updatedAt: string };
type Share = { id: string; inviteeEmail: string; inviteeName: string; status: string; expiresAt: string | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${localStorage.getItem('docsenseToken') ?? ''}`, ...(init?.headers ?? {}) }, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function AuthenticatedPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try { setDocuments((await api<{ documents: Document[] }>('/api/documents')).documents); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load documents'); }
  };
  useEffect(() => { void load(); }, []);

  const openShare = async (document: Document) => {
    setSelected(document); setMessage(''); setError('');
    try { setShares((await api<{ shares: Share[] }>(`/api/documents/${document.id}/shares`)).shares); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load shares'); }
  };
  const createShare = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    try {
      await api(`/api/documents/${selected.id}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteeEmail: email, inviteeName: name }) });
      setEmail(''); setName(''); setMessage('Invitation sent.'); void openShare(selected);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create invitation'); }
  };
  const revoke = async (shareId: string) => {
    if (!selected) return;
    try { await api(`/api/documents/${selected.id}/shares/${shareId}`, { method: 'DELETE' }); void openShare(selected); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to revoke invitation'); }
  };

  return <main className="dashboard-shell">
    <header className="dashboard-header"><div className="brand-lockup"><span className="brand-mark-small">D</span><span>DOCSENSE</span></div><nav><button className="nav-active">My workspace</button><button onClick={() => setMessage('Comments will be available in a future PR.')}>Comments</button><button onClick={() => setMessage('AI chat will be available in a future PR.')}>AI assistant</button></nav><button className="avatar" onClick={() => { localStorage.removeItem('docsenseToken'); goTo('/'); }}>ER</button></header>
    <section className="dashboard-intro"><div><p className="eyebrow">PRIVATE DOCUMENT WORKSPACE</p><h1>Good morning, Elena.</h1><p className="subtle">Your legal intelligence desk, arranged for focus.</p></div><label className="upload-button">Upload PDF<input type="file" accept="application/pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { await api('/api/documents', { method: 'POST', body: form }); await load(); setMessage('PDF uploaded.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed'); } }} /></label></section>
    <div className="workspace-grid"><section className="documents-panel"><div className="panel-heading"><div><p className="eyebrow">DOCUMENTS</p><h2>Your library <span>{documents.length}</span></h2></div><button className="quiet-button" onClick={() => void load()}>Refresh</button></div>{documents.length === 0 ? <div className="empty-state"><strong>Your library is ready.</strong><span>Upload a PDF to start reviewing.</span></div> : <div className="document-list">{documents.map((document) => <article className="document-row" key={document.id}><button className="document-main" onClick={() => goTo(`/documents/${document.id}`)}><span className="pdf-badge">PDF</span><span><strong>{document.filename}</strong><small>{formatSize(document.sizeBytes)} · Updated {new Date(document.updatedAt).toLocaleDateString()}</small></span></button><button className="share-action" onClick={() => void openShare(document)}>Share</button></article>)}</div>}</section><aside className="insight-panel"><p className="eyebrow">WORKSPACE NOTE</p><h2>Keep the room small.</h2><p>Share only the documents that need another set of eyes. Invitees verify their email before they can view anything.</p><div className="placeholder-row"><span>Comments</span><b>Coming soon</b></div><div className="placeholder-row"><span>AI assistant</span><b>Coming soon</b></div></aside></div>
    {message && <p className="toast-message" role="status">{message}</p>}{error && <p className="toast-error" role="alert">{error}</p>}
    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="share-modal"><button className="modal-close" onClick={() => setSelected(null)}>Close</button><p className="eyebrow">SHARE DOCUMENT</p><h2>{selected.filename}</h2><p className="subtle">The invitee must verify the invited email before access is granted.</p><form onSubmit={createShare} className="share-form"><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alice Morgan" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alice@firm.com" /></label><button className="primary-button" type="submit">Send invitation</button></form><div className="share-list">{shares.map((share) => <div className="share-row" key={share.id}><span><strong>{share.inviteeName}</strong><small>{share.inviteeEmail}</small></span><span className={`status status-${share.status.toLowerCase()}`}>{share.status}</span>{share.status !== 'REVOKED' && <button onClick={() => void revoke(share.id)}>Revoke</button>}</div>)}</div></section></div>}
  </main>;
}
