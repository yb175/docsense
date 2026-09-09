import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';

const API = '';
async function post(path: string, body: unknown) { const response = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? 'Unable to verify access'); return data; }

export function ShareAccessPage({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If guest already verified this token before, skip straight to the document.
  useEffect(() => {
    // We don't know the documentId yet from just the token, so we check
    // after requesting OTP — handled server-side. Nothing to do here on mount.
  }, []);

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/api/shares/request-otp', { token, email }); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send code'); }
    finally { setBusy(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await post('/api/shares/verify-otp', { token, email, otp }) as { documentId: string };
      goTo(`/documents/${result.documentId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify code'); }
    finally { setBusy(false); }
  };

  return (
    <main className="access-page">
      <section className="access-card">
        <span className="brand-mark-small">D</span>
        <p className="eyebrow">PRIVATE PDF INVITATION</p>
        <h1>Verify your email to open this document.</h1>
        <p className="subtle">This invitation is locked to the email address it was sent to.</p>
        <form className="share-form" onSubmit={sent ? verify : requestOtp}>
          <label>Invited email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@firm.com" />
          </label>
          {sent && (
            <label>Verification code
              <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            </label>
          )}
          <p className="error" role="alert">{error}</p>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Checking…' : sent ? 'Open document' : 'Send verification code'}
          </button>
        </form>
        <button className="back-link" onClick={() => goTo('/')}>Return to Docsense</button>
      </section>
    </main>
  );
}
