import { useEffect, useState } from 'react';
import { AuthenticatedPage } from './pages/AuthenticatedPage';
import { ShareAccessPage } from './pages/ShareAccessPage';
import { SharedDocumentPage } from './pages/SharedDocumentPage';
import { AuthPage } from './pages/AuthPage';
import { OtpPage } from './pages/OtpPage';
import { getPath, getHash } from './utils/navigation';
import { API } from './config';

function getRoute() {
  return { path: getPath(), hash: getHash() };
}

export function App() {
  const [route, setRoute] = useState(getRoute);
  const [hasValidToken, setHasValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    const onNavigate = () => setRoute(getRoute());
    const onLogout = () => setHasValidToken(false);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    window.addEventListener('docsense:logout', onLogout);
    return () => {
      window.removeEventListener('popstate', onNavigate);
      window.removeEventListener('hashchange', onNavigate);
      window.removeEventListener('docsense:logout', onLogout);
    };
  }, []);

  useEffect(() => {
    const requiresOwnerSession = (route.path === '/' && !route.hash) || route.path === '/authenticated';
    if (!requiresOwnerSession) return;
    setHasValidToken(null);
    void fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((response) => setHasValidToken(response.ok))
      .catch(() => setHasValidToken(false));
  }, [route.path, route.hash]);

  // Path-first: /documents/:id wins over any leftover hash.
  if (route.path.startsWith('/documents/')) {
    return <SharedDocumentPage documentId={route.path.slice('/documents/'.length)} />;
  }
  if (route.hash.startsWith('#/share/')) {
    return <ShareAccessPage token={decodeURIComponent(route.hash.slice('#/share/'.length))} />;
  }
  if (route.path === '/authenticated' && hasValidToken === null) return <AuthPage />;
  if (route.path === '/authenticated') return hasValidToken ? <AuthenticatedPage /> : <AuthPage />;
  if (route.path === '/' && !route.hash && hasValidToken === null) return <AuthPage />;
  if (route.path === '/' && hasValidToken) return <AuthenticatedPage />;
  return route.path === '/otp' ? <OtpPage /> : <AuthPage />;
}
