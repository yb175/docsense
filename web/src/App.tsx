import { useEffect, useState } from 'react';
import { AuthenticatedPage } from './pages/AuthenticatedPage';
import { AuthPage } from './pages/AuthPage';
import { OtpPage } from './pages/OtpPage';
import { getPath } from './utils/navigation';

export function App() {
  const [path, setPath] = useState(getPath());
  useEffect(() => {
    const onNavigate = () => setPath(getPath());
    window.addEventListener('popstate', onNavigate);
    return () => window.removeEventListener('popstate', onNavigate);
  }, []);
  if (path === '/authenticated') return <AuthenticatedPage />;
  return path === '/otp' ? <OtpPage /> : <AuthPage />;
}
