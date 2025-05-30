const nodemailer = require('nodemailer');

const emailConfig = {
  // For development, using Mailtrap
  host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
  port: process.env.EMAIL_PORT || 2525,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
};

const transporter = nodemailer.createTransport(emailConfig);

module.exports = transporter; 