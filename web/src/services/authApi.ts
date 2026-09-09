const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type AuthInput = { email: string; password: string };
type SignupInput = AuthInput & { name: string };
type VerifyInput = { email: string; otp: string };

export type AuthResponse = { token: string; user: { id: string; name: string; email: string } };

async function post<T>(path: string, body: AuthInput | SignupInput | VerifyInput): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

export const authApi = {
  signup: (input: SignupInput) => post('/auth/signup', input),
  verifyEmail: (input: VerifyInput) => post('/auth/verify-email', input),
  login: (input: AuthInput) => post<AuthResponse>('/auth/login', input),
};
