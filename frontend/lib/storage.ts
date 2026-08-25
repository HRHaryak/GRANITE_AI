export const SELECTED_USER_KEY = "gm_selected_user";

export function getSelectedUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_USER_KEY);
}

export function setSelectedUserId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id === null) {
    localStorage.removeItem(SELECTED_USER_KEY);
  } else {
    localStorage.setItem(SELECTED_USER_KEY, id);
  }
}
