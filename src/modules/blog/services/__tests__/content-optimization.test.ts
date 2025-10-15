/**
 * Content Optimization Integration Test
 * Tests the comprehensive content optimization analysis functionality
 */

import { PrismaClient } from '@prisma/client';
import { ContentOptimizationService } from '../services/content-optimization.service';

// Mock Prisma client for testing
const mockPrisma = {
  post: {
    findMany: jest.fn().mockResolvedValue([])
  }
} as unknown as PrismaClient;

describe('ContentOptimizationService', () => {
  let service: ContentOptimizationService;

  beforeEach(() => {
    service = new ContentOptimizationService(mockPrisma);
  });

  describe('analyzeContent', () => {
    it('should perform comprehensive content analysis', async () => {
      const testContent = `
        <h1>Complete Guide to Content Marketing</h1>
        <p>Content marketing is a strategic marketing approach focused on creating and distributing valuable, relevant, and consistent content to attract and retain a clearly defined audience. This comprehensive guide will walk you through everything you need to know about content marketing.</p>
        
        <h2>What is Content Marketing?</h2>
        <p>Content marketing involves creating and sharing online material such as videos, blogs, and social media posts that does not explicitly promote a brand but is intended to stimulate interest in its products or services. The key is to provide value to your audience while subtly promoting your brand.</p>
        
        <h3>Benefits of Content Marketing</h3>
        <p>Content marketing offers numerous benefits for businesses of all sizes. It helps build brand awareness, establishes thought leadership, improves search engine rankings, and generates qualified leads. When done correctly, content marketing can drive significant traffic to your website and convert visitors into customers.</p>
        
        <img src="content-marketing-stats.jpg" alt="Content marketing statistics showing ROI improvement">
        
        <h2>Content Marketing Strategy</h2>
        <p>Developing an effective content marketing strategy requires careful planning and execution. You need to understand your target audience, define clear goals, create a content calendar, and measure your results. The most successful content marketing campaigns are those that align with business objectives and provide genuine value to the audience.</p>
        
        <h3>Creating Quality Content</h3>
        <p>Quality content is the foundation of any successful content marketing strategy. This means creating content that is informative, engaging, and relevant to your audience. Your content should solve problems, answer questions, or provide insights that your audience finds valuable.</p>
        
        <img src="content-creation-process.jpg" alt="Step-by-step content creation workflow diagram">
        
        <p>Remember that content marketing is a long-term strategy that requires consistency and patience. The results may not be immediate, but with persistence and quality content, you will see significant improvements in your brand's online presence and customer engagement.</p>
      `;

      const result = await service.analyzeContent(testContent, {
        title: 'Complete Guide to Content Marketing',
        contentType: 'guide',
        targetKeywords: ['content marketing', 'strategy', 'digital marketing']
      });

      // Test overall structure
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('keywordAnalysis');
      expect(result).toHaveProperty('headingStructure');
      expect(result).toHaveProperty('readability');
      expect(result).toHaveProperty('imageValidation');
      expect(result).toHaveProperty('contentLength');
      expect(result).toHaveProperty('internalLinking');
      expect(result).toHaveProperty('summary');

      // Test keyword analysis
      expect(result.keywordAnalysis).toHaveProperty('singleWords');
      expect(result.keywordAnalysis).toHaveProperty('twoWordPhrases');
      expect(result.keywordAnalysis).toHaveProperty('threeWordPhrases');
      expect(result.keywordAnalysis).toHaveProperty('totalWords');
      expect(result.keywordAnalysis.totalWords).toBeGreaterThan(0);

      // Test heading structure
      expect(result.headingStructure).toHaveProperty('isValid');
      expect(result.headingStructure).toHaveProperty('headings');
      expect(result.headingStructure.headings.length).toBeGreaterThan(0);
      expect(result.headingStructure.headings[0].level).toBe(1); // Should have H1

      // Test readability
      expect(result.readability).toHaveProperty('score');
      expect(result.readability).toHaveProperty('metrics');
      expect(result.readability.score).toBeGreaterThanOrEqual(0);
      expect(result.readability.score).toBeLessThanOrEqual(100);

      // Test image validation
      expect(result.imageValidation).toHaveProperty('totalImages');
      expect(result.imageValidation).toHaveProperty('validImages');
      expect(result.imageValidation).toHaveProperty('complianceScore');
      expect(result.imageValidation.totalImages).toBe(2); // Two images in test content

      // Test content length analysis
      expect(result.contentLength).toHaveProperty('currentWordCount');
      expect(result.contentLength).toHaveProperty('status');
      expect(result.contentLength).toHaveProperty('recommendedRange');

      // Test summary
      expect(result.summary).toHaveProperty('strengths');
      expect(result.summary).toHaveProperty('issues');
      expect(result.summary).toHaveProperty('priority_fixes');
      expect(result.summary).toHaveProperty('quick_wins');

      // Test that processing time is recorded
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle content with poor SEO structure', async () => {
      const poorContent = `
        This is some content without proper headings or structure. It has no alt text on images and poor readability with very long sentences that go on and on without proper punctuation or breaks which makes it difficult to read and understand for most users who expect content to be well structured and easy to digest.
        
        <img src="image.jpg">
        
        More content that lacks proper structure and organization making it difficult for both users and search engines to understand the main topics and themes being discussed in this particular piece of content.
      `;

      const result = await service.analyzeContent(poorContent, {
        title: 'Poor Content Example',
        contentType: 'default'
      });

      // Should identify issues
      expect(result.overallScore).toBeLessThan(70);
      expect(result.headingStructure.isValid).toBe(false);
      expect(result.imageValidation.complianceScore).toBeLessThan(100);
      expect(result.summary.issues.length).toBeGreaterThan(0);
      expect(result.summary.priority_fixes.length).toBeGreaterThan(0);
    });

    it('should provide appropriate recommendations based on content type', async () => {
      const tutorialContent = `
        <h1>How to Create a Blog Post</h1>
        <p>This short tutorial explains the basics.</p>
        <h2>Step 1</h2>
        <p>Write your content.</p>
      `;

      const result = await service.analyzeContent(tutorialContent, {
        title: 'How to Create a Blog Post',
        contentType: 'tutorial'
      });

      // Tutorial content should be flagged as too short
      expect(result.contentLength.status).toBe('too-short');
      expect(result.contentLength.recommendedRange.min).toBe(1500); // Tutorial minimum
      expect(result.contentLength.recommendedRange.max).toBe(3000); // Tutorial maximum
    });
  });

  describe('keyword density analysis', () => {
    it('should calculate keyword density correctly', async () => {
      const content = `
        Content marketing is important. Content marketing helps businesses grow. 
        Good content marketing requires strategy. Content marketing content marketing content marketing.
      `;

      const result = await service.analyzeContent(content, {
        title: 'Content Marketing Guide',
        targetKeywords: ['content marketing']
      });

      const contentMarketingKeyword = result.keywordAnalysis.twoWordPhrases
        .find(phrase => phrase.keyword === 'content marketing');

      expect(contentMarketingKeyword).toBeDefined();
      expect(contentMarketingKeyword?.density).toBeGreaterThan(0);
      expect(contentMarketingKeyword?.frequency).toBeGreaterThan(1);
    });
  });

  describe('readability analysis', () => {
    it('should calculate Flesch reading ease score', async () => {
      const easyContent = `
        <h1>Simple Guide</h1>
        <p>This is easy to read. Short sentences work well. They help users understand.</p>
      `;

      const result = await service.analyzeContent(easyContent);
      
      expect(result.readability.metrics.fleschReadingEase).toBeGreaterThan(60);
      expect(result.readability.classification).toMatch(/easy|standard/);
    });

    it('should identify complex content', async () => {
      const complexContent = `
        <h1>Complex Academic Discussion</h1>
        <p>The implementation of sophisticated algorithmic methodologies within contemporary computational frameworks necessitates comprehensive understanding of multifaceted theoretical constructs and their practical applications in real-world scenarios, particularly when considering the interconnected dependencies between various system components and their potential impact on overall performance optimization strategies.</p>
      `;

      const result = await service.analyzeContent(complexContent);
      
      expect(result.readability.metrics.fleschReadingEase).toBeLessThan(60);
      expect(result.readability.classification).toMatch(/difficult/);
    });
  });

  describe('image validation', () => {
    it('should detect missing alt text', async () => {
      const contentWithBadImages = `
        <h1>Image Test</h1>
        <img src="image1.jpg">
        <img src="image2.jpg" alt="">
        <img src="image3.jpg" alt="img">
        <img src="image4.jpg" alt="A comprehensive description of what this image shows to users">
      `;

      const result = await service.analyzeContent(contentWithBadImages);

      expect(result.imageValidation.totalImages).toBe(4);
      expect(result.imageValidation.validImages).toBe(1); // Only the last one is valid
      expect(result.imageValidation.issues.length).toBe(3);
      
      const issueTypes = result.imageValidation.issues.map(issue => issue.issue);
      expect(issueTypes).toContain('missing-alt');
      expect(issueTypes).toContain('empty-alt');
      expect(issueTypes).toContain('generic-alt');
    });
  });

  describe('heading structure validation', () => {
    it('should validate proper heading hierarchy', async () => {
      const goodHeadings = `
        <h1>Main Title</h1>
        <p>Introduction paragraph.</p>
        <h2>Section One</h2>
        <p>Section content.</p>
        <h3>Subsection</h3>
        <p>Subsection content.</p>
        <h2>Section Two</h2>
        <p>More content.</p>
      `;

      const result = await service.analyzeContent(goodHeadings);

      expect(result.headingStructure.isValid).toBe(true);
      expect(result.headingStructure.headings).toHaveLength(4);
      expect(result.headingStructure.issues).toHaveLength(0);
    });

    it('should detect skipped heading levels', async () => {
      const badHeadings = `
        <h1>Main Title</h1>
        <h4>Skipped to H4</h4>
        <h2>Back to H2</h2>
      `;

      const result = await service.analyzeContent(badHeadings);

      expect(result.headingStructure.isValid).toBe(false);
      expect(result.headingStructure.issues.length).toBeGreaterThan(0);
      expect(result.headingStructure.issues[0].type).toBe('error');
    });
  });

  describe('content length recommendations', () => {
    it('should provide appropriate length recommendations for different content types', async () => {
      const shortContent = '<h1>Title</h1><p>Short content.</p>';

      // Test news content
      const newsResult = await service.analyzeContent(shortContent, {
        contentType: 'news'
      });
      expect(newsResult.contentLength.recommendedRange.min).toBe(300);
      expect(newsResult.contentLength.recommendedRange.max).toBe(800);

      // Test guide content  
      const guideResult = await service.analyzeContent(shortContent, {
        contentType: 'guide'
      });
      expect(guideResult.contentLength.recommendedRange.min).toBe(2000);
      expect(guideResult.contentLength.recommendedRange.max).toBe(4000);
    });
  });
});

// Integration test for the complete content optimization workflow
describe('Content Optimization Integration', () => {
  it('should provide actionable recommendations for content improvement', async () => {
    const service = new ContentOptimizationService(mockPrisma);
    
    const realWorldContent = `
      <h1>10 Tips for Better SEO</h1>
      <p>SEO is important for websites. Here are some tips to improve your SEO.</p>
      
      <h2>Tip 1: Use Keywords</h2>
      <p>Keywords help search engines understand your content. Use them naturally throughout your text.</p>
      
      <img src="seo-tips.jpg">
      
      <h2>Tip 2: Write Quality Content</h2>
      <p>Quality content keeps users engaged and encourages them to stay longer on your site, which signals to search engines that your content is valuable and relevant to user queries.</p>
      
      <h2>Tip 3: Optimize Images</h2>
      <p>Images should have descriptive alt text for accessibility and SEO benefits.</p>
      
      <img src="image-optimization.jpg" alt="Screenshot showing image optimization settings">
    `;

    const result = await service.analyzeContent(realWorldContent, {
      title: '10 Tips for Better SEO',
      contentType: 'default',
      targetKeywords: ['SEO', 'search engine optimization', 'tips']
    });

    // Should provide comprehensive analysis
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.summary.strengths.length + result.summary.issues.length).toBeGreaterThan(0);
    
    // Should identify the missing alt text issue
    expect(result.imageValidation.issues.some(issue => 
      issue.issue === 'missing-alt'
    )).toBe(true);

    // Should provide actionable recommendations
    expect(result.summary.quick_wins.length).toBeGreaterThan(0);
    
    // Should calculate readability
    expect(result.readability.score).toBeGreaterThan(0);
    
    // Should analyze content length appropriately
    expect(result.contentLength.currentWordCount).toBeGreaterThan(0);
  });
});
