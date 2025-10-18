/**
 * Recommendations Service
 * Provides related content suggestions using content-based and collaborative filtering
 */

import { PrismaClient } from '@prisma/client';
import type {
  RelatedContent,
  RelatedContentOptions,
  SearchableEntity,
  EntityMetadata,
  RelationshipType,
} from '../types/search.types';

export class RecommendationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get related content recommendations for a given item
   */
  async getRelatedContent(
    entityType: SearchableEntity,
    entityId: string,
    userId?: string,
    options: RelatedContentOptions = {}
  ): Promise<RelatedContent[]> {
    const {
      limit = 10,
      includeTypes,
      excludeIds = [],
      minRelevanceScore = 0.3,
    } = options;

    const allExcludeIds = [...excludeIds, entityId];
    const recommendations: RelatedContent[] = [];

    // Get the source entity details
    const sourceEntity = await this.getEntityDetails(entityType, entityId);
    if (!sourceEntity) {
      return [];
    }

    // Apply different recommendation strategies based on entity type
    switch (entityType) {
      case 'assets':
        recommendations.push(
          ...await this.getRelatedAssets(sourceEntity, allExcludeIds, includeTypes)
        );
        break;
      case 'creators':
        recommendations.push(
          ...await this.getRelatedCreators(sourceEntity, allExcludeIds, includeTypes)
        );
        break;
      case 'projects':
        recommendations.push(
          ...await this.getRelatedProjects(sourceEntity, allExcludeIds, includeTypes)
        );
        break;
      case 'licenses':
        recommendations.push(
          ...await this.getRelatedLicenses(sourceEntity, allExcludeIds, includeTypes)
        );
        break;
    }

    // Filter by minimum relevance score and limit
    return recommendations
      .filter(rec => rec.relevanceScore >= minRelevanceScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Get related assets
   */
  private async getRelatedAssets(
    sourceAsset: any,
    excludeIds: string[],
    includeTypes?: RelationshipType[]
  ): Promise<RelatedContent[]> {
    const recommendations: RelatedContent[] = [];

    // 1. Same type assets
    if (!includeTypes || includeTypes.includes('similar_content')) {
      const sameTypeAssets = await this.prisma.ipAsset.findMany({
        where: {
          id: { notIn: excludeIds },
          type: sourceAsset.type,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          ownerships: {
            where: { endDate: null },
            include: { creator: true },
          },
        },
      });

      recommendations.push(
        ...sameTypeAssets.map(asset => ({
          id: asset.id,
          entityType: 'assets' as const,
          title: asset.title,
          description: asset.description,
          thumbnailUrl: asset.thumbnailUrl,
          relevanceScore: 0.8,
          relationshipType: 'similar_content' as const,
          relationshipReason: `Similar asset type: ${asset.type}`,
          metadata: {
            type: 'asset',
            assetType: asset.type,
            status: asset.status,
            fileSize: asset.fileSize,
            mimeType: asset.mimeType,
            thumbnailUrl: asset.thumbnailUrl,
            createdBy: asset.createdBy,
            tags: [],
          } as EntityMetadata,
        }))
      );
    }

    // 2. Assets from the same project
    if (sourceAsset.projectId && (!includeTypes || includeTypes.includes('same_project'))) {
      const projectAssets = await this.prisma.ipAsset.findMany({
        where: {
          id: { notIn: excludeIds },
          projectId: sourceAsset.projectId,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      recommendations.push(
        ...projectAssets.map(asset => ({
          id: asset.id,
          entityType: 'assets' as const,
          title: asset.title,
          description: asset.description,
          thumbnailUrl: asset.thumbnailUrl,
          relevanceScore: 0.9,
          relationshipType: 'same_project' as const,
          relationshipReason: 'From the same project',
          metadata: {
            type: 'asset',
            assetType: asset.type,
            status: asset.status,
            fileSize: asset.fileSize,
            mimeType: asset.mimeType,
            thumbnailUrl: asset.thumbnailUrl,
            createdBy: asset.createdBy,
            tags: [],
          } as EntityMetadata,
        }))
      );
    }

    // 3. Assets from the same creator
    if (!includeTypes || includeTypes.includes('same_creator')) {
      const creatorAssets = await this.prisma.ipAsset.findMany({
        where: {
          id: { notIn: excludeIds },
          ownerships: {
            some: {
              creatorId: sourceAsset.ownerships?.[0]?.creatorId,
              endDate: null,
            },
          },
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      recommendations.push(
        ...creatorAssets.map(asset => ({
          id: asset.id,
          entityType: 'assets' as const,
          title: asset.title,
          description: asset.description,
          thumbnailUrl: asset.thumbnailUrl,
          relevanceScore: 0.75,
          relationshipType: 'same_creator' as const,
          relationshipReason: 'From the same creator',
          metadata: {
            type: 'asset',
            assetType: asset.type,
            status: asset.status,
            fileSize: asset.fileSize,
            mimeType: asset.mimeType,
            thumbnailUrl: asset.thumbnailUrl,
            createdBy: asset.createdBy,
            tags: [],
          } as EntityMetadata,
        }))
      );
    }

    return recommendations;
  }

  /**
   * Get related creators
   */
  private async getRelatedCreators(
    sourceCreator: any,
    excludeIds: string[],
    includeTypes?: RelationshipType[]
  ): Promise<RelatedContent[]> {
    const recommendations: RelatedContent[] = [];

    // 1. Creators with similar specialties
    if (!includeTypes || includeTypes.includes('similar_content')) {
      const sourceSpecialties = sourceCreator.specialties || [];
      
      if (sourceSpecialties.length > 0) {
        const similarCreators = await this.prisma.creator.findMany({
          where: {
            id: { notIn: excludeIds },
            deletedAt: null,
            specialties: {
              path: [],
              array_contains: sourceSpecialties,
            },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        });

        recommendations.push(
          ...similarCreators.map(creator => ({
            id: creator.id,
            entityType: 'creators' as const,
            title: creator.stageName,
            description: creator.bio,
            thumbnailUrl: null,
            relevanceScore: 0.8,
            relationshipType: 'similar_content' as const,
            relationshipReason: 'Similar specialties',
            metadata: {
              type: 'creator',
              stageName: creator.stageName,
              verificationStatus: creator.verificationStatus,
              specialties: creator.specialties as string[],
              avatar: null,
              portfolioUrl: creator.portfolioUrl,
              availability: creator.availability,
              performanceMetrics: creator.performanceMetrics,
            } as EntityMetadata,
          }))
        );
      }
    }

    // 2. Creators with similar verification status and performance
    if (!includeTypes || includeTypes.includes('same_category')) {
      const similarPerformanceCreators = await this.prisma.creator.findMany({
        where: {
          id: { notIn: excludeIds },
          verificationStatus: sourceCreator.verificationStatus,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      recommendations.push(
        ...similarPerformanceCreators.map(creator => ({
          id: creator.id,
          entityType: 'creators' as const,
          title: creator.stageName,
          description: creator.bio,
          thumbnailUrl: null,
          relevanceScore: 0.6,
          relationshipType: 'same_category' as const,
          relationshipReason: 'Similar verification level',
          metadata: {
            type: 'creator',
            stageName: creator.stageName,
            verificationStatus: creator.verificationStatus,
            specialties: creator.specialties as string[],
            avatar: null,
            portfolioUrl: creator.portfolioUrl,
            availability: creator.availability,
            performanceMetrics: creator.performanceMetrics,
          } as EntityMetadata,
        }))
      );
    }

    return recommendations;
  }

  /**
   * Get related projects
   */
  private async getRelatedProjects(
    sourceProject: any,
    excludeIds: string[],
    includeTypes?: RelationshipType[]
  ): Promise<RelatedContent[]> {
    const recommendations: RelatedContent[] = [];

    // 1. Projects of the same type
    if (!includeTypes || includeTypes.includes('similar_content')) {
      const sameTypeProjects = await this.prisma.project.findMany({
        where: {
          id: { notIn: excludeIds },
          projectType: sourceProject.projectType,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          brand: {
            select: { companyName: true },
          },
        },
      });

      recommendations.push(
        ...sameTypeProjects.map(project => ({
          id: project.id,
          entityType: 'projects' as const,
          title: project.name,
          description: project.description,
          thumbnailUrl: null,
          relevanceScore: 0.8,
          relationshipType: 'similar_content' as const,
          relationshipReason: `Similar project type: ${project.projectType}`,
          metadata: {
            type: 'project',
            projectType: project.projectType,
            status: project.status,
            brandName: project.brand.companyName,
            budgetCents: project.budgetCents,
            startDate: project.startDate,
            endDate: project.endDate,
          } as EntityMetadata,
        }))
      );
    }

    // 2. Projects from the same brand
    if (!includeTypes || includeTypes.includes('same_category')) {
      const brandProjects = await this.prisma.project.findMany({
        where: {
          id: { notIn: excludeIds },
          brandId: sourceProject.brandId,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          brand: {
            select: { companyName: true },
          },
        },
      });

      recommendations.push(
        ...brandProjects.map(project => ({
          id: project.id,
          entityType: 'projects' as const,
          title: project.name,
          description: project.description,
          thumbnailUrl: null,
          relevanceScore: 0.85,
          relationshipType: 'same_category' as const,
          relationshipReason: 'From the same brand',
          metadata: {
            type: 'project',
            projectType: project.projectType,
            status: project.status,
            brandName: project.brand.companyName,
            budgetCents: project.budgetCents,
            startDate: project.startDate,
            endDate: project.endDate,
          } as EntityMetadata,
        }))
      );
    }

    return recommendations;
  }

  /**
   * Get related licenses
   */
  private async getRelatedLicenses(
    sourceLicense: any,
    excludeIds: string[],
    includeTypes?: RelationshipType[]
  ): Promise<RelatedContent[]> {
    const recommendations: RelatedContent[] = [];

    // 1. Licenses of the same type
    if (!includeTypes || includeTypes.includes('similar_content')) {
      const sameTypeLicenses = await this.prisma.license.findMany({
        where: {
          id: { notIn: excludeIds },
          licenseType: sourceLicense.licenseType,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          ipAsset: {
            select: { title: true },
          },
          brand: {
            select: { companyName: true },
          },
        },
      });

      recommendations.push(
        ...sameTypeLicenses.map(license => {
          const title = `${license.licenseType} License - ${license.ipAsset.title}`;
          return {
            id: license.id,
            entityType: 'licenses' as const,
            title,
            description: `License for ${license.brand.companyName}`,
            thumbnailUrl: null,
            relevanceScore: 0.8,
            relationshipType: 'similar_content' as const,
            relationshipReason: `Similar license type: ${license.licenseType}`,
            metadata: {
              type: 'license',
              licenseType: license.licenseType,
              status: license.status,
              feeCents: license.feeCents,
              startDate: license.startDate,
              endDate: license.endDate,
              assetTitle: license.ipAsset.title,
              brandName: license.brand.companyName,
            } as EntityMetadata,
          };
        })
      );
    }

    // 2. Other licenses for the same asset
    if (!includeTypes || includeTypes.includes('same_category')) {
      const assetLicenses = await this.prisma.license.findMany({
        where: {
          id: { notIn: excludeIds },
          ipAssetId: sourceLicense.ipAssetId,
          deletedAt: null,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          ipAsset: {
            select: { title: true },
          },
          brand: {
            select: { companyName: true },
          },
        },
      });

      recommendations.push(
        ...assetLicenses.map(license => {
          const title = `${license.licenseType} License - ${license.ipAsset.title}`;
          return {
            id: license.id,
            entityType: 'licenses' as const,
            title,
            description: `License for ${license.brand.companyName}`,
            thumbnailUrl: null,
            relevanceScore: 0.9,
            relationshipType: 'same_category' as const,
            relationshipReason: 'License for the same asset',
            metadata: {
              type: 'license',
              licenseType: license.licenseType,
              status: license.status,
              feeCents: license.feeCents,
              startDate: license.startDate,
              endDate: license.endDate,
              assetTitle: license.ipAsset.title,
              brandName: license.brand.companyName,
            } as EntityMetadata,
          };
        })
      );
    }

    return recommendations;
  }

  /**
   * Get entity details for the source item
   */
  private async getEntityDetails(
    entityType: SearchableEntity,
    entityId: string
  ): Promise<any | null> {
    try {
      switch (entityType) {
        case 'assets':
          return await this.prisma.ipAsset.findUnique({
            where: { id: entityId },
            include: {
              ownerships: {
                where: { endDate: null },
                include: { creator: true },
              },
            },
          });
        case 'creators':
          return await this.prisma.creator.findUnique({
            where: { id: entityId },
          });
        case 'projects':
          return await this.prisma.project.findUnique({
            where: { id: entityId },
            include: {
              brand: {
                select: { companyName: true },
              },
            },
          });
        case 'licenses':
          return await this.prisma.license.findUnique({
            where: { id: entityId },
            include: {
              ipAsset: {
                select: { title: true },
              },
              brand: {
                select: { companyName: true },
              },
            },
          });
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error fetching ${entityType} details:`, error);
      return null;
    }
  }
}
