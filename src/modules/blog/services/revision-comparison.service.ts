/**
 * Revision Comparison Service
 * Handles post revision comparison and restore functionality
 */

import { PrismaClient } from '@prisma/client';
import { PostNotFoundError, PostRevisionNotFoundError, BlogDatabaseError } from '../errors/blog.errors';
import { AuditService } from '@/lib/services/audit.service';

export interface RevisionComparison {
  oldRevision: {
    id: string;
    content: string;
    authorId: string;
    authorName: string | null;
    createdAt: Date;
    revisionNote: string | null;
  };
  newRevision: {
    id: string;
    content: string;
    authorId: string;
    authorName: string | null;
    createdAt: Date;
    revisionNote: string | null;
  };
  changes: {
    additions: string[];
    deletions: string[];
    modifications: string[];
  };
  diffHtml: string;
  statistics: {
    charactersAdded: number;
    charactersRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
    changePercentage: number;
  };
}

export interface CreateRevisionRequest {
  postId: string;
  content: string;
  revisionNote?: string;
  authorId: string;
}

export interface RestoreRevisionRequest {
  postId: string;
  revisionId: string;
  authorId: string;
  reason?: string;
}

export class RevisionComparisonService {
  private auditService: AuditService;

  constructor(private prisma: PrismaClient) {
    this.auditService = new AuditService(this.prisma);
  }

  /**
   * Create a new revision for a post
   */
  async createRevision(request: CreateRevisionRequest): Promise<any> {
    try {
      // Verify post exists
      const post = await this.prisma.post.findUnique({
        where: { id: request.postId },
        select: { id: true, title: true, content: true }
      });

      if (!post) {
        throw new PostNotFoundError(request.postId);
      }

      // Only create revision if content has changed
      if (post.content === request.content) {
        throw new Error('No content changes detected');
      }

      // Create revision
      const revision = await this.prisma.postRevision.create({
        data: {
          postId: request.postId,
          content: request.content,
          authorId: request.authorId,
          revisionNote: request.revisionNote || null
        },
        include: {
          author: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      // Create audit log
      await this.auditService.log({
        action: 'POST_REVISION_CREATED',
        entityType: 'PostRevision',
        entityId: revision.id,
        userId: request.authorId,
        after: {
          postId: request.postId,
          postTitle: post.title,
          revisionNote: request.revisionNote,
          contentLength: request.content.length
        }
      });

      return revision;

    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to create revision', error as Error);
    }
  }

  /**
   * Get all revisions for a post
   */
  async getPostRevisions(postId: string, options: { page?: number; limit?: number } = {}): Promise<any> {
    try {
      const { page = 1, limit = 50 } = options;
      const offset = (page - 1) * limit;

      const [revisions, total] = await Promise.all([
        this.prisma.postRevision.findMany({
          where: { postId },
          include: {
            author: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        this.prisma.postRevision.count({
          where: { postId }
        })
      ]);

      return {
        revisions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error) {
      throw new BlogDatabaseError('Failed to get post revisions', error as Error);
    }
  }

  /**
   * Compare two revisions
   */
  async compareRevisions(
    postId: string,
    oldRevisionId: string,
    newRevisionId: string
  ): Promise<RevisionComparison> {
    try {
      // Get both revisions
      const [oldRevision, newRevision] = await Promise.all([
        this.prisma.postRevision.findUnique({
          where: { id: oldRevisionId },
          include: {
            author: { select: { id: true, name: true } }
          }
        }),
        this.prisma.postRevision.findUnique({
          where: { id: newRevisionId },
          include: {
            author: { select: { id: true, name: true } }
          }
        })
      ]);

      if (!oldRevision) {
        throw new PostRevisionNotFoundError(oldRevisionId);
      }

      if (!newRevision) {
        throw new PostRevisionNotFoundError(newRevisionId);
      }

      // Verify both revisions belong to the same post
      if (oldRevision.postId !== postId || newRevision.postId !== postId) {
        throw new Error('Revisions do not belong to the specified post');
      }

      // Generate comparison
      const changes = this.generateContentDiff(oldRevision.content, newRevision.content);
      const diffHtml = this.generateDiffHtml(oldRevision.content, newRevision.content);
      const statistics = this.calculateDiffStatistics(oldRevision.content, newRevision.content);

      return {
        oldRevision: {
          id: oldRevision.id,
          content: oldRevision.content,
          authorId: oldRevision.authorId,
          authorName: oldRevision.author.name,
          createdAt: oldRevision.createdAt,
          revisionNote: oldRevision.revisionNote
        },
        newRevision: {
          id: newRevision.id,
          content: newRevision.content,
          authorId: newRevision.authorId,
          authorName: newRevision.author.name,
          createdAt: newRevision.createdAt,
          revisionNote: newRevision.revisionNote
        },
        changes,
        diffHtml,
        statistics
      };

    } catch (error) {
      if (error instanceof PostRevisionNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to compare revisions', error as Error);
    }
  }

  /**
   * Compare current post content with a revision
   */
  async compareWithCurrent(postId: string, revisionId: string): Promise<RevisionComparison> {
    try {
      // Get current post content
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: { id: true, name: true } }
        }
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      // Get revision
      const revision = await this.prisma.postRevision.findUnique({
        where: { id: revisionId },
        include: {
          author: { select: { id: true, name: true } }
        }
      });

      if (!revision) {
        throw new PostRevisionNotFoundError(revisionId);
      }

      if (revision.postId !== postId) {
        throw new Error('Revision does not belong to the specified post');
      }

      // Generate comparison
      const changes = this.generateContentDiff(revision.content, post.content);
      const diffHtml = this.generateDiffHtml(revision.content, post.content);
      const statistics = this.calculateDiffStatistics(revision.content, post.content);

      return {
        oldRevision: {
          id: revision.id,
          content: revision.content,
          authorId: revision.authorId,
          authorName: revision.author.name,
          createdAt: revision.createdAt,
          revisionNote: revision.revisionNote
        },
        newRevision: {
          id: 'current',
          content: post.content,
          authorId: post.authorId,
          authorName: post.author.name,
          createdAt: post.updatedAt,
          revisionNote: null
        },
        changes,
        diffHtml,
        statistics
      };

    } catch (error) {
      if (error instanceof PostNotFoundError || error instanceof PostRevisionNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to compare with current version', error as Error);
    }
  }

  /**
   * Restore a post to a previous revision
   */
  async restoreRevision(request: RestoreRevisionRequest): Promise<any> {
    try {
      // Get the revision to restore
      const revision = await this.prisma.postRevision.findUnique({
        where: { id: request.revisionId },
        include: {
          post: { select: { id: true, title: true, content: true } }
        }
      });

      if (!revision) {
        throw new PostRevisionNotFoundError(request.revisionId);
      }

      if (revision.postId !== request.postId) {
        throw new Error('Revision does not belong to the specified post');
      }

      // Create a new revision with current content before restoring
      await this.createRevision({
        postId: request.postId,
        content: revision.post.content,
        authorId: request.authorId,
        revisionNote: `Auto-save before restore to revision ${request.revisionId}`
      });

      // Update post with revision content
      const updatedPost = await this.prisma.post.update({
        where: { id: request.postId },
        data: {
          content: revision.content,
          // Note: We're not updating the authorId as the original author should remain
        },
        include: {
          author: { select: { id: true, name: true } }
        }
      });

      // Create a new revision for the restore
      const restoreRevision = await this.createRevision({
        postId: request.postId,
        content: revision.content,
        authorId: request.authorId,
        revisionNote: `Restored from revision ${request.revisionId}${request.reason ? `: ${request.reason}` : ''}`
      });

      // Create audit log
      await this.auditService.log({
        action: 'POST_REVISION_RESTORED',
        entityType: 'Post',
        entityId: request.postId,
        userId: request.authorId,
        after: {
          restoredFromRevisionId: request.revisionId,
          newRevisionId: restoreRevision.id,
          reason: request.reason,
          postTitle: revision.post.title
        }
      });

      return {
        post: updatedPost,
        revision: restoreRevision,
        restoredFrom: {
          revisionId: request.revisionId,
          createdAt: revision.createdAt
        }
      };

    } catch (error) {
      if (error instanceof PostNotFoundError || error instanceof PostRevisionNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to restore revision', error as Error);
    }
  }

  /**
   * Generate a simple text diff between two content strings
   */
  private generateContentDiff(oldContent: string, newContent: string): {
    additions: string[];
    deletions: string[];
    modifications: string[];
  } {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const additions: string[] = [];
    const deletions: string[] = [];
    const modifications: string[] = [];

    // Simple line-by-line comparison
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine && !newLine) {
        deletions.push(oldLine);
      } else if (!oldLine && newLine) {
        additions.push(newLine);
      } else if (oldLine !== newLine) {
        modifications.push(`${oldLine} → ${newLine}`);
      }
    }

    return { additions, deletions, modifications };
  }

  /**
   * Generate HTML diff visualization
   */
  private generateDiffHtml(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    let html = '<div class="diff-container">';
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine && !newLine) {
        html += `<div class="diff-line diff-removed">- ${this.escapeHtml(oldLine)}</div>`;
      } else if (!oldLine && newLine) {
        html += `<div class="diff-line diff-added">+ ${this.escapeHtml(newLine)}</div>`;
      } else if (oldLine !== newLine) {
        html += `<div class="diff-line diff-removed">- ${this.escapeHtml(oldLine)}</div>`;
        html += `<div class="diff-line diff-added">+ ${this.escapeHtml(newLine)}</div>`;
      } else {
        html += `<div class="diff-line diff-unchanged">  ${this.escapeHtml(oldLine)}</div>`;
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Calculate diff statistics
   */
  private calculateDiffStatistics(oldContent: string, newContent: string): {
    charactersAdded: number;
    charactersRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
    changePercentage: number;
  } {
    const oldWords = oldContent.split(/\s+/).filter(w => w.length > 0);
    const newWords = newContent.split(/\s+/).filter(w => w.length > 0);
    
    const charactersAdded = Math.max(0, newContent.length - oldContent.length);
    const charactersRemoved = Math.max(0, oldContent.length - newContent.length);
    const wordsAdded = Math.max(0, newWords.length - oldWords.length);
    const wordsRemoved = Math.max(0, oldWords.length - newWords.length);
    
    const totalChanges = charactersAdded + charactersRemoved;
    const totalCharacters = Math.max(oldContent.length, newContent.length);
    const changePercentage = totalCharacters > 0 ? (totalChanges / totalCharacters) * 100 : 0;
    
    return {
      charactersAdded,
      charactersRemoved,
      wordsAdded,
      wordsRemoved,
      changePercentage: Math.round(changePercentage * 100) / 100
    };
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
