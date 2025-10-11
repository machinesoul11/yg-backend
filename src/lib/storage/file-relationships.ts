/**
 * File Relationship Tracking System
 * 
 * Creates a graph-like structure that connects related assets,
 * enabling dependency tracking, derivative management, and impact analysis.
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Relationship types that define how assets are connected
 */
export enum FileRelationshipType {
  DERIVED_FROM = 'derived_from',           // One asset created from another (e.g., thumbnail from original)
  CUTDOWN_OF = 'cutdown_of',               // Shortened version of another asset
  REPLACEMENT_FOR = 'replacement_for',      // New asset supersedes old one
  VARIATION_OF = 'variation_of',            // Different version of same creative concept
  COMPONENT_OF = 'component_of',            // Asset is part of a larger composition
  REFERENCES = 'references',                // Asset includes or depends on another
  TRANSCODED_FROM = 'transcoded_from',      // Different format/encoding of same content
  PREVIEW_OF = 'preview_of',                // Preview representation of another asset
}

/**
 * Relationship metadata
 */
export interface RelationshipMetadata {
  notes?: string;
  createdAt: Date;
  createdBy: string;
  confidence?: number;  // For AI-detected relationships
  [key: string]: any;
}

/**
 * Create relationship input
 */
export interface CreateRelationshipInput {
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: FileRelationshipType;
  metadata?: Partial<RelationshipMetadata>;
  userId: string;
}

/**
 * Relationship record
 */
export interface FileRelationship {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: FileRelationshipType;
  metadata: RelationshipMetadata;
  createdAt: Date;
}

/**
 * Query relationships input
 */
export interface QueryRelationshipsInput {
  assetId: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  relationshipTypes?: FileRelationshipType[];
  includeDeleted?: boolean;
}

/**
 * Relationship graph node
 */
export interface RelationshipNode {
  id: string;
  title: string;
  type: string;
  storageKey: string;
  relationships: {
    type: FileRelationshipType;
    direction: 'outgoing' | 'incoming';
    relatedAssetId: string;
  }[];
}

/**
 * Traversal options
 */
export interface TraversalOptions {
  maxDepth?: number;
  relationshipTypes?: FileRelationshipType[];
  stopCondition?: (node: RelationshipNode) => boolean;
}

/**
 * File Relationship Service
 * 
 * Manages asset relationships and provides graph traversal capabilities
 */
export class FileRelationshipService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new relationship between assets
   */
  async createRelationship(input: CreateRelationshipInput): Promise<FileRelationship> {
    const { sourceAssetId, targetAssetId, relationshipType, metadata = {}, userId } = input;

    // Validate both assets exist
    const [sourceAsset, targetAsset] = await Promise.all([
      this.prisma.ipAsset.findUnique({ where: { id: sourceAssetId, deletedAt: null } }),
      this.prisma.ipAsset.findUnique({ where: { id: targetAssetId, deletedAt: null } }),
    ]);

    if (!sourceAsset) {
      throw new Error(`Source asset ${sourceAssetId} not found`);
    }
    if (!targetAsset) {
      throw new Error(`Target asset ${targetAssetId} not found`);
    }

    // Prevent self-references
    if (sourceAssetId === targetAssetId) {
      throw new Error('Cannot create relationship from asset to itself');
    }

    // Check for circular dependencies
    const wouldCreateCycle = await this.wouldCreateCycle(sourceAssetId, targetAssetId);
    if (wouldCreateCycle) {
      throw new Error('Creating this relationship would create a circular dependency');
    }

    // Check if relationship already exists
    const existing = await this.prisma.fileRelationship.findFirst({
      where: {
        sourceAssetId,
        targetAssetId,
        relationshipType,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new Error('Relationship already exists');
    }

    // Create relationship
    const relationship = await this.prisma.fileRelationship.create({
      data: {
        sourceAssetId,
        targetAssetId,
        relationshipType,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          createdBy: userId,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: relationship.id,
      sourceAssetId: relationship.sourceAssetId,
      targetAssetId: relationship.targetAssetId,
      relationshipType: relationship.relationshipType as FileRelationshipType,
      metadata: relationship.metadata as RelationshipMetadata,
      createdAt: relationship.createdAt,
    };
  }

  /**
   * Query relationships for an asset
   */
  async queryRelationships(input: QueryRelationshipsInput): Promise<FileRelationship[]> {
    const {
      assetId,
      direction = 'both',
      relationshipTypes,
      includeDeleted = false,
    } = input;

    const whereConditions: Prisma.FileRelationshipWhereInput[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      whereConditions.push({ sourceAssetId: assetId });
    }

    if (direction === 'incoming' || direction === 'both') {
      whereConditions.push({ targetAssetId: assetId });
    }

    const relationships = await this.prisma.fileRelationship.findMany({
      where: {
        OR: whereConditions,
        ...(relationshipTypes && {
          relationshipType: { in: relationshipTypes },
        }),
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return relationships.map((r) => ({
      id: r.id,
      sourceAssetId: r.sourceAssetId,
      targetAssetId: r.targetAssetId,
      relationshipType: r.relationshipType as FileRelationshipType,
      metadata: r.metadata as RelationshipMetadata,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(relationshipId: string, userId: string): Promise<void> {
    await this.prisma.fileRelationship.update({
      where: { id: relationshipId },
      data: {
        deletedAt: new Date(),
        metadata: {
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Get all assets that depend on a given asset
   */
  async getDependentAssets(assetId: string): Promise<string[]> {
    const relationships = await this.queryRelationships({
      assetId,
      direction: 'incoming',
    });

    return [...new Set(relationships.map((r) => r.sourceAssetId))];
  }

  /**
   * Get all assets that a given asset depends on
   */
  async getDependencies(assetId: string): Promise<string[]> {
    const relationships = await this.queryRelationships({
      assetId,
      direction: 'outgoing',
    });

    return [...new Set(relationships.map((r) => r.targetAssetId))];
  }

  /**
   * Find all assets affected by deleting a specific asset
   */
  async findAffectedAssets(assetId: string): Promise<{
    directDependents: string[];
    allAffected: string[];
  }> {
    const directDependents = await this.getDependentAssets(assetId);
    const allAffected = await this.traverseDependents(assetId);

    return {
      directDependents,
      allAffected: [...new Set(allAffected)],
    };
  }

  /**
   * Traverse the dependency graph from an asset
   */
  async traverseDependents(
    assetId: string,
    options: TraversalOptions = {}
  ): Promise<string[]> {
    const { maxDepth = 10, relationshipTypes, stopCondition } = options;
    const visited = new Set<string>();
    const result: string[] = [];

    const traverse = async (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) {
        return;
      }

      visited.add(currentId);

      const relationships = await this.queryRelationships({
        assetId: currentId,
        direction: 'incoming',
        relationshipTypes,
      });

      for (const rel of relationships) {
        const dependentId = rel.sourceAssetId;
        
        if (stopCondition) {
          const asset = await this.prisma.ipAsset.findUnique({
            where: { id: dependentId },
          });
          if (asset && stopCondition({
            id: asset.id,
            title: asset.title,
            type: asset.type,
            storageKey: asset.storageKey,
            relationships: [],
          })) {
            continue;
          }
        }

        result.push(dependentId);
        await traverse(dependentId, depth + 1);
      }
    };

    await traverse(assetId, 0);
    return result;
  }

  /**
   * Get relationship statistics for an asset
   */
  async getRelationshipStats(assetId: string): Promise<{
    totalRelationships: number;
    byType: Record<string, number>;
    incoming: number;
    outgoing: number;
  }> {
    const relationships = await this.queryRelationships({
      assetId,
      direction: 'both',
    });

    const byType: Record<string, number> = {};
    let incoming = 0;
    let outgoing = 0;

    for (const rel of relationships) {
      const type = rel.relationshipType;
      byType[type] = (byType[type] || 0) + 1;

      if (rel.sourceAssetId === assetId) {
        outgoing++;
      } else {
        incoming++;
      }
    }

    return {
      totalRelationships: relationships.length,
      byType,
      incoming,
      outgoing,
    };
  }

  /**
   * Build a relationship graph for visualization
   */
  async buildRelationshipGraph(
    rootAssetId: string,
    options: TraversalOptions = {}
  ): Promise<{
    nodes: RelationshipNode[];
    edges: Array<{
      source: string;
      target: string;
      type: FileRelationshipType;
    }>;
  }> {
    const { maxDepth = 3 } = options;
    const visited = new Set<string>();
    const nodes: RelationshipNode[] = [];
    const edges: Array<{ source: string; target: string; type: FileRelationshipType }> = [];

    const traverse = async (assetId: string, depth: number) => {
      if (depth > maxDepth || visited.has(assetId)) {
        return;
      }

      visited.add(assetId);

      // Get asset details
      const asset = await this.prisma.ipAsset.findUnique({
        where: { id: assetId },
      });

      if (!asset) {
        return;
      }

      // Get relationships
      const relationships = await this.queryRelationships({
        assetId,
        direction: 'both',
      });

      // Add node
      nodes.push({
        id: asset.id,
        title: asset.title,
        type: asset.type,
        storageKey: asset.storageKey,
        relationships: relationships.map((r) => ({
          type: r.relationshipType,
          direction: r.sourceAssetId === assetId ? 'outgoing' : 'incoming',
          relatedAssetId:
            r.sourceAssetId === assetId ? r.targetAssetId : r.sourceAssetId,
        })),
      });

      // Add edges and traverse
      for (const rel of relationships) {
        edges.push({
          source: rel.sourceAssetId,
          target: rel.targetAssetId,
          type: rel.relationshipType,
        });

        const nextId =
          rel.sourceAssetId === assetId ? rel.targetAssetId : rel.sourceAssetId;
        await traverse(nextId, depth + 1);
      }
    };

    await traverse(rootAssetId, 0);

    return { nodes, edges };
  }

  /**
   * Check if creating a relationship would create a circular dependency
   */
  private async wouldCreateCycle(
    sourceId: string,
    targetId: string
  ): Promise<boolean> {
    // Use BFS to check if targetId can reach sourceId
    const visited = new Set<string>();
    const queue = [targetId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current === sourceId) {
        return true; // Cycle detected
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      const relationships = await this.queryRelationships({
        assetId: current,
        direction: 'outgoing',
      });

      for (const rel of relationships) {
        queue.push(rel.targetAssetId);
      }
    }

    return false;
  }

  /**
   * Validate relationships before asset deletion
   */
  async validateDeletion(assetId: string): Promise<{
    canDelete: boolean;
    blockers: string[];
    warnings: string[];
  }> {
    const affected = await this.findAffectedAssets(assetId);
    const relationships = await this.queryRelationships({
      assetId,
      direction: 'both',
    });

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check for critical dependencies
    const criticalTypes = [
      FileRelationshipType.COMPONENT_OF,
      FileRelationshipType.REFERENCES,
    ];

    const criticalRels = relationships.filter((r) =>
      criticalTypes.includes(r.relationshipType)
    );

    if (criticalRels.length > 0) {
      blockers.push(
        `Asset has ${criticalRels.length} critical dependencies that prevent deletion`
      );
    }

    if (affected.directDependents.length > 0) {
      warnings.push(
        `${affected.directDependents.length} assets directly depend on this asset`
      );
    }

    if (affected.allAffected.length > affected.directDependents.length) {
      warnings.push(
        `${affected.allAffected.length} total assets will be affected by this deletion`
      );
    }

    return {
      canDelete: blockers.length === 0,
      blockers,
      warnings,
    };
  }
}
