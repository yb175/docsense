export function goTo(path: string): void {
  // Replace history entry so the hash is fully cleared before the event fires.
  window.history.pushState({}, '', path.includes('#') ? path : path);
  // Force hash to empty synchronously when navigating to a non-hash path.
  if (!path.includes('#') && window.location.hash) {
    window.history.replaceState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const getPath = (): string => window.location.pathname;
export const getHash = (): string => window.location.hash;
