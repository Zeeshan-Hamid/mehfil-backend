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
};

const transporter = nodemailer.createTransport(emailConfig);

module.exports = transporter; 