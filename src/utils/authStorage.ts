export interface CurrentUser {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
}

const AUTH_STORAGE_KEY = 'sap_spec_current_user_v1';
const REGISTERED_USERS_STORAGE_KEY = 'sap_spec_registered_users_v1';

export const USERS_UPDATED_EVENT = 'sap-users-updated';

export const DEFAULT_OPERATOR_USER: CurrentUser = {
  id: 'user-josh',
  name: 'Josh Lee',
  role: 'Platform Owner / Lead Architect',
  department: 'ERP Development Team',
  email: 'toc80.lee@gmail.com',
};

export const LEGACY_REMOVED_USER_NAMES: readonly string[] = [
  '홍길동 책임',
  '김원가 책임',
  '박자재 수석',
];

export const PRESET_USERS: CurrentUser[] = [DEFAULT_OPERATOR_USER];

export function isLegacyRemovedUserName(name?: string): boolean {
  const clean = (name || '').trim();
  return LEGACY_REMOVED_USER_NAMES.includes(clean);
}

export function isDefaultOperatorUser(
  userOrIdentifier?: Pick<CurrentUser, 'id' | 'name' | 'email'> | string | null
): boolean {
  if (!userOrIdentifier) return false;
  if (typeof userOrIdentifier === 'string') {
    const clean = userOrIdentifier.trim().toLowerCase();
    return (
      clean === DEFAULT_OPERATOR_USER.name.toLowerCase() ||
      clean === DEFAULT_OPERATOR_USER.email.toLowerCase() ||
      clean === DEFAULT_OPERATOR_USER.id
    );
  }
  const cleanName = (userOrIdentifier.name || '').trim().toLowerCase();
  const cleanEmail = (userOrIdentifier.email || '').trim().toLowerCase();
  return (
    userOrIdentifier.id === DEFAULT_OPERATOR_USER.id ||
    cleanName === DEFAULT_OPERATOR_USER.name.toLowerCase() ||
    cleanEmail === DEFAULT_OPERATOR_USER.email.toLowerCase()
  );
}

function emitUsersUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(USERS_UPDATED_EVENT));
  }
}

function normalizeUserList(rawList: unknown): { users: CurrentUser[]; changed: boolean } {
  let changed = false;
  const result: CurrentUser[] = [DEFAULT_OPERATOR_USER];
  const seenNames = new Set<string>([DEFAULT_OPERATOR_USER.name.toLowerCase()]);
  const seenEmails = new Set<string>([DEFAULT_OPERATOR_USER.email.toLowerCase()]);

  if (!Array.isArray(rawList)) {
    return { users: result, changed: true };
  }

  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      changed = true;
      continue;
    }
    const candidate = item as Partial<CurrentUser>;
    const cleanName = (candidate.name || '').trim();
    const cleanEmail = (candidate.email || '').trim();

    if (!cleanName || isLegacyRemovedUserName(cleanName)) {
      changed = true;
      continue;
    }

    if (isDefaultOperatorUser({ id: candidate.id || '', name: cleanName, email: cleanEmail })) {
      if (
        cleanEmail.toLowerCase() !== DEFAULT_OPERATOR_USER.email.toLowerCase() ||
        candidate.role !== DEFAULT_OPERATOR_USER.role
      ) {
        changed = true;
      }
      continue;
    }

    const nameKey = cleanName.toLowerCase();
    const emailKey = cleanEmail.toLowerCase();
    if (seenNames.has(nameKey) || (emailKey && seenEmails.has(emailKey))) {
      changed = true;
      continue;
    }

    seenNames.add(nameKey);
    if (emailKey) seenEmails.add(emailKey);

    result.push({
      id: candidate.id && typeof candidate.id === 'string' ? candidate.id : `user-${Date.now()}`,
      name: cleanName,
      role: (candidate.role || '').trim() || 'SAP Consultant / Developer',
      department: (candidate.department || '').trim() || 'SAP Project Team',
      email: cleanEmail,
    });
  }

  if (result.length !== rawList.length) {
    changed = true;
  }

  return { users: result, changed };
}

/**
 * Retrieve all registered workspace users.
 * Josh Lee (toc80.lee@gmail.com) is always first and permanent.
 */
export const getRegisteredUsers = (): CurrentUser[] => {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_STORAGE_KEY);
    if (!raw) {
      const initial = [DEFAULT_OPERATOR_USER];
      localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    const { users, changed } = normalizeUserList(parsed);
    if (changed) {
      localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(users));
    }
    return users;
  } catch (err) {
    console.error('Failed to get registered users', err);
    return [DEFAULT_OPERATOR_USER];
  }
};

/**
 * Ensure a user profile exists in the workspace directory (creates if new,
 * or returns/updates the existing profile when assigning the same user to another project).
 */
export const ensureRegisteredUser = (input: {
  name: string;
  email?: string;
  role?: string;
  department?: string;
}): { success: boolean; message?: string; user?: CurrentUser; users: CurrentUser[] } => {
  const cleanName = (input.name || '').trim();
  const cleanEmail = (input.email || '').trim();
  const cleanRole = (input.role || '').trim() || 'SAP Consultant / Developer';
  const cleanDept = (input.department || '').trim() || 'SAP Project Team';

  const currentList = getRegisteredUsers();

  if (!cleanName) {
    return {
      success: false,
      message: 'Please enter a user name.',
      users: currentList,
    };
  }

  if (isLegacyRemovedUserName(cleanName)) {
    return {
      success: false,
      message: 'Legacy preset accounts cannot be re-added.',
      users: currentList,
    };
  }

  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      message: 'Please enter a valid email address.',
      users: currentList,
    };
  }

  if (isDefaultOperatorUser(cleanName) || (cleanEmail && isDefaultOperatorUser(cleanEmail))) {
    return {
      success: true,
      user: DEFAULT_OPERATOR_USER,
      users: currentList,
    };
  }

  const existingIdx = currentList.findIndex(
    (u) =>
      u.name.toLowerCase() === cleanName.toLowerCase() ||
      (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail.toLowerCase())
  );

  if (existingIdx >= 0) {
    const existing = currentList[existingIdx];
    const updatedUser: CurrentUser = {
      ...existing,
      email: cleanEmail || existing.email,
      role: input.role?.trim() ? cleanRole : existing.role,
      department: input.department?.trim() ? cleanDept : existing.department,
    };
    const nextUsers = [...currentList];
    nextUsers[existingIdx] = updatedUser;
    try {
      localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(nextUsers));
      emitUsersUpdated();
    } catch {
      // ignore
    }
    return { success: true, user: updatedUser, users: nextUsers };
  }

  const newUser: CurrentUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    role: cleanRole,
    department: cleanDept,
    email: cleanEmail,
  };

  const nextUsers = [...currentList, newUser];
  try {
    localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(nextUsers));
    emitUsersUpdated();
    return { success: true, user: newUser, users: nextUsers };
  } catch (err) {
    console.error('Failed to save registered user', err);
    return {
      success: false,
      message: 'Failed to save user.',
      users: currentList,
    };
  }
};

/**
 * Register a new custom user added explicitly by the site operator.
 */
export const addRegisteredUser = (input: {
  name: string;
  email?: string;
  role?: string;
  department?: string;
}): { success: boolean; message?: string; user?: CurrentUser; users: CurrentUser[] } => {
  const cleanName = (input.name || '').trim();
  const cleanEmail = (input.email || '').trim();
  const currentList = getRegisteredUsers();

  if (
    cleanName &&
    (currentList.some((u) => u.name.toLowerCase() === cleanName.toLowerCase()) ||
      isDefaultOperatorUser(cleanName))
  ) {
    return {
      success: false,
      message: `User '${cleanName}' is already registered.`,
      users: currentList,
    };
  }

  if (
    cleanEmail &&
    currentList.some((u) => u.email && u.email.toLowerCase() === cleanEmail.toLowerCase())
  ) {
    return {
      success: false,
      message: `Email '${cleanEmail}' is already registered.`,
      users: currentList,
    };
  }

  return ensureRegisteredUser(input);
};

/**
 * Remove a manually added user from the workspace directory.
 * Default operator Josh Lee cannot be removed.
 */
export const removeRegisteredUser = (
  idOrName: string
): { success: boolean; message?: string; removedName?: string; users: CurrentUser[] } => {
  const currentList = getRegisteredUsers();
  const target = currentList.find(
    (u) => u.id === idOrName || u.name.toLowerCase() === idOrName.trim().toLowerCase()
  );

  if (!target) {
    return { success: false, message: 'User not found.', users: currentList };
  }

  if (isDefaultOperatorUser(target)) {
    return {
      success: false,
      message: 'Default operator Josh Lee (toc80.lee@gmail.com) cannot be removed.',
      users: currentList,
    };
  }

  const nextUsers = currentList.filter((u) => u.id !== target.id);
  try {
    localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(nextUsers));
    const active = getCurrentUser();
    if (active.id === target.id || active.name.toLowerCase() === target.name.toLowerCase()) {
      setCurrentUser(DEFAULT_OPERATOR_USER);
    }
    emitUsersUpdated();
    return { success: true, removedName: target.name, users: nextUsers };
  } catch (err) {
    console.error('Failed to remove registered user', err);
    return { success: false, message: 'Failed to remove user.', users: currentList };
  }
};

/**
 * Keep registered users directory in sync with members actually assigned to projects.
 * Any user (except Josh Lee) not present in activeMemberNames is pruned.
 */
export const pruneUnassignedRegisteredUsers = (activeMemberNames: Set<string>): CurrentUser[] => {
  const lowerActive = new Set(Array.from(activeMemberNames).map((n) => n.trim().toLowerCase()));
  const currentList = getRegisteredUsers();
  const nextUsers = currentList.filter(
    (u) => isDefaultOperatorUser(u) || lowerActive.has(u.name.trim().toLowerCase())
  );

  if (nextUsers.length !== currentList.length) {
    try {
      localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(nextUsers));
      const active = getCurrentUser();
      if (!isDefaultOperatorUser(active) && !lowerActive.has(active.name.trim().toLowerCase())) {
        setCurrentUser(DEFAULT_OPERATOR_USER);
      }
      emitUsersUpdated();
    } catch {
      // ignore
    }
  }
  return nextUsers;
};

/**
 * Retrieve current logged-in user (falls back/migrates legacy removed users to Josh Lee)
 */
export const getCurrentUser = (): CurrentUser => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CurrentUser>;
      if (parsed && parsed.name) {
        if (isLegacyRemovedUserName(parsed.name)) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(DEFAULT_OPERATOR_USER));
          return DEFAULT_OPERATOR_USER;
        }
        if (isDefaultOperatorUser(parsed as CurrentUser)) {
          if (parsed.email !== DEFAULT_OPERATOR_USER.email) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(DEFAULT_OPERATOR_USER));
          }
          return DEFAULT_OPERATOR_USER;
        }
        return parsed as CurrentUser;
      }
    }
  } catch (err) {
    console.error('Failed to get current user', err);
  }
  return DEFAULT_OPERATOR_USER;
};

/**
 * Update current logged-in user
 */
export const setCurrentUser = (user: CurrentUser): void => {
  try {
    const normalized = isDefaultOperatorUser(user) ? DEFAULT_OPERATOR_USER : user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Failed to set current user', err);
  }
};

/**
 * Quick login by registered user name
 */
export const loginAsUser = (name: string): CurrentUser => {
  const clean = name.trim();
  const registered = getRegisteredUsers();
  const matched = registered.find(
    (u) => u.name.toLowerCase() === clean.toLowerCase()
  );
  if (matched) {
    setCurrentUser(matched);
    return matched;
  }
  setCurrentUser(DEFAULT_OPERATOR_USER);
  return DEFAULT_OPERATOR_USER;
};
