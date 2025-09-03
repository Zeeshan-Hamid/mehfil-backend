const cron = require('node-cron');
const viewTrackingService = require('./viewTrackingService');

class CronService {
  constructor() {
    this.jobs = new Map();
  }

  // Initialize all cron jobs
  init() {
    const initTimestamp = new Date().toISOString();
    console.log(`🕐 [${initTimestamp}] Initializing cron jobs...`);
    
    // Daily view count aggregation at 2 AM
    this.scheduleViewCountAggregation();
    
    console.log(`✅ [${initTimestamp}] Cron jobs initialized`);
  }

  // Schedule daily view count aggregation
  scheduleViewCountAggregation() {
    // Run daily at 2 AM UTC
    const job = cron.schedule('0 2 * * *', async () => {
      const timestamp = new Date().toISOString();
      console.log(`🕐 [${timestamp}] 🔄 Running daily view count aggregation...`);
      try {
        const result = await viewTrackingService.aggregateViewCounts();
        if (result.success) {
          console.log(`✅ [${timestamp}] Daily aggregation completed. Updated ${result.updatedVendors} vendors`);
        } else {
          console.error(`❌ [${timestamp}] Daily aggregation failed:`, result.error);
        }
      } catch (error) {
        console.error(`💥 [${timestamp}] Error in daily aggregation:`, error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.set('viewCountAggregation', job);
    const initTimestamp = new Date().toISOString();
    console.log(`📅 [${initTimestamp}] Scheduled daily view count aggregation for 2:00 AM UTC`);
  }

  // Manually trigger view count aggregation (for testing)
  async triggerViewCountAggregation() {
    console.log('🔄 Manually triggering view count aggregation...');
    try {
      const result = await viewTrackingService.aggregateViewCounts();
      if (result.success) {
        console.log(`✅ Manual aggregation completed. Updated ${result.updatedVendors} vendors`);
        return result;
      } else {
        console.error('❌ Manual aggregation failed:', result.error);
        return result;
      }
    } catch (error) {
      console.error('💥 Error in manual aggregation:', error);
      return { success: false, error: error.message };
    }
  }

  // Stop all cron jobs
  stop() {
    console.log('🛑 Stopping all cron jobs...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    });
    this.jobs.clear();
  }

  // Get status of all jobs
  getStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        nextDate: job.nextDate()
      };
    });
    return status;
  }
}

module.exports = new CronService();
