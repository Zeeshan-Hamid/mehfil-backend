require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');

(async function run() {
  try {
    await connectDB();
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD in env');
      process.exit(1);
    }

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      
      process.exit(0);
    }

    const admin = await User.create({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      phoneNumber: ADMIN_PHONE || '0000000000',
      emailVerified: true,
      isActive: true,
    });

    
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed admin:', err);
    process.exit(1);
  } finally {
    try { await mongoose.connection.close(); } catch (_) {}
  }
})();


