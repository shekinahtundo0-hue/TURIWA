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
};

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
    const name = err instanceof Error ? err.name : '';
    if (!REDIRECT_FALLBACK_ERRORS.has(name)) {
      throw new GoogleSignInError(FRIENDLY_ERRORS[name] ?? (err instanceof Error ? err.message : 'Google sign-in failed.'));
    }
    await signInWithRedirect(auth, provider());
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
    if (err instanceof Error && err.name === 'auth/web-storage-disabled') return null;
    throw new GoogleSignInError(err instanceof Error ? err.message : 'Google sign-in failed.');
  }
}
