import { useState } from 'react';
import { authApi } from '../services/authApi';
import { goTo } from '../utils/navigation';

type AuthForm = { name: string; email: string; password: string };
type Mode = 'signin' | 'signup';

export function useAuth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const submit = async ({ name, email, password }: AuthForm) => {
    setError('');
    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        await authApi.signup({ name, email, password });
        sessionStorage.setItem('pendingEmail', email);
        goTo('/otp');
      } else {
        const data = await authApi.login({ email, password });
        setAuthenticated(true);
        goTo('/authenticated');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to authenticate');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { mode, setMode, error, isSubmitting, authenticated, submit };
}
