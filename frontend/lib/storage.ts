export const SELECTED_USER_KEY = "gm_selected_user";

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getSelectedUserId(): string | null {
  if (!hasBrowserStorage()) return null;

  try {
    const value = window.localStorage.getItem(SELECTED_USER_KEY);
    const normalized = value?.trim();

    return normalized ? normalized : null;
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
    return null;
  }
}

export function setSelectedUserId(id: string | null): void {
  if (!hasBrowserStorage()) return;

  try {
    const normalized = id?.trim() ?? "";

    if (!normalized) {
      window.localStorage.removeItem(SELECTED_USER_KEY);
      return;
    }

    window.localStorage.setItem(SELECTED_USER_KEY, normalized);
  } catch {
    // Session attribution can continue in-memory in the calling component
    // even when browser persistence is unavailable.
  }
}

export function clearSelectedUserId(): void {
  setSelectedUserId(null);
}
