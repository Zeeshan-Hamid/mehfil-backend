/**
 * Migration Script: Add serviceArea field to existing events
 * 
 * This script adds the serviceArea field to all existing events in the database.
 * All existing events will be set to have serviceArea: { serviceAreaType: 'within_city' }
 * 
 * Usage: node migration-script-service-area.js
 */

const mongoose = require('mongoose');
const Event = require('./src/models/schemas/Event');

async function migrateServiceArea() {
  try {
    // Connect to your database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mehfil';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');

    // Find all events that don't have serviceArea field or have null/undefined serviceArea
    const eventsToMigrate = await Event.find({
      $or: [
        { serviceArea: { $exists: false } },
        { serviceArea: null },
        { 'serviceArea.serviceAreaType': { $exists: false } }
      ]
    });

    console.log(`Found ${eventsToMigrate.length} events to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const event of eventsToMigrate) {
      try {
        // Set serviceArea to default value
        event.serviceArea = {
          serviceAreaType: 'within_city'
        };
        
        // Fix any data issues before saving
        // Handle flatPrice that might be boolean instead of object
        if (event.flatPrice && typeof event.flatPrice === 'boolean') {
          event.flatPrice = undefined;
        }
        
        // Save without validation to avoid issues with other fields
        await event.save({ validateBeforeSave: false });
        migratedCount++;
        
        if (migratedCount % 100 === 0) {
          console.log(`Migrated ${migratedCount} events...`);
        }
      } catch (error) {
        console.error(`Error migrating event ${event._id}:`, error.message);
        errorCount++;
        
        // Try to update directly using updateOne as fallback
        try {
          await Event.updateOne(
            { _id: event._id },
            { $set: { serviceArea: { serviceAreaType: 'within_city' } } }
          );
          migratedCount++;
          errorCount--;
          console.log(`Successfully migrated event ${event._id} using direct update`);
        } catch (updateError) {
          console.error(`Failed to migrate event ${event._id} even with direct update:`, updateError.message);
        }
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total events found: ${eventsToMigrate.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);

    // Verify migration by counting events with serviceArea
    const eventsWithServiceArea = await Event.countDocuments({
      'serviceArea.serviceAreaType': { $exists: true }
    });
    const totalEvents = await Event.countDocuments();
    
    console.log(`\n=== Verification ===`);
    console.log(`Total events in database: ${totalEvents}`);
    console.log(`Events with serviceArea: ${eventsWithServiceArea}`);

    if (eventsWithServiceArea === totalEvents) {
      console.log('✓ All events have serviceArea field set');
    } else {
      console.log(`⚠ Warning: ${totalEvents - eventsWithServiceArea} events still missing serviceArea`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateServiceArea();
}

module.exports = { migrateServiceArea };

