const request = require('supertest');
const mongoose = require('mongoose');
// Try to load app from index.js, fallback to src/app if it exists
let app;
try {
  app = require('../index');
} catch (e) {
  app = require('../src/app');
}
const Event = require('../src/models/schemas/Event');
const User = require('../src/models/User');
const jwt = require('jsonwebtoken');

describe('Event Service Area', () => {
  let vendor;
  let vendorToken;
  let testEvent;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mehfil-test');
    }
  });

  beforeEach(async () => {
    // Create a test vendor
    vendor = await User.create({
      email: 'vendor@test.com',
      password: 'password123',
      phoneNumber: '+1234567890',
      role: 'vendor',
      emailVerified: true,
      vendorProfile: {
        businessName: 'Test Vendor',
        ownerName: 'Test Owner',
        businessAddress: {
          zipCode: '12345'
        }
      }
    });

    // Generate JWT token for vendor
    vendorToken = jwt.sign({ userId: vendor._id }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '7d'
    });

    // Create a test event
    testEvent = await Event.create({
      vendor: vendor._id,
      name: 'Test Event',
      category: 'Photography',
      description: 'Test description',
      imageUrls: ['https://example.com/image.jpg'],
      location: {
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'United States'
      },
      packages: [{
        name: 'Basic Package',
        price: 100,
        includes: ['Photo session']
      }]
    });
  });

  afterEach(async () => {
    // Clean up
    await Event.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    // Close database connection
    await mongoose.connection.close();
  });

  describe('Model Validation', () => {
    it('should set default serviceAreaType to "within_city" when not provided', async () => {
      const event = await Event.create({
        vendor: vendor._id,
        name: 'Test Event 2',
        category: 'Photography',
        description: 'Test description',
        imageUrls: ['https://example.com/image.jpg'],
        location: {
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        }
      });

      expect(event.serviceArea).toBeDefined();
      expect(event.serviceArea.serviceAreaType).toBe('within_city');
      expect(event.serviceArea.serviceAreaMiles).toBeUndefined();
    });

    it('should accept valid serviceAreaType enum values', async () => {
      const validTypes = ['miles', 'within_city', 'within_state', 'within_whole_usa'];
      
      for (const type of validTypes) {
        const event = await Event.create({
          vendor: vendor._id,
          name: `Test Event ${type}`,
          category: 'Photography',
          description: 'Test description',
          imageUrls: ['https://example.com/image.jpg'],
          location: {
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'United States'
          },
          serviceArea: {
            serviceAreaType: type,
            ...(type === 'miles' ? { serviceAreaMiles: 10 } : {})
          }
        });

        expect(event.serviceArea.serviceAreaType).toBe(type);
      }
    });

    it('should reject invalid serviceAreaType enum values', async () => {
      await expect(
        Event.create({
          vendor: vendor._id,
          name: 'Test Event Invalid',
          category: 'Photography',
          description: 'Test description',
          imageUrls: ['https://example.com/image.jpg'],
          location: {
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'United States'
          },
          serviceArea: {
            serviceAreaType: 'invalid_type'
          }
        })
      ).rejects.toThrow();
    });

    it('should require serviceAreaMiles when serviceAreaType is "miles"', async () => {
      await expect(
        Event.create({
          vendor: vendor._id,
          name: 'Test Event Miles',
          category: 'Photography',
          description: 'Test description',
          imageUrls: ['https://example.com/image.jpg'],
          location: {
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'United States'
          },
          serviceArea: {
            serviceAreaType: 'miles'
            // serviceAreaMiles is missing
          }
        })
      ).rejects.toThrow();
    });

    it('should validate serviceAreaMiles minimum value', async () => {
      await expect(
        Event.create({
          vendor: vendor._id,
          name: 'Test Event Miles',
          category: 'Photography',
          description: 'Test description',
          imageUrls: ['https://example.com/image.jpg'],
          location: {
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'United States'
          },
          serviceArea: {
            serviceAreaType: 'miles',
            serviceAreaMiles: 0 // Invalid: less than 1
          }
        })
      ).rejects.toThrow();
    });

    it('should accept valid serviceAreaMiles when type is "miles"', async () => {
      const event = await Event.create({
        vendor: vendor._id,
        name: 'Test Event Miles',
        category: 'Photography',
        description: 'Test description',
        imageUrls: ['https://example.com/image.jpg'],
        location: {
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        },
        serviceArea: {
          serviceAreaType: 'miles',
          serviceAreaMiles: 15
        }
      });

      expect(event.serviceArea.serviceAreaType).toBe('miles');
      expect(event.serviceArea.serviceAreaMiles).toBe(15);
    });

    it('should clear serviceAreaMiles when type is not "miles"', async () => {
      const event = await Event.create({
        vendor: vendor._id,
        name: 'Test Event Clear',
        category: 'Photography',
        description: 'Test description',
        imageUrls: ['https://example.com/image.jpg'],
        location: {
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        },
        serviceArea: {
          serviceAreaType: 'within_city',
          serviceAreaMiles: 10 // Should be cleared
        }
      });

      expect(event.serviceArea.serviceAreaType).toBe('within_city');
      expect(event.serviceArea.serviceAreaMiles).toBeUndefined();
    });

    it('should allow updating serviceArea on existing events', async () => {
      testEvent.serviceArea = {
        serviceAreaType: 'within_state',
        serviceAreaMiles: undefined
      };
      await testEvent.save();

      const updatedEvent = await Event.findById(testEvent._id);
      expect(updatedEvent.serviceArea.serviceAreaType).toBe('within_state');
      expect(updatedEvent.serviceArea.serviceAreaMiles).toBeUndefined();
    });
  });

  describe('API Integration Tests', () => {
    it('POST /api/events should accept serviceArea object', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('name', 'API Test Event')
        .field('category', 'Photography')
        .field('description', 'Test description')
        .field('location', JSON.stringify({
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        }))
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'within_state'
        }))
        .attach('images', Buffer.from('fake image'), 'test.jpg');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.event.serviceArea).toBeDefined();
      expect(res.body.data.event.serviceArea.serviceAreaType).toBe('within_state');
    });

    it('POST /api/events should accept serviceArea with miles', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('name', 'API Test Event Miles')
        .field('category', 'Photography')
        .field('description', 'Test description')
        .field('location', JSON.stringify({
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        }))
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'miles',
          serviceAreaMiles: 25
        }))
        .attach('images', Buffer.from('fake image'), 'test.jpg');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.event.serviceArea.serviceAreaType).toBe('miles');
      expect(res.body.data.event.serviceArea.serviceAreaMiles).toBe(25);
    });

    it('POST /api/events should reject invalid serviceAreaType', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('name', 'API Test Event Invalid')
        .field('category', 'Photography')
        .field('description', 'Test description')
        .field('location', JSON.stringify({
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        }))
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'invalid_type'
        }))
        .attach('images', Buffer.from('fake image'), 'test.jpg');

      expect(res.status).toBe(500); // Mongoose validation error
    });

    it('POST /api/events should reject missing serviceAreaMiles when type is "miles"', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('name', 'API Test Event Missing Miles')
        .field('category', 'Photography')
        .field('description', 'Test description')
        .field('location', JSON.stringify({
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States'
        }))
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'miles'
          // serviceAreaMiles is missing
        }))
        .attach('images', Buffer.from('fake image'), 'test.jpg');

      expect(res.status).toBe(500); // Mongoose validation error
    });

    it('GET /api/events/:id should return serviceArea in response', async () => {
      // Update test event with serviceArea
      testEvent.serviceArea = {
        serviceAreaType: 'within_whole_usa'
      };
      await testEvent.save();

      const res = await request(app)
        .get(`/api/events/${testEvent._id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.event.serviceArea).toBeDefined();
      expect(res.body.data.event.serviceArea.serviceAreaType).toBe('within_whole_usa');
    });

    it('PATCH /api/events/:id should accept serviceArea update', async () => {
      const res = await request(app)
        .patch(`/api/events/${testEvent._id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'miles',
          serviceAreaMiles: 30
        }));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.event.serviceArea.serviceAreaType).toBe('miles');
      expect(res.body.data.event.serviceArea.serviceAreaMiles).toBe(30);
    });

    it('PATCH /api/events/:id should clear serviceAreaMiles when changing to non-miles type', async () => {
      // First set to miles
      testEvent.serviceArea = {
        serviceAreaType: 'miles',
        serviceAreaMiles: 20
      };
      await testEvent.save();

      // Then update to within_city
      const res = await request(app)
        .patch(`/api/events/${testEvent._id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .field('serviceArea', JSON.stringify({
          serviceAreaType: 'within_city'
        }));

      expect(res.status).toBe(200);
      expect(res.body.data.event.serviceArea.serviceAreaType).toBe('within_city');
      expect(res.body.data.event.serviceArea.serviceAreaMiles).toBeUndefined();
    });
  });
});

