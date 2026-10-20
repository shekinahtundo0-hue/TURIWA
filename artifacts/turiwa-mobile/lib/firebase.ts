import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { Platform } from 'react-native';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

// A build without Firebase keys must stay fully usable with phone + password,
// so every Google entry point checks this before rendering or running. This gate covers
// the browser flow only: a packaged app signs in through expo-auth-session instead, which
// is gated by isGoogleNativeAuthConfigured() in lib/googleAuthNative.ts.
export function isGoogleAuthConfigured(): boolean {
  return Platform.OS === 'web' && Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!isGoogleAuthConfigured()) return null;
  if (auth) return auth;
  app = app?.name ? app : (getApps()[0] ?? initializeApp(firebaseConfig));
  auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence).catch(() => {
    // Private browsing modes can reject persistence; the in-memory session still works.
  });
  return auth;
}
