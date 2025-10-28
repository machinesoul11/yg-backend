/**
 * Twilio SMS Service
 * Handles SMS sending via Twilio API for 2FA and notifications
 */

import twilio from 'twilio';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Configuration constants
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 5;
const MAX_SMS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 3;

// SMS Templates
const SMS_TEMPLATES = {
  twoFactorAuth: (code: string, expiryMinutes: number) =>
    `YesGoddess: Your verification code is ${code}. Valid for ${expiryMinutes} minutes. Never share this code.`,
  
  phoneVerification: (code: string, expiryMinutes: number) =>
    `YesGoddess: Verify your phone with code ${code}. Expires in ${expiryMinutes} minutes.`,
  
  loginVerification: (code: string, expiryMinutes: number) =>
    `YesGoddess: Login code ${code}. Valid for ${expiryMinutes} minutes. If you didn't request this, contact support.`,
};

export type SmsTemplate = keyof typeof SMS_TEMPLATES;

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rateLimitExceeded?: boolean;
  rateLimitResetAt?: Date;
  cost?: number;
}

export interface VerifyCodeResult {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  count: number;
}

export class TwilioSmsService {
  private client: twilio.Twilio | null = null;

  constructor() {
    if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.warn('[TwilioSmsService] Missing Twilio configuration. SMS features will be disabled.');
      return;
    }

    try {
      this.client = twilio(ACCOUNT_SID, AUTH_TOKEN);
    } catch (error) {
      console.error('[TwilioSmsService] Failed to initialize Twilio client:', error);
    }
  }

  /**
   * Check if SMS service is properly configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Generate a cryptographically secure 6-digit code
   */
  private generateCode(): string {
    const buffer = crypto.randomBytes(4);
    const number = buffer.readUInt32BE(0);
    const code = (number % 1000000).toString().padStart(CODE_LENGTH, '0');
    return code;
  }

  /**
   * Hash a verification code for secure storage
   */
  private async hashCode(code: string): Promise<string> {
    return bcrypt.hash(code, 10);
  }

  /**
   * Verify a code against its hash
   */
  private async verifyCodeHash(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }

  /**
   * Check rate limit for SMS sending
   */
  async checkRateLimit(userId: string): Promise<RateLimitCheck> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - RATE_LIMIT_WINDOW_MINUTES);

    const recentCodes = await prisma.smsVerificationCode.count({
      where: {
        userId,
        createdAt: {
          gte: windowStart,
        },
      },
    });

    const allowed = recentCodes < MAX_SMS_PER_WINDOW;
    const remaining = Math.max(0, MAX_SMS_PER_WINDOW - recentCodes);
    
    const resetAt = new Date();
    resetAt.setMinutes(resetAt.getMinutes() + RATE_LIMIT_WINDOW_MINUTES);

    return {
      allowed,
      remaining,
      resetAt,
      count: recentCodes,
    };
  }

  /**
   * Calculate progressive backoff time
   */
  private calculateBackoffSeconds(attemptCount: number): number {
    // First resend: 30 seconds, second: 60 seconds, third+: 120 seconds
    const backoffMap = [0, 30, 60, 120];
    return backoffMap[Math.min(attemptCount, backoffMap.length - 1)];
  }

  /**
   * Check if user needs to wait before requesting another code
   */
  async checkBackoffPeriod(userId: string): Promise<{ shouldWait: boolean; waitSeconds?: number; lastSentAt?: Date }> {
    const recentCode = await prisma.smsVerificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!recentCode) {
      return { shouldWait: false };
    }

    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - RATE_LIMIT_WINDOW_MINUTES);

    const recentCount = await prisma.smsVerificationCode.count({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
    });

    const backoffSeconds = this.calculateBackoffSeconds(recentCount - 1);
    const lastSentAt = recentCode.createdAt;
    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - lastSentAt.getTime()) / 1000);

    if (elapsedSeconds < backoffSeconds) {
      return {
        shouldWait: true,
        waitSeconds: backoffSeconds - elapsedSeconds,
        lastSentAt,
      };
    }

    return { shouldWait: false, lastSentAt };
  }

  /**
   * Send a specific OTP code via SMS (for 2FA challenges)
   * This method sends a pre-generated OTP instead of generating one
   */
  async sendOtpCode(
    userId: string,
    phoneNumber: string,
    otp: string,
    template: SmsTemplate = 'loginVerification'
  ): Promise<SendSmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SMS service is not configured',
      };
    }

    // Check rate limit
    const rateLimit = await this.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `SMS rate limit exceeded. Maximum ${MAX_SMS_PER_WINDOW} SMS per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
        rateLimitExceeded: true,
        rateLimitResetAt: rateLimit.resetAt,
      };
    }

    // Check backoff period
    const backoff = await this.checkBackoffPeriod(userId);
    if (backoff.shouldWait) {
      return {
        success: false,
        error: `Please wait ${backoff.waitSeconds} seconds before requesting another code.`,
      };
    }

    // Prepare SMS message with the provided OTP
    const message = SMS_TEMPLATES[template](otp, CODE_EXPIRY_MINUTES);

    try {
      // Send SMS via Twilio
      const twilioMessage = await this.client!.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        statusCallback: `${process.env.NEXTAUTH_URL}/api/webhooks/twilio/status`,
      });

      // Note: We don't store the code hash here since 2FA challenge service handles that
      // Just log the SMS send for tracking
      console.log('[TwilioSmsService] OTP sent successfully:', {
        userId,
        messageId: twilioMessage.sid,
        status: twilioMessage.status,
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        cost: parseFloat(twilioMessage.price || '0'),
      };
    } catch (error: any) {
      console.error('[TwilioSmsService] Error sending OTP SMS:', error);

      return {
        success: false,
        error: this.parseError(error),
      };
    }
  }

  /**
   * Send SMS verification code (generates its own code)
   */
  async sendVerificationCode(
    userId: string,
    phoneNumber: string,
    template: SmsTemplate = 'twoFactorAuth'
  ): Promise<SendSmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SMS service is not configured',
      };
    }

    // Check rate limit
    const rateLimit = await this.checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `SMS rate limit exceeded. Maximum ${MAX_SMS_PER_WINDOW} SMS per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
        rateLimitExceeded: true,
        rateLimitResetAt: rateLimit.resetAt,
      };
    }

    // Check backoff period
    const backoff = await this.checkBackoffPeriod(userId);
    if (backoff.shouldWait) {
      return {
        success: false,
        error: `Please wait ${backoff.waitSeconds} seconds before requesting another code.`,
      };
    }

    // Generate and hash code
    const code = this.generateCode();
    const codeHash = await this.hashCode(code);

    // Calculate expiry
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + CODE_EXPIRY_MINUTES);

    // Prepare SMS message
    const message = SMS_TEMPLATES[template](code, CODE_EXPIRY_MINUTES);

    try {
      // Send SMS via Twilio
      const twilioMessage = await this.client!.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        statusCallback: `${process.env.NEXTAUTH_URL}/api/webhooks/twilio/status`,
      });

      // Store verification code in database
      await prisma.smsVerificationCode.create({
        data: {
          userId,
          codeHash,
          phoneNumber,
          expires,
          twilioMessageId: twilioMessage.sid,
          deliveryStatus: twilioMessage.status,
          cost: parseFloat(twilioMessage.price || '0'),
        },
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        cost: parseFloat(twilioMessage.price || '0'),
      };
    } catch (error: any) {
      console.error('[TwilioSmsService] Error sending SMS:', error);

      // Store failed attempt in database
      await prisma.smsVerificationCode.create({
        data: {
          userId,
          codeHash,
          phoneNumber,
          expires,
          deliveryStatus: 'failed',
          deliveryError: error.message || 'Unknown error',
        },
      });

      return {
        success: false,
        error: this.parseError(error),
      };
    }
  }

  /**
   * Verify SMS code
   */
  async verifyCode(userId: string, code: string): Promise<VerifyCodeResult> {
    // Find the most recent unexpired, unverified code for this user
    const verificationCode = await prisma.smsVerificationCode.findFirst({
      where: {
        userId,
        verified: false,
        expires: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!verificationCode) {
      return {
        success: false,
        error: 'No valid verification code found. Please request a new code.',
      };
    }

    // Check if max attempts exceeded
    if (verificationCode.attempts >= MAX_ATTEMPTS) {
      return {
        success: false,
        error: 'Maximum verification attempts exceeded. Please request a new code.',
        attemptsRemaining: 0,
      };
    }

    // Increment attempts
    await prisma.smsVerificationCode.update({
      where: { id: verificationCode.id },
      data: { attempts: verificationCode.attempts + 1 },
    });

    // Verify code
    const isValid = await this.verifyCodeHash(code, verificationCode.codeHash);

    if (!isValid) {
      const attemptsRemaining = MAX_ATTEMPTS - (verificationCode.attempts + 1);
      return {
        success: false,
        error: `Invalid verification code. ${attemptsRemaining} attempts remaining.`,
        attemptsRemaining,
      };
    }

    // Mark as verified
    await prisma.smsVerificationCode.update({
      where: { id: verificationCode.id },
      data: {
        verified: true,
        verifiedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  /**
   * Get SMS cost statistics for a user
   */
  async getUserSmsCosts(userId: string, startDate?: Date, endDate?: Date): Promise<{
    totalCost: number;
    totalSent: number;
    successRate: number;
  }> {
    const where: any = { userId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const codes = await prisma.smsVerificationCode.findMany({
      where,
      select: {
        cost: true,
        deliveryStatus: true,
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const totalSent = codes.length;
    const successfulDeliveries = codes.filter(
      (code) => code.deliveryStatus === 'delivered' || code.deliveryStatus === 'sent'
    ).length;
    const successRate = totalSent > 0 ? (successfulDeliveries / totalSent) * 100 : 0;

    return {
      totalCost,
      totalSent,
      successRate,
    };
  }

  /**
   * Get aggregate SMS costs across all users
   */
  async getAggregateCosts(startDate?: Date, endDate?: Date): Promise<{
    totalCost: number;
    totalSent: number;
    uniqueUsers: number;
    averageCostPerSms: number;
    deliveryStats: Record<string, number>;
  }> {
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const codes = await prisma.smsVerificationCode.findMany({
      where,
      select: {
        userId: true,
        cost: true,
        deliveryStatus: true,
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const totalSent = codes.length;
    const uniqueUsers = new Set(codes.map((code) => code.userId)).size;
    const averageCostPerSms = totalSent > 0 ? totalCost / totalSent : 0;

    const deliveryStats: Record<string, number> = {};
    codes.forEach((code) => {
      const status = code.deliveryStatus || 'unknown';
      deliveryStats[status] = (deliveryStats[status] || 0) + 1;
    });

    return {
      totalCost,
      totalSent,
      uniqueUsers,
      averageCostPerSms,
      deliveryStats,
    };
  }

  /**
   * Update SMS delivery status (called by webhook)
   */
  async updateDeliveryStatus(
    messageId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await prisma.smsVerificationCode.updateMany({
      where: { twilioMessageId: messageId },
      data: {
        deliveryStatus: status,
        deliveryError: errorMessage || errorCode || null,
      },
    });
  }

  /**
   * Clean up expired verification codes
   */
  async cleanupExpiredCodes(): Promise<number> {
    const result = await prisma.smsVerificationCode.deleteMany({
      where: {
        expires: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Parse Twilio errors into user-friendly messages
   */
  private parseError(error: any): string {
    const errorCode = error.code;
    const errorMessage = error.message || 'Unknown error occurred';

    // Common Twilio error codes
    const errorMap: Record<string, string> = {
      '21211': 'Invalid phone number',
      '21408': 'You do not have permission to send SMS to this number',
      '21610': 'Phone number is not reachable',
      '21614': 'Invalid phone number',
      '30007': 'Message filtered - likely spam',
      '30008': 'Unknown destination error',
    };

    return errorMap[errorCode] || errorMessage;
  }
}

// Export singleton instance
export const twilioSmsService = new TwilioSmsService();
