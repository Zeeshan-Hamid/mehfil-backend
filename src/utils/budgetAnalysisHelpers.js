const Event = require('../models/schemas/Event');

/**
 * Analyze budget ranges for a specific event category
 * @param {string} category - Event category to analyze
 * @param {number} months - Number of months to look back (default: 2)
 * @param {boolean} includeServices - Whether to include services/offerings data (default: false)
 * @returns {Promise<Object>} Budget analysis data
 */
const getBudgetAnalysis = async (category, months = 2, includeServices = false) => {
    try {
        // Calculate the date for filtering (last 2 months)
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);

        // Query events matching the category created in the last 2 months
        const selectFields = 'name packages flatPrice customPackages category createdAt';
        const events = await Event.find({
            category: category,
            createdAt: { $gte: cutoffDate }
        }).select(includeServices ? selectFields + ' services offerings' : selectFields);

        // If no events found, return empty result
        if (!events || events.length === 0) {
            return {
                category,
                eventCount: 0,
                noData: true,
                message: 'No events found in this category'
            };
        }

        // Extract all prices from events
        const prices = [];
        const pricingBreakdown = {
            flatPrices: [],
            perAttendeePrices: [],
            customPackages: []
        };

        events.forEach(event => {
            // Extract from packages array
            if (event.packages && event.packages.length > 0) {
                event.packages.forEach(pkg => {
                    if (pkg.price && pkg.price > 0) {
                        prices.push(pkg.price);

                        if (pkg.pricingMode === 'flatPrice') {
                            pricingBreakdown.flatPrices.push(pkg.price);
                        } else {
                            pricingBreakdown.perAttendeePrices.push(pkg.price);
                        }
                    }
                });
            }

            // Extract from flatPrice
            if (event.flatPrice && event.flatPrice.isActive && event.flatPrice.amount > 0) {
                prices.push(event.flatPrice.amount);
                pricingBreakdown.flatPrices.push(event.flatPrice.amount);
            }

            // Extract from customPackages (only active ones)
            if (event.customPackages && event.customPackages.length > 0) {
                event.customPackages
                    .filter(pkg => pkg.isActive && pkg.price > 0)
                    .forEach(pkg => {
                        prices.push(pkg.price);
                        pricingBreakdown.customPackages.push(pkg.price);

                        if (pkg.pricingMode === 'flatPrice') {
                            pricingBreakdown.flatPrices.push(pkg.price);
                        } else {
                            pricingBreakdown.perAttendeePrices.push(pkg.price);
                        }
                    });
            }
        });

        // If no prices found
        if (prices.length === 0) {
            return {
                category,
                eventCount: events.length,
                noPrices: true,
                message: 'Events found but no pricing data available'
            };
        }

        // Sort prices for statistical calculations
        const sortedPrices = prices.sort((a, b) => a - b);

        // Calculate statistics
        const min = sortedPrices[0];
        const max = sortedPrices[sortedPrices.length - 1];
        const avg = sortedPrices.reduce((sum, price) => sum + price, 0) / sortedPrices.length;

        // Calculate median
        const mid = Math.floor(sortedPrices.length / 2);
        const median = sortedPrices.length % 2 === 0
            ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
            : sortedPrices[mid];

        // Calculate quartiles
        const q1Index = Math.floor(sortedPrices.length * 0.25);
        const q3Index = Math.floor(sortedPrices.length * 0.75);
        const q1 = sortedPrices[q1Index];
        const q3 = sortedPrices[q3Index];

        // Pricing mode distribution
        const totalPrices = prices.length;
        const flatPriceCount = pricingBreakdown.flatPrices.length;
        const perAttendeeCount = pricingBreakdown.perAttendeePrices.length;

        // Collect services/offerings if requested
        let servicesData = null;
        if (includeServices) {
            const servicesMap = new Map();

            events.forEach(event => {
                // Collect from services array
                if (event.services && Array.isArray(event.services)) {
                    event.services.forEach(service => {
                        if (service && service.trim()) {
                            const normalized = service.trim();
                            servicesMap.set(normalized, (servicesMap.get(normalized) || 0) + 1);
                        }
                    });
                }

                // Collect from offerings array
                if (event.offerings && Array.isArray(event.offerings)) {
                    event.offerings.forEach(offering => {
                        if (offering && offering.trim()) {
                            const normalized = offering.trim();
                            servicesMap.set(normalized, (servicesMap.get(normalized) || 0) + 1);
                        }
                    });
                }
            });

            // Convert to array and sort by frequency
            const servicesArray = Array.from(servicesMap.entries())
                .map(([service, count]) => ({ service, count }))
                .sort((a, b) => b.count - a.count);

            servicesData = {
                totalUniqueServices: servicesArray.length,
                commonServices: servicesArray.slice(0, 10), // Top 10 most common
                allServices: servicesArray.map(s => s.service)
            };
        }

        const result = {
            category,
            eventCount: events.length,
            priceCount: totalPrices,
            statistics: {
                min: Math.round(min),
                max: Math.round(max),
                average: Math.round(avg),
                median: Math.round(median),
                lowerRange: Math.round(q1),
                upperRange: Math.round(q3)
            },
            pricingModes: {
                flatPrice: flatPriceCount,
                perAttendee: perAttendeeCount,
                flatPricePercentage: Math.round((flatPriceCount / totalPrices) * 100),
                perAttendeePercentage: Math.round((perAttendeeCount / totalPrices) * 100)
            },
            priceRanges: {
                budget: sortedPrices.filter(p => p < q1).length,
                midRange: sortedPrices.filter(p => p >= q1 && p <= q3).length,
                premium: sortedPrices.filter(p => p > q3).length
            },
            monthsAnalyzed: months
        };

        // Add services data if available
        if (servicesData) {
            result.services = servicesData;
        }

        return result;

    } catch (error) {
        console.error('Error in getBudgetAnalysis:', error);
        throw error;
    }
};

/**
 * Get list of valid event categories
 * @returns {Array<string>} List of valid categories
 */
const getValidCategories = () => {
    return [
        'Drinks',
        'Desserts',
        'Decor',
        'Henna',
        'Food',
        'Videography',
        'Venue Management',
        'Entertainment',
        'Hair',
        'Makeup',
        'Photography',
        'Catering',
        'Wedding Planner',
        'Event Planner',
        'Other'
    ];
};

/**
 * Analyze competitive service opportunities in a category
 * @param {string} category - Event category to analyze
 * @param {number} months - Number of months to look back (default: 2)
 * @returns {Promise<Object>} Competitive analysis data
 */
const getCompetitiveServiceAnalysis = async (category, months = 2) => {
    try {
        // Calculate the date for filtering
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);

        // Query events in the category with services/offerings
        const events = await Event.find({
            category: category,
            createdAt: { $gte: cutoffDate }
        }).select('services offerings name');

        if (!events || events.length === 0) {
            return {
                category,
                eventCount: 0,
                noData: true,
                message: 'No events found in this category'
            };
        }

        // Collect all services and their frequencies
        const servicesMap = new Map();

        events.forEach(event => {
            // Collect from services
            if (event.services && Array.isArray(event.services)) {
                event.services.forEach(service => {
                    if (service && service.trim()) {
                        const normalized = service.trim().toLowerCase();
                        servicesMap.set(normalized, (servicesMap.get(normalized) || 0) + 1);
                    }
                });
            }

            // Collect from offerings
            if (event.offerings && Array.isArray(event.offerings)) {
                event.offerings.forEach(offering => {
                    if (offering && offering.trim()) {
                        const normalized = offering.trim().toLowerCase();
                        servicesMap.set(normalized, (servicesMap.get(normalized) || 0) + 1);
                    }
                });
            }
        });

        if (servicesMap.size === 0) {
            return {
                category,
                eventCount: events.length,
                noServices: true,
                message: 'No service data available for this category'
            };
        }

        // Convert to array and analyze
        const totalEvents = events.length;
        const servicesArray = Array.from(servicesMap.entries())
            .map(([service, count]) => ({
                service,
                count,
                percentage: Math.round((count / totalEvents) * 100)
            }))
            .sort((a, b) => b.count - a.count);

        // Categorize services by saturation
        const oversaturated = servicesArray.filter(s => s.percentage >= 70); // 70%+ offer it
        const common = servicesArray.filter(s => s.percentage >= 30 && s.percentage < 70); // 30-70%
        const underserved = servicesArray.filter(s => s.percentage < 30); // <30% offer it

        return {
            category,
            eventCount: totalEvents,
            totalUniqueServices: servicesArray.length,
            serviceSaturation: {
                oversaturated: oversaturated.map(s => ({
                    service: s.service,
                    offeredBy: `${s.percentage}% of vendors`
                })),
                common: common.map(s => ({
                    service: s.service,
                    offeredBy: `${s.percentage}% of vendors`
                })),
                underserved: underserved.map(s => ({
                    service: s.service,
                    offeredBy: `${s.percentage}% of vendors`,
                    opportunity: 'high' // Mark as opportunity
                }))
            },
            recommendations: {
                // Services most vendors offer (hard to differentiate)
                avoid: oversaturated.slice(0, 5).map(s => s.service),
                // Services few vendors offer (differentiation opportunities)
                opportunities: underserved.slice(0, 10).map(s => s.service),
                // Balanced services to consider
                consider: common.slice(0, 5).map(s => s.service)
            },
            monthsAnalyzed: months
        };

    } catch (error) {
        console.error('Error in getCompetitiveServiceAnalysis:', error);
        throw error;
    }
};

/**
 * Get package recommendations based on event parameters
 * @param {Object} params - Search parameters
 * @param {string} params.location - City or state
 * @param {number} params.guestCount - Number of guests
 * @param {string} params.keywords - Keywords like "Muslim wedding", "corporate event"
 * @param {string} params.category - Optional event category
 * @returns {Promise<Object>} Package recommendations
 */
const getPackageRecommendations = async ({ location, guestCount, keywords, category }) => {
    try {
        const query = { createdAt: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }; // Last 2 months

        // Add location filter
        if (location) {
            query.$or = [
                { 'location.city': new RegExp(location, 'i') },
                { 'location.state': new RegExp(location, 'i') }
            ];
        }

        // Add category filter
        if (category) {
            query.category = category;
        }

        // Add keyword search in tags, name, description
        if (keywords) {
            query.$text = { $search: keywords };
        }

        const events = await Event.find(query)
            .select('name category packages customPackages location tags')
            .limit(50);

        if (!events || events.length === 0) {
            return {
                found: false,
                message: 'No matching events found with these criteria'
            };
        }

        // Analyze packages
        const packages = [];

        events.forEach(event => {
            // Get regular packages
            if (event.packages && event.packages.length > 0) {
                event.packages.forEach(pkg => {
                    packages.push({
                        name: pkg.name,
                        price: pkg.price,
                        pricingMode: pkg.pricingMode,
                        includes: pkg.includes,
                        eventCategory: event.category
                    });
                });
            }

            // Get custom packages that match guest count
            if (event.customPackages && event.customPackages.length > 0) {
                event.customPackages
                    .filter(pkg => pkg.isActive)
                    .forEach(pkg => {
                        // If guest count specified, only include packages close to that count
                        if (guestCount && pkg.attendees) {
                            const difference = Math.abs(pkg.attendees - guestCount);
                            if (difference <= guestCount * 0.3) { // Within 30% of target
                                packages.push({
                                    name: pkg.name,
                                    price: pkg.price,
                                    pricingMode: pkg.pricingMode,
                                    attendees: pkg.attendees,
                                    includes: pkg.includes,
                                    eventCategory: event.category
                                });
                            }
                        }
                    });
            }
        });

        if (packages.length === 0) {
            return {
                found: true,
                eventsFound: events.length,
                noPackages: true,
                message: 'Found events but no package data available'
            };
        }

        // Calculate pricing insights
        const prices = packages.map(p => p.price).filter(p => p > 0);
        const sortedPrices = prices.sort((a, b) => a - b);

        const avgPrice = Math.round(sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length);
        const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

        // Extract common inclusions
        const inclusionsMap = new Map();
        packages.forEach(pkg => {
            if (pkg.includes && Array.isArray(pkg.includes)) {
                pkg.includes.forEach(item => {
                    inclusionsMap.set(item, (inclusionsMap.get(item) || 0) + 1);
                });
            }
        });

        const commonInclusions = Array.from(inclusionsMap.entries())
            .map(([item, count]) => ({ item, count, percentage: Math.round((count / packages.length) * 100) }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            found: true,
            matchingEvents: events.length,
            packagesAnalyzed: packages.length,
            location: location || 'Any',
            guestCount: guestCount || 'Any',
            keywords: keywords || 'Any',
            pricingInsights: {
                averagePrice: avgPrice,
                medianPrice: medianPrice,
                lowestPrice: sortedPrices[0],
                highestPrice: sortedPrices[sortedPrices.length - 1]
            },
            commonInclusions: commonInclusions.map(i => ({
                item: i.item,
                includedIn: `${i.percentage}% of packages`
            })),
            pricingModes: {
                perAttendee: packages.filter(p => p.pricingMode === 'perAttendee').length,
                flatPrice: packages.filter(p => p.pricingMode === 'flatPrice').length
            }
        };

    } catch (error) {
        console.error('Error in getPackageRecommendations:', error);
        throw error;
    }
};

/**
 * Compare vendor's pricing with similar vendors nearby
 * @param {string} vendorId - The vendor's user ID
 * @returns {Promise<Object>} Pricing comparison data
 */
const compareVendorPricing = async (vendorId) => {
    try {
        // Get vendor's own events
        const vendorEvents = await Event.find({ vendor: vendorId })
            .select('name category packages flatPrice location');

        if (!vendorEvents || vendorEvents.length === 0) {
            return {
                hasEvents: false,
                message: 'You have not created any events yet'
            };
        }

        // Analyze vendor's pricing
        const vendorPricing = {};
        const vendorCategories = new Set();
        const vendorLocations = new Set();

        vendorEvents.forEach(event => {
            vendorCategories.add(event.category);
            if (event.location) {
                if (event.location.city) vendorLocations.add(event.location.city);
                if (event.location.state) vendorLocations.add(event.location.state);
            }

            if (!vendorPricing[event.category]) {
                vendorPricing[event.category] = {
                    eventName: event.name,
                    prices: [],
                    hasPricing: false
                };
            }

            // Extract pricing
            if (event.packages && event.packages.length > 0) {
                event.packages.forEach(pkg => {
                    if (pkg.price > 0) {
                        vendorPricing[event.category].prices.push(pkg.price);
                        vendorPricing[event.category].hasPricing = true;
                    }
                });
            }

            if (event.flatPrice && event.flatPrice.isActive && event.flatPrice.amount > 0) {
                vendorPricing[event.category].prices.push(event.flatPrice.amount);
                vendorPricing[event.category].hasPricing = true;
            }
        });

        // Find competitors in same categories and nearby
        const competitorQuery = {
            vendor: { $ne: vendorId },
            category: { $in: Array.from(vendorCategories) },
            $or: []
        };

        // Add location filters
        vendorLocations.forEach(location => {
            competitorQuery.$or.push(
                { 'location.city': new RegExp(location, 'i') },
                { 'location.state': new RegExp(location, 'i') }
            );
        });

        if (competitorQuery.$or.length === 0) {
            delete competitorQuery.$or;
        }

        const competitors = await Event.find(competitorQuery)
            .select('name category packages flatPrice location vendor')
            .limit(100);

        // Analyze competitor pricing by category
        const competitorPricing = {};
        const competitorNames = {}; // Track competitor event names

        competitors.forEach(event => {
            if (!competitorPricing[event.category]) {
                competitorPricing[event.category] = {
                    competitors: 0,
                    prices: []
                };
                competitorNames[event.category] = [];
            }

            competitorPricing[event.category].competitors++;

            // Add event name to the list
            if (!competitorNames[event.category].includes(event.name)) {
                competitorNames[event.category].push(event.name);
            }

            if (event.packages && event.packages.length > 0) {
                event.packages.forEach(pkg => {
                    if (pkg.price > 0) {
                        competitorPricing[event.category].prices.push(pkg.price);
                    }
                });
            }

            if (event.flatPrice && event.flatPrice.isActive && event.flatPrice.amount > 0) {
                competitorPricing[event.category].prices.push(event.flatPrice.amount);
            }
        });

        // Build comparison results
        const comparisons = [];

        Object.keys(vendorPricing).forEach(category => {
            const vendorData = vendorPricing[category];
            const compData = competitorPricing[category];

            const comparison = {
                category,
                eventName: vendorData.eventName,
                yourPricing: null,
                competitorPricing: null,
                status: null
            };

            // Handle vendor pricing
            if (vendorData.hasPricing && vendorData.prices.length > 0) {
                const avgVendor = Math.round(vendorData.prices.reduce((a, b) => a + b, 0) / vendorData.prices.length);
                comparison.yourPricing = {
                    average: avgVendor,
                    range: `$${Math.min(...vendorData.prices)} - $${Math.max(...vendorData.prices)}`,
                    hasPricing: true
                };
            } else {
                comparison.yourPricing = {
                    hasPricing: false,
                    message: `Your "${vendorData.eventName}" event doesn't have pricing set`
                };
            }

            // Handle competitor pricing
            if (compData && compData.prices.length > 0) {
                const sortedComp = compData.prices.sort((a, b) => a - b);
                const avgComp = Math.round(sortedComp.reduce((a, b) => a + b, 0) / sortedComp.length);
                const medianComp = sortedComp[Math.floor(sortedComp.length / 2)];

                comparison.competitorPricing = {
                    competitorCount: compData.competitors,
                    average: avgComp,
                    median: medianComp,
                    range: `$${sortedComp[0]} - $${sortedComp[sortedComp.length - 1]}`,
                    competitorListings: competitorNames[category] || []
                };

                // Compare if vendor has pricing
                if (comparison.yourPricing.hasPricing) {
                    const yourAvg = comparison.yourPricing.average;
                    if (yourAvg < avgComp * 0.85) {
                        comparison.status = 'significantly_lower';
                    } else if (yourAvg < avgComp * 0.95) {
                        comparison.status = 'slightly_lower';
                    } else if (yourAvg > avgComp * 1.15) {
                        comparison.status = 'significantly_higher';
                    } else if (yourAvg > avgComp * 1.05) {
                        comparison.status = 'slightly_higher';
                    } else {
                        comparison.status = 'competitive';
                    }
                }
            } else {
                comparison.competitorPricing = {
                    competitorCount: 0,
                    message: 'No competitor pricing data available for comparison'
                };
            }

            comparisons.push(comparison);
        });

        return {
            hasEvents: true,
            yourEvents: vendorEvents.length,
            categoriesAnalyzed: Array.from(vendorCategories),
            locationsAnalyzed: Array.from(vendorLocations),
            competitorsFound: competitors.length,
            comparisons
        };

    } catch (error) {
        console.error('Error in compareVendorPricing:', error);
        throw error;
    }
};

/**
 * Get detailed information about a vendor's specific listing
 * @param {string} vendorId - The vendor's user ID
 * @param {string} listingName - Name of the event/listing to find
 * @returns {Promise<Object>} Listing details and suggestions
 */
const getVendorListingDetails = async (vendorId, listingName) => {
    try {
        // Search for vendor's events by name (case-insensitive, partial match)
        const events = await Event.find({
            vendor: vendorId,
            name: new RegExp(listingName, 'i')
        }).populate('reviews');

        if (!events || events.length === 0) {
            return {
                found: false,
                message: `No listing found matching "${listingName}"`
            };
        }

        // If multiple matches, take the closest match
        const event = events[0];

        // Extract pricing information
        const pricing = {
            flatPrice: null,
            packages: [],
            customPackages: []
        };

        if (event.flatPrice && event.flatPrice.isActive) {
            pricing.flatPrice = {
                amount: event.flatPrice.amount,
                currency: event.flatPrice.currency || 'USD'
            };
        }

        if (event.packages && event.packages.length > 0) {
            pricing.packages = event.packages.map(pkg => ({
                name: pkg.name,
                price: pkg.price,
                pricingMode: pkg.pricingMode,
                includes: pkg.includes || []
            }));
        }

        if (event.customPackages && event.customPackages.length > 0) {
            pricing.customPackages = event.customPackages
                .filter(pkg => pkg.isActive)
                .map(pkg => ({
                    name: pkg.name,
                    price: pkg.price,
                    attendees: pkg.attendees,
                    pricingMode: pkg.pricingMode,
                    includes: pkg.includes || []
                }));
        }

        // Extract services and offerings
        const servicesOffered = {
            services: event.services || [],
            offerings: event.offerings || []
        };

        // Extract reviews
        const reviews = {
            count: event.reviews ? event.reviews.length : 0,
            ratings: [],
            comments: []
        };

        if (event.reviews && event.reviews.length > 0) {
            reviews.ratings = event.reviews.map(r => r.rating).filter(r => r);
            reviews.comments = event.reviews.map(r => ({
                rating: r.rating,
                comment: r.comment,
                date: r.createdAt
            }));

            const avgRating = reviews.ratings.length > 0
                ? (reviews.ratings.reduce((a, b) => a + b, 0) / reviews.ratings.length).toFixed(1)
                : null;

            reviews.averageRating = avgRating;
        }

        // Analyze completeness and generate suggestions
        const suggestions = [];
        const completeness = {
            hasPricing: false,
            hasServices: false,
            hasPhotos: false,
            hasReviews: false,
            hasDescription: false
        };

        // Check pricing
        const hasPricing = (pricing.flatPrice && pricing.flatPrice.amount > 0) ||
            pricing.packages.length > 0 ||
            pricing.customPackages.length > 0;
        completeness.hasPricing = hasPricing;
        if (!hasPricing) {
            suggestions.push({
                type: 'critical',
                issue: 'No pricing set',
                suggestion: 'Add pricing to attract clients. Set packages or flat price.'
            });
        }

        // Check services
        const hasServices = (event.services && event.services.length > 0) ||
            (event.offerings && event.offerings.length > 0);
        completeness.hasServices = hasServices;
        if (!hasServices) {
            suggestions.push({
                type: 'important',
                issue: 'No services listed',
                suggestion: 'Add what services you provide to stand out.'
            });
        }



        // Check reviews
        completeness.hasReviews = reviews.count > 0;
        if (reviews.count === 0) {
            suggestions.push({
                type: 'tip',
                issue: 'No reviews yet',
                suggestion: 'Encourage satisfied clients to leave reviews to build trust.'
            });
        }

        // Check description
        const hasDescription = event.description && event.description.trim().length > 50;
        completeness.hasDescription = hasDescription;
        if (!hasDescription) {
            suggestions.push({
                type: 'important',
                issue: 'Weak description',
                suggestion: 'Add a detailed description highlighting what makes you unique.'
            });
        }

        return {
            found: true,
            listing: {
                name: event.name,
                category: event.category,
                description: event.description,
                location: event.location,
                tags: event.tags
            },
            pricing,
            servicesOffered,
            reviews,
            completeness,
            suggestions,
            profileCompleteness: Math.round(
                (Object.values(completeness).filter(v => v).length / Object.keys(completeness).length) * 100
            )
        };

    } catch (error) {
        console.error('Error in getVendorListingDetails:', error);
        throw error;
    }
};

/**
 * Get all listings/events for a vendor
 * @param {string} vendorId - The vendor's user ID
 * @returns {Promise<Object>} List of vendor's events
 */
const getVendorListings = async (vendorId) => {
    try {
        const events = await Event.find({ vendor: vendorId })
            .select('name category createdAt packages flatPrice customPackages reviews')
            .sort({ createdAt: -1 });

        if (!events || events.length === 0) {
            return {
                hasListings: false,
                message: 'You have not created any listings yet'
            };
        }

        const listings = events.map(event => {
            // Count pricing options
            const pricingCount =
                (event.flatPrice && event.flatPrice.isActive ? 1 : 0) +
                (event.packages ? event.packages.length : 0) +
                (event.customPackages ? event.customPackages.filter(p => p.isActive).length : 0);

            return {
                name: event.name,
                category: event.category,
                hasPricing: pricingCount > 0,
                reviewCount: event.reviews ? event.reviews.length : 0,
                createdDate: event.createdAt
            };
        });

        return {
            hasListings: true,
            totalListings: listings.length,
            listings
        };

    } catch (error) {
        console.error('Error in getVendorListings:', error);
        throw error;
    }
};

/**
 * Critically audit all vendor listings for improvements
 * @param {string} vendorId - The vendor's user ID
 * @returns {Promise<Object>} Critical audit results
 */
const auditVendorListings = async (vendorId) => {
    try {
        const events = await Event.find({ vendor: vendorId })
            .select('name category description services offerings packages flatPrice customPackages photos location reviews')
            .populate('reviews');

        if (!events || events.length === 0) {
            return {
                hasListings: false,
                message: 'No listings to audit'
            };
        }

        const audits = events.map(event => {
            const issues = [];
            let score = 100; // Start at 100, deduct points for issues

            // 1. CRITICAL: Name Analysis
            if (!event.name || event.name.trim().length < 3) {
                issues.push({ severity: 'critical', area: 'Name', issue: 'Name is too short or missing', impact: -20 });
                score -= 20;
            } else if (event.name.length < 10) {
                issues.push({ severity: 'important', area: 'Name', issue: 'Name is too generic. Make it more descriptive and memorable', impact: -10 });
                score -= 10;
            } else if (!/[A-Z]/.test(event.name)) {
                issues.push({ severity: 'minor', area: 'Name', issue: 'Use proper capitalization for professionalism', impact: -5 });
                score -= 5;
            }

            // 2. CRITICAL: Description Analysis
            if (!event.description || event.description.trim().length === 0) {
                issues.push({ severity: 'critical', area: 'Description', issue: 'No description! This is your sales pitch - add one immediately', impact: -25 });
                score -= 25;
            } else if (event.description.length < 50) {
                issues.push({ severity: 'critical', area: 'Description', issue: 'Description is way too short. Aim for 200+ characters to tell your story', impact: -20 });
                score -= 20;
            } else if (event.description.length < 150) {
                issues.push({ severity: 'important', area: 'Description', issue: 'Description is too brief. Add more details about what makes you special', impact: -15 });
                score -= 15;
            } else if (event.description.length > 1000) {
                issues.push({ severity: 'minor', area: 'Description', issue: 'Description is too long. Keep it under 500 chars for better readability', impact: -5 });
                score -= 5;
            }

            // 3. CRITICAL: Pricing Analysis
            const hasFlatPrice = event.flatPrice && event.flatPrice.isActive && event.flatPrice.amount > 0;
            const packageCount = event.packages ? event.packages.length : 0;
            const customPackageCount = event.customPackages ? event.customPackages.filter(p => p.isActive).length : 0;
            const totalPricingOptions = (hasFlatPrice ? 1 : 0) + packageCount + customPackageCount;

            if (totalPricingOptions === 0) {
                issues.push({ severity: 'critical', area: 'Pricing', issue: 'NO PRICING SET! Clients need to see prices to book you', impact: -30 });
                score -= 30;
            } else if (totalPricingOptions === 1) {
                issues.push({ severity: 'important', area: 'Pricing', issue: 'Only 1 pricing option. Offer 2-3 packages (good/better/best) to increase bookings', impact: -15 });
                score -= 15;
            }

            // 4. Package Quality Analysis
            if (event.packages && event.packages.length > 0) {
                event.packages.forEach((pkg, idx) => {
                    if (!pkg.name || pkg.name.length < 5) {
                        issues.push({ severity: 'important', area: `Package ${idx + 1}`, issue: 'Package name is too generic. Use names like "Premium", "Deluxe", "Signature"', impact: -5 });
                        score -= 5;
                    }
                    if (!pkg.includes || pkg.includes.length === 0) {
                        issues.push({ severity: 'critical', area: `Package ${idx + 1}`, issue: "No inclusions listed! Clients need to know what they're getting", impact: -10 });
                        score -= 10;
                    } else if (pkg.includes.length < 3) {
                        issues.push({ severity: 'important', area: `Package ${idx + 1}`, issue: 'Too few inclusions. List at least 5 things included to show value', impact: -8 });
                        score -= 8;
                    }
                });
            }



            // 6. Services/Offerings
            const servicesCount = (event.services ? event.services.length : 0) + (event.offerings ? event.offerings.length : 0);
            if (servicesCount === 0) {
                issues.push({ severity: 'important', area: 'Services', issue: 'No services listed. Tell clients exactly what you provide', impact: -12 });
                score -= 12;
            } else if (servicesCount < 3) {
                issues.push({ severity: 'minor', area: 'Services', issue: 'List more services to show your full capabilities', impact: -6 });
                score -= 6;
            }

            // 7. Location
            if (!event.location || !event.location.city || !event.location.state) {
                issues.push({ severity: 'important', area: 'Location', issue: 'Incomplete location info. Add city and state for local searches', impact: -10 });
                score -= 10;
            }

            // 8. Reviews
            const reviewCount = event.reviews ? event.reviews.length : 0;
            if (reviewCount === 0) {
                issues.push({ severity: 'minor', area: 'Reviews', issue: 'No reviews yet. Ask satisfied clients to leave reviews for social proof', impact: -8 });
                score -= 8;
            }

            // Ensure score doesn't go below 0
            score = Math.max(0, score);

            return {
                listingName: event.name,
                category: event.category,
                overallScore: score,
                grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
                totalIssues: issues.length,
                criticalIssues: issues.filter(i => i.severity === 'critical').length,
                issues: issues.sort((a, b) => {
                    const severityOrder = { critical: 0, important: 1, minor: 2 };
                    return severityOrder[a.severity] - severityOrder[b.severity];
                })
            };
        });

        // Sort by score (worst first)
        const sortedAudits = audits.sort((a, b) => a.overallScore - b.overallScore);

        return {
            hasListings: true,
            totalListings: audits.length,
            averageScore: Math.round(audits.reduce((sum, a) => sum + a.overallScore, 0) / audits.length),
            needsUrgentAttention: sortedAudits.filter(a => a.overallScore < 50),
            needsImprovement: sortedAudits.filter(a => a.overallScore >= 50 && a.overallScore < 80),
            goodListings: sortedAudits.filter(a => a.overallScore >= 80),
            audits: sortedAudits
        };

    } catch (error) {
        console.error('Error in auditVendorListings:', error);
        throw error;
    }
};

module.exports = {
    getBudgetAnalysis,
    getValidCategories,
    getCompetitiveServiceAnalysis,
    getPackageRecommendations,
    compareVendorPricing,
    getVendorListingDetails,
    getVendorListings,
    auditVendorListings
};
