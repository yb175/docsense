export function goTo(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const getPath = (): string => window.location.pathname;
