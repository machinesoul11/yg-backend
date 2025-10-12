/**
 * Email Personalization Service
 * 
 * Provides dynamic variable resolution and personalization:
 * - User data variables (name, email, account info)
 * - Creator/Brand specific variables
 * - Dynamic calculations (account age, engagement score)
 * - Template variable catalog
 * - Safe fallback values
 * - Variable formatting and filters
 */

import { prisma } from '@/lib/db';

export interface PersonalizationData {
  // User variables
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  
  // Account variables
  accountAge?: string;
  lastLoginDate?: string;
  memberSince?: string;
  
  // Creator-specific
  stageName?: string;
  portfolioUrl?: string;
  lastRoyaltyAmount?: string;
  totalEarnings?: string;
  activeProjects?: number;
  
  // Brand-specific
  brandName?: string;
  companyName?: string;
  activeLicenses?: number;
  
  // Dynamic
  recentActivity?: string[];
  upcomingDeadlines?: Array<{ title: string; date: string }>;
}

export class PersonalizationService {
  /**
   * Resolve all personalization variables for a user
   */
  async resolveVariables(userId: string): Promise<PersonalizationData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        creator: true,
        brand: true,
      },
    });

    if (!user) {
      return this.getDefaultVariables();
    }

    const data: PersonalizationData = {
      email: user.email,
    };

    // Parse name
    if (user.name) {
      const nameParts = user.name.split(' ');
      data.firstName = nameParts[0];
      data.lastName = nameParts.slice(1).join(' ') || nameParts[0];
      data.fullName = user.name;
    } else {
      data.firstName = 'Valued User';
      data.fullName = 'Valued User';
    }

    // Account info
    data.memberSince = this.formatDate(user.createdAt);
    data.accountAge = this.calculateAccountAge(user.createdAt);
    if (user.lastLoginAt) {
      data.lastLoginDate = this.formatDate(user.lastLoginAt);
    }

    // Creator-specific variables
    if (user.creator) {
      data.stageName = user.creator.stageName;
      data.portfolioUrl = user.creator.portfolioUrl || undefined;

      // Get royalty data
      const lastStatement = await prisma.royaltyStatement.findFirst({
        where: { creatorId: user.creator.id },
        orderBy: { createdAt: 'desc' },
      });

      if (lastStatement) {
        data.lastRoyaltyAmount = this.formatCurrency(lastStatement.totalAmount);
      }

      // Calculate total earnings
      const totalEarnings = await prisma.royaltyStatement.aggregate({
        where: { creatorId: user.creator.id },
        _sum: { totalAmount: true },
      });

      if (totalEarnings._sum.totalAmount) {
        data.totalEarnings = this.formatCurrency(totalEarnings._sum.totalAmount);
      }

      // Count active projects (would need to implement project membership tracking)
      data.activeProjects = 0;
    }

    // Brand-specific variables
    if (user.brand) {
      data.brandName = user.brand.name;
      data.companyName = user.brand.companyName || user.brand.name;

      // Count active licenses
      const activeLicenses = await prisma.license.count({
        where: {
          brandId: user.brand.id,
          status: 'ACTIVE',
        },
      });

      data.activeLicenses = activeLicenses;
    }

    // Recent activity (last 5 events)
    const recentEvents = await prisma.auditEvent.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    data.recentActivity = recentEvents.map(e => 
      `${e.action} ${e.entityType} at ${this.formatDate(e.timestamp)}`
    );

    return data;
  }

  /**
   * Get default/fallback variables
   */
  private getDefaultVariables(): PersonalizationData {
    return {
      firstName: 'Valued User',
      fullName: 'Valued User',
      email: '',
    };
  }

  /**
   * Format currency value
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Format date
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  /**
   * Calculate account age in human-readable format
   */
  private calculateAccountAge(createdAt: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return `${diffDays} days`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years > 1 ? 's' : ''}`;
    }
  }

  /**
   * Replace variables in a template string
   */
  replaceVariables(template: string, data: PersonalizationData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = data[varName as keyof PersonalizationData];
      
      if (value === undefined || value === null) {
        return match; // Keep placeholder if variable not found
      }

      if (Array.isArray(value)) {
        return value.join(', ');
      }

      return String(value);
    });
  }

  /**
   * Catalog available personalization variables
   */
  async catalogVariables(): Promise<void> {
    const variables = [
      { name: 'firstName', dataType: 'string', defaultValue: 'Valued User', description: 'User first name' },
      { name: 'lastName', dataType: 'string', defaultValue: '', description: 'User last name' },
      { name: 'fullName', dataType: 'string', defaultValue: 'Valued User', description: 'User full name' },
      { name: 'email', dataType: 'string', defaultValue: '', description: 'User email address' },
      { name: 'memberSince', dataType: 'date', defaultValue: '', description: 'Account creation date' },
      { name: 'accountAge', dataType: 'string', defaultValue: '', description: 'How long user has had account' },
      { name: 'lastLoginDate', dataType: 'date', defaultValue: '', description: 'Last login timestamp' },
      { name: 'stageName', dataType: 'string', defaultValue: '', description: 'Creator stage name', applicableUserTypes: ['creator'] },
      { name: 'portfolioUrl', dataType: 'url', defaultValue: '', description: 'Creator portfolio URL', applicableUserTypes: ['creator'] },
      { name: 'lastRoyaltyAmount', dataType: 'currency', defaultValue: '$0.00', description: 'Last royalty payment', applicableUserTypes: ['creator'] },
      { name: 'totalEarnings', dataType: 'currency', defaultValue: '$0.00', description: 'Total lifetime earnings', applicableUserTypes: ['creator'] },
      { name: 'activeProjects', dataType: 'number', defaultValue: '0', description: 'Number of active projects', applicableUserTypes: ['creator'] },
      { name: 'brandName', dataType: 'string', defaultValue: '', description: 'Brand name', applicableUserTypes: ['brand'] },
      { name: 'companyName', dataType: 'string', defaultValue: '', description: 'Company name', applicableUserTypes: ['brand'] },
      { name: 'activeLicenses', dataType: 'number', defaultValue: '0', description: 'Number of active licenses', applicableUserTypes: ['brand'] },
    ];

    for (const variable of variables) {
      await prisma.emailPersonalizationVariable.upsert({
        where: { variableName: variable.name },
        create: {
          variableName: variable.name,
          dataType: variable.dataType,
          defaultValue: variable.defaultValue,
          description: variable.description,
          applicableUserTypes: (variable as any).applicableUserTypes || ['all'],
        },
        update: {
          dataType: variable.dataType,
          defaultValue: variable.defaultValue,
          description: variable.description,
        },
      });
    }

    console.log('[Personalization] Cataloged variables');
  }

  /**
   * Get all available variables
   */
  async getAvailableVariables(userType?: string): Promise<any[]> {
    return prisma.emailPersonalizationVariable.findMany({
      where: userType
        ? {
            OR: [
              { applicableUserTypes: { has: userType } },
              { applicableUserTypes: { has: 'all' } },
            ],
          }
        : undefined,
      orderBy: { variableName: 'asc' },
    });
  }
}

export const personalizationService = new PersonalizationService();
