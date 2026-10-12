declare module 'expo-router' {
  import type { ComponentType, ReactNode } from 'react';
  export const Stack: ComponentType<any> & { Screen: ComponentType<any> };
  export const Tabs: ComponentType<any> & { Screen: ComponentType<any> };
  export const Link: ComponentType<any>;
  export const router: { push: (href: any) => void; back: () => void };
  export function useLocalSearchParams<T extends Record<string, string | string[] | undefined>>(): T;
}

declare module 'expo-router/html' {
  export const ScrollViewStyleReset: React.ComponentType;
}
