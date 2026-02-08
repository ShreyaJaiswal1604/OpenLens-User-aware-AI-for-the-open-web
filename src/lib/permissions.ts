import type { Permission, PermissionType, PermissionScope } from '../modules/types';

const STORAGE_KEY = 'permissions';

// Use callback pattern for Firefox MV2 compatibility
// (chrome.storage.local.get without callback may not return a Promise in Firefox)
function loadPermissions(): Promise<Permission[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result?.[STORAGE_KEY] || []);
    });
  });
}

function savePermissions(permissions: Permission[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: permissions }, () => resolve());
  });
}

export async function checkPermission(
  type: PermissionType,
  origin: string,
  tabId: number,
): Promise<Permission | null> {
  const permissions = await loadPermissions();
  const now = Date.now();

  return permissions.find((p) => {
    if (p.type !== type) return false;
    if (p.expiresAt && p.expiresAt < now) return false;

    switch (p.scope) {
      case 'page':
        return p.tabId === tabId && p.origin === origin;
      case 'site':
        return p.origin === origin;
      case 'session':
        return true;
    }
  }) || null;
}

export async function grantPermission(
  type: PermissionType,
  scope: PermissionScope,
  origin: string,
  tabId: number,
): Promise<Permission> {
  const permissions = await loadPermissions();
  const now = Date.now();

  const permission: Permission = {
    type,
    scope,
    origin,
    tabId,
    grantedAt: now,
    expiresAt: scope === 'page' ? null : now + 30 * 60 * 1000, // session: 30 min
  };

  // Remove existing permission of same type+origin+tab to avoid duplicates
  const filtered = permissions.filter(
    (p) => !(p.type === type && p.origin === origin && p.tabId === tabId),
  );
  filtered.push(permission);
  await savePermissions(filtered);

  return permission;
}

export async function revokePermission(
  type: PermissionType,
  origin: string,
  tabId: number,
): Promise<void> {
  const permissions = await loadPermissions();
  const filtered = permissions.filter(
    (p) => !(p.type === type && p.origin === origin && p.tabId === tabId),
  );
  await savePermissions(filtered);
}

export async function revokeAllForTab(tabId: number): Promise<void> {
  const permissions = await loadPermissions();
  const filtered = permissions.filter((p) => p.tabId !== tabId);
  await savePermissions(filtered);
}

export async function revokePagePermissions(tabId: number): Promise<void> {
  const permissions = await loadPermissions();
  const filtered = permissions.filter(
    (p) => !(p.scope === 'page' && p.tabId === tabId),
  );
  await savePermissions(filtered);
}

export async function getActivePermissions(tabId?: number): Promise<Permission[]> {
  const permissions = await loadPermissions();
  const now = Date.now();

  return permissions.filter((p) => {
    if (p.expiresAt && p.expiresAt < now) return false;
    if (tabId !== undefined && p.tabId !== tabId) return false;
    return true;
  });
}
