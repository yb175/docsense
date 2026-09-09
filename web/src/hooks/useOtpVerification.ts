import { useState } from 'react';
import { authApi } from '../services/authApi';
import { goTo } from '../utils/navigation';

export function useOtpVerification(email: string) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  const verify = async (otp: string) => {
    setError('');
    setIsSubmitting(true);
    try {
      await authApi.verifyEmail({ email, otp });
      setVerified(true);
      goTo('/authenticated');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to verify email');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, verified, verify };
}
