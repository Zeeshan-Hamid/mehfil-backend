const cron = require('node-cron');
const viewTrackingService = require('./viewTrackingService');

class CronService {
  constructor() {
    this.jobs = new Map();
  }

  // Initialize all cron jobs
  init() {
    const initTimestamp = new Date().toISOString();
    // Initializing cron jobs
    
    // Daily view count aggregation at 2 AM
    this.scheduleViewCountAggregation();
    
    // Cron jobs initialized
  }

  // Schedule daily view count aggregation
  scheduleViewCountAggregation() {
    // Run daily at 2 AM UTC
    const job = cron.schedule('0 2 * * *', async () => {
      const timestamp = new Date().toISOString();
      // Running daily view count aggregation
      try {
        const result = await viewTrackingService.aggregateViewCounts();
        if (result.success) {
          // Daily aggregation completed
        } else {
          // Daily aggregation failed
        }
      } catch (error) {
        // Error in daily aggregation
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.set('viewCountAggregation', job);
    const initTimestamp = new Date().toISOString();
    // Scheduled daily view count aggregation for 2:00 AM UTC
  }

  // Manually trigger view count aggregation (for testing)
  async triggerViewCountAggregation() {
    // Manually triggering view count aggregation
    try {
      const result = await viewTrackingService.aggregateViewCounts();
      if (result.success) {
        // Manual aggregation completed
        return result;
      } else {
        // Manual aggregation failed
        return result;
      }
    } catch (error) {
      // Error in manual aggregation
      return { success: false, error: error.message };
    }
  }

  // Stop all cron jobs
  stop() {
    // Stopping all cron jobs
    this.jobs.forEach((job, name) => {
      job.stop();
      // Stopped job
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
