import { useEffect, useState } from 'react';
import { goTo } from '../utils/navigation';

const API = '';

function getAuthHeaders(): Record<string, string> {
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export function SharedDocumentPage({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<{ filename: string } | null>(null);
  const [accessKind, setAccessKind] = useState<'owner' | 'guest'>('guest');
  const [contentUrl, setContentUrl] = useState('');
  const [contentError, setContentError] = useState('');
  const [authError, setAuthError] = useState('');
  const isOwner = accessKind === 'owner';

  useEffect(() => {
    void (async () => {
      try {
        const authHeader: Record<string, string> = getAuthHeaders();
        const data = await request<{ document: { filename: string }; access: 'owner' | 'guest' }>(`/api/documents/${documentId}`, { headers: authHeader });
        setDocument(data.document);
        setAccessKind(data.access);

        const response = await fetch(`${API}/api/documents/${documentId}/content`, { credentials: 'include', headers: authHeader });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error ?? 'Unable to retrieve PDF from storage');
        }
        setContentUrl(URL.createObjectURL(await response.blob()));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Unable to access document';
        if (!document) setAuthError(message);
        else setContentError(message);
      }
    })();
  }, [documentId]);

  if (authError) {
    return (
      <main className="access-page">
        <section className="access-card">
          <span className="brand-mark-small">D</span>
          <p className="eyebrow">ACCESS RESTRICTED</p>
          <h1>{authError}</h1>
          <p className="subtle">If you received an invitation link, please verify your email first.</p>
          <button className="primary-button" onClick={() => goTo('/')}>Return to Home</button>
        </section>
      </main>
    );
  }

  return (
    <main className="viewer-shell">
      <header className="viewer-header">
        <div className="brand-lockup" onClick={() => isOwner ? goTo('/authenticated') : undefined}>
          <span className="brand-mark-small">D</span>
          <span>DOCSENSE</span>
        </div>
        <span className="guest-label">{accessKind === 'owner' ? 'Owner View' : 'Guest Access · Verified'}</span>
      </header>
      <section className="viewer-content">
        <div className="viewer-toolbar">
          <div>
            <p className="eyebrow">SHARED PDF DOCUMENT</p>
            <h1>{document?.filename ?? 'Loading document...'}</h1>
          </div>
          {isOwner && (
            <button className="quiet-button" onClick={() => goTo('/authenticated')}>
              Back to workspace
            </button>
          )}
        </div>
        <div className="pdf-frame">
          {contentUrl ? (
            <iframe title={document?.filename ?? 'PDF'} src={contentUrl} />
          ) : contentError ? (
            <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
              <strong>Unable to render PDF preview</strong>
              <span>{contentError}</span>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
              <span>Loading secure document stream...</span>
            </div>
          )}
        </div>
        <div className="future-tools">
          <button onClick={() => alert('Comments are coming in a future PR.')}>Comments</button>
          <button onClick={() => alert('AI chat is coming in a future PR.')}>Ask the document</button>
        </div>
      </section>
    </main>
  );
}
