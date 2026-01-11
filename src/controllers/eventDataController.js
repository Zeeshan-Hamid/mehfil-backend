const eventDataService = require('../services/eventDataService');

/**
 * Controller for Event Data Access
 * Adheres to SOLID: Decouples HTTP interface from business logic
 */
const registerEventAccess = async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and Email are mandatory.'
            });
        }

        // Capture metadata for security/tracking
        const metadata = {
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const result = await eventDataService.registerAccess({ name, email, phone }, metadata);

        res.status(201).json({
            success: true,
            data: {
                token: result.token,
                visitor: {
                    name: result.visitor.name,
                    email: result.visitor.email
                }
            },
            message: 'Access granted successfully.'
        });

    } catch (error) {
        console.error('Error in registerEventAccess:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while granting access. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    registerEventAccess
};
