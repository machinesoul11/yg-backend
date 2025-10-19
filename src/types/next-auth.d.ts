/**
 * TypeScript type declarations for Auth.js (NextAuth)
 * Extends default Session and JWT types with custom user properties
 */

import 'next-auth';
import 'next-auth/jwt';
import { UserRole } from '@prisma/client';

declare module 'next-auth' {
  /**
   * Extended User type for Auth.js
   */
  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: UserRole;
    emailVerified: Date | null;
  }

  /**
   * Extended Session type
   * Returned by `getSession`, `useSession`, `getServerSession`
   */
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: string;
      emailVerified: boolean;
      twoFactorEnabled: boolean;
      
      // Creator-specific fields
      creatorId?: string;
      creatorVerificationStatus?: string;
      creatorOnboardingStatus?: string;
      
      // Brand-specific fields
      brandId?: string;
      brandVerificationStatus?: string;
      isBrandVerified?: boolean;
      
      // Computed properties
      isAdmin: boolean;
      isCreator: boolean;
      isBrand: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  /**
   * Extended JWT type
   * Returned by the `jwt` callback and `getToken`
   */
  interface JWT {
    userId: string;
    email: string;
    role: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    name?: string | null;
    picture?: string | null;
    
    // Creator-specific fields
    creatorId?: string;
    creatorVerificationStatus?: string;
    creatorOnboardingStatus?: string;
    
    // Brand-specific fields
    brandId?: string;
    brandVerificationStatus?: string;
    isBrandVerified?: boolean;
  }
}
