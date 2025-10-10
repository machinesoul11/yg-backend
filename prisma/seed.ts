#!/usr/bin/env tsx
/**
 * Database Seeding Script
 * 
 * Seeds the database with initial data for development/testing.
 * Run with: npm run db:seed
 */

import { PrismaClient, UserRole, IPType, LicenseStatus, RoyaltyType, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clear existing data (development only!)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Clearing existing data...');
    await prisma.payment.deleteMany();
    await prisma.royalty.deleteMany();
    await prisma.license.deleteMany();
    await prisma.iPFile.deleteMany();
    await prisma.intellectualProperty.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.talent.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    console.log('✓ Cleared existing data\n');
  }

  // Create admin user
  console.log('Creating admin user...');
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@yesgoddess.com',
      name: 'Platform Admin',
      role: UserRole.ADMIN,
      isActive: true,
      lastLoginAt: new Date(),
    },
  });
  console.log(`✓ Created admin: ${adminUser.email}\n`);

  // Create talent users
  console.log('Creating talent users...');
  const talents = await Promise.all([
    prisma.user.create({
      data: {
        email: 'photographer@example.com',
        name: 'Sarah Chen',
        role: UserRole.TALENT,
        isActive: true,
        talent: {
          create: {
            stageName: 'Sarah Chen Photography',
            bio: 'Professional portrait and fashion photographer with 10+ years experience.',
            socialMediaLinks: {
              instagram: 'https://instagram.com/sarahchen',
              twitter: 'https://twitter.com/sarahchen',
            },
            categories: ['photography', 'portrait', 'fashion'],
            isVerified: true,
            rating: 4.8,
          },
        },
      },
      include: { talent: true },
    }),
    prisma.user.create({
      data: {
        email: 'videographer@example.com',
        name: 'Marcus Williams',
        role: UserRole.TALENT,
        isActive: true,
        talent: {
          create: {
            stageName: 'Marcus Film Productions',
            bio: 'Award-winning videographer specializing in commercial and brand content.',
            socialMediaLinks: {
              instagram: 'https://instagram.com/marcusfilm',
              website: 'https://marcusfilm.com',
            },
            categories: ['videography', 'commercial', 'brand-content'],
            isVerified: true,
            rating: 4.9,
          },
        },
      },
      include: { talent: true },
    }),
    prisma.user.create({
      data: {
        email: 'artist@example.com',
        name: 'Elena Rodriguez',
        role: UserRole.TALENT,
        isActive: true,
        talent: {
          create: {
            stageName: 'Elena Art Studio',
            bio: 'Digital artist and illustrator for brands and editorial.',
            socialMediaLinks: {
              instagram: 'https://instagram.com/elenaart',
              website: 'https://elenaart.com',
            },
            categories: ['illustration', 'digital-art', 'branding'],
            isVerified: false, // Pending verification
            rating: 0,
          },
        },
      },
      include: { talent: true },
    }),
  ]);
  console.log(`✓ Created ${talents.length} talents\n`);

  // Create brand users
  console.log('Creating brand users...');
  const brands = await Promise.all([
    prisma.user.create({
      data: {
        email: 'brand@fashionco.com',
        name: 'Fashion Co Team',
        role: UserRole.BRAND,
        isActive: true,
        brand: {
          create: {
            companyName: 'Fashion Co',
            industry: 'Fashion & Apparel',
            website: 'https://fashionco.com',
            description: 'Leading sustainable fashion brand focused on ethical production.',
            isVerified: true,
          },
        },
      },
      include: { brand: true },
    }),
    prisma.user.create({
      data: {
        email: 'brand@techstartup.com',
        name: 'TechStartup Marketing',
        role: UserRole.BRAND,
        isActive: true,
        brand: {
          create: {
            companyName: 'TechStartup Inc',
            industry: 'Technology',
            website: 'https://techstartup.com',
            description: 'Innovative SaaS platform for modern businesses.',
            isVerified: true,
          },
        },
      },
      include: { brand: true },
    }),
  ]);
  console.log(`✓ Created ${brands.length} brands\n`);

  // Create IP assets
  console.log('Creating IP assets...');
  const ipAssets = await Promise.all([
    prisma.intellectualProperty.create({
      data: {
        name: 'Urban Fashion Collection 2024',
        description: 'Professional photoshoot featuring sustainable urban fashion',
        type: IPType.IMAGE,
        category: 'Fashion Photography',
        tags: ['fashion', 'urban', 'sustainable', 'portraits'],
        talentId: talents[0].talent!.id,
        isActive: true,
        metadata: {
          resolution: '6000x4000',
          format: 'RAW + JPEG',
          count: 150,
        },
        files: {
          create: [
            {
              url: 'https://storage.example.com/photos/urban-fashion-001.jpg',
              type: 'image',
              size: 8500000,
              originalName: 'urban-fashion-001.jpg',
              mimeType: 'image/jpeg',
            },
          ],
        },
      },
    }),
    prisma.intellectualProperty.create({
      data: {
        name: 'Brand Story Video Series',
        description: 'Cinematic brand storytelling video content',
        type: IPType.VIDEO,
        category: 'Commercial Videography',
        tags: ['video', 'commercial', 'storytelling', 'brand'],
        talentId: talents[1].talent!.id,
        isActive: true,
        metadata: {
          duration: 120,
          resolution: '4K',
          format: 'MP4',
        },
        files: {
          create: [
            {
              url: 'https://storage.example.com/videos/brand-story-v1.mp4',
              type: 'video',
              size: 450000000,
              originalName: 'brand-story-v1.mp4',
              mimeType: 'video/mp4',
            },
          ],
        },
      },
    }),
  ]);
  console.log(`✓ Created ${ipAssets.length} IP assets\n`);

  // Create licenses
  console.log('Creating licenses...');
  const licenses = await Promise.all([
    prisma.license.create({
      data: {
        title: 'Social Media Campaign License - Fashion Co',
        description: 'License for using urban fashion photos in social media campaigns',
        status: LicenseStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        terms: 'Usage limited to Instagram, Facebook, and TikTok posts. No print media.',
        royaltyRate: 15.00,
        royaltyType: RoyaltyType.PERCENTAGE,
        totalValue: 5000.00,
        talentId: talents[0].talent!.id,
        brandId: brands[0].brand!.id,
        ipId: ipAssets[0].id,
      },
    }),
    prisma.license.create({
      data: {
        title: 'Website & Digital License - TechStartup',
        description: 'License for brand story video on website and digital ads',
        status: LicenseStatus.ACTIVE,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2025-01-31'),
        terms: 'Usage for website hero section and digital advertising campaigns.',
        royaltyRate: 2500.00,
        royaltyType: RoyaltyType.FIXED,
        totalValue: 10000.00,
        talentId: talents[1].talent!.id,
        brandId: brands[1].brand!.id,
        ipId: ipAssets[1].id,
      },
    }),
  ]);
  console.log(`✓ Created ${licenses.length} licenses\n`);

  // Create royalties
  console.log('Creating royalties...');
  const royalties = await Promise.all([
    prisma.royalty.create({
      data: {
        licenseId: licenses[0].id,
        amount: 750.00,
        currency: 'USD',
        period: 'MONTHLY',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
        status: PaymentStatus.COMPLETED,
        paidAt: new Date('2024-02-05'),
        talentId: talents[0].talent!.id,
      },
    }),
    prisma.royalty.create({
      data: {
        licenseId: licenses[0].id,
        amount: 750.00,
        currency: 'USD',
        period: 'MONTHLY',
        periodStart: new Date('2024-02-01'),
        periodEnd: new Date('2024-02-29'),
        status: PaymentStatus.PENDING,
        talentId: talents[0].talent!.id,
      },
    }),
  ]);
  console.log(`✓ Created ${royalties.length} royalties\n`);

  // Create payments
  console.log('Creating payments...');
  const payments = await Promise.all([
    prisma.payment.create({
      data: {
        amount: 5000.00,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        paymentMethod: 'stripe',
        stripePaymentIntentId: 'pi_test_1234567890',
        licenseId: licenses[0].id,
        brandId: brands[0].brand!.id,
        paidAt: new Date('2024-01-15'),
      },
    }),
    prisma.payment.create({
      data: {
        amount: 10000.00,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        paymentMethod: 'stripe',
        stripePaymentIntentId: 'pi_test_0987654321',
        licenseId: licenses[1].id,
        brandId: brands[1].brand!.id,
        paidAt: new Date('2024-02-10'),
      },
    }),
  ]);
  console.log(`✓ Created ${payments.length} payments\n`);

  // Create analytics events
  console.log('Creating analytics events...');
  const events = [];
  for (let i = 0; i < 50; i++) {
    events.push(
      prisma.analyticsEvent.create({
        data: {
          type: ['page_view', 'license_created', 'ip_uploaded', 'payment_completed'][Math.floor(Math.random() * 4)],
          userId: [adminUser.id, ...talents.map(t => t.id), ...brands.map(b => b.id)][Math.floor(Math.random() * 6)],
          metadata: {
            source: 'web',
            userAgent: 'Mozilla/5.0...',
          },
          timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random time in last 30 days
        },
      })
    );
  }
  await Promise.all(events);
  console.log(`✓ Created ${events.length} analytics events\n`);

  // Update aggregated data
  console.log('Updating aggregated data...');
  await prisma.talent.update({
    where: { id: talents[0].talent!.id },
    data: { totalEarnings: 750.00 },
  });
  await prisma.brand.update({
    where: { id: brands[0].brand!.id },
    data: { totalSpent: 5000.00 },
  });
  await prisma.brand.update({
    where: { id: brands[1].brand!.id },
    data: { totalSpent: 10000.00 },
  });
  console.log('✓ Updated aggregated data\n');

  console.log('='.repeat(60));
  console.log('✓ Database seeding completed successfully!\n');
  console.log('Summary:');
  console.log(`  Users: ${await prisma.user.count()}`);
  console.log(`  Talents: ${await prisma.talent.count()}`);
  console.log(`  Brands: ${await prisma.brand.count()}`);
  console.log(`  IP Assets: ${await prisma.intellectualProperty.count()}`);
  console.log(`  Licenses: ${await prisma.license.count()}`);
  console.log(`  Royalties: ${await prisma.royalty.count()}`);
  console.log(`  Payments: ${await prisma.payment.count()}`);
  console.log(`  Analytics Events: ${await prisma.analyticsEvent.count()}`);
  console.log('='.repeat(60) + '\n');

  console.log('Login credentials:');
  console.log('  Admin:        admin@yesgoddess.com');
  console.log('  Photographer: photographer@example.com');
  console.log('  Videographer: videographer@example.com');
  console.log('  Artist:       artist@example.com');
  console.log('  Brand 1:      brand@fashionco.com');
  console.log('  Brand 2:      brand@techstartup.com');
  console.log('\n');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
