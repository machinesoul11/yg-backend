#!/usr/bin/env tsx

/**
 * Initialize Resend Email Optimization Features
 * 
 * Run this script after deploying the database migration to:
 * 1. Catalog personalization variables
 * 2. Schedule reputation monitoring job
 * 3. Verify all services are working
 */

import { prisma } from '../src/lib/db';
import { redis } from '../src/lib/redis';
import { personalizationService } from '../src/lib/services/email/personalization.service';
import { scheduleReputationMonitoring } from '../src/jobs/reputation-monitoring.job';
import { scheduleDeliverabilityMonitoring } from '../src/jobs/deliverability-monitoring.job';
import { emailReputationService } from '../src/lib/services/email/reputation.service';
import { emailDeliverabilityService } from '../src/lib/services/email/deliverability.service';

async function main() {
  console.log('🚀 Initializing Resend Email Optimization...\n');

  try {
    // 1. Test database connection
    console.log('1️⃣  Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected\n');

    // 2. Test Redis connection
    console.log('2️⃣  Testing Redis connection...');
    await redis.ping();
    console.log('✅ Redis connected\n');

    // 3. Catalog personalization variables
    console.log('3️⃣  Cataloging personalization variables...');
    await personalizationService.catalogVariables();
    const variables = await personalizationService.getAvailableVariables();
    console.log(`✅ Cataloged ${variables.length} personalization variables\n`);

    // 4. Schedule reputation monitoring
    console.log('4️⃣  Scheduling reputation monitoring job...');
    await scheduleReputationMonitoring();
    console.log('✅ Reputation monitoring scheduled (runs daily at 2 AM)\n');

    // 5. Schedule deliverability monitoring
    console.log('5️⃣  Scheduling deliverability monitoring job...');
    await scheduleDeliverabilityMonitoring();
    console.log('✅ Deliverability monitoring scheduled (runs hourly and daily)\n');

    // 6. Verify new tables exist
    console.log('6️⃣  Verifying database tables...');
    const tables = [
      'email_reputation_metrics',
      'domain_reputation_log',
      'email_tests',
      'email_test_assignments',
      'scheduled_emails',
      'email_personalization_variables',
      'email_campaign_analytics',
      'email_unsubscribe_log',
    ];

    for (const table of tables) {
      const result = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${table}'`
      );
      const exists = (result as any)[0].count === '1';
      if (exists) {
        console.log(`  ✅ ${table}`);
      } else {
        console.log(`  ❌ ${table} - MISSING!`);
      }
    }
    console.log('');

    // 7. Run initial reputation check
    const domain = process.env.RESEND_SENDER_DOMAIN || 'yesgoddess.com';
    console.log(`7️⃣  Running initial reputation check for ${domain}...`);
    await emailReputationService.calculateReputationMetrics(domain);
    const score = await emailReputationService.getCurrentReputationScore(domain);
    console.log(`✅ Current reputation score: ${score}/100\n`);

    // 8. Run initial deliverability check
    console.log('8️⃣  Running initial deliverability check...');
    const metrics = await emailDeliverabilityService.calculateMetrics('day');
    console.log(`✅ Deliverability metrics calculated:`);
    console.log(`   - Delivery Rate: ${(metrics.deliveryRate * 100).toFixed(2)}%`);
    console.log(`   - Bounce Rate: ${(metrics.bounceRate * 100).toFixed(2)}%`);
    console.log(`   - Complaint Rate: ${(metrics.complaintRate * 100).toFixed(4)}%\n`);

    // 9. Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Resend Email Optimization Initialized!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Next Steps:');
    console.log('1. Configure Resend webhook: https://api.yesgoddess.com/api/webhooks/resend');
    console.log('2. Enable events: sent, delivered, opened, clicked, bounced, complained');
    console.log('3. Enable tracking in Resend: trackOpens=true, trackClicks=true');
    console.log('4. Monitor deliverability alerts in admin notifications');
    console.log('5. Review engagement scores for campaign targeting\n');

    console.log('Documentation:');
    console.log('- Email Events Processing: docs/modules/email-campaigns/EMAIL_EVENTS_PROCESSING.md');
    console.log('- Quick Reference: docs/modules/email-campaigns/EMAIL_EVENTS_QUICK_REFERENCE.md');
    console.log('- Implementation Guide: docs/infrastructure/email/RESEND_OPTIMIZATION.md\n');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

main();
