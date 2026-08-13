'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  signInError: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    // Captura resultado de signInWithRedirect ao voltar para a página
    getRedirectResult(auth).then((result) => {
      if (!result) return;
      const idToken = result.user.getIdToken();
      idToken.then((token) => {
        fetch(`${API_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }).catch(console.error);
      }).catch(console.error);
    }).catch((err) => {
      const code = (err as { code?: string }).code ?? '';
      if (code) setSignInError(`Erro ao fazer login: ${code}`);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    setSignInError(null);
    try {
      // Tenta popup primeiro; se falhar por bloqueio, usa redirect
      await signInWithPopup(auth, googleProvider).then(async (result) => {
        const idToken = await result.user.getIdToken();
        await fetch(`${API_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        // Fallback para redirect quando popup é bloqueado
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      console.error('[Auth] signIn error:', err);
      setSignInError(
        code === 'auth/unauthorized-domain'
          ? 'Domínio não autorizado. Adicione "localhost" em Firebase Console → Authentication → Settings → Authorized domains.'
          : `Erro ao fazer login: ${code || String(err)}`
      );
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await firebaseSignOut(auth);
  }, []);

  return { user, loading, signInError, signIn, signOut };
}
