import { useEffect, useState } from 'react';
import { AuthenticatedPage } from './pages/AuthenticatedPage';
import { ShareAccessPage } from './pages/ShareAccessPage';
import { SharedDocumentPage } from './pages/SharedDocumentPage';
import { AuthPage } from './pages/AuthPage';
import { OtpPage } from './pages/OtpPage';
import { getPath, getHash } from './utils/navigation';

function getRoute() {
  return { path: getPath(), hash: getHash() };
}

export function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onNavigate = () => setRoute(getRoute());
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    return () => {
      window.removeEventListener('popstate', onNavigate);
      window.removeEventListener('hashchange', onNavigate);
    };
  }, []);

  // Path-first: /documents/:id wins over any leftover hash.
  if (route.path.startsWith('/documents/')) {
    return <SharedDocumentPage documentId={route.path.slice('/documents/'.length)} />;
  }
  if (route.hash.startsWith('#/share/')) {
    return <ShareAccessPage token={decodeURIComponent(route.hash.slice('#/share/'.length))} />;
  }
  if (route.path === '/authenticated') return <AuthenticatedPage />;
  return route.path === '/otp' ? <OtpPage /> : <AuthPage />;
}
