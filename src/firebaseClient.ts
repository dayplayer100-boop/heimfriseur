import { firebaseDeployment } from "./firebaseDeployment";
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  connectAuthEmulator,
  onIdTokenChanged,
  browserPopupRedirectResolver,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";

export const firebaseEnabled = import.meta.env.VITE_BACKEND === "firebase";
const projectId =
  import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseDeployment.projectId;
const apiKey =
  import.meta.env.VITE_FIREBASE_API_KEY || firebaseDeployment.apiKey;
const appId = import.meta.env.VITE_FIREBASE_APP_ID || firebaseDeployment.appId;
export const firebaseConfigured = !!(projectId && apiKey && appId);
export const firebaseApp =
  firebaseEnabled && firebaseConfigured
    ? initializeApp({
        apiKey,
        projectId,
        authDomain:
          import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
          firebaseDeployment.authDomain,
        appId,
      })
    : null;
export const firebaseAuth = firebaseApp
  ? initializeAuth(firebaseApp, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;
export const firestore = firebaseApp
  ? initializeFirestore(firebaseApp, { localCache: memoryLocalCache() })
  : null;
if (
  projectId.startsWith("demo-") &&
  import.meta.env.VITE_FIREBASE_EMULATORS === "true" &&
  firebaseAuth &&
  firestore
) {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
}
// A small auth bridge keeps the existing UI/store session contract. Firebase data
// never travels through Supabase; unsupported operations fail explicitly.
export const firebaseAuthBridge = firebaseAuth
  ? {
      auth: {
        getSession: async () => {
          await firebaseAuth.authStateReady();
          const u = firebaseAuth.currentUser;
          return {
            data: {
              session: u?.emailVerified
                ? { user: { id: u.uid, email: u.email } }
                : null,
            },
            error: null,
          };
        },
        onAuthStateChange: (
          callback: (event: string, session: unknown) => void,
        ) => {
          const stop = onIdTokenChanged(firebaseAuth, (u) =>
            callback(
              "SIGNED_IN",
              u?.emailVerified ? { user: { id: u.uid, email: u.email } } : null,
            ),
          );
          return { data: { subscription: { unsubscribe: stop } } };
        },
        signOut: async () => {
          await firebaseAuth.signOut();
          return { error: null };
        },
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          }),
        },
      },
    }
  : null;
