// Dynamic host permission management
// Requests access at runtime instead of hardcoding in manifest

/** Convert a URL to an origin match pattern for the permissions API */
export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

/** Check if we already have permission for a URL */
export function hasHostPermission(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const pattern = originPattern(url);
      chrome.permissions.contains({ origins: [pattern] }, (result) => {
        resolve(result ?? false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Request host permission from the user.
 * MUST be called from a user gesture (click handler) in popup/sidepanel.
 * Returns true if granted, false if denied.
 */
export function requestHostPermission(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const pattern = originPattern(url);
      chrome.permissions.request({ origins: [pattern] }, (granted) => {
        resolve(granted ?? false);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Request permission for multiple URLs at once */
export function requestHostPermissions(urls: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const patterns = urls.map(originPattern);
      chrome.permissions.request({ origins: patterns }, (granted) => {
        resolve(granted ?? false);
      });
    } catch {
      resolve(false);
    }
  });
}
