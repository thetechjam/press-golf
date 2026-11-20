import { useEffect, useState } from 'react';
import { DownloadIcon } from '../icons';
import { isNative } from '../native';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * True when Trunk is already out of a browser tab: the native shell, or added
 * to the home screen. Safari's seven-day eviction does not apply there, which
 * is why the install hint stands down.
 */
export function isInstalled(): boolean {
  if (isNative()) return true;
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    // A test environment with a matchMedia that throws is not installed.
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Shows an "Install" button on browsers that support it (Android/Chrome/Edge).
 * iOS Safari doesn't fire beforeinstallprompt, so it falls back to the
 * add-to-home-screen hint elsewhere on the page.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <button className="install-btn" onClick={install}>
      <DownloadIcon size={17} /> Install Trunk as an app
    </button>
  );
}
