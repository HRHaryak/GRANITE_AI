import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * In-memory fallback for environments without persistent storage.
 */
const memoryStore = new Map<string, string>();

/**
 * Check if running in browser / web environment.
 */
function isWebEnvironment(): boolean {
  return Platform.OS === 'web' || typeof window !== 'undefined';
}

/**
 * Safe Cross-Platform Storage Adapter.
 *
 * - Web: uses window.localStorage if available, falling back to memoryStore.
 * - Native (iOS / Android): uses expo-secure-store with try/catch fallback to memoryStore.
 *
 * Guaranteed NEVER to throw unhandled exceptions or crash screens.
 */
export const AppStorage = {
  /**
   * Retrieve a string value by key.
   */
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWebEnvironment()) {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return memoryStore.get(key) ?? null;
      }

      // Native platform check
      if (typeof SecureStore?.getItemAsync === 'function') {
        const val = await SecureStore.getItemAsync(key);
        if (val !== null && val !== undefined) return val;
      }
      return memoryStore.get(key) ?? null;
    } catch (error) {
      console.warn(`[AppStorage] Failed to read key "${key}", falling back to memory:`, error);
      return memoryStore.get(key) ?? null;
    }
  },

  /**
   * Save a string value by key.
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      memoryStore.set(key, value);

      if (isWebEnvironment()) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return;
      }

      // Native platform
      if (typeof SecureStore?.setItemAsync === 'function') {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.warn(`[AppStorage] Failed to write key "${key}", kept in memory:`, error);
    }
  },

  /**
   * Delete a key.
   */
  async removeItem(key: string): Promise<void> {
    try {
      memoryStore.delete(key);

      if (isWebEnvironment()) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return;
      }

      // Native platform
      if (typeof SecureStore?.deleteItemAsync === 'function') {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.warn(`[AppStorage] Failed to delete key "${key}":`, error);
    }
  },

  /**
   * Clear all stored values from memory (and localStorage on web).
   */
  async clear(): Promise<void> {
    try {
      memoryStore.clear();
      if (isWebEnvironment() && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    } catch (error) {
      console.warn('[AppStorage] Clear error:', error);
    }
  },
};
