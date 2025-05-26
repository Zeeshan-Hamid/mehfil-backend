# Mehfil - Event Planning Platform for Muslim & Desi Communities

## Overview
Mehfil is a comprehensive event planning platform designed specifically for Muslim and Desi communities. The platform connects event planners, vendors, and customers while respecting cultural preferences and requirements, including Halal certification verification.

## Tech Stack
- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcrypt
- **Validation**: express-validator

## Project Structure
```
mehfil/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   └── auth/
│   │       └── authController.js
│   ├── models/
│   │   ├── schemas/
│   │   │   └── User.js
│   │   └── User.js
│   ├── routes/
│   │   └── api/
│   │       ├── index.js
│   │       └── authRoutes.js
│   ├── validators/
│   │   └── authValidators.js
│   └── uploads/
│       ├── images/
│       ├── documents/
│       └── temp/
└── index.js
```

## Models

### User Model
The User model is designed to handle both customers and vendors with role-specific profiles.

#### Common Fields
- `email` (String, required, unique)
- `password` (String, required, min length: 8)
- `phoneNumber` (String, required)
- `role` (String, enum: ['customer', 'vendor', 'admin'])
- Authentication fields (authProvider, passwordReset, socialLogin)
- Verification fields (emailVerified, phoneVerified, twoFactorEnabled)

#### Customer Profile
- Personal Information
  - `fullName`
  - `gender`
  - `location` (city, state, country, zipCode)
  - `profileImage`
- Preferences
  - `eventTypes` (wedding, engagement, aqeeqah, etc.)
  - `budgetRange`
  - `preferredLanguages`
  - `genderPreference`
  - `culturalPreferences`
- `preferredVendors` (references to vendor profiles)

#### Vendor Profile
- Business Information
  - `businessName`
  - `ownerName`
  - `businessAddress`
  - `businessRegistration`
  - `timezone`
- Service Details
  - `primaryServiceCategory`
  - `serviceCategories`
  - `serviceDescription`
  - `experienceYears`
  - `serviceAreas`
- Halal Certification
  - `hasHalalCert`
  - `certificationFile`
  - `certificateNumber`
  - `status`
  - Verification details
- Portfolio
  - `images`
  - `videos`
  - `beforeAfterPhotos`
- Availability & Scheduling
  - Calendar with time slots
  - Working days and hours
  - Booking rules
- Pricing
  - `startingPrice`
  - `maxPrice`
  - `pricingType`
  - `packageDeals`
- Business Metrics
  - Ratings and reviews
  - Performance stats
  - Verification badges

## API Endpoints

### Authentication Routes
- `POST /api/auth/signup/customer` - Register a new customer
- `POST /api/auth/signup/vendor` - Register a new vendor
- `POST /api/auth/login` - User login

### Base Routes
- `GET /` - Welcome route with API information
- `GET /api/health` - Health check endpoint

## Setup & Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Available Scripts
- `npm start` - Run the production server
- `npm run dev` - Run the development server
- `npm run dev:watch` - Run the development server with file watching
- `npm test` - Run tests (to be implemented)

## Dependencies
```json
{
  "bcrypt": "^6.0.0",
  "cors": "^2.8.5",
  "crypto": "^1.0.1",
  "dotenv": "^16.5.0",
  "express": "^4.19.2",
  "express-validator": "^7.2.1",
  "jsonwebtoken": "^9.0.2",
  "mongodb": "^6.16.0",
  "mongoose": "^8.15.0",
  "nodemon": "^3.1.10"
}
```

## Security Features
- Password hashing using bcrypt
- JWT-based authentication
- Two-factor authentication support
- Secure password reset functionality
- Role-based access control

## Data Validation
- Input validation using express-validator
- Custom validation middleware for signup and login
- Mongoose schema-level validation

## File Upload Structure
- `/uploads/images` - For profile and portfolio images
- `/uploads/documents` - For business and certification documents
- `/uploads/temp` - For temporary file storage

## Contributing
Please read our contributing guidelines before submitting pull requests.

## License
ISC 