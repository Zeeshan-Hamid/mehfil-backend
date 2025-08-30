const Invoice = require('../models/Invoice');
const { validationResult } = require('express-validator');
const https = require('https');
const AWS = require('aws-sdk');
const { processAndUploadBusinessLogo } = require('../services/fileUploadService');
// Extend jsPDF with autoTable when generating PDFs
// Note: require side-effect is safe here; it augments jsPDF prototype
// We will require it inside the download handler to avoid loading cost if not used elsewhere

// @desc    Create a new invoice
// @route   POST /api/invoices
// @access  Private (Vendor only)
const createInvoice = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      clientName,
      event,
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentOption,
      notes,
      taxEnabled,
      taxRate,
      adjustments,
      items,
      logoUrl
    } = req.body;

    // Check if invoice number already exists
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(409).json({
        success: false,
        message: 'Invoice number already exists'
      });
    }

    // Create new invoice
    const newInvoice = new Invoice({
      vendor: req.user.id,
      clientName,
      event,
      invoiceNumber: invoiceNumber || Invoice.generateInvoiceNumber(),
      invoiceDate: invoiceDate || new Date(),
      dueDate,
      paymentOption,
      notes,
      taxEnabled,
      taxRate,
      adjustments: adjustments || [],
      items,
      logoUrl,
      subtotal: req.body.subtotal,
      taxAmount: req.body.taxAmount,
      adjustmentsTotal: req.body.adjustmentsTotal,
      total: req.body.total
    });

    await newInvoice.save();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice: newInvoice
      }
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during invoice creation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get all invoices for a vendor
// @route   GET /api/invoices
// @access  Private (Vendor only)
const getInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { vendor: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { event: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Get invoices with pagination
    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Invoice.countDocuments(query);

    // Calculate summary stats
    const allInvoices = await Invoice.find({ vendor: req.user.id });
    const totalAmount = allInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const pending = allInvoices.filter(inv => inv.status === 'Pending');
    const paid = allInvoices.filter(inv => inv.status === 'Paid');
    const overdue = allInvoices.filter(inv => inv.status === 'Overdue');
    const pendingAmount = pending.reduce((sum, inv) => sum + inv.total, 0);
    const paidAmount = paid.reduce((sum, inv) => sum + inv.total, 0);
    const overdueAmount = overdue.reduce((sum, inv) => sum + inv.total, 0);

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      data: {
        invoices,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        },
        summary: {
          totalAmount,
          pending: {
            count: pending.length,
            amount: pendingAmount
          },
          paid: {
            count: paid.length,
            amount: paidAmount
          },
          overdue: {
            count: overdue.length,
            amount: overdueAmount
          }
        }
      }
    });

  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get a single invoice by ID
// @route   GET /api/invoices/:id
// @access  Private (Vendor only)
const getInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      data: {
        invoice
      }
    });

  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update an invoice
// @route   PUT /api/invoices/:id
// @access  Private (Vendor only)
const updateInvoice = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if invoice number is being changed and if it already exists
    if (updateData.invoiceNumber && updateData.invoiceNumber !== invoice.invoiceNumber) {
      const existingInvoice = await Invoice.findOne({ 
        invoiceNumber: updateData.invoiceNumber,
        _id: { $ne: id }
      });
      if (existingInvoice) {
        return res.status(409).json({
          success: false,
          message: 'Invoice number already exists'
        });
      }
    }

    // Update invoice
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        invoice: updatedInvoice
      }
    });

  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete an invoice
// @route   DELETE /api/invoices/:id
// @access  Private (Vendor only)
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Delete invoice
    await Invoice.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });

  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Mark invoice as paid
// @route   PATCH /api/invoices/:id/mark-paid
// @access  Private (Vendor only)
const markInvoiceAsPaid = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Mark as paid
    await invoice.markAsPaid();

    res.status(200).json({
      success: true,
      message: 'Invoice marked as paid successfully',
      data: {
        invoice
      }
    });

  } catch (error) {
    console.error('Mark invoice as paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while marking invoice as paid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update overdue invoices status
// @route   PATCH /api/invoices/update-overdue
// @access  Private (Vendor only)
const updateOverdueInvoices = async (req, res) => {
  try {
    const result = await Invoice.updateOverdueStatus();

    res.status(200).json({
      success: true,
      message: 'Overdue invoices updated successfully',
      data: {
        updatedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Update overdue invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating overdue invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// One-time configured absolute logo URL (set via env or hardcoded after upload)
const MEHFIL_LOGO_URL = process.env.MEHFIL_LOGO_ABSOLUTE_URL || ' https://mehfil-images.s3.eu-north-1.amazonaws.com/branding/logo-black-1754731552840.png';

async function fetchImageAsDataUrl(imageUrl) {
  return new Promise((resolve, reject) => {
    try {
      https.get(imageUrl, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Failed to fetch image. Status: ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Default to PNG; adjust if you decide to upload JPEG
          const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
          resolve(dataUrl);
        });
      }).on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchS3ImageAsDataUrlFromUrl(s3Url) {
  try {
    // Match virtual-hosted style: https://bucket.s3.region.amazonaws.com/key
    const match = s3Url.match(/^https?:\/\/([^\.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)$/);
    if (!match) return null;
    const [, bucket, region, key] = match;

    const s3 = new AWS.S3({
      region: process.env.AWS_REGION || region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_KEY
    });

    const result = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    const contentType = result.ContentType || 'image/png';
    const base64 = Buffer.from(result.Body).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (_) {
    return null;
  }
}

// @desc    Download invoice as PDF
// @route   GET /api/invoices/:id/download
// @access  Private (Vendor only)
const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Generate PDF using jsPDF with professional layout
    const { jsPDF } = require('jspdf');
    const autoTableModule = require('jspdf-autotable');
    const autoTable =
      typeof autoTableModule === 'function'
        ? autoTableModule
        : (autoTableModule && (autoTableModule.default || autoTableModule.autoTable));
    if (typeof autoTable !== 'function') {
      throw new TypeError('jspdf-autotable could not be loaded as a function');
    }

    const brandPurple = [175, 142, 186]; // #AF8EBA
    const grayText = [73, 80, 87];
    const lightBorder = [220, 223, 230];

    // Use points for easier sizing (A4: 595.28 x 841.89 pt)
    const pdf = new jsPDF('p', 'pt', 'a4');
    pdf.setFont('helvetica', 'normal');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40; // 40pt margin

    // Get both logos: vendor's business logo and Mehfil logo for watermark
    let vendorLogoDataUrl = null;
    let mehfilLogoDataUrl = null;
    
    try {
      // Get vendor's business logo if available
      if (invoice.logoUrl && invoice.logoUrl.startsWith('http')) {
        vendorLogoDataUrl = await fetchImageAsDataUrl(invoice.logoUrl);
        if (!vendorLogoDataUrl) {
          // Try fetching via AWS SDK (works even if the object is private)
          vendorLogoDataUrl = await fetchS3ImageAsDataUrlFromUrl(invoice.logoUrl);
        }
      }
    } catch (_) {
      // Vendor logo not available
    }
    
    try {
      // Get Mehfil logo for watermark
      if (MEHFIL_LOGO_URL && MEHFIL_LOGO_URL.startsWith('http')) {
        console.log('🔄 [InvoiceController] Fetching Mehfil logo from:', MEHFIL_LOGO_URL);
        mehfilLogoDataUrl = await fetchImageAsDataUrl(MEHFIL_LOGO_URL);
        if (!mehfilLogoDataUrl) {
          console.log('🔄 [InvoiceController] Trying AWS SDK method for Mehfil logo');
          // Try fetching via AWS SDK (works even if the object is private)
          mehfilLogoDataUrl = await fetchS3ImageAsDataUrlFromUrl(MEHFIL_LOGO_URL);
        }
        
        if (mehfilLogoDataUrl) {
          console.log('✅ [InvoiceController] Mehfil logo fetched successfully');
        } else {
          console.log('⚠️ [InvoiceController] Mehfil logo could not be fetched');
        }
      } else {
        console.log('⚠️ [InvoiceController] MEHFIL_LOGO_URL not configured or invalid');
      }
    } catch (error) {
      console.error('❌ [InvoiceController] Error fetching Mehfil logo:', error);
      // Mehfil logo not available
    }

    // Header band
    const headerHeight = 70;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, headerHeight + margin / 2, 'F');

    // Logo on the left (preserve aspect ratio, cap height)
    const logoY = margin;
    let cursorX = margin;
    if (vendorLogoDataUrl) {
      try {
        const maxLogoHeight = 36; // pt (increase size)
        const maxLogoWidth = 180; // pt (increase size)
        let drawWidth = 100;
        let drawHeight = 24;
        try {
          const props = pdf.getImageProperties(vendorLogoDataUrl);
          if (props && props.width && props.height) {
            const ratio = props.width / props.height;
            drawHeight = Math.min(maxLogoHeight, props.height);
            drawWidth = drawHeight * ratio;
            if (drawWidth > maxLogoWidth) {
              drawWidth = maxLogoWidth;
              drawHeight = drawWidth / ratio;
            }
          }
        } catch (_) { /* fallback to defaults above */ }
        pdf.addImage(vendorLogoDataUrl, 'PNG', cursorX, logoY, drawWidth, drawHeight, undefined, 'FAST');
      } catch (_) {
        // Fallback to Mehfil text if vendor logo fails
        pdf.setFontSize(22);
        pdf.setTextColor(...brandPurple);
        pdf.text('MEHFIL', cursorX, logoY + 22);
      }
    } else {
      // No vendor logo, use Mehfil text
      pdf.setFontSize(22);
      pdf.setTextColor(...brandPurple);
      pdf.text('MEHFIL', cursorX, logoY + 22);
    }

    // Invoice title and meta on the right
    const rightBoxX = pageWidth - margin - 220;
    pdf.setFontSize(26);
    pdf.setTextColor(...brandPurple);
    pdf.text('INVOICE', rightBoxX, logoY + 8);

    pdf.setFontSize(11);
    pdf.setTextColor(...grayText);
    const metaYStart = logoY + 26;
    pdf.text(`Invoice #: ${invoice.invoiceNumber}`, rightBoxX, metaYStart);
    pdf.text(`Date: ${invoice.formattedInvoiceDate || new Date(invoice.invoiceDate).toLocaleDateString()}`, rightBoxX, metaYStart + 16);
    pdf.text(`Due Date: ${invoice.formattedDueDate || new Date(invoice.dueDate).toLocaleDateString()}`, rightBoxX, metaYStart + 32);
    pdf.text(`Status: ${invoice.status}`, rightBoxX, metaYStart + 48);

    // Separator line (only under right meta to avoid overlapping Bill To area)
    pdf.setDrawColor(...lightBorder);
    pdf.setLineWidth(1);
    pdf.line(rightBoxX, headerHeight + margin / 2, pageWidth - margin, headerHeight + margin / 2);

    // Add Mehfil logo as watermark in background (if available)
    if (mehfilLogoDataUrl) {
      try {
        // Set watermark properties: large size, moderate opacity, centered
        const watermarkSize = 400; // Larger size for better visibility
        const watermarkX = (pageWidth - watermarkSize) / 2;
        const watermarkY = (pageHeight - watermarkSize) / 2;
        
        // Save current graphics state
        pdf.saveGraphicsState();
        
        // Set transparency (opacity) for watermark effect - increased for better visibility
        pdf.setGlobalAlpha(0.15); // Moderate opacity (15%) for better visibility
        
        // Add the watermark image
        pdf.addImage(mehfilLogoDataUrl, 'PNG', watermarkX, watermarkY, watermarkSize, watermarkSize, undefined, 'FAST');
        
        // Restore graphics state
        pdf.restoreGraphicsState();
        
        console.log('✅ [InvoiceController] Mehfil logo watermark added successfully');
      } catch (error) {
        console.error('❌ [InvoiceController] Failed to add Mehfil logo watermark:', error);
        // Watermark failed, continue without it
      }
    } else {
      console.log('⚠️ [InvoiceController] Mehfil logo not available for watermark');
      
      // Fallback: Add text-based watermark
      try {
        pdf.saveGraphicsState();
        pdf.setGlobalAlpha(0.08); // Very low opacity for text watermark
        pdf.setFontSize(120);
        pdf.setTextColor(175, 142, 186); // Brand purple color
        pdf.setFont('helvetica', 'bold');
        
        // Center the text watermark
        const watermarkText = 'MEHFIL';
        const textWidth = pdf.getTextWidth(watermarkText);
        const textX = (pageWidth - textWidth) / 2;
        const textY = pageHeight / 2;
        
        pdf.text(watermarkText, textX, textY);
        pdf.restoreGraphicsState();
        
        console.log('✅ [InvoiceController] Text watermark added as fallback');
      } catch (error) {
        console.error('❌ [InvoiceController] Failed to add text watermark:', error);
      }
    }

    // Bill To box
    let cursorY = headerHeight + margin;
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Bill To', margin, cursorY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...grayText);
    cursorY += 18;
    pdf.text(invoice.clientName || 'Client', margin, cursorY);
    if (invoice.event) {
      cursorY += 16;
      pdf.text(`Event: ${invoice.event}`, margin, cursorY);
    }

    // Items table using autoTable for professional borders and layout
    const currency = (n) => {
      const num = Number(n || 0);
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    };

    const tableBody = (invoice.items || []).map((item) => [
      item.description || '-',
      String(item.quantity ?? 0),
      currency(item.unitPrice),
      currency((item.quantity || 0) * (item.unitPrice || 0))
    ]);

    const tableStartY = cursorY + 24;
    autoTable(pdf, {
      head: [['Description', 'Qty', 'Unit Price', 'Amount']],
      body: tableBody,
      startY: tableStartY,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        textColor: [34, 34, 34],
        lineColor: lightBorder,
        lineWidth: 0.8,
        cellPadding: 8,
      },
      headStyles: {
        fillColor: brandPurple,
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [250, 248, 252] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 60 },
        2: { halign: 'right', cellWidth: 100 },
        3: { halign: 'right', cellWidth: 110 },
      },
      margin: { left: margin, right: margin },
    });

    let afterTableY = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : tableStartY) + 12;

    // Totals table aligned to the right
    const totalsRows = [];
    if (invoice.adjustmentsTotal > 0) {
      totalsRows.push(['Adjustments', currency(invoice.adjustmentsTotal)]);
    }
    totalsRows.push(['Subtotal', currency(invoice.subtotal)]);
    if (invoice.taxAmount > 0) {
      totalsRows.push([`Tax (${Number(invoice.taxRate || 0)}%)`, currency(invoice.taxAmount)]);
    }
    totalsRows.push(['Total', currency(invoice.total)]);

    autoTable(pdf, {
      body: totalsRows,
      startY: afterTableY,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        textColor: [34, 34, 34],
        lineColor: lightBorder,
        lineWidth: 0.8,
        cellPadding: 6,
      },
      columnStyles: {
        0: { cellWidth: 140 },
        1: { cellWidth: 120, halign: 'right' },
      },
      didParseCell: (data) => {
        // Make the last row (Total) bold
        if (data.row.index === totalsRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: pageWidth - margin - 260, right: margin },
    });

    afterTableY = pdf.lastAutoTable.finalY + 16;

    // Payment method and notes box
    const boxWidth = pageWidth - margin * 2;
    const boxHeight = 90;
    pdf.setDrawColor(...lightBorder);
    pdf.setLineWidth(1);
    pdf.roundedRect(margin, afterTableY, boxWidth, boxHeight, 6, 6, 'S');

    const boxPadding = 12;
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Payment', margin + boxPadding, afterTableY + 20);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...grayText);
    pdf.text(`Method: ${invoice.paymentOption || '—'}`, margin + boxPadding, afterTableY + 38);

    // Notes on the right side of the same box
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Notes', margin + boxWidth / 2, afterTableY + 20);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...grayText);
    const notesText = invoice.notes ? String(invoice.notes) : 'Thank you for your business!';
    const notesMaxWidth = boxWidth / 2 - boxPadding * 2;
    const splitNotes = pdf.splitTextToSize(notesText, notesMaxWidth);
    pdf.text(splitNotes, margin + boxWidth / 2, afterTableY + 38);

    // Mehfil Footer - Generated by information
    const footerY = afterTableY + boxHeight + 30;
    const footerWidth = pageWidth - margin * 2;
    
    // Footer separator line
    pdf.setDrawColor(...lightBorder);
    pdf.setLineWidth(1);
    pdf.line(margin, footerY, pageWidth - margin, footerY);
    
    // Footer text
    pdf.setFontSize(10);
    pdf.setTextColor(102, 102, 102); // Gray color
    pdf.setFont('helvetica', 'normal');
    
    // "Generated by Mehfil" text
    const generatedByText = 'Generated by';
    const mehfilText = 'Mehfil';
    const generatedByWidth = pdf.getTextWidth(generatedByText);
    const mehfilWidth = pdf.getTextWidth(mehfilText);
    
    const footerTextX = margin + (footerWidth - generatedByWidth - mehfilWidth - 8) / 2;
    pdf.text(generatedByText, footerTextX, footerY + 20);
    
    // Mehfil in brand color
    pdf.setTextColor(175, 142, 186); // Brand purple color
    pdf.setFont('helvetica', 'bold');
    pdf.text(mehfilText, footerTextX + generatedByWidth + 8, footerY + 20);
    
    // Website URL
    pdf.setFontSize(9);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont('helvetica', 'normal');
    const urlText = 'https://www.mehfil.app';
    const urlWidth = pdf.getTextWidth(urlText);
    const urlX = margin + (footerWidth - urlWidth) / 2;
    pdf.text(urlText, urlX, footerY + 35);

    // Footer - page number and brand tint
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    }

    // Response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Download invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while downloading invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update invoice status
// @route   PATCH /api/invoices/:id/status
// @access  Private (Vendor only)
const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['Pending', 'Paid', 'Overdue', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: Pending, Paid, Overdue, Cancelled'
      });
    }

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Update status
    invoice.status = status;
    
    // If marking as paid, set paidAt timestamp
    if (status === 'Paid') {
      invoice.paidAt = new Date();
    }

    await invoice.save();

    res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
      data: {
        invoice
      }
    });

  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating invoice status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Upload business logo for invoices
// @route   POST /api/invoices/upload-logo
// @access  Private (Vendor only)
const uploadBusinessLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'
      });
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }

    // Upload logo to S3
    const logoUrl = await processAndUploadBusinessLogo(req.file, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Business logo uploaded successfully',
      data: {
        logoUrl
      }
    });

  } catch (error) {
    console.error('Upload business logo error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logo upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  markInvoiceAsPaid,
  updateOverdueInvoices,
  updateInvoiceStatus,
  downloadInvoice,
  uploadBusinessLogo
}; 