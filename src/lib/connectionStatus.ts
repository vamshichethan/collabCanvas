export const getBrowserOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

export const subscribeConnectionStatus = (listener: (online: boolean) => void) => {
  const handleOnline = () => listener(true);
  const handleOffline = () => listener(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};
