function getStorage(storageName) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[storageName] || null;
  } catch {
    return null;
  }
}

export function getLocalItem(key) {
  try {
    return getStorage('localStorage')?.getItem(key) || '';
  } catch {
    return '';
  }
}

export function setLocalItem(key, value) {
  try {
    getStorage('localStorage')?.setItem(key, value);
  } catch {
    // Browser storage can be blocked; the app should keep running in memory.
  }
}

export function removeLocalItem(key) {
  try {
    getStorage('localStorage')?.removeItem(key);
  } catch {
    // Browser storage can be blocked; the app should keep running in memory.
  }
}

export function getSessionItem(key) {
  try {
    return getStorage('sessionStorage')?.getItem(key) || '';
  } catch {
    return '';
  }
}

export function setSessionItem(key, value) {
  try {
    getStorage('sessionStorage')?.setItem(key, value);
  } catch {
    // Losing navigation cache is better than crashing the page.
  }
}
