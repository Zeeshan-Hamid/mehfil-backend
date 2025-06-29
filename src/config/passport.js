const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = function(passport) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI,
        passReqToCallback: true,
        scope: ['openid', 'email', 'profile']
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists in our database
          let user = await User.findOne({ 'socialLogin.googleId': profile.id });

          if (user) {
            // User exists, log them in
            // Add profileCompleted to the response
            const userResponse = user.toObject();
            userResponse.profileCompleted = user.role === 'customer' ? 
              user.customerProfile.profileCompleted : 
              user.vendorProfile.profileCompleted;
            return done(null, userResponse);
          }

          // If not, check if they signed up with this email before
          user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            // User exists, link their Google account
            user.socialLogin.googleId = profile.id;
            user.authProvider = 'google';
            await user.save({ validateBeforeSave: false });
            // Add profileCompleted to the response
            const userResponse = user.toObject();
            userResponse.profileCompleted = user.role === 'customer' ? 
              user.customerProfile.profileCompleted : 
              user.vendorProfile.profileCompleted;
            return done(null, userResponse);
          }
          
          // If user doesn't exist, create a new one
          const role = req.query.state; // 'customer' or 'vendor'

          const newUser = new User({
            email: profile.emails[0].value,
            authProvider: 'google',
            socialLogin: { googleId: profile.id },
            role: role,
            emailVerified: true,
            phoneNumber: null,
          });

          if (role === 'customer') {
            newUser.customerProfile = {
              fullName: profile.displayName || '',
              gender: null,
              location: {
                city: null,
                state: null,
                country: null,
                zipCode: null
              },
              profileImage: profile.photos && profile.photos.length > 0 ? profile.photos[0].value.replace('?sz=50', '?sz=200') : null,
              preferences: {
                eventTypes: [],
                budgetRange: null,
                preferredLanguages: [],
                genderPreference: null,
                culturalPreferences: []
              },
              preferredVendors: [],
              profileCompleted: false // Initialize as false for new users
            };
          }

          if (role === 'vendor') {
            newUser.vendorProfile = {
              ownerName: profile.displayName || '',
              businessName: null,
              profileImage: profile.photos && profile.photos.length > 0 ? profile.photos[0].value.replace('?sz=50', '?sz=200') : null,
              businessAddress: {
                street: null,
                city: null,
                state: null,
                zipCode: null,
                country: null
              },
              timezone: null,
              geo: { type: 'Point', coordinates: [0, 0] }, // Default for system use
              serviceDescription: null,
              experienceYears: null,
              serviceCategories: [],
              languagesSpoken: [],
              serviceAreas: [],
              halalCertification: {
                hasHalalCert: false,
                status: 'unverified',
                renewalReminders: {},
                certificationFile: null,
                certificateNumber: null,
                expiryDate: null,
                issuingAuthority: null,
                verificationDate: null,
              },
              portfolio: {
                images: [],
                videos: [],
                description: null,
                beforeAfterPhotos: []
              },
              socialLinks: {},
              availability: {
                calendar: [],
                workingDays: [],
                workingHours: { start: null, end: null },
                advanceBookingDays: null,
                blackoutDates: []
              },
              bookingRules: {
                minNoticeHours: null,
                cancellationPolicy: null,
                depositRequired: null,
                depositPercentage: null,
                paymentTerms: null
              },
              pricing: {
                startingPrice: null,
                maxPrice: null,
                currency: 'USD',
                pricingType: null,
                packageDeals: []
              },
              paymentInfo: {},
              rating: {
                average: 0,
                totalReviews: 0,
                breakdown: { fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 }
              },
              approvalHistory: [],
              stats: {
                  totalBookings: 0,
                  completedBookings: 0,
                  cancelledBookings: 0,
                  responseTime: 0,
                  responseRate: 0,
                  repeatCustomers: 0
              },
              verifications: {
                  businessVerified: false,
                  backgroundCheckComplete: false,
                  insuranceVerified: false
              },
              team: [],
              tags: [],
              profileCompleted: false // Initialize as false for new users
            };
          }

          await newUser.save({ validateBeforeSave: false });
          // Add profileCompleted to the response
          const newUserResponse = newUser.toObject();
          newUserResponse.profileCompleted = role === 'customer' ? 
            newUser.customerProfile.profileCompleted : 
            newUser.vendorProfile.profileCompleted;
          done(null, newUserResponse);

        } catch (err) {
          console.error('Google Strategy Error:', err);
          done(err, false);
        }
      }
    )
  );
}; 