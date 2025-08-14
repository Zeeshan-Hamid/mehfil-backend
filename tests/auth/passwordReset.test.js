const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const EmailService = require('../../src/services/emailService');

describe('Password Reset Flow', () => {
  let user;

  beforeEach(async () => {
    // Create a test user
    user = await User.create({
      email: 'test@example.com',
      password: 'password123',
      phoneNumber: '+1234567890',
      role: 'customer'
    });
  });

  afterEach(async () => {
    // Clean up
    await User.deleteMany({});
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should send reset password email for existing user', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      
      // Verify user has reset token
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.passwordResetToken).toBeDefined();
      expect(updatedUser.passwordResetExpires).toBeDefined();
    });

    it('should return success even for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should enforce rate limiting', async () => {
      // Make multiple requests
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: 'test@example.com' });

        if (i < 5) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(429);
        }
      }
    });

    it('should set reset token expiration to 1 hour', async () => {
      const beforeRequest = Date.now();
      
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.passwordResetExpires).toBeDefined();
      
      // Check that expiration is approximately 1 hour from now (allowing 1 minute tolerance)
      const oneHourFromNow = beforeRequest + (60 * 60 * 1000); // 1 hour in milliseconds
      const tolerance = 60 * 1000; // 1 minute tolerance
      
      expect(updatedUser.passwordResetExpires.getTime()).toBeGreaterThan(oneHourFromNow - tolerance);
      expect(updatedUser.passwordResetExpires.getTime()).toBeLessThan(oneHourFromNow + tolerance);
    });
  });

  describe('GET /api/auth/reset-password/:token', () => {
    it('should verify valid reset token', async () => {
      // Trigger password reset to get token
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      const updatedUser = await User.findById(user._id);
      const token = updatedUser.passwordResetToken;

      const res = await request(app)
        .get(`/api/auth/reset-password/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should reject invalid reset token', async () => {
      const res = await request(app)
        .get('/api/auth/reset-password/invalidtoken');

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('POST /api/auth/reset-password/:token', () => {
    it('should reset password with valid token', async () => {
      // Trigger password reset to get token
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      const updatedUser = await User.findById(user._id);
      const token = updatedUser.passwordResetToken;

      const res = await request(app)
        .post(`/api/auth/reset-password/${token}`)
        .send({
          password: 'newpassword123',
          passwordConfirm: 'newpassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify password was changed
      const finalUser = await User.findById(user._id);
      expect(finalUser.passwordResetToken).toBeUndefined();
      expect(finalUser.passwordResetExpires).toBeUndefined();
    });

    it('should reject password reset with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password/invalidtoken')
        .send({
          password: 'newpassword123',
          passwordConfirm: 'newpassword123'
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('should reject if passwords do not match', async () => {
      // Trigger password reset to get token
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      const updatedUser = await User.findById(user._id);
      const token = updatedUser.passwordResetToken;

      const res = await request(app)
        .post(`/api/auth/reset-password/${token}`)
        .send({
          password: 'newpassword123',
          passwordConfirm: 'differentpassword'
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });
}); 