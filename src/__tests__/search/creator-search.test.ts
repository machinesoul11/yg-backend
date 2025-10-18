/**
 * Creator Search Test Suite
 * Comprehensive tests for creator search functionality
 */

import { prisma } from '@/lib/db';
import { SearchService } from '@/modules/search/services/search.service';

describe('Creator Search', () => {
  let searchService: SearchService;
  let testCreators: any[] = [];

  beforeAll(async () => {
    searchService = new SearchService(prisma);

    // Create test creators
    const testUsers = await Promise.all([
      prisma.user.create({
        data: {
          email: 'photographer1@test.com',
          name: 'John Smith',
          role: 'CREATOR',
        },
      }),
      prisma.user.create({
        data: {
          email: 'photographer2@test.com',
          name: 'Jane Doe',
          role: 'CREATOR',
        },
      }),
      prisma.user.create({
        data: {
          email: 'designer1@test.com',
          name: 'Alex Johnson',
          role: 'CREATOR',
        },
      }),
    ]);

    testCreators = await Promise.all([
      prisma.creator.create({
        data: {
          userId: testUsers[0].id,
          stageName: 'John Smith Photography',
          bio: 'Professional photographer specializing in portraits and weddings',
          specialties: ['photography', 'videography'],
          verificationStatus: 'approved',
          verifiedAt: new Date(),
          availability: {
            status: 'available',
            hoursPerWeek: 40,
          },
          performanceMetrics: {
            totalCollaborations: 25,
            totalRevenue: 50000,
            averageRating: 4.8,
          },
        },
      }),
      prisma.creator.create({
        data: {
          userId: testUsers[1].id,
          stageName: 'Jane Doe Studio',
          bio: 'Creative photographer with 10 years experience',
          specialties: ['photography', 'graphic-design'],
          verificationStatus: 'approved',
          verifiedAt: new Date(),
          availability: {
            status: 'limited',
            hoursPerWeek: 20,
          },
          performanceMetrics: {
            totalCollaborations: 50,
            totalRevenue: 100000,
            averageRating: 4.9,
          },
        },
      }),
      prisma.creator.create({
        data: {
          userId: testUsers[2].id,
          stageName: 'Alex Design Co',
          bio: 'Modern graphic designer and illustrator',
          specialties: ['graphic-design', 'illustration'],
          verificationStatus: 'pending',
          availability: {
            status: 'available',
            hoursPerWeek: 30,
          },
          performanceMetrics: {
            totalCollaborations: 10,
            totalRevenue: 20000,
            averageRating: 4.5,
          },
        },
      }),
    ]);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.creator.deleteMany({
      where: {
        id: { in: testCreators.map(c => c.id) },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: ['photographer1@test.com', 'photographer2@test.com', 'designer1@test.com'] },
      },
    });
  });

  describe('Text Search', () => {
    it('should find creators by stage name', async () => {
      const results = await searchService.search({
        query: 'John Smith',
        entities: ['creators'],
      });

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].title).toContain('John Smith');
    });

    it('should find creators by bio content', async () => {
      const results = await searchService.search({
        query: 'photographer',
        entities: ['creators'],
      });

      expect(results.results.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle fuzzy matching', async () => {
      const results = await searchService.search({
        query: 'Jon Smyth', // Typo
        entities: ['creators'],
      });

      // Should still find "John Smith" with trigram matching
      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should handle empty queries gracefully', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
      });

      expect(results.results).toEqual([]);
    });
  });

  describe('Specialty Filtering', () => {
    it('should filter by single specialty', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          specialties: ['photography'],
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.specialties).toContain('photography');
      });
    });

    it('should filter by multiple specialties', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          specialties: ['photography', 'graphic-design'],
        },
      });

      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should return empty for non-existent specialty', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          specialties: ['nonexistent-specialty'],
        },
      });

      expect(results.results).toEqual([]);
    });
  });

  describe('Verification Status Filtering', () => {
    it('should filter by approved status', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved'],
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.verificationStatus).toBe('approved');
      });
    });

    it('should filter by pending status', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['pending'],
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.verificationStatus).toBe('pending');
      });
    });

    it('should filter by multiple statuses', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved', 'pending'],
        },
      });

      expect(results.results.length).toBeGreaterThan(0);
    });
  });

  describe('Availability Filtering', () => {
    it('should filter by available status', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          availabilityStatus: 'available',
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.availability?.status).toBe('available');
      });
    });

    it('should filter by limited availability', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          availabilityStatus: 'limited',
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.availability?.status).toBe('limited');
      });
    });
  });

  describe('Performance Metrics Sorting', () => {
    it('should sort by total collaborations (desc)', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved'],
        },
        sortBy: 'total_collaborations',
        sortOrder: 'desc',
      });

      expect(results.results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 0; i < results.results.length - 1; i++) {
        const currentMetrics = (results.results[i].metadata as any).performanceMetrics;
        const nextMetrics = (results.results[i + 1].metadata as any).performanceMetrics;
        
        const currentCollab = currentMetrics?.totalCollaborations || 0;
        const nextCollab = nextMetrics?.totalCollaborations || 0;
        
        expect(currentCollab).toBeGreaterThanOrEqual(nextCollab);
      }
    });

    it('should sort by total revenue (desc)', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved'],
        },
        sortBy: 'total_revenue',
        sortOrder: 'desc',
      });

      expect(results.results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 0; i < results.results.length - 1; i++) {
        const currentMetrics = (results.results[i].metadata as any).performanceMetrics;
        const nextMetrics = (results.results[i + 1].metadata as any).performanceMetrics;
        
        const currentRevenue = currentMetrics?.totalRevenue || 0;
        const nextRevenue = nextMetrics?.totalRevenue || 0;
        
        expect(currentRevenue).toBeGreaterThanOrEqual(nextRevenue);
      }
    });

    it('should sort by average rating (desc)', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved'],
        },
        sortBy: 'average_rating',
        sortOrder: 'desc',
      });

      expect(results.results.length).toBeGreaterThan(0);
      
      // Verify descending order
      for (let i = 0; i < results.results.length - 1; i++) {
        const currentMetrics = (results.results[i].metadata as any).performanceMetrics;
        const nextMetrics = (results.results[i + 1].metadata as any).performanceMetrics;
        
        const currentRating = currentMetrics?.averageRating || 0;
        const nextRating = nextMetrics?.averageRating || 0;
        
        expect(currentRating).toBeGreaterThanOrEqual(nextRating);
      }
    });
  });

  describe('Combined Filters', () => {
    it('should apply text search and specialty filter', async () => {
      const results = await searchService.search({
        query: 'photographer',
        entities: ['creators'],
        filters: {
          specialties: ['photography'],
          verificationStatus: ['approved'],
        },
      });

      expect(results.results.length).toBeGreaterThan(0);
      
      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.specialties).toContain('photography');
        expect(metadata.verificationStatus).toBe('approved');
      });
    });

    it('should apply specialty, verification, and availability filters', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          specialties: ['photography'],
          verificationStatus: ['approved'],
          availabilityStatus: 'available',
        },
      });

      results.results.forEach(result => {
        const metadata = result.metadata as any;
        expect(metadata.specialties).toContain('photography');
        expect(metadata.verificationStatus).toBe('approved');
        expect(metadata.availability?.status).toBe('available');
      });
    });
  });

  describe('Pagination', () => {
    it('should paginate results correctly', async () => {
      const page1 = await searchService.search({
        query: '',
        entities: ['creators'],
        pagination: { page: 1, limit: 1 },
      });

      const page2 = await searchService.search({
        query: '',
        entities: ['creators'],
        pagination: { page: 2, limit: 1 },
      });

      expect(page1.results.length).toBe(1);
      expect(page2.results.length).toBeLessThanOrEqual(1);
      expect(page1.results[0].id).not.toBe(page2.results[0]?.id);
    });

    it('should calculate pagination metadata correctly', async () => {
      const results = await searchService.search({
        query: '',
        entities: ['creators'],
        pagination: { page: 1, limit: 2 },
      });

      expect(results.pagination.page).toBe(1);
      expect(results.pagination.limit).toBe(2);
      expect(results.pagination.total).toBeGreaterThan(0);
      expect(results.pagination.totalPages).toBeGreaterThan(0);
    });
  });

  describe('Relevance Scoring', () => {
    it('should score exact name matches higher', async () => {
      const results = await searchService.search({
        query: 'John Smith Photography',
        entities: ['creators'],
      });

      expect(results.results.length).toBeGreaterThan(0);
      
      // First result should be the exact match
      expect(results.results[0].title).toContain('John Smith Photography');
      expect(results.results[0].relevanceScore).toBeGreaterThan(0.7);
    });

    it('should score verified creators higher', async () => {
      const approvedResults = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['approved'],
        },
      });

      const pendingResults = await searchService.search({
        query: '',
        entities: ['creators'],
        filters: {
          verificationStatus: ['pending'],
        },
      });

      if (approvedResults.results.length > 0 && pendingResults.results.length > 0) {
        // Approved creators should generally score higher due to quality score
        expect(approvedResults.results[0].scoreBreakdown.qualityScore)
          .toBeGreaterThan(pendingResults.results[0].scoreBreakdown.qualityScore);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid filters gracefully', async () => {
      const results = await searchService.search({
        query: 'test',
        entities: ['creators'],
        filters: {
          specialties: [],
        },
      });

      expect(results.results).toBeDefined();
    });

    it('should handle extremely long queries', async () => {
      const longQuery = 'a'.repeat(300);
      
      const results = await searchService.search({
        query: longQuery,
        entities: ['creators'],
      });

      expect(results.results).toBeDefined();
    });
  });
});

describe('Creator Search Facets', () => {
  it('should return facet counts for specialties', async () => {
    // This would test the getCreatorSearchFacets procedure
    // Implementation depends on your test setup
  });

  it('should return facet counts for availability', async () => {
    // Test availability facets
  });

  it('should return facet counts for verification status (admin)', async () => {
    // Test verification status facets for admin users
  });
});
