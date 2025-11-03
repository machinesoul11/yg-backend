/**
 * Auth.js Configuration
 * Core authentication configuration with Prisma adapter, JWT strategy, and custom callbacks
 */

import { PrismaAdapter } from '@auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import LinkedInProvider from 'next-auth/providers/linkedin';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { AUTH_CONFIG } from '@/lib/config';
import { AuditService, AUDIT_ACTIONS } from '@/lib/services/audit.service';
import { OAuthProfileSyncService } from '@/lib/services/oauth-profile-sync.service';

// Initialize services
const auditService = new AuditService(prisma);
const oauthProfileSyncService = new OAuthProfileSyncService(prisma, auditService);

/**
 * Auth.js Configuration
 */
export const authOptions: NextAuthOptions = {
  // Use Prisma adapter for database session/user management
  adapter: PrismaAdapter(prisma) as Adapter,

  // Use JWT strategy for stateless sessions
  session: {
    strategy: 'jwt',
    maxAge: AUTH_CONFIG.sessionMaxAge, // 30 days
    updateAge: AUTH_CONFIG.sessionUpdateAge, // 24 hours
  },

  // Authentication providers
  providers: [
    // Credentials (Email/Password) Provider
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();

        // RBAC: Only allow internal staff emails (@yesgoddess.agency domain)
        const emailDomain = email.split('@')[1];
        if (emailDomain !== 'yesgoddess.agency') {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: 'unknown',
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'UNAUTHORIZED_DOMAIN' },
          });
          return null;
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            creator: true,
            brand: true,
          },
        });

        // Check if user exists
        if (!user) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: 'unknown',
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'USER_NOT_FOUND' },
          });
          return null;
        }

        // Check if account is soft-deleted
        if (user.deleted_at) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: user.id,
            userId: user.id,
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'ACCOUNT_DELETED' },
          });
          return null;
        }

        // Check if account is active
        if (!user.isActive) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: user.id,
            userId: user.id,
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'ACCOUNT_INACTIVE' },
          });
          return null;
        }

        // Check if password hash exists
        if (!user.password_hash) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: user.id,
            userId: user.id,
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'NO_PASSWORD_SET' },
          });
          return null;
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!isValidPassword) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: user.id,
            userId: user.id,
            email,
            ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            after: { reason: 'INVALID_PASSWORD' },
          });
          return null;
        }

        // Check if TOTP is enabled for this user
        // Note: TOTP verification should be handled separately via the tRPC endpoints
        // The frontend should check if user.two_factor_enabled and prompt for TOTP
        // This is a limitation of NextAuth - full 2FA flow requires custom implementation
        
        // Check email verification requirement (optional - can be enforced based on business logic)
        // For now, we'll allow login even if email is not verified
        // Uncomment the following to enforce email verification:
        // if (!user.email_verified) {
        //   await auditService.log({
        //     action: AUDIT_ACTIONS.LOGIN_FAILED,
        //     userId: user.id,
        //     email,
        //     ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
        //     userAgent: req?.headers?.['user-agent'] || 'unknown',
        //     afterJson: { reason: 'EMAIL_NOT_VERIFIED' },
        //   });
        //   return null;
        // }

        // Log successful login
        await auditService.log({
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          email,
          ipAddress: req?.headers?.['x-forwarded-for'] as string || 'unknown',
          userAgent: req?.headers?.['user-agent'] || 'unknown',
        });

        // Update last login timestamp
        // Temporarily disabled due to RLS policy issue
        // await prisma.user.update({
        //   where: { id: user.id },
        //   data: { lastLoginAt: new Date() },
        // });

        // Return user object for session
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          role: user.role,
          emailVerified: user.email_verified,
        };
      },
    }),

    // Google OAuth Provider (if credentials are configured)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true, // Allow linking OAuth to existing email accounts
          }),
        ]
      : []),

    // GitHub OAuth Provider (if credentials are configured)
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),

    // LinkedIn OAuth Provider (if credentials are configured)
    ...(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
      ? [
          LinkedInProvider({
            clientId: process.env.LINKEDIN_CLIENT_ID,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                scope: 'openid profile email',
              },
            },
          }),
        ]
      : []),
  ],

  // Custom pages
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
  },

  // Callbacks for customizing behavior
  callbacks: {
    /**
     * JWT Callback - Called whenever a JWT is created or updated
     * Use this to add custom properties to the JWT token
     */
    async jwt({ token, user, account, trigger }) {
      // On initial sign in (when user object exists)
      if (user) {
        token.userId = user.id;
        token.email = user.email;
        token.role = user.role;
        token.emailVerified = !!user.emailVerified;
        token.name = user.name;
        token.picture = user.image;

        // Fetch additional user data for token enrichment
        const userData = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            creator: {
              select: {
                id: true,
                verificationStatus: true,
                onboardingStatus: true,
              },
            },
            brand: {
              select: {
                id: true,
                verificationStatus: true,
                isVerified: true,
              },
            },
          },
        });

        // Add TOTP status to token
        if (userData) {
          token.twoFactorEnabled = userData.two_factor_enabled;
        }

        // Add role-specific data
        if (userData?.creator) {
          token.creatorId = userData.creator.id;
          token.creatorVerificationStatus = userData.creator.verificationStatus;
          token.creatorOnboardingStatus = userData.creator.onboardingStatus;
        }

        if (userData?.brand) {
          token.brandId = userData.brand.id;
          token.brandVerificationStatus = userData.brand.verificationStatus;
          token.isBrandVerified = userData.brand.isVerified;
        }
      }

      // On token update (trigger === 'update')
      if (trigger === 'update') {
        // Refresh user data from database
        const userData = await prisma.user.findUnique({
          where: { id: token.userId as string },
          include: {
            creator: {
              select: {
                id: true,
                verificationStatus: true,
                onboardingStatus: true,
              },
            },
            brand: {
              select: {
                id: true,
                verificationStatus: true,
                isVerified: true,
              },
            },
          },
        });

        if (userData) {
          token.role = userData.role;
          token.emailVerified = !!userData.email_verified;
          token.twoFactorEnabled = userData.two_factor_enabled;
          token.name = userData.name;
          token.picture = userData.avatar;

          if (userData.creator) {
            token.creatorId = userData.creator.id;
            token.creatorVerificationStatus = userData.creator.verificationStatus;
            token.creatorOnboardingStatus = userData.creator.onboardingStatus;
          }

          if (userData.brand) {
            token.brandId = userData.brand.id;
            token.brandVerificationStatus = userData.brand.verificationStatus;
            token.isBrandVerified = userData.brand.isVerified;
          }
        }
      }

      return token;
    },

    /**
     * Session Callback - Called whenever session is accessed
     * Use this to add custom properties to the session object
     */
    async session({ session, token }) {
      // Add custom properties to session
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.emailVerified = token.emailVerified as boolean;
        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean;

        // Add role-specific data
        if (token.creatorId) {
          session.user.creatorId = token.creatorId as string;
          session.user.creatorVerificationStatus = token.creatorVerificationStatus as string;
          session.user.creatorOnboardingStatus = token.creatorOnboardingStatus as string;
        }

        if (token.brandId) {
          session.user.brandId = token.brandId as string;
          session.user.brandVerificationStatus = token.brandVerificationStatus as string;
          session.user.isBrandVerified = token.isBrandVerified as boolean;
        }

        // Add computed properties
        session.user.isAdmin = token.role === 'ADMIN';
        session.user.isCreator = token.role === 'CREATOR';
        session.user.isBrand = token.role === 'BRAND';
      }

      return session;
    },

    /**
     * SignIn Callback - Control if user is allowed to sign in
     * Return true to allow sign in, false to deny
     */
    async signIn({ user, account, profile, credentials }) {
      // For OAuth providers
      if (account?.provider && account.provider !== 'credentials') {
        // Check if user exists in database
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        // Check if account is soft-deleted
        if (existingUser?.deleted_at) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: existingUser.id,
            userId: existingUser.id,
            email: existingUser.email,
            after: { reason: 'ACCOUNT_DELETED', provider: account.provider },
          });
          return false;
        }

        // Check if account is inactive
        if (existingUser && !existingUser.isActive) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            entityType: 'user',
            entityId: existingUser.id,
            userId: existingUser.id,
            email: existingUser.email,
            after: { reason: 'ACCOUNT_INACTIVE', provider: account.provider },
          });
          return false;
        }

        // Log OAuth sign in
        if (existingUser) {
          await auditService.log({
            action: AUDIT_ACTIONS.LOGIN_SUCCESS,
            entityType: 'user',
            entityId: existingUser.id,
            userId: existingUser.id,
            email: existingUser.email,
            after: { provider: account.provider, isOAuth: true },
          });

          // Update last login
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { lastLoginAt: new Date() },
          });
        } else {
          // New user via OAuth
          await auditService.log({
            action: AUDIT_ACTIONS.REGISTER_SUCCESS,
            entityType: 'user',
            entityId: user.id!,
            email: user.email!,
            after: { provider: account.provider, isOAuth: true },
          });
        }
      }

      return true;
    },
  },

  // Events for logging and side effects
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      // Log sign in event
      await auditService.log({
        action: isNewUser ? AUDIT_ACTIONS.REGISTER_SUCCESS : AUDIT_ACTIONS.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email!,
        after: {
          provider: account?.provider,
          isNewUser,
          isOAuth: account?.provider !== 'credentials',
        },
      });

      // Sync profile from OAuth provider if applicable
      if (account?.provider && account.provider !== 'credentials' && profile) {
        try {
          await oauthProfileSyncService.syncProfile(
            user.id,
            {
              provider: account.provider as 'google' | 'github' | 'linkedin',
              name: profile.name ?? user.name,
              email: profile.email ?? user.email!,
              image: profile.image ?? (profile as any).avatar_url ?? (profile as any).picture,
            },
            {
              syncAvatar: true,
              syncName: true,
              overrideManualChanges: isNewUser, // Only override for new users
            }
          );
        } catch (error) {
          console.error('Failed to sync OAuth profile:', error);
          // Don't fail the sign-in if profile sync fails
        }
      }
    },

    async signOut({ token }) {
      // Log sign out event
      if (token?.userId) {
        await auditService.log({
          action: AUDIT_ACTIONS.LOGOUT,
          entityType: 'user',
          entityId: token.userId as string,
          userId: token.userId as string,
          email: token.email as string,
        });
      }
    },

    async createUser({ user }) {
      // Log new user creation
      await auditService.log({
        action: AUDIT_ACTIONS.REGISTER_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email!,
      });
    },

    async linkAccount({ user, account }) {
      // Log account linking
      await auditService.log({
        action: AUDIT_ACTIONS.PROFILE_UPDATED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email!,
        after: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          accountLinked: true,
        },
      });
    },
  },

  // Security configuration
  secret: AUTH_CONFIG.secret,

  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Cookie configuration - CRITICAL FIX for Vercel deployment
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'none', // Required for cross-origin requests (www -> ops subdomain)
        path: '/',
        secure: true, // Required when sameSite=none
        domain: process.env.NODE_ENV === 'production' 
          ? '.yesgoddess.agency'  // Share cookies across all yesgoddess.agency subdomains
          : undefined,
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url'
        : 'next-auth.callback-url',
      options: {
        sameSite: 'none',
        path: '/',
        secure: true,
        domain: process.env.NODE_ENV === 'production' 
          ? '.yesgoddess.agency' 
          : undefined,
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.csrf-token' // Changed from __Host- to __Secure- (allows domain attribute)
        : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        domain: process.env.NODE_ENV === 'production' 
          ? '.yesgoddess.agency' 
          : undefined,
      },
    },
  },

  // Use secure cookies in production
  useSecureCookies: process.env.NODE_ENV === 'production',
};

/**
 * Helper functions for server-side authentication
 */
import { getServerSession } from 'next-auth/next';

/**
 * Get the current session on the server
 * Use this in Server Components, API routes, and Server Actions
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current user from the session
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Require authentication - throws if not authenticated
 * Use this in protected routes and API endpoints
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session || !session.user) {
    throw new Error('Unauthorized - Authentication required');
  }
  return session;
}

/**
 * Require specific role - throws if user doesn't have the role
 */
export async function requireRole(role: string | string[]) {
  const session = await requireAuth();
  const roles = Array.isArray(role) ? role : [role];
  
  if (!roles.includes(session.user.role)) {
    throw new Error(`Forbidden - Required role: ${roles.join(' or ')}`);
  }
  
  return session;
}

/**
 * Check if user is admin
 */
export async function isAdmin() {
  const session = await getSession();
  return session?.user?.role === 'ADMIN';
}

/**
 * Check if user is creator
 */
export async function isCreator() {
  const session = await getSession();
  return session?.user?.role === 'CREATOR';
}

/**
 * Check if user is brand
 */
export async function isBrand() {
  const session = await getSession();
  return session?.user?.role === 'BRAND';
}

