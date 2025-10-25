#!/usr/bin/env tsx
/**
 * Creator Database Seeding Script
 * 
 * Seeds the database with Creator profiles for development/testing.
 * Run with: npx tsx prisma/seed-creators.ts
 */

import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Use direct connection instead of pooled
    },
  },
});

async function main() {
  console.log('🌱 Seeding Creator data...\n');

  // Check if creators already exist
  const existingCount = await prisma.creator.count();
  if (existingCount > 0) {
    console.log(`⚠️  Found ${existingCount} existing creators. Skipping seed (run in fresh DB or delete manually).\n`);
    return;
  }

  // Default password for all seed users
  const defaultPassword = await hash('password123', 10);

  // Create creator users with profiles
  console.log('Creating creator profiles...');
  
  const creators = await Promise.all([
    // Creator 1: Sophia Martinez - Vocalist
    prisma.user.create({
      data: {
        email: 'sophia@yesgoddess.agency',
        name: 'Sophia Martinez',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Sophia Martinez',
            bio: 'Award-winning vocalist and songwriter specializing in R&B, soul, and contemporary pop. Featured on multiple Billboard charts with over 500M streams.',
            specialties: ['Vocalist', 'Songwriter', 'R&B', 'Soul', 'Pop'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2024-01-15'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/sophia',
            availability: {
              status: 'available',
              hoursPerWeek: 20,
              nextAvailable: null,
            },
            performanceMetrics: {
              totalCollaborations: 47,
              totalRevenue: 250000,
              averageRating: 4.9,
              recentActivityScore: 95,
              responseTimeHours: 2,
            },
            socialLinks: {
              instagram: 'https://instagram.com/sophiamartinez',
              twitter: 'https://twitter.com/sophiamartinez',
              website: 'https://sophiamartinez.com',
            },
          },
        },
      },
    }),

    // Creator 2: Marcus Chen - Producer
    prisma.user.create({
      data: {
        email: 'marcus@yesgoddess.agency',
        name: 'Marcus Chen',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Marcus Chen',
            bio: 'Producer and mixing engineer with 15+ years experience. Specialized in hip-hop, trap, and electronic music production. Credits include major label artists.',
            specialties: ['Producer', 'Audio Engineer', 'Hip-Hop', 'Trap', 'Electronic'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2023-12-10'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/marcus',
            availability: {
              status: 'limited',
              hoursPerWeek: 10,
              nextAvailable: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
            },
            performanceMetrics: {
              totalCollaborations: 89,
              totalRevenue: 480000,
              averageRating: 4.8,
              recentActivityScore: 88,
              responseTimeHours: 4,
            },
            socialLinks: {
              instagram: 'https://instagram.com/marcuschen',
              soundcloud: 'https://soundcloud.com/marcuschen',
            },
          },
        },
      },
    }),

    // Creator 3: Luna Rose - Composer
    prisma.user.create({
      data: {
        email: 'luna@yesgoddess.agency',
        name: 'Luna Rose',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Luna Rose',
            bio: 'Multi-instrumentalist and composer creating ethereal soundscapes. Specializing in film scores, ambient music, and experimental compositions.',
            specialties: ['Composer', 'Multi-Instrumentalist', 'Film Score', 'Ambient', 'Experimental'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2024-02-20'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/luna',
            availability: {
              status: 'available',
              hoursPerWeek: 30,
              nextAvailable: null,
            },
            performanceMetrics: {
              totalCollaborations: 34,
              totalRevenue: 180000,
              averageRating: 5.0,
              recentActivityScore: 98,
              responseTimeHours: 1,
            },
            socialLinks: {
              website: 'https://lunarose.music',
              spotify: 'https://spotify.com/artist/lunarose',
            },
          },
        },
      },
    }),

    // Creator 4: DJ Apex - EDM Producer
    prisma.user.create({
      data: {
        email: 'djapex@yesgoddess.agency',
        name: 'Alex Thompson',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'DJ Apex',
            bio: 'Electronic music producer and DJ known for high-energy festival sets. Expertise in EDM, house, and techno with releases on major electronic labels.',
            specialties: ['DJ', 'Producer', 'EDM', 'House', 'Techno'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2024-03-05'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/djapex',
            availability: {
              status: 'limited',
              hoursPerWeek: 15,
              nextAvailable: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
            },
            performanceMetrics: {
              totalCollaborations: 56,
              totalRevenue: 320000,
              averageRating: 4.7,
              recentActivityScore: 85,
              responseTimeHours: 6,
            },
            socialLinks: {
              instagram: 'https://instagram.com/djapex',
              soundcloud: 'https://soundcloud.com/djapex',
              youtube: 'https://youtube.com/djapex',
            },
          },
        },
      },
    }),

    // Creator 5: Amara Johnson - Guitarist
    prisma.user.create({
      data: {
        email: 'amara@yesgoddess.agency',
        name: 'Amara Johnson',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Amara Johnson',
            bio: 'Session guitarist and music director with expertise in jazz, funk, and fusion. Toured internationally with Grammy-winning artists.',
            specialties: ['Guitarist', 'Music Director', 'Jazz', 'Funk', 'Fusion'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2023-11-30'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/amara',
            availability: {
              status: 'available',
              hoursPerWeek: 25,
              nextAvailable: null,
            },
            performanceMetrics: {
              totalCollaborations: 71,
              totalRevenue: 290000,
              averageRating: 4.9,
              recentActivityScore: 92,
              responseTimeHours: 3,
            },
            socialLinks: {
              instagram: 'https://instagram.com/amarajohnson',
              website: 'https://amarajohnson.com',
            },
          },
        },
      },
    }),

    // Creator 6: Phoenix Beats - Beatmaker
    prisma.user.create({
      data: {
        email: 'phoenix@yesgoddess.agency',
        name: 'Phoenix Chen',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Phoenix Beats',
            bio: 'Beatmaker and sound designer pushing boundaries in lo-fi, boom bap, and experimental hip-hop. Featured in Spotify editorial playlists.',
            specialties: ['Beatmaker', 'Sound Designer', 'Lo-Fi', 'Boom Bap', 'Hip-Hop'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2024-01-25'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/phoenix',
            availability: {
              status: 'available',
              hoursPerWeek: 35,
              nextAvailable: null,
            },
            performanceMetrics: {
              totalCollaborations: 42,
              totalRevenue: 195000,
              averageRating: 4.8,
              recentActivityScore: 90,
              responseTimeHours: 2,
            },
            socialLinks: {
              instagram: 'https://instagram.com/phoenixbeats',
              soundcloud: 'https://soundcloud.com/phoenixbeats',
              spotify: 'https://spotify.com/artist/phoenixbeats',
            },
          },
        },
      },
    }),

    // Creator 7: Isabella Rivera - Photographer (Pending)
    prisma.user.create({
      data: {
        email: 'isabella@example.com',
        name: 'Isabella Rivera',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Isabella Rivera Photography',
            bio: 'Fashion and portrait photographer with a unique creative vision.',
            specialties: ['Photography', 'Fashion', 'Portrait', 'Editorial'],
            verificationStatus: 'pending',
            verifiedAt: null,
            onboardingStatus: 'in_progress',
            portfolioUrl: 'https://example.com/isabella',
            availability: {
              status: 'available',
              hoursPerWeek: 20,
            },
            performanceMetrics: {
              totalCollaborations: 0,
              totalRevenue: 0,
              averageRating: 0,
              recentActivityScore: 0,
            },
          },
        },
      },
    }),

    // Creator 8: Kai Washington - Videographer
    prisma.user.create({
      data: {
        email: 'kai@yesgoddess.agency',
        name: 'Kai Washington',
        password_hash: defaultPassword,
        role: UserRole.CREATOR,
        isActive: true,
        email_verified: new Date(),
        creator: {
          create: {
            stageName: 'Kai Visual',
            bio: 'Cinematographer and video editor specializing in music videos, documentaries, and branded content. 10+ years in the industry.',
            specialties: ['Videography', 'Cinematography', 'Editing', 'Music Videos', 'Documentary'],
            verificationStatus: 'approved',
            verifiedAt: new Date('2024-04-10'),
            onboardingStatus: 'completed',
            portfolioUrl: 'https://example.com/kai',
            availability: {
              status: 'available',
              hoursPerWeek: 30,
            },
            performanceMetrics: {
              totalCollaborations: 38,
              totalRevenue: 215000,
              averageRating: 4.9,
              recentActivityScore: 93,
              responseTimeHours: 2,
            },
            socialLinks: {
              instagram: 'https://instagram.com/kaivisual',
              vimeo: 'https://vimeo.com/kaivisual',
              website: 'https://kaivisual.com',
            },
          },
        },
      },
    }),
  ]);

  console.log(`✓ Created ${creators.length} creator profiles\n`);

  console.log('='.repeat(60));
  console.log('✓ Creator seeding completed successfully!\n');
  console.log('Summary:');
  console.log(`  Total Creators: ${await prisma.creator.count()}`);
  console.log(`  Approved Creators: ${await prisma.creator.count({ where: { verificationStatus: 'approved' } })}`);
  console.log(`  Pending Creators: ${await prisma.creator.count({ where: { verificationStatus: 'pending' } })}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('📧 Login credentials (all use password: password123):');
  creators.forEach((c) => {
    console.log(`  ${c.email}`);
  });
  console.log('\n');
}

main()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
