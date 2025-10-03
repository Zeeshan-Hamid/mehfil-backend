const nodemailer = require('nodemailer');
require('dotenv').config();

// Spacemail configuration
const emailConfig = {
  host: process.env.MAIL_SERVER, // mail.spacemail.com
  port: parseInt(process.env.MAIL_PORT), // 465
  secure: process.env.MAIL_SSL_TLS === 'True', // true for SSL/TLS
  auth: {
    user: process.env.EMAIL_USER, // info@mehfil.app
    pass: process.env.EMAIL_PASSWORD, // Infomehfil2025!
  },
  // Connection pooling for better performance
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 14, // 14 emails per second
  // Connection timeout
  connectionTimeout: 60000, // 60 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 60000, // 60 seconds
};

// Debug: Log email configuration
console.log('📧 Email Configuration:');
console.log('  Host:', process.env.MAIL_SERVER);
console.log('  Port:', process.env.MAIL_PORT);
console.log('  SSL/TLS:', process.env.MAIL_SSL_TLS);
console.log('  User:', process.env.EMAIL_USER);
console.log('  Admin Email:', process.env.ADMIN_NOTIFICATION_EMAIL);

const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

module.exports = transporter; 