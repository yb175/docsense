import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { goTo } from '../utils/navigation';
import { API } from '../config';

async function post(path: string, body: unknown) {
  const response = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Unable to verify access');
  return data;
}

export function ShareAccessPage({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`${API}/api/shares/${encodeURIComponent(token)}/session`, { credentials: 'include' });
      if (!response.ok) return;
      const result = await response.json() as { documentId: string | null; verified: boolean };
      if (result.verified && result.documentId) goTo(`/documents/${result.documentId}`);
    })();
  }, [token]);

  const requestOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true); setError('');
    try { await post('/api/shares/request-otp', { token, email }); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await post('/api/shares/verify-otp', { token, email, otp }) as { documentId: string };
      goTo(`/documents/${result.documentId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That verification code is incorrect.'); }
    finally { setBusy(false); }
  };

  return <main className="share-access-page">
    <div className="share-access-glow share-access-glow-one" aria-hidden="true" /><div className="share-access-glow share-access-glow-two" aria-hidden="true" />
    <section className="share-access-card" aria-labelledby="share-access-title">
      <div className="share-brand"><span className="brand-mark" aria-hidden="true">✦</span><span>DocSense</span></div>
      <div className="share-document-mark" aria-hidden="true"><span className="material-symbols-outlined">picture_as_pdf</span></div>
      <p className="share-eyebrow">PRIVATE PDF</p>
      <h1 id="share-access-title">Verify your email.</h1>
      <p className="share-intro">This private PDF was shared with you.</p>
      <div className="share-trust"><span className="material-symbols-outlined">verified_user</span><span>Use the invited email to continue.</span></div>
      <form className="share-access-form" onSubmit={sent ? verify : (event) => void requestOtp(event)}>
        <label className="share-field">Invited email <span className="share-field-hint"><span className="material-symbols-outlined">lock</span>Invitation email</span><div className="share-input-wrap"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} readOnly={sent} placeholder="name@firm.com" autoComplete="email" aria-describedby="share-email-help" /><span className="material-symbols-outlined" aria-hidden="true">lock</span></div></label>
        {sent && <label className="share-field">Verification code <span className="share-field-hint">Expires in 3 min</span><input className="otp-input" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" autoComplete="one-time-code" aria-describedby="share-otp-help" /></label>}
        {error && <p className="share-error" role="alert"><span className="material-symbols-outlined">error</span>{error}</p>}
        <button className="share-primary-button" disabled={busy} type="submit"><span className="material-symbols-outlined">{busy ? 'progress_activity' : sent ? 'arrow_forward' : 'mail'}</span>{busy ? (sent ? 'Verifying…' : 'Sending code…') : sent ? 'Verify & open document' : 'Send verification code'}</button>
      </form>
      {sent && <button className="share-resend" disabled={busy} onClick={() => void requestOtp()} type="button">Didn’t receive it? <strong>Resend code</strong></button>}
      <p className="share-security"><span className="material-symbols-outlined">shield</span>Email verification is required.</p>
      <button className="share-return" onClick={() => goTo('/')} type="button"><span className="material-symbols-outlined">arrow_back</span>Return to DocSense</button>
    </section>
  </main>;
}
