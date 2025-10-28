/**
 * 2FA Challenge Service
 * Manages the two-factor authentication challenge flow including:
 * - Challenge initiation and token management
 * - SMS OTP generation and verification
 * - TOTP verification
 * - Rate limiting and account lockout integration
 * - Security alerts
 */

import { PrismaClient, User } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { decrypt } from '@/lib/auth/encryption';
import { TwilioSmsService } from '@/lib/services/sms/twilio.service';
import { EmailService } from '@/lib/services/email/email.service';
import { AccountLockoutService } from '@/lib/auth/account-lockout.service';
import { getRedisClient } from '@/lib/redis/client';
import { RedisKeys, RedisTTL } from '@/lib/redis/keys';

// Import the enum type from Prisma schema
type TwoFactorMethod = 'SMS' | 'AUTHENTICATOR' | 'BOTH';

// Helper type for User with 2FA fields (bypass TypeScript cache issues)
type UserWith2FA = Pick<User, 'id' | 'email' | 'name'> & {
  two_factor_enabled: boolean;
  preferred_2fa_method: TwoFactorMethod | null;
  two_factor_secret: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  locked_until: Date | null;
};

// Configuration
const CHALLENGE_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_VERIFICATION_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const ACCOUNT_LOCKOUT_THRESHOLD = 10;
const RESEND_LIMIT_PER_WINDOW = 3;
const BCRYPT_ROUNDS = 12;

// TOTP Configuration
const TOTP_WINDOW = 1; // ±1 window tolerance (±30 seconds)

export interface ChallengeToken {
  token: string; // Challenge token to return to client
  challengeId: string; // Internal challenge ID
  expiresAt: Date;
  method: TwoFactorMethod;
  maskedPhone?: string; // Last 4 digits of phone number
}

export interface VerificationResult {
  success: boolean;
  sessionToken?: string;
  error?: string;
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

export interface ResendResult {
  success: boolean;
  error?: string;
  resetAt?: Date;
  remainingAttempts?: number;
}

interface ChallengeData {
  userId: string;
  method: TwoFactorMethod;
  otpHash?: string;
  phoneNumber?: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  ipAddress?: string;
  userAgent?: string;
}

interface UsedTotpCode {
  code: string;
  timestamp: number;
}

export class TwoFactorChallengeService {
  private redis = getRedisClient();

  constructor(
    private prisma: PrismaClient,
    private smsService: TwilioSmsService,
    private emailService: EmailService,
    private lockoutService: AccountLockoutService
  ) {}

  /**
   * Initiate a 2FA challenge after successful password authentication
   */
  async initiateChallenge(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<ChallengeToken> {
    // Get user and verify 2FA is enabled
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        // @ts-ignore - Prisma types will update after client regeneration
        two_factor_enabled: true,
        // @ts-ignore - Prisma types will update after client regeneration
        preferred_2fa_method: true,
        // @ts-ignore - Prisma types will update after client regeneration
        two_factor_secret: true,
        // @ts-ignore - Prisma types will update after client regeneration
        phone_number: true,
        // @ts-ignore - Prisma types will update after client regeneration
        phone_verified: true,
        // @ts-ignore - Prisma types will update after client regeneration
        locked_until: true,
      },
    })) as UserWith2FA | null;

    if (!user) {
      throw new Error('User not found');
    }

    // Check if account is locked
    if (user.locked_until && user.locked_until > new Date()) {
      throw new Error(`Account is locked until ${user.locked_until.toISOString()}`);
    }

    // Verify 2FA is enabled
    if (!user.two_factor_enabled) {
      throw new Error('Two-factor authentication is not enabled for this account');
    }

    // Determine 2FA method
    const method = (user.preferred_2fa_method as TwoFactorMethod) || 'AUTHENTICATOR';

    // Check rate limit for challenge initiation
    const rateLimitKey = `${RedisKeys.rateLimit.login(userId)}:challenge`;
    const challengeCount = await this.redis.incr(rateLimitKey);
    if (challengeCount === 1) {
      await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_MINUTES * 60);
    }
    if (challengeCount > 10) {
      throw new Error('Too many challenge requests. Please try again later.');
    }

    // Generate challenge ID and token
    const challengeId = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('base64url');

    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MINUTES * 60 * 1000);

    // Prepare challenge data
    const challengeData: ChallengeData = {
      userId,
      method,
      createdAt: new Date(),
      expiresAt,
      attempts: 0,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    };

    // Handle SMS method
    if (method === 'SMS') {
      if (!user.phone_number || !user.phone_verified) {
        throw new Error('Phone number not verified for SMS authentication');
      }

      // Generate OTP
      const otp = this.generateOTP();
      const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);

      challengeData.otpHash = otpHash;
      challengeData.phoneNumber = user.phone_number;

      // Send the specific OTP via SMS
      console.log('[2FA Challenge] Sending OTP via SMS to:', user.phone_number);
      const smsResult = await this.smsService.sendOtpCode(
        userId,
        user.phone_number,
        otp, // Pass the generated OTP
        'loginVerification'
      );

      if (!smsResult.success) {
        console.error('[2FA Challenge] Failed to send SMS:', smsResult);
        throw new Error('Failed to send verification code. Please try again.');
      }

      console.log('[2FA Challenge] SMS sent successfully, messageId:', smsResult.messageId);
    }

    // Store challenge data in Redis
    const challengeKey = `2fa:challenge:${challengeId}`;
    await this.redis.set(
      challengeKey,
      JSON.stringify(challengeData),
      'EX',
      CHALLENGE_EXPIRY_MINUTES * 60
    );

    // Map token to challenge ID
    const tokenKey = `2fa:token:${token}`;
    await this.redis.set(
      tokenKey,
      challengeId,
      'EX',
      CHALLENGE_EXPIRY_MINUTES * 60
    );

    return {
      token,
      challengeId,
      expiresAt,
      method,
      maskedPhone: method === 'SMS' && user.phone_number
        ? this.maskPhoneNumber(user.phone_number)
        : undefined,
    };
  }

  /**
   * Verify SMS OTP code
   */
  async verifySmsOtp(
    token: string,
    code: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<VerificationResult> {
    // Get challenge data
    const challenge = await this.getChallengeFromToken(token);
    if (!challenge) {
      return { success: false, error: 'Invalid or expired challenge token' };
    }

    // Verify method is SMS
    if (challenge.method !== 'SMS') {
      return { success: false, error: 'This challenge requires a different verification method' };
    }

    // Check if challenge has expired
    if (challenge.expiresAt < new Date()) {
      await this.invalidateChallenge(token);
      return { success: false, error: 'Challenge has expired. Please request a new code.' };
    }

    // Check attempts limit
    if (challenge.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.invalidateChallenge(token);
      return { success: false, error: 'Maximum verification attempts exceeded' };
    }

    // Check rate limit
    const rateLimitResult = await this.checkVerificationRateLimit(challenge.userId);
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error: `Too many verification attempts. Please try again in ${Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 60000)} minutes.`,
      };
    }

    // Increment attempt counter
    await this.incrementChallengeAttempts(token);

    // Verify OTP
    const isValid = await bcrypt.compare(code, challenge.otpHash!);

    if (!isValid) {
      // Record failed attempt
      await this.recordFailedVerification(challenge.userId, context);

      const remaining = MAX_VERIFICATION_ATTEMPTS - challenge.attempts - 1;
      return {
        success: false,
        error: 'Invalid verification code',
        attemptsRemaining: Math.max(0, remaining),
      };
    }

    // Success - complete authentication
    return await this.completeAuthentication(challenge.userId, token, context);
  }

  /**
   * Verify TOTP code from authenticator app
   */
  async verifyTotp(
    token: string,
    code: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<VerificationResult> {
    // Get challenge data
    const challenge = await this.getChallengeFromToken(token);
    if (!challenge) {
      return { success: false, error: 'Invalid or expired challenge token' };
    }

    // Verify method is TOTP
    if (challenge.method !== 'AUTHENTICATOR') {
      return { success: false, error: 'This challenge requires a different verification method' };
    }

    // Check if challenge has expired
    if (challenge.expiresAt < new Date()) {
      await this.invalidateChallenge(token);
      return { success: false, error: 'Challenge has expired. Please try again.' };
    }

    // Check attempts limit
    if (challenge.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.invalidateChallenge(token);
      return { success: false, error: 'Maximum verification attempts exceeded' };
    }

    // Check rate limit
    const rateLimitResult = await this.checkVerificationRateLimit(challenge.userId);
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error: `Too many verification attempts. Please try again in ${Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 60000)} minutes.`,
      };
    }

    // Get user's TOTP secret
    const user = (await this.prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        // @ts-ignore - Prisma types will update after client regeneration
        two_factor_secret: true
      },
    })) as { two_factor_secret: string | null } | null;

    if (!user?.two_factor_secret) {
      return { success: false, error: 'TOTP secret not found' };
    }

    // Decrypt secret
    const secret = decrypt(user.two_factor_secret);

    // Check for replay attack
    const isReplayAttack = await this.checkTotpReplay(challenge.userId, code);
    if (isReplayAttack) {
      await this.recordFailedVerification(challenge.userId, context);
      return { success: false, error: 'This code has already been used' };
    }

    // Increment attempt counter
    await this.incrementChallengeAttempts(token);

    // Verify TOTP code with time window
    authenticator.options = { window: TOTP_WINDOW };
    const isValid = authenticator.verify({
      token: code,
      secret,
    });

    if (!isValid) {
      // Record failed attempt
      await this.recordFailedVerification(challenge.userId, context);

      const remaining = MAX_VERIFICATION_ATTEMPTS - challenge.attempts - 1;
      return {
        success: false,
        error: 'Invalid verification code',
        attemptsRemaining: Math.max(0, remaining),
      };
    }

    // Store used code to prevent replay
    await this.recordUsedTotpCode(challenge.userId, code);

    // Success - complete authentication
    return await this.completeAuthentication(challenge.userId, token, context);
  }

  /**
   * Resend SMS verification code
   */
  async resendSmsCode(
    token: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<ResendResult> {
    try {
      // Get challenge data with timeout protection
      let challenge;
      try {
        challenge = await this.getChallengeFromToken(token);
      } catch (redisError) {
        console.error('[2FA Resend] Redis error getting challenge:', redisError);
        return { 
          success: false, 
          error: 'Service temporarily unavailable. Please try again.' 
        };
      }

      if (!challenge) {
        console.error('[2FA Resend] Challenge not found for token');
        return { success: false, error: 'Invalid or expired challenge token' };
      }

      // Verify method is SMS
      if (challenge.method !== 'SMS') {
        return { success: false, error: 'This challenge does not use SMS verification' };
      }

      // Check if challenge is expired
      if (challenge.expiresAt < new Date()) {
        return { success: false, error: 'Challenge has expired. Please initiate a new login.' };
      }

      // Check resend rate limit with Redis error handling
      const resendRateLimitKey = `2fa:resend:${challenge.userId}`;
      let resendCount = 1;
      
      try {
        resendCount = await this.redis.incr(resendRateLimitKey);
        
        if (resendCount === 1) {
          await this.redis.expire(resendRateLimitKey, RATE_LIMIT_WINDOW_MINUTES * 60);
        }

        if (resendCount > RESEND_LIMIT_PER_WINDOW) {
          const ttl = await this.redis.ttl(resendRateLimitKey);
          const resetAt = new Date(Date.now() + ttl * 1000);
          return {
            success: false,
            error: 'Too many resend requests. Please try again later.',
            resetAt,
            remainingAttempts: 0,
          };
        }
      } catch (redisError) {
        console.error('[2FA Resend] Redis error during rate limit check:', redisError);
        // Allow the resend to proceed if Redis is down (graceful degradation)
        // This prevents complete system failure when Redis is unstable
        console.warn('[2FA Resend] Bypassing rate limit due to Redis error');
        resendCount = 1;
      }

      // Generate new OTP
      const otp = this.generateOTP();
      const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);

      // Update challenge with new OTP
      challenge.otpHash = otpHash;
      challenge.attempts = 0; // Reset attempts for new code
      challenge.expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MINUTES * 60 * 1000);

      // Save updated challenge with error handling
      try {
        const tokenKey = `2fa:token:${token}`;
        const challengeIdResult = await this.redis.get(tokenKey);
        if (challengeIdResult) {
          const challengeKey = `2fa:challenge:${challengeIdResult}`;
          await this.redis.set(
            challengeKey,
            JSON.stringify(challenge),
            'EX',
            CHALLENGE_EXPIRY_MINUTES * 60
          );
        }
      } catch (redisError) {
        console.error('[2FA Resend] Redis error during challenge update:', redisError);
        return { 
          success: false, 
          error: 'Service temporarily unavailable. Please try again.' 
        };
      }

      // Send new SMS
      if (!challenge.phoneNumber) {
        return { success: false, error: 'Phone number not found' };
      }

      console.log('[2FA Resend] Sending OTP via SMS to:', challenge.phoneNumber);
      
      const smsResult = await this.smsService.sendOtpCode(
        challenge.userId,
        challenge.phoneNumber,
        otp, // Pass the generated OTP
        'loginVerification'
      );

      if (!smsResult.success) {
        console.error('[2FA Resend] SMS send failed:', smsResult);
        return { success: false, error: 'Failed to send verification code' };
      }

      console.log('[2FA Resend] SMS sent successfully, messageId:', smsResult.messageId);

      return {
        success: true,
        remainingAttempts: Math.max(0, RESEND_LIMIT_PER_WINDOW - resendCount),
      };
    } catch (error) {
      console.error('[2FA Resend] Unexpected error:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      };
    }
  }

  /**
   * Generate a cryptographically secure 6-digit OTP
   */
  private generateOTP(): string {
    const buffer = crypto.randomBytes(4);
    const number = buffer.readUInt32BE(0);
    return (number % 1000000).toString().padStart(OTP_LENGTH, '0');
  }

  /**
   * Mask phone number showing only last 4 digits
   */
  private maskPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return `****${digits.slice(-4)}`;
  }

  /**
   * Get challenge data from token
   */
  private async getChallengeFromToken(token: string): Promise<ChallengeData | null> {
    const tokenKey = `2fa:token:${token}`;
    const challengeId = await this.redis.get(tokenKey);

    if (!challengeId) {
      return null;
    }

    const challengeKey = `2fa:challenge:${challengeId}`;
    const challengeJson = await this.redis.get(challengeKey);

    if (!challengeJson) {
      return null;
    }

    const challenge = JSON.parse(challengeJson) as ChallengeData;
    challenge.createdAt = new Date(challenge.createdAt);
    challenge.expiresAt = new Date(challenge.expiresAt);

    return challenge;
  }

  /**
   * Increment challenge attempt counter
   */
  private async incrementChallengeAttempts(token: string): Promise<void> {
    const challenge = await this.getChallengeFromToken(token);
    if (!challenge) return;

    challenge.attempts += 1;

    const tokenKey = `2fa:token:${token}`;
    const challengeId = await this.redis.get(tokenKey);
    if (challengeId) {
      const challengeKey = `2fa:challenge:${challengeId}`;
      await this.redis.set(
        challengeKey,
        JSON.stringify(challenge),
        'EX',
        CHALLENGE_EXPIRY_MINUTES * 60
      );
    }
  }

  /**
   * Check verification rate limit
   */
  private async checkVerificationRateLimit(userId: string): Promise<{
    allowed: boolean;
    resetAt: Date;
    current: number;
  }> {
    const rateLimitKey = `2fa:verify:${userId}`;
    const count = await this.redis.incr(rateLimitKey);

    if (count === 1) {
      await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_MINUTES * 60);
    }

    const ttl = await this.redis.ttl(rateLimitKey);
    const resetAt = new Date(Date.now() + ttl * 1000);

    return {
      allowed: count <= MAX_ATTEMPTS_PER_WINDOW,
      resetAt,
      current: count,
    };
  }

  /**
   * Record failed verification attempt
   */
  private async recordFailedVerification(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    // Record in account lockout service
    const lockoutStatus = await this.lockoutService.recordFailedAttempt(
      userId,
      context?.ipAddress,
      context?.userAgent
    );

    // If account is locked, send alert email
    if (lockoutStatus.isLocked) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user) {
        await this.sendAccountLockedAlert(user.email, user.name || 'User', lockoutStatus, context);
      }
    }

    // Check if we should send suspicious activity alert (5+ failures but not yet locked)
    if (lockoutStatus.failedAttempts >= 5 && !lockoutStatus.isLocked) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user) {
        await this.sendSuspiciousActivityAlert(user.email, user.name || 'User', lockoutStatus, context);
      }
    }
  }

  /**
   * Check for TOTP replay attack
   */
  private async checkTotpReplay(userId: string, code: string): Promise<boolean> {
    const replayKey = `2fa:totp-used:${userId}`;
    const usedCodesJson = await this.redis.get(replayKey);

    if (!usedCodesJson) {
      return false;
    }

    const usedCodes: UsedTotpCode[] = JSON.parse(usedCodesJson);
    const now = Date.now();
    const windowMs = (TOTP_WINDOW + 1) * 30 * 1000; // Validity window in ms

    // Check if code was used recently
    return usedCodes.some(
      (used) => used.code === code && now - used.timestamp < windowMs
    );
  }

  /**
   * Record used TOTP code to prevent replay
   */
  private async recordUsedTotpCode(userId: string, code: string): Promise<void> {
    const replayKey = `2fa:totp-used:${userId}`;
    const usedCodesJson = await this.redis.get(replayKey);

    let usedCodes: UsedTotpCode[] = usedCodesJson ? JSON.parse(usedCodesJson) : [];

    // Add new code
    usedCodes.push({
      code,
      timestamp: Date.now(),
    });

    // Clean up old codes (older than validity window)
    const windowMs = (TOTP_WINDOW + 1) * 30 * 1000;
    const now = Date.now();
    usedCodes = usedCodes.filter((used) => now - used.timestamp < windowMs);

    // Store updated list
    await this.redis.set(
      replayKey,
      JSON.stringify(usedCodes),
      'EX',
      (TOTP_WINDOW + 1) * 30 * 2 // Keep for 2x the window
    );
  }

  /**
   * Complete authentication after successful 2FA verification
   */
  private async completeAuthentication(
    userId: string,
    token: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<VerificationResult> {
    // Reset failed attempts
    await this.lockoutService.resetFailedAttempts(userId);

    // Invalidate challenge
    await this.invalidateChallenge(token);

    // Update last login
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        // @ts-ignore - Prisma types will update after client regeneration
        two_factor_verified_at: new Date(),
      },
    });

    // Log successful authentication
    await this.prisma.auditEvent.create({
      data: {
        userId,
        entityType: 'user',
        entityId: userId,
        action: '2FA_VERIFICATION_SUCCESS',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: {
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Check for new device/location and send alert
    await this.checkForSuspiciousLogin(userId, context);

    // Return success (session token generation handled by auth system)
    return {
      success: true,
    };
  }

  /**
   * Invalidate challenge token
   */
  private async invalidateChallenge(token: string): Promise<void> {
    const tokenKey = `2fa:token:${token}`;
    const challengeId = await this.redis.get(tokenKey);

    if (challengeId) {
      const challengeKey = `2fa:challenge:${challengeId}`;
      await this.redis.del(challengeKey);
    }

    await this.redis.del(tokenKey);
  }

  /**
   * Send account locked alert email
   */
  private async sendAccountLockedAlert(
    email: string,
    name: string,
    lockoutStatus: any,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    try {
      // Log security alert - email template integration can be added later
      console.log('[2FA Challenge] Account locked alert:', {
        email,
        name,
        lockedUntil: lockoutStatus.lockedUntil,
        ipAddress: context?.ipAddress,
      });
      
      // TODO: Send email once security-alert template is added to email service
      // For now, use existing password-changed template as closest match
      await this.emailService.sendTransactional({
        email,
        subject: '🔒 Your Account Has Been Temporarily Locked',
        template: 'password-changed',
        variables: {
          userName: name,
          ipAddress: context?.ipAddress,
        },
      });
    } catch (error) {
      console.error('[2FA Challenge] Failed to send account locked alert:', error);
    }
  }

  /**
   * Send suspicious activity alert email
   */
  private async sendSuspiciousActivityAlert(
    email: string,
    name: string,
    lockoutStatus: any,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    try {
      // Log security alert
      console.log('[2FA Challenge] Suspicious activity alert:', {
        email,
        name,
        failedAttempts: lockoutStatus.failedAttempts,
        ipAddress: context?.ipAddress,
      });

      // TODO: Send email once security-alert template is added to email service
      // For now, use existing password-changed template as closest match
      await this.emailService.sendTransactional({
        email,
        subject: '⚠️ Suspicious Login Activity Detected',
        template: 'password-changed',
        variables: {
          userName: name,
          ipAddress: context?.ipAddress,
        },
      });
    } catch (error) {
      console.error('[2FA Challenge] Failed to send suspicious activity alert:', error);
    }
  }

  /**
   * Check for suspicious login patterns and send alerts
   */
  private async checkForSuspiciousLogin(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    // Get user's recent logins
    const recentLogins = await this.prisma.auditEvent.findMany({
      where: {
        userId,
        action: '2FA_VERIFICATION_SUCCESS',
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    // Check for new IP address
    const knownIps = recentLogins
      .filter((login) => login.ipAddress)
      .map((login) => login.ipAddress);

    const isNewIp = context?.ipAddress && !knownIps.includes(context.ipAddress);

    // If new IP or new device, send alert
    if (isNewIp) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user) {
        try {
          // Log new device login
          console.log('[2FA Challenge] New device login alert:', {
            email: user.email,
            name: user.name,
            ipAddress: context?.ipAddress,
          });

          // TODO: Send email once security-alert template is added to email service
          // For now, use existing password-changed template as closest match
          await this.emailService.sendTransactional({
            email: user.email,
            subject: '🔐 New Login to Your Account',
            template: 'password-changed',
            variables: {
              userName: user.name || 'User',
              ipAddress: context?.ipAddress,
            },
          });
        } catch (error) {
          console.error('[2FA Challenge] Failed to send new device alert:', error);
        }
      }
    }
  }

  /**
   * Switch 2FA method during active login challenge
   * Allows user to switch between SMS and AUTHENTICATOR if both are enabled
   */
  async switchChallengeMethod(
    token: string,
    newMethod: 'SMS' | 'AUTHENTICATOR',
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<ChallengeToken> {
    // Get current challenge data
    const challenge = await this.getChallengeFromToken(token);
    if (!challenge) {
      throw new Error('Invalid or expired challenge token');
    }

    // Check if challenge has expired
    if (challenge.expiresAt < new Date()) {
      await this.invalidateChallenge(token);
      throw new Error('Challenge has expired. Please restart the login process.');
    }

    // Check method switch rate limit (max 3 switches per challenge)
    const switchCountKey = `2fa:challenge:${challenge.userId}:switch_count`;
    const switchCount = await this.redis.incr(switchCountKey);
    
    if (switchCount === 1) {
      // Set expiry to match challenge expiry
      const ttl = Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000);
      await this.redis.expire(switchCountKey, ttl);
    }
    
    if (switchCount > 3) {
      throw new Error('Maximum method switches exceeded. Please restart the login process.');
    }

    // Get user to verify both methods are available
    const user = (await this.prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        email: true,
        name: true,
        // @ts-ignore - Prisma types will update after client regeneration
        two_factor_enabled: true,
        // @ts-ignore
        two_factor_secret: true,
        // @ts-ignore
        phone_number: true,
        // @ts-ignore
        phone_verified: true,
      },
    })) as UserWith2FA | null;

    if (!user) {
      throw new Error('User not found');
    }

    // Verify user has both methods enabled
    const hasTotp = user.two_factor_enabled && !!user.two_factor_secret;
    const hasSms = user.phone_verified && !!user.phone_number;

    if (!hasTotp || !hasSms) {
      throw new Error('Both SMS and authenticator methods must be enabled to switch between them');
    }

    // Verify switching to different method
    if (challenge.method === newMethod) {
      throw new Error('Already using this verification method');
    }

    // Generate new challenge ID and token
    const newChallengeId = crypto.randomBytes(16).toString('hex');
    const newToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = challenge.expiresAt; // Keep same expiry time

    // Prepare new challenge data
    const newChallengeData: ChallengeData = {
      userId: challenge.userId,
      method: newMethod,
      createdAt: new Date(),
      expiresAt,
      attempts: 0,
      ipAddress: context?.ipAddress || challenge.ipAddress,
      userAgent: context?.userAgent || challenge.userAgent,
    };

    // Handle SMS method - send new OTP
    if (newMethod === 'SMS') {
      const otp = this.generateOTP();
      const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);

      newChallengeData.otpHash = otpHash;
      newChallengeData.phoneNumber = user.phone_number!;

      // Send SMS
      const smsResult = await this.smsService.sendVerificationCode(
        user.id,
        user.phone_number!,
        'loginVerification'
      );

      if (!smsResult.success) {
        throw new Error('Failed to send SMS verification code. Please try again.');
      }
    }

    // Store new challenge data in Redis
    const newChallengeKey = `2fa:challenge:${newChallengeId}`;
    await this.redis.set(
      newChallengeKey,
      JSON.stringify(newChallengeData),
      'EX',
      Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    );

    // Map new token to challenge ID
    const newTokenKey = `2fa:token:${newToken}`;
    await this.redis.set(
      newTokenKey,
      newChallengeId,
      'EX',
      Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    );

    // Invalidate old challenge
    await this.invalidateChallenge(token);

    return {
      token: newToken,
      challengeId: newChallengeId,
      expiresAt,
      method: newMethod,
      maskedPhone: newMethod === 'SMS' && user.phone_number
        ? this.maskPhoneNumber(user.phone_number)
        : undefined,
    };
  }
}
