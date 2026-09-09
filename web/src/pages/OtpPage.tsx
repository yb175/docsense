import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { BrandHeader } from '../components/BrandHeader';
import { FormField } from '../components/FormField';
import { useOtpVerification } from '../hooks/useOtpVerification';
import { goTo } from '../utils/navigation';

export function OtpPage() {
  const email = sessionStorage.getItem('pendingEmail') ?? '';
  const { error, isSubmitting, verified, verify } = useOtpVerification(email);
  const [otp, setOtp] = useState('');
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void verify(otp); };

  return <AuthLayout><div className="auth-card">
    <BrandHeader title="Verify your email" description={<>Enter the six-digit code we sent to <strong>{email || 'your email address'}</strong>.</>} />
    <form className="form" style={{ marginTop: 28 }} onSubmit={onSubmit} noValidate>
      <FormField id="otp" label="VERIFICATION CODE" hint="Expires in 3 minutes" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} />
      <p className="error" role="alert">{error}</p>
      <button className="primary-button" disabled={isSubmitting || verified} type="submit">{verified ? 'Email verified  ✓' : isSubmitting ? 'Verifying…' : 'Verify & enter workspace  →'}</button>
    </form>
    <button className="back-link" type="button" onClick={() => goTo('/')}>← Back to sign in</button>
  </div></AuthLayout>;
}
