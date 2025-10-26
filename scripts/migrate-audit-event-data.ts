/**
 * Data Migration Script: Audit Event Data Migration
 * 
 * Migrates existing audit event data to new column structure
 * Maps legacy columns to new enhanced columns
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAuditEventData() {
  console.log('Starting audit event data migration...\n');

  try {
    // Get all audit events that need migration
    const events = await prisma.$queryRaw<any[]>`
      SELECT id, "user_id", "entity_type", "entity_id", "before_json", "after_json", "ip_address", "user_agent", "request_id"
      FROM audit_events
      WHERE entity_type = '' OR entity_id = ''
    `;

    console.log(`Found ${events.length} audit events to migrate`);

    if (events.length === 0) {
      console.log('No migration needed - all data is already in the new format');
      return;
    }

    let migrated = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Update the event with migrated data
        await prisma.$executeRaw`
          UPDATE audit_events
          SET
            entity_type = COALESCE(NULLIF(entity_type, ''), 'OTHER'),
            entity_id = COALESCE(NULLIF(entity_id, ''), id),
            before_state = before_json,
            after_state = after_json,
            session_id = NULL,
            metadata = NULL,
            previous_log_hash = NULL
          WHERE id = ${event.id}
        `;

        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`Migrated ${migrated} events...`);
        }
      } catch (error) {
        console.error(`Error migrating event ${event.id}:`, error);
        errors++;
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`- Successfully migrated: ${migrated}`);
    console.log(`- Errors: ${errors}`);
    console.log(`- Total: ${events.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateAuditEventData()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateAuditEventData };
