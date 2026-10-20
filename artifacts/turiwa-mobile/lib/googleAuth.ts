import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export class GoogleSignInError extends Error {}

// Popup errors that mean "this browser will not run a popup here" — the redirect
// flow is the supported fallback for all of them. A popup the user dismissed is a
// plain error, so it must not trigger a full-page navigation.
const REDIRECT_FALLBACK_ERRORS = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/invalid-auth-event',
]);

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/popup-closed-by-user': 'You closed the Google window before finishing. Try again when you are ready.',
  'auth/unauthorized-domain': 'This web address is not an authorized domain for Google sign-in yet. Add it in Firebase Console under Authentication > Settings.',
  'auth/user-rejected': 'Google rejected the account selection. Pick an account and try again.',
  'auth/network-request-failed': 'Your device could not reach Google. Check the connection and try again.',
  'auth/too-many-requests': 'Google is asking you to wait a moment before trying again.',
};

// A FirebaseError keeps its `auth/...` identifier in `code` and reports the plain name
// `FirebaseError`, so matching on `name` alone never matches anything and every failure shows
// the raw SDK string to the user.
export function firebaseErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  return err instanceof Error ? err.name : '';
}

function friendlyMessage(err: unknown): string {
  return FRIENDLY_ERRORS[firebaseErrorCode(err)] ?? (err instanceof Error ? err.message : 'Google sign-in failed.');
}

function provider(): GoogleAuthProvider {
  const instance = new GoogleAuthProvider();
  instance.setCustomParameters({ prompt: 'select_account' });
  return instance;
}

async function tokenFor(user: { getIdToken: () => Promise<string> }): Promise<string> {
  const idToken = await user.getIdToken();
  if (!idToken) throw new GoogleSignInError('Google did not return a sign-in token.');
  return idToken;
}

// Resolves to null when the browser blocked the popup and we started a full-page
// redirect instead; the caller then waits for the redirect to come back.
export async function signInWithGoogleWeb(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) throw new GoogleSignInError('Google sign-in is not configured on this build.');
  try {
    const result = await signInWithPopup(auth, provider());
    return await tokenFor(result.user);
  } catch (err) {
    const code = firebaseErrorCode(err);
    if (!REDIRECT_FALLBACK_ERRORS.has(code)) {
      throw new GoogleSignInError(friendlyMessage(err));
    }
    // This call rejects on its own — an origin Firebase has not authorized throws here while the
    // page is still spinning, so its error needs the same mapping as the popup's.
    try {
      await signInWithRedirect(auth, provider());
    } catch (redirectErr) {
      throw new GoogleSignInError(friendlyMessage(redirectErr));
    }
    return null;
  }
}

export async function takeGoogleRedirectToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    return await tokenFor(result.user);
  } catch (err) {
    const code = firebaseErrorCode(err);
    if (code === 'auth/web-storage-disabled') return null;
    throw new GoogleSignInError(friendlyMessage(err));
  }
}
