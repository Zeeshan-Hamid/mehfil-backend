const { Mistral } = require('@mistralai/mistralai');
const AWS = require('aws-sdk');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

// Initialize S3 client for temporary file hosting
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

// Initialize Mistral client
let mistralClient = null;
const getMistralClient = () => {
  if (!mistralClient) {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY environment variable is required');
    }
    mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return mistralClient;
};

/**
 * Upload file temporarily to S3 and get public URL for Mistral OCR
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} mimeType - MIME type
 * @returns {Promise<string>} Public URL
 */
async function uploadToS3ForOCR(fileBuffer, fileName, mimeType) {
  try {
    // Create a unique filename for temporary storage
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const s3Key = `temp-ocr/${uniqueSuffix}-${fileName}`;
    
    // Upload to S3 without ACL (bucket policies may already allow public access)
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: 'no-cache' // Don't cache temporary files
    }).promise();
    
    // Generate presigned URL that's publicly accessible for 1 hour
    // Mistral OCR needs to access this URL, so we use presigned URL with public-read
    const publicUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600 // 1 hour should be enough for OCR processing
    });
    
    logger.info(
      {
        event: 's3_file_uploaded_for_ocr',
        s3Key,
        publicUrl,
        fileName
      },
      'File uploaded to S3 for OCR'
    );
    
    return { url: publicUrl, s3Key };
  } catch (error) {
    logger.error(
      {
        event: 's3_upload_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error uploading file to S3 for OCR'
    );
    throw error;
  }
}

/**
 * Delete temporary file from S3
 * @param {string} s3Key - S3 key to delete
 */
async function deleteFromS3(s3Key) {
  try {
    await s3.deleteObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key
    }).promise();
    
    // File deleted successfully - no need to log routine cleanup
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break the flow
    logger.warn(
      {
        event: 's3_delete_error',
        s3Key,
        error: error?.message
      },
      'Failed to delete temporary file from S3'
    );
  }
}

/**
 * Extract text from PDF file using Mistral OCR
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPDF(pdfBuffer) {
  let s3Key = null;
  
  try {
    const client = getMistralClient();
    
    logger.info({ event: 'mistral_ocr_pdf_start' }, 'Starting Mistral OCR for PDF');
    
    // Upload file to S3 temporarily to get public URL
    const { url: publicUrl, s3Key: key } = await uploadToS3ForOCR(pdfBuffer, 'menu.pdf', 'application/pdf');
    s3Key = key;
    
    // Use public URL for OCR
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: publicUrl
      },
      includeImageBase64: false
    });
    
    // Extract text from Mistral OCR response
    // Mistral OCR returns: { pages: [...], model, documentAnnotation, usageInfo }
    // Each page has markdown text
    let extractedText = '';
    
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      // Extract markdown from all pages
      extractedText = ocrResponse.pages
        .map(page => page.markdown || page.text || page.content || '')
        .filter(text => text.length > 0)
        .join('\n\n');
    } else if (ocrResponse.markdown) {
      extractedText = ocrResponse.markdown;
    } else if (ocrResponse.text) {
      extractedText = ocrResponse.text;
    } else if (ocrResponse.content) {
      extractedText = ocrResponse.content;
    } else if (typeof ocrResponse === 'string') {
      extractedText = ocrResponse;
    } else if (ocrResponse.documentAnnotation?.markdown) {
      extractedText = ocrResponse.documentAnnotation.markdown;
    }
    
    if (!extractedText) {
      logger.warn(
        {
          event: 'mistral_ocr_unexpected_response',
          responseKeys: Object.keys(ocrResponse || {}),
          responseStructure: JSON.stringify(ocrResponse).substring(0, 500)
        },
        'Unexpected OCR response format, no text extracted'
      );
    }
    
    logger.info(
      {
        event: 'mistral_ocr_pdf_success',
        textLength: extractedText.length,
        extractedText: extractedText.substring(0, 500) // First 500 chars for preview
      },
      `Mistral OCR completed for PDF. Extracted ${extractedText.length} characters.`
    );
    
    // Extracted text ready - no need to log full text (too verbose)
    
    return extractedText;
  } catch (error) {
    logger.error(
      {
        event: 'pdf_extraction_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error extracting text from PDF using Mistral OCR'
    );
    throw new Error('Failed to extract text from PDF: ' + error.message);
  } finally {
    // Clean up temporary S3 file
    if (s3Key) {
      await deleteFromS3(s3Key);
    }
  }
}

/**
 * Extract text from image using Mistral OCR
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromImage(imageBuffer, mimeType) {
  let s3Key = null;
  
  try {
    const client = getMistralClient();
    
    // Determine file extension from mime type
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    const ext = extensions[mimeType] || 'jpg';
    const fileName = `menu.${ext}`;
    
    logger.info({ event: 'mistral_ocr_image_start', mimeType }, 'Starting Mistral OCR for image');
    
    // Upload file to S3 temporarily to get public URL
    const { url: publicUrl, s3Key: key } = await uploadToS3ForOCR(imageBuffer, fileName, mimeType);
    s3Key = key;
    
    // Use public URL for OCR
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl: publicUrl
      },
      includeImageBase64: false
    });
    
    // Extract text from Mistral OCR response
    // Mistral OCR returns: { pages: [...], model, documentAnnotation, usageInfo }
    // Each page has markdown text
    let extractedText = '';
    
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      // Extract markdown from all pages
      extractedText = ocrResponse.pages
        .map(page => page.markdown || page.text || page.content || '')
        .filter(text => text.length > 0)
        .join('\n\n');
    } else if (ocrResponse.markdown) {
      extractedText = ocrResponse.markdown;
    } else if (ocrResponse.text) {
      extractedText = ocrResponse.text;
    } else if (ocrResponse.content) {
      extractedText = ocrResponse.content;
    } else if (typeof ocrResponse === 'string') {
      extractedText = ocrResponse;
    } else if (ocrResponse.documentAnnotation?.markdown) {
      extractedText = ocrResponse.documentAnnotation.markdown;
    }
    
    if (!extractedText) {
      logger.warn(
        {
          event: 'mistral_ocr_unexpected_response',
          responseKeys: Object.keys(ocrResponse || {}),
          responseStructure: JSON.stringify(ocrResponse).substring(0, 500)
        },
        'Unexpected OCR response format, no text extracted'
      );
    }
    
    logger.info(
      {
        event: 'mistral_ocr_image_success',
        textLength: extractedText.length,
        mimeType,
        extractedText: extractedText.substring(0, 500) // First 500 chars for preview
      },
      `Mistral OCR completed for image. Extracted ${extractedText.length} characters.`
    );
    
    // Extracted text ready - no need to log full text (too verbose)
    
    return extractedText;
  } catch (error) {
    logger.error(
      {
        event: 'ocr_extraction_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error extracting text from image using Mistral OCR'
    );
    throw new Error('Failed to extract text from image: ' + error.message);
  } finally {
    // Clean up temporary S3 file
    if (s3Key) {
      await deleteFromS3(s3Key);
    }
  }
}

/**
 * Parse menu text and extract structured menu items
 * @param {string} text - Raw menu text
 * @returns {Array} Structured menu items
 */
function parseMenuStructure(text) {
  const menuItems = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Common menu categories
  const categoryKeywords = [
    'appetizers', 'starters', 'soups', 'salads',
    'main course', 'main courses', 'entrees', 'mains',
    'desserts', 'dessert',
    'drinks', 'beverages', 'beverage', 'cocktails',
    'sides', 'side dishes'
  ];

  let currentCategory = 'Other';
  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check if line is a category header
    const matchedCategory = categoryKeywords.find(cat => 
      lowerLine.includes(cat) && line.length < 50 // Category headers are usually short
    );

    if (matchedCategory) {
      // Map to standardized category
      if (matchedCategory.includes('appetizer') || matchedCategory.includes('starter')) {
        currentCategory = 'Appetizers';
      } else if (matchedCategory.includes('main') || matchedCategory.includes('entree')) {
        currentCategory = 'Main Courses';
      } else if (matchedCategory.includes('dessert')) {
        currentCategory = 'Desserts';
      } else if (matchedCategory.includes('drink') || matchedCategory.includes('beverage') || matchedCategory.includes('cocktail')) {
        currentCategory = 'Drinks';
      } else if (matchedCategory.includes('soup')) {
        currentCategory = 'Soups';
      } else if (matchedCategory.includes('salad')) {
        currentCategory = 'Salads';
      } else {
        currentCategory = 'Other';
      }
      continue;
    }

    // Try to extract price (usually at the end, formats: $XX.XX, XX.XX, $XX)
    const priceMatch = line.match(/(\$?\d+\.?\d*)/);
    let price = null;
    if (priceMatch) {
      price = parseFloat(priceMatch[1].replace('$', ''));
    }

    // Check if line looks like an item name (capitalized, relatively short)
    const isItemName = /^[A-Z]/.test(line) && line.length < 100 && !priceMatch;

    if (isItemName && !currentItem) {
      // Start of a new item
      currentItem = {
        name: line,
        description: '',
        price: price || null,
        category: currentCategory,
        attributes: []
      };
    } else if (currentItem) {
      // Continue building current item
      if (priceMatch && !currentItem.price) {
        currentItem.price = price;
        // Description might be the part before the price
        const descPart = line.substring(0, priceMatch.index).trim();
        if (descPart && descPart !== currentItem.name) {
          currentItem.description += (currentItem.description ? ' ' : '') + descPart;
        }
      } else if (!priceMatch && line !== currentItem.name) {
        // Add to description
        currentItem.description += (currentItem.description ? ' ' : '') + line;
      }

      // If we have a price and the next line looks like a new item, finalize current item
      if (currentItem.price || (i < lines.length - 1 && /^[A-Z]/.test(lines[i + 1]) && lines[i + 1].length < 100)) {
        // Extract attributes from description
        const descLower = currentItem.description.toLowerCase();
        if (descLower.includes('spicy') || descLower.includes('hot')) {
          currentItem.attributes.push('spicy');
        }
        if (descLower.includes('vegetarian') || descLower.includes('veggie')) {
          currentItem.attributes.push('vegetarian');
        }
        if (descLower.includes('vegan')) {
          currentItem.attributes.push('vegan');
        }
        if (descLower.includes('gluten-free') || descLower.includes('gluten free')) {
          currentItem.attributes.push('gluten-free');
        }

        menuItems.push(currentItem);
        currentItem = null;
      }
    }
  }

  // Add last item if exists
  if (currentItem) {
    menuItems.push(currentItem);
  }

  // If no structured items found, create items from all text lines
  if (menuItems.length === 0) {
    logger.warn({ event: 'menu_parsing_fallback' }, 'Could not parse structured menu, using fallback extraction');
    
    // Fallback: create items from significant lines
    lines.forEach((line, index) => {
      if (line.length > 3 && line.length < 200) {
        const priceMatch = line.match(/(\$?\d+\.?\d*)/);
        menuItems.push({
          name: line.replace(/\$?\d+\.?\d*/g, '').trim() || `Item ${index + 1}`,
          description: '',
          price: priceMatch ? parseFloat(priceMatch[1].replace('$', '')) : null,
          category: currentCategory,
          attributes: []
        });
      }
    });
  }

  logger.info(
    {
      event: 'menu_parsed',
      itemCount: menuItems.length,
      categories: [...new Set(menuItems.map(item => item.category))]
    },
    `Parsed menu: ${menuItems.length} items found`
  );

  return menuItems;
}

/**
 * Process menu file and return structured data
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} Processed menu data
 */
async function processMenuFile(file) {
  try {
    let extractedText = '';

    if (file.mimetype === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.buffer);
    } else if (file.mimetype.startsWith('image/')) {
      extractedText = await extractTextFromImage(file.buffer, file.mimetype);
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or image file.');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the uploaded file.');
    }

    const menuItems = parseMenuStructure(extractedText);

    return {
      rawText: extractedText,
      menuItems: menuItems,
      itemCount: menuItems.length,
      categories: [...new Set(menuItems.map(item => item.category))]
    };
  } catch (error) {
    logger.error(
      {
        event: 'menu_processing_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
        fileType: file?.mimetype
      },
      'Error processing menu file'
    );
    throw error;
  }
}

module.exports = {
  processMenuFile,
  extractTextFromPDF,
  extractTextFromImage,
  parseMenuStructure
};

