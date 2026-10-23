// Native: expo-sqlite provides a persistent localStorage for the auth session.
import 'expo-sqlite/localStorage/install';

export const sessionStorage = globalThis.localStorage;
