/**
 * useAuth Hook
 * Client-side hook for accessing authentication state and methods
 */

'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

/**
 * Custom hook for authentication
 * Provides session data and authentication methods
 */
export function useAuth() {
  const { data: session, status } = useSession();

  return {
    // Session data
    session,
    user: session?.user,
    status,
    
    // Authentication state
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    isUnauthenticated: status === 'unauthenticated',
    
    // User roles
    isAdmin: session?.user?.role === 'ADMIN',
    isCreator: session?.user?.role === 'CREATOR',
    isBrand: session?.user?.role === 'BRAND',
    isViewer: session?.user?.role === 'VIEWER',
    
    // Authentication methods
    signIn,
    signOut,
  };
}

/**
 * Hook to require authentication
 * Redirects to sign-in if not authenticated
 */
export function useRequireAuth() {
  const auth = useAuth();

  if (auth.isUnauthenticated) {
    signIn();
  }

  return auth;
}

/**
 * Hook to require specific role
 * Throws error if user doesn't have required role
 */
export function useRequireRole(role: string | string[]) {
  const auth = useAuth();
  const roles = Array.isArray(role) ? role : [role];

  if (auth.isAuthenticated && auth.user && !roles.includes(auth.user.role)) {
    throw new Error(`Access denied. Required role: ${roles.join(' or ')}`);
  }

  return auth;
}
