const LeadGeneration = require('../models/schemas/LeadGeneration');

/**
 * Create a new lead
 */
exports.createLead = async (req, res) => {
    try {
        const { email, phone, source } = req.body;

        // Validate required fields
        if (!email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Email and phone are required fields'
            });
        }

        // Check if lead already exists
        const existingLead = await LeadGeneration.findOne({ email });
        if (existingLead) {
            return res.status(200).json({
                success: true,
                message: 'You are already registered for early access!',
                data: existingLead
            });
        }

        // Create new lead
        const newLead = new LeadGeneration({
            email,
            phone,
            source: source || 'promotions_page'
        });

        await newLead.save();

        res.status(201).json({
            success: true,
            message: 'Thank you! You have been registered for early vendor access.',
            data: newLead
        });

    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register for early access. Please try again.',
            error: error.message
        });
    }
};

/**
 * Get all leads (for admin purposes)
 */
exports.getAllLeads = async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;

        const query = {};
        if (status) {
            query.status = status;
        }

        const leads = await LeadGeneration.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await LeadGeneration.countDocuments(query);

        res.status(200).json({
            success: true,
            data: leads,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });

    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leads',
            error: error.message
        });
    }
};

/**
 * Update lead status
 */
exports.updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const lead = await LeadGeneration.findByIdAndUpdate(
            id,
            { status, notes, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Lead updated successfully',
            data: lead
        });

    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update lead',
            error: error.message
        });
    }
};
