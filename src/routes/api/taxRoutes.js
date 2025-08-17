const express = require('express');
const router = express.Router();
const taxService = require('../../services/taxService');

/**
 * @route   GET /api/tax/calculate
 * @desc    Calculate tax based on zip code and subtotal
 * @access  Public
 */
router.get('/calculate', async (req, res) => {
  try {
    const { zipCode, subtotal } = req.query;

    if (!zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Zip code is required'
      });
    }

    if (!subtotal || isNaN(subtotal) || parseFloat(subtotal) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid subtotal is required'
      });
    }

    const taxInfo = taxService.getTaxInfoFromZipCode(zipCode);
    
    if (taxInfo.error) {
      return res.status(400).json({
        success: false,
        message: taxInfo.error
      });
    }

    const subtotalNum = parseFloat(subtotal);
    const taxAmount = taxService.calculateTaxAmount(subtotalNum, taxInfo.taxRate);
    const totalWithTax = taxService.calculateTotalWithTax(subtotalNum, taxInfo.taxRate);

    res.json({
      success: true,
      data: {
        zipCode,
        state: taxInfo.state,
        city: taxInfo.city,
        taxRate: taxInfo.taxRate,
        subtotal: subtotalNum,
        taxAmount,
        total: totalWithTax
      }
    });

  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during tax calculation'
    });
  }
});

/**
 * @route   GET /api/tax/rates
 * @desc    Get all available tax rates
 * @access  Public
 */
router.get('/rates', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        taxRates: taxService.STATE_TAX_RATES
      }
    });
  } catch (error) {
    console.error('Get tax rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching tax rates'
    });
  }
});

module.exports = router;
