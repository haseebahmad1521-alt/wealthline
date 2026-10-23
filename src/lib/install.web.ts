// "Add to Home Screen" support for the web build. Chrome/Edge/Android fire beforeinstallprompt (often before the
// Account screen exists), so it is captured at app start; iOS Safari has no such event and gets instructions.
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const install = {
  /** Already running as an installed app. */
  standalone: () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true),
  isIOS: () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent),
  canPrompt: () => !!deferred,
  async prompt() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
