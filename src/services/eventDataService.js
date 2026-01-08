const EventData = require('../models/schemas/EventData');
const jwt = require('jsonwebtoken');

/**
 * Service to handle Event Visitor Data logic
 * Adheres to SOLID: Single Responsibility (Data persistence and token generation)
 */
class EventDataService {
    /**
     * Register a new access and return a JWT
     * @param {Object} data - User name, email, and phone
     * @param {Object} metadata - IP and UserAgent
     */
    async registerAccess(data, metadata) {
        const { name, email, phone } = data;
        const { ipAddress, userAgent } = metadata;

        // Save visitor to database
        const visitor = await EventData.create({
            name,
            email,
            phone,
            ipAddress,
            userAgent
        });

        // Generate JWT token specifically for the event map
        const token = jwt.sign(
            {
                email: visitor.email,
                name: visitor.name,
                accessType: 'event_map'
            },
            process.env.EVENT_JWT_SECRET || process.env.JWT_SECRET,
            { expiresIn: '30d' } // Long lived token for event visitors
        );

        return { visitor, token };
    }
}

module.exports = new EventDataService();
