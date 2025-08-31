const nodemailer = require('nodemailer');

// Spacemail configuration
const emailConfig = {
  host: process.env.MAIL_SERVER, // mail.spacemail.com
  port: process.env.MAIL_PORT, // 465
  secure: process.env.MAIL_SSL_TLS === 'True', // true for SSL/TLS
  auth: {
    user: process.env.EMAIL_USER, // imran.khan@mehfil.app
    pass: process.env.EMAIL_PASSWORD, // Imranmehfil2025!
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