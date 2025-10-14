/**
 * Migration Script: Copy services to offerings for existing listings
 * 
 * This script helps migrate existing listings that have services data
 * to the new offerings system. Run this once after deploying the changes.
 * 
 * Usage: node migration-script.js
 */

const mongoose = require('mongoose');
const Event = require('./src/models/schemas/Event');

async function migrateServicesToOfferings() {
  try {
    // Connect to your database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mehfil');
    console.log('Connected to database');

    // Find all events that have services but no offerings
    const eventsToMigrate = await Event.find({
      services: { $exists: true, $ne: [], $not: { $size: 0 } },
      $or: [
        { offerings: { $exists: false } },
        { offerings: { $size: 0 } }
      ]
    });

    console.log(`Found ${eventsToMigrate.length} events to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const event of eventsToMigrate) {
      try {
        // Copy services to offerings if offerings is empty
        if (!event.offerings || event.offerings.length === 0) {
          event.offerings = [...event.services];
          await event.save();
          migratedCount++;
          console.log(`Migrated event: ${event.name} (ID: ${event._id})`);
        } else {
          skippedCount++;
          console.log(`Skipped event: ${event.name} (already has offerings)`);
        }
      } catch (error) {
        console.error(`Error migrating event ${event._id}:`, error.message);
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`- Migrated: ${migratedCount} events`);
    console.log(`- Skipped: ${skippedCount} events`);
    console.log(`- Total processed: ${eventsToMigrate.length} events`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateServicesToOfferings();
}

module.exports = { migrateServicesToOfferings };
