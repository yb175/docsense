import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { BrandHeader } from '../components/BrandHeader';
import { FormField } from '../components/FormField';
import { useAuth } from '../hooks/useAuth';

export function AuthPage() {
  const { mode, setMode, error, isSubmitting, authenticated, submit } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const isSignup = mode === 'signup';
  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(form); };

  return <AuthLayout><div className="auth-card">
    <BrandHeader title="DocSense" description="Tactile AI workspace for contracts, legal agreements & research documents" />
    <div className="tabs" role="tablist" aria-label="Authentication">
      <button className={`tab ${!isSignup ? 'active' : ''}`} role="tab" aria-selected={!isSignup} onClick={() => setMode('signin')} type="button">↪&nbsp; Sign In</button>
      <button className={`tab ${isSignup ? 'active' : ''}`} role="tab" aria-selected={isSignup} onClick={() => setMode('signup')} type="button">♙&nbsp; Create Account</button>
    </div>
    <form className="form" onSubmit={onSubmit} noValidate>
      {isSignup && <FormField id="name" name="name" label="FULL LEGAL NAME" hint="Required" placeholder="Elena Rostova, Counsel" autoComplete="name" value={form.name} onChange={update('name')} />}
      <FormField id="email" name="email" label="WORK EMAIL ADDRESS" hint={<span className="accent">⌾ Legal Domain</span>} type="email" placeholder="name@firm.com" autoComplete="email" required value={form.email} onChange={update('email')} />
      <div className="field"><label htmlFor="password">PASSWORD <span>Min. 8 chars</span></label><div className="password-wrap"><input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••••••••••" autoComplete={isSignup ? 'new-password' : 'current-password'} required value={form.password} onChange={update('password')} /><button className="icon-button" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>◉</button></div></div>
      <div className="form-row"><label className="remember"><input type="checkbox" defaultChecked /> <span>Remember device</span></label><a className="forgot-link" href="#forgot"><span className="material-symbols-outlined">lock_reset</span>Forgot password?</a></div>
      <p className="error" role="alert">{error}</p>
      <button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Working…' : authenticated ? 'Workspace ready  ✓' : isSignup ? 'Create DocSense Account  →' : 'Sign In to DocSense Workspace  →'}</button>
    </form>
  </div></AuthLayout>;
}
