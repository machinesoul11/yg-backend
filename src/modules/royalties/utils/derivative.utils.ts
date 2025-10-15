/**
 * Derivative Work Royalty Calculation Utilities
 * Handles royalty splits for derivative works and original creator compensation
 */

import { CALCULATION_ENGINE_CONFIG } from '../config/calculation.config';

/**
 * Derivative work information
 */
export interface DerivativeWorkInfo {
  ipAssetId: string;
  isDerivative: boolean;
  parentAssetId?: string;
  derivativeLevel: number; // 0 = original, 1 = first derivative, 2 = derivative of derivative, etc.
  originalCreatorId?: string;
  originalCreatorShareBps?: number;
}

/**
 * Derivative royalty split result
 */
export interface DerivativeRoyaltySplit {
  originalCreatorShareCents: number;
  derivativeCreatorsShareCents: number;
  splits: Array<{
    creatorId: string;
    isOriginalCreator: boolean;
    shareBps: number;
    calculatedRoyaltyCents: number;
    metadata?: any;
  }>;
}

/**
 * Calculate royalty splits for derivative works
 * 
 * When an IP asset is a derivative of an original work, the original creator
 * may be entitled to a percentage of the royalties. This function:
 * 1. Allocates the original creator's share first
 * 2. Distributes the remaining amount among derivative work creators
 * 
 * @param totalRoyaltyCents - Total royalty amount to split
 * @param derivativeInfo - Information about the derivative work
 * @param derivativeCreators - Creators of the derivative work with their ownership shares
 * @returns Detailed split showing original and derivative creator allocations
 */
export function calculateDerivativeRoyaltySplit(
  totalRoyaltyCents: number,
  derivativeInfo: DerivativeWorkInfo,
  derivativeCreators: Array<{ creatorId: string; shareBps: number }>
): DerivativeRoyaltySplit {
  // If not a derivative or derivative splits are disabled, return simple split
  if (!derivativeInfo.isDerivative || !CALCULATION_ENGINE_CONFIG.enableDerivativeRoyaltySplits) {
    return {
      originalCreatorShareCents: 0,
      derivativeCreatorsShareCents: totalRoyaltyCents,
      splits: derivativeCreators.map(creator => ({
        creatorId: creator.creatorId,
        isOriginalCreator: false,
        shareBps: creator.shareBps,
        calculatedRoyaltyCents: Math.round((totalRoyaltyCents * creator.shareBps) / 10000),
        metadata: {
          type: 'standard',
        },
      })),
    };
  }

  // Determine original creator's share
  const originalShareBps = derivativeInfo.originalCreatorShareBps || 
    CALCULATION_ENGINE_CONFIG.derivativeOriginalCreatorShareBps;

  // Calculate original creator's portion
  const originalCreatorShareCents = Math.round(
    (totalRoyaltyCents * originalShareBps) / 10000
  );

  // Remaining amount goes to derivative creators
  const derivativeCreatorsShareCents = totalRoyaltyCents - originalCreatorShareCents;

  // Build splits array
  const splits: DerivativeRoyaltySplit['splits'] = [];

  // Add original creator if they have a share
  if (originalCreatorShareCents > 0 && derivativeInfo.originalCreatorId) {
    splits.push({
      creatorId: derivativeInfo.originalCreatorId,
      isOriginalCreator: true,
      shareBps: originalShareBps,
      calculatedRoyaltyCents: originalCreatorShareCents,
      metadata: {
        type: 'original_creator_share',
        derivativeAssetId: derivativeInfo.ipAssetId,
        derivativeLevel: derivativeInfo.derivativeLevel,
      },
    });
  }

  // Calculate derivative creators' shares using accurate splitting
  // Validate derivative creators' shares sum to 10000 bps
  const totalDerivativeBps = derivativeCreators.reduce((sum, c) => sum + c.shareBps, 0);
  if (totalDerivativeBps !== 10000) {
    throw new Error(
      `Derivative creators' shares must sum to 10000 bps, got ${totalDerivativeBps}`
    );
  }

  // Use largest remainder method for accurate splitting
  const derivativeSplits = splitAmountAccurately(
    derivativeCreatorsShareCents,
    derivativeCreators
  );

  // Add derivative creator splits
  for (const creator of derivativeCreators) {
    const split = derivativeSplits.find(s => s.id === creator.creatorId);
    if (split) {
      splits.push({
        creatorId: creator.creatorId,
        isOriginalCreator: false,
        shareBps: creator.shareBps,
        calculatedRoyaltyCents: split.amountCents,
        metadata: {
          type: 'derivative_creator_share',
          originalCreatorId: derivativeInfo.originalCreatorId,
          originalCreatorShareBps: originalShareBps,
          derivativeLevel: derivativeInfo.derivativeLevel,
        },
      });
    }
  }

  return {
    originalCreatorShareCents,
    derivativeCreatorsShareCents,
    splits,
  };
}

/**
 * Helper function for accurate amount splitting (imported concept from financial.utils.ts)
 */
function splitAmountAccurately(
  totalCents: number,
  splits: { creatorId: string; shareBps: number }[]
): { id: string; amountCents: number }[] {
  // Calculate raw shares
  const rawShares = splits.map(split => ({
    id: split.creatorId,
    rawAmount: (totalCents * split.shareBps) / 10000,
  }));

  // Round down and calculate remainders
  const roundedShares = rawShares.map(share => ({
    id: share.id,
    amountCents: Math.floor(share.rawAmount),
    remainder: share.rawAmount - Math.floor(share.rawAmount),
  }));

  // Calculate remaining cents
  let roundedTotal = roundedShares.reduce((sum, share) => sum + share.amountCents, 0);
  const remainingCents = totalCents - roundedTotal;

  // Distribute remaining cents using largest remainder method
  if (remainingCents > 0) {
    const sortedByRemainder = [...roundedShares].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remainingCents; i++) {
      sortedByRemainder[i].amountCents += 1;
    }
  }

  return roundedShares.map(share => ({
    id: share.id,
    amountCents: share.amountCents,
  }));
}

/**
 * Calculate multi-level derivative royalty cascade
 * 
 * For cases where derivatives have derivatives (e.g., a remix of a remix),
 * this ensures all original creators in the chain receive their shares.
 * 
 * Example:
 * - Original Creator A creates Work 1
 * - Creator B creates Derivative Work 2 from Work 1 (A gets 10%)
 * - Creator C creates Derivative Work 3 from Work 2 (A gets 10%, B gets 10%)
 */
export function calculateMultiLevelDerivativeRoyalty(
  totalRoyaltyCents: number,
  derivativeChain: Array<{
    assetId: string;
    creatorId: string;
    shareBps: number; // Share of royalty at this level
    level: number;
  }>
): Array<{
  creatorId: string;
  level: number;
  shareBps: number;
  calculatedRoyaltyCents: number;
  metadata: any;
}> {
  if (!CALCULATION_ENGINE_CONFIG.enableDerivativeRoyaltySplits) {
    // Return only the most recent creators if derivative splits disabled
    const currentLevelCreators = derivativeChain.filter(
      c => c.level === Math.max(...derivativeChain.map(x => x.level))
    );
    
    return currentLevelCreators.map(creator => ({
      creatorId: creator.creatorId,
      level: creator.level,
      shareBps: creator.shareBps,
      calculatedRoyaltyCents: Math.round((totalRoyaltyCents * creator.shareBps) / 10000),
      metadata: { type: 'standard' },
    }));
  }

  // Sort by level ascending (original first)
  const sortedChain = [...derivativeChain].sort((a, b) => a.level - b.level);
  
  const results: Array<{
    creatorId: string;
    level: number;
    shareBps: number;
    calculatedRoyaltyCents: number;
    metadata: any;
  }> = [];

  let remainingRoyaltyCents = totalRoyaltyCents;

  // Process each level
  for (let currentLevel = 0; currentLevel <= Math.max(...derivativeChain.map(c => c.level)); currentLevel++) {
    const creatorsAtLevel = sortedChain.filter(c => c.level === currentLevel);
    
    if (creatorsAtLevel.length === 0) continue;

    // For levels > 0, allocate the derivative share first
    if (currentLevel > 0) {
      const derivativeShareBps = CALCULATION_ENGINE_CONFIG.derivativeOriginalCreatorShareBps;
      const derivativeShareCents = Math.round((remainingRoyaltyCents * derivativeShareBps) / 10000);
      
      // Distribute derivative share among creators at this level
      const levelSplits = splitAmountAccurately(
        derivativeShareCents,
        creatorsAtLevel.map(c => ({ creatorId: c.creatorId, shareBps: c.shareBps }))
      );

      for (const creator of creatorsAtLevel) {
        const split = levelSplits.find(s => s.id === creator.creatorId);
        if (split) {
          results.push({
            creatorId: creator.creatorId,
            level: currentLevel,
            shareBps: creator.shareBps,
            calculatedRoyaltyCents: split.amountCents,
            metadata: {
              type: currentLevel === 0 ? 'original_creator' : 'derivative_creator',
              derivativeLevel: currentLevel,
              derivativeShareBps,
            },
          });
        }
      }

      // Reduce remaining royalty
      remainingRoyaltyCents -= derivativeShareCents;
    } else {
      // Level 0 - distribute all remaining among original creators
      const levelSplits = splitAmountAccurately(
        remainingRoyaltyCents,
        creatorsAtLevel.map(c => ({ creatorId: c.creatorId, shareBps: c.shareBps }))
      );

      for (const creator of creatorsAtLevel) {
        const split = levelSplits.find(s => s.id === creator.creatorId);
        if (split) {
          results.push({
            creatorId: creator.creatorId,
            level: 0,
            shareBps: creator.shareBps,
            calculatedRoyaltyCents: split.amountCents,
            metadata: {
              type: 'original_creator',
              derivativeLevel: 0,
            },
          });
        }
      }

      remainingRoyaltyCents = 0;
    }
  }

  // Any remaining cents go to the most recent derivative creators
  if (remainingRoyaltyCents > 0) {
    const maxLevel = Math.max(...derivativeChain.map(c => c.level));
    const finalLevelCreators = results.filter(r => r.level === maxLevel);
    
    if (finalLevelCreators.length > 0) {
      // Add remaining cents to the first creator
      finalLevelCreators[0].calculatedRoyaltyCents += remainingRoyaltyCents;
    }
  }

  return results;
}

/**
 * Validate derivative work chain for calculation
 */
export function validateDerivativeChain(
  chain: Array<{ level: number; shareBps: number }>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check each level has shares summing to 10000 bps
  const levels = [...new Set(chain.map(c => c.level))];
  
  for (const level of levels) {
    const levelCreators = chain.filter(c => c.level === level);
    const totalBps = levelCreators.reduce((sum, c) => sum + c.shareBps, 0);
    
    if (totalBps !== 10000) {
      errors.push(
        `Level ${level} shares sum to ${totalBps} bps, expected 10000 bps`
      );
    }
  }

  // Check levels are sequential
  const sortedLevels = [...levels].sort((a, b) => a - b);
  for (let i = 0; i < sortedLevels.length; i++) {
    if (sortedLevels[i] !== i) {
      errors.push(
        `Missing level ${i} in derivative chain. Levels must be sequential starting from 0.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get derivative work metadata for statement display
 */
export function getDerivativeWorkMetadata(
  derivativeInfo: DerivativeWorkInfo,
  includeOriginalCreator: boolean = true
): {
  isDerivative: boolean;
  derivativeLevel: number;
  originalCreatorInfo?: {
    creatorId: string;
    shareBps: number;
  };
  displayLabel: string;
} {
  if (!derivativeInfo.isDerivative) {
    return {
      isDerivative: false,
      derivativeLevel: 0,
      displayLabel: 'Original Work',
    };
  }

  const levelLabels = ['Original', 'Derivative', '2nd-Gen Derivative', '3rd-Gen Derivative'];
  const label = derivativeInfo.derivativeLevel < levelLabels.length
    ? levelLabels[derivativeInfo.derivativeLevel]
    : `${derivativeInfo.derivativeLevel}th-Gen Derivative`;

  const result: any = {
    isDerivative: true,
    derivativeLevel: derivativeInfo.derivativeLevel,
    displayLabel: label,
  };

  if (includeOriginalCreator && derivativeInfo.originalCreatorId) {
    result.originalCreatorInfo = {
      creatorId: derivativeInfo.originalCreatorId,
      shareBps: derivativeInfo.originalCreatorShareBps || 
        CALCULATION_ENGINE_CONFIG.derivativeOriginalCreatorShareBps,
    };
  }

  return result;
}
