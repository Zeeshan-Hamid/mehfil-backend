const mongoose = require('mongoose');
const User = require('../models/User');
const ViewCount = require('../models/ViewCount');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function checkViewCount() {
  try {
    console.log('🔍 Checking view count for vendor...');
    
    const vendorId = '68b4556d3821f1dac688e289';
    
    // Get vendor info
    const vendor = await User.findById(vendorId).select('email vendorProfile.businessName vendorProfile.analytics');
    
    if (!vendor) {
      console.log('❌ Vendor not found');
      return;
    }
    
    console.log('👤 Vendor:', vendor.email);
    console.log('🏢 Business:', vendor.vendorProfile?.businessName || 'N/A');
    
    // Check analytics
    const analytics = vendor.vendorProfile?.analytics || {};
    const profileViews = analytics.profileViews || { total: 0, unique: 0, lastUpdated: null };
    
    console.log('📊 Current view count from analytics:');
    console.log(`   Total views: ${profileViews.total}`);
    console.log(`   Unique views: ${profileViews.unique}`);
    console.log(`   Last updated: ${profileViews.lastUpdated ? new Date(profileViews.lastUpdated).toISOString() : 'Never'}`);
    
    // Check raw view counts
    const rawViews = await ViewCount.find({ vendorId }).sort({ timestamp: -1 }).limit(10);
    
    console.log(`📊 Raw view records (last 10): ${rawViews.length}`);
    rawViews.forEach((view, index) => {
      console.log(`   ${index + 1}. userId: "${view.userId}" | ${view.viewerId ? 'Logged-in' : 'Anonymous'} - ${new Date(view.timestamp).toISOString()} - ${view.isUnique ? 'Unique' : 'Duplicate'}`);
    });
    
    // Count total unique views in raw data
    const uniqueViews = await ViewCount.countDocuments({ 
      vendorId, 
      isUnique: true 
    });
    
    console.log(`📊 Total unique views in raw data: ${uniqueViews}`);
    
  } catch (error) {
    console.error('💥 Error checking view count:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkViewCount();
