const nodemailer = require('nodemailer');

// To use Gmail, you'll need to configure your Google account to allow access from less secure apps,
// or preferably, create an "App Password".
// For more details, visit: https://support.google.com/accounts/answer/185833
const emailConfig = {
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address (e.g., example@gmail.com)
    pass: process.env.EMAIL_PASSWORD, // Your Gmail App Password
  },
  // Connection pooling for better performance
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 14, // 14 emails per second (Gmail limit is 15/sec)
  // Connection timeout
  connectionTimeout: 60000, // 60 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 60000, // 60 seconds
};

const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to take our messages');
  }
});

module.exports = transporter; 