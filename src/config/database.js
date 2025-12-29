const mongoose = require('mongoose');
const { getLogger } = require('./logging');

const logger = getLogger(__filename);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    logger.info(
      {
        event: 'database_connected',
        database: {
          host: conn.connection.host,
          name: conn.connection.name,
        },
      },
      `MongoDB Connected: ${conn.connection.host} | Database: ${conn.connection.name}`
    );
    
    mongoose.connection.on('error', (err) => {
      logger.error(
        {
          event: 'database_connection_error',
          error: {
            type: err?.constructor?.name || 'Error',
            message: err?.message || 'Unknown error',
            stack: err?.stack,
          },
        },
        'MongoDB connection error'
      );
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn(
        {
          event: 'database_disconnected',
        },
        'MongoDB disconnected'
      );
    });
    
    // just using this method for graceful shutdown and not show tons of errors
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        
        logger.info(
          {
            event: 'database_shutdown',
          },
          'Database connection closed gracefully'
        );
        process.exit(0);
      } catch (error) {
        logger.error(
          {
            event: 'database_shutdown_error',
            error: {
              type: error?.constructor?.name || 'Error',
              message: error?.message || 'Unknown error',
              stack: error?.stack,
            },
          },
          'Error during database disconnect'
        );
        process.exit(1);
      }
    });

  } catch (error) {
    logger.error(
      {
        event: 'database_connection_failed',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      `Database connection failed: ${error.message}`
    );
    process.exit(1);
  }
};

module.exports = connectDB; 
