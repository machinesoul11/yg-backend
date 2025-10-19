/**
 * CAPTCHA Verification Service
 * Supports multiple CAPTCHA providers (reCAPTCHA, hCaptcha, Turnstile)
 * 
 * Configuration via environment variables:
 * - CAPTCHA_PROVIDER: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'none'
 * - CAPTCHA_SECRET_KEY: Secret key for the chosen provider
 * - CAPTCHA_SITE_KEY: Site key for frontend (not used in backend, but documented here)
 */

export type CaptchaProvider = 'recaptcha' | 'hcaptcha' | 'turnstile' | 'none';

export interface CaptchaVerificationResult {
  success: boolean;
  score?: number; // For reCAPTCHA v3
  challengeTs?: Date;
  hostname?: string;
  errorCodes?: string[];
}

export class CaptchaService {
  private provider: CaptchaProvider;
  private secretKey: string | null;

  constructor() {
    this.provider = (process.env.CAPTCHA_PROVIDER as CaptchaProvider) || 'none';
    this.secretKey = process.env.CAPTCHA_SECRET_KEY || null;

    if (this.provider !== 'none' && !this.secretKey) {
      console.warn(
        `CAPTCHA provider is set to '${this.provider}' but CAPTCHA_SECRET_KEY is not configured. CAPTCHA verification will be bypassed.`
      );
    }
  }

  /**
   * Verify a CAPTCHA token
   * Returns success: true if CAPTCHA is valid or provider is 'none'
   */
  async verify(
    token: string,
    remoteIp?: string
  ): Promise<CaptchaVerificationResult> {
    // If provider is 'none' or no secret key, bypass verification
    if (this.provider === 'none' || !this.secretKey) {
      return {
        success: true,
        challengeTs: new Date(),
      };
    }

    try {
      switch (this.provider) {
        case 'recaptcha':
          return await this.verifyRecaptcha(token, remoteIp);
        case 'hcaptcha':
          return await this.verifyHCaptcha(token, remoteIp);
        case 'turnstile':
          return await this.verifyTurnstile(token, remoteIp);
        default:
          console.error(`Unsupported CAPTCHA provider: ${this.provider}`);
          return { success: false, errorCodes: ['UNSUPPORTED_PROVIDER'] };
      }
    } catch (error) {
      console.error('CAPTCHA verification error:', error);
      return {
        success: false,
        errorCodes: ['VERIFICATION_FAILED'],
      };
    }
  }

  /**
   * Verify Google reCAPTCHA token
   */
  private async verifyRecaptcha(
    token: string,
    remoteIp?: string
  ): Promise<CaptchaVerificationResult> {
    const params = new URLSearchParams({
      secret: this.secretKey!,
      response: token,
    });

    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    return {
      success: data.success === true,
      score: data.score, // Available for reCAPTCHA v3
      challengeTs: data.challenge_ts ? new Date(data.challenge_ts) : undefined,
      hostname: data.hostname,
      errorCodes: data['error-codes'] || [],
    };
  }

  /**
   * Verify hCaptcha token
   */
  private async verifyHCaptcha(
    token: string,
    remoteIp?: string
  ): Promise<CaptchaVerificationResult> {
    const params = new URLSearchParams({
      secret: this.secretKey!,
      response: token,
    });

    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    return {
      success: data.success === true,
      challengeTs: data.challenge_ts ? new Date(data.challenge_ts) : undefined,
      hostname: data.hostname,
      errorCodes: data['error-codes'] || [],
    };
  }

  /**
   * Verify Cloudflare Turnstile token
   */
  private async verifyTurnstile(
    token: string,
    remoteIp?: string
  ): Promise<CaptchaVerificationResult> {
    const body: any = {
      secret: this.secretKey!,
      response: token,
    };

    if (remoteIp) {
      body.remoteip = remoteIp;
    }

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return {
      success: data.success === true,
      challengeTs: data.challenge_ts ? new Date(data.challenge_ts) : undefined,
      hostname: data.hostname,
      errorCodes: data['error-codes'] || [],
    };
  }

  /**
   * Check if CAPTCHA is enabled
   */
  isEnabled(): boolean {
    return this.provider !== 'none' && this.secretKey !== null;
  }

  /**
   * Get the current provider
   */
  getProvider(): CaptchaProvider {
    return this.provider;
  }
}

// Export a singleton instance
export const captchaService = new CaptchaService();
