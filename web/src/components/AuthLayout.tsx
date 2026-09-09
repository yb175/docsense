import type { ReactNode } from 'react';
import { WorkspacePreview } from './WorkspacePreview';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-shell"><section className="auth-panel">{children}</section><WorkspacePreview /></main>;
}
