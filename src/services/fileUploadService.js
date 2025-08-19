const AWS = require('aws-sdk');
const multer = require('multer');
const sharp = require('sharp');

// 1. Multer Configuration to store files in memory
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, and DOCX files are allowed.'), false);
  }
};

exports.uploadInMemory = multer({ storage: memoryStorage, fileFilter });


// 2. Image Processing and S3 Upload Logic
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

exports.processAndUploadImages = async (files, userId) => {
  try {
    const uploadedUrls = await Promise.all(
      files.map(async (file) => {
        // Create a unique filename for the optimized image
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = `events/${userId}-${uniqueSuffix}.webp`;

        // Process the image: resize and convert to WebP with optimized settings
        const processedBuffer = await sharp(file.buffer)
          .resize({ 
            width: 1920, 
            height: 1080, 
            fit: 'inside', 
            withoutEnlargement: true 
          }) // Resize to max dimensions, don't enlarge small images
          .webp({ 
            quality: 80,
            effort: 4, // Higher compression effort for smaller file size
            nearLossless: false // Better compression
          }) // Convert to WebP with 80% quality
          .toBuffer();

        // Upload to S3
        await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: newFilename,
          Body: processedBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000' // Cache for 1 year
        }).promise();

        // Return the public URL of the uploaded file
        return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
      })
    );

    return uploadedUrls;
  } catch (error) {
    console.error('❌ [FileUploadService] Error processing/uploading event images:', error);
    throw new Error('Failed to process and upload images');
  }
};

// 3. Image Processing and S3 Upload Logic for Messages (Single Image)
exports.processAndUploadMessageImage = async (file, userId, conversationId) => {
    try {
        console.log('🔄 [FileUploadService] Starting image processing for conversation:', conversationId);

        // Create a unique filename for the optimized image
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = `messages/${conversationId}/${userId}-${uniqueSuffix}.webp`;
        console.log('📄 [FileUploadService] New filename:', newFilename);

        // Process the image: resize and convert to WebP with optimized settings
        const processedBuffer = await sharp(file.buffer)
            .resize({ 
                width: 800, 
                height: 600, 
                fit: 'inside', 
                withoutEnlargement: true 
            }) // Max 800x600 for chat images, don't enlarge small images
            .webp({ 
                quality: 75,
                effort: 4, // Higher compression effort for smaller file size
                nearLossless: false // Better compression
            }) // Convert to WebP with 75% quality
            .toBuffer();
        console.log('✅ [FileUploadService] Image processed successfully');

        // Upload to S3
        await s3.upload({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: newFilename,
            Body: processedBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000' // Cache for 1 year
        }).promise();
        console.log('✅ [FileUploadService] Image uploaded to S3');

        // Return the public URL of the uploaded file
        const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
        console.log('🔗 [FileUploadService] Image URL:', imageUrl);

        return imageUrl;
    } catch (error) {
        console.error('❌ [FileUploadService] Error processing/uploading message image:', error);
        throw new Error('Failed to process and upload image');
    }
};

// 4. Multiple Image Processing and S3 Upload Logic for Messages
exports.processAndUploadMultipleMessageImages = async (files, userId, conversationId) => {
    try {
        console.log('🔄 [FileUploadService] Starting multiple image processing for conversation:', conversationId);
        console.log('📄 [FileUploadService] Number of images to process:', files.length);

        const uploadedUrls = await Promise.all(
            files.map(async (file, index) => {
                console.log(`🔄 [FileUploadService] Processing image ${index + 1}/${files.length}:`, file.originalname);

                // Create a unique filename for the optimized image
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + index;
                const newFilename = `messages/${conversationId}/${userId}-${uniqueSuffix}.webp`;
                console.log('📄 [FileUploadService] New filename:', newFilename);

                // Process the image: resize and convert to WebP with optimized settings
                const processedBuffer = await sharp(file.buffer)
                    .resize({ 
                        width: 800, 
                        height: 600, 
                        fit: 'inside', 
                        withoutEnlargement: true 
                    }) // Max 800x600 for chat images, don't enlarge small images
                    .webp({ 
                        quality: 75,
                        effort: 4, // Higher compression effort for smaller file size
                        nearLossless: false // Better compression
                    }) // Convert to WebP with 75% quality
                    .toBuffer();
                console.log(`✅ [FileUploadService] Image ${index + 1} processed successfully`);

                // Upload to S3
                await s3.upload({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: newFilename,
                    Body: processedBuffer,
                    ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000' // Cache for 1 year
                }).promise();
                console.log(`✅ [FileUploadService] Image ${index + 1} uploaded to S3`);

                // Return the public URL of the uploaded file
                const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
                console.log(`🔗 [FileUploadService] Image ${index + 1} URL:`, imageUrl);

                return imageUrl;
            })
        );

        console.log('✅ [FileUploadService] All images processed and uploaded successfully');
        return uploadedUrls;
    } catch (error) {
        console.error('❌ [FileUploadService] Error processing/uploading multiple message images:', error);
        throw new Error('Failed to process and upload images');
    }
};

// 4. Document Upload Logic for Messages
exports.uploadMessageDocument = async (file, userId, conversationId) => {
    try {
        console.log('🔄 [FileUploadService] Starting document upload for conversation:', conversationId);

        // Create a unique filename for the document
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = file.originalname.split('.').pop();
        const newFilename = `documents/${conversationId}/${userId}-${uniqueSuffix}.${extension}`;
        console.log('📄 [FileUploadService] New filename:', newFilename);

        // Upload to S3
        await s3.upload({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: newFilename,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentDisposition: `attachment; filename="${file.originalname}"`, // Prompt download
            CacheControl: 'public, max-age=31536000' // Cache for 1 year
        }).promise();
        console.log('✅ [FileUploadService] Document uploaded to S3');

        // Return the public URL of the uploaded file
        const documentUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
        console.log('🔗 [FileUploadService] Document URL:', documentUrl);

        return documentUrl;
    } catch (error) {
        console.error('❌ [FileUploadService] Error uploading message document:', error);
        throw new Error('Failed to upload document');
    }
};

// 5. Profile Image Upload Logic
exports.processAndUploadProfileImage = async (file, userId) => {
    try {
        console.log('🔄 [FileUploadService] Starting profile image processing for user:', userId);

        // Create a unique filename for the optimized profile image
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = `profiles/${userId}-${uniqueSuffix}.webp`;
        console.log('📄 [FileUploadService] New filename:', newFilename);

        // Process the image: resize and convert to WebP with optimized settings
        const processedBuffer = await sharp(file.buffer)
            .resize({ 
                width: 400, 
                height: 400, 
                fit: 'cover', 
                position: 'center'
            }) // Square profile image, 400x400
            .webp({ 
                quality: 85,
                effort: 4, // Higher compression effort for smaller file size
                nearLossless: false // Better compression
            }) // Convert to WebP with 85% quality
            .toBuffer();
        console.log('✅ [FileUploadService] Profile image processed successfully');

        // Upload to S3
        await s3.upload({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: newFilename,
            Body: processedBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000' // Cache for 1 year
        }).promise();
        console.log('✅ [FileUploadService] Profile image uploaded to S3');

        // Return the public URL of the uploaded file
        const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
        console.log('🔗 [FileUploadService] Profile image URL:', imageUrl);

        return imageUrl;
    } catch (error) {
        console.error('❌ [FileUploadService] Error processing/uploading profile image:', error);
        throw new Error('Failed to process and upload profile image');
    }
};

// 6. Business Logo Upload Logic for Invoices
exports.processAndUploadBusinessLogo = async (file, userId) => {
    try {
        console.log('🔄 [FileUploadService] Starting business logo processing for user:', userId);

        // Create a unique filename for the optimized business logo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFilename = `business-logos/${userId}-${uniqueSuffix}.webp`;
        console.log('📄 [FileUploadService] New business logo filename:', newFilename);

        // Process the image: resize and convert to WebP with optimized settings
        // Business logos should be square and reasonably sized for invoices
        const processedBuffer = await sharp(file.buffer)
            .resize({ 
                width: 300, 
                height: 300, 
                fit: 'inside', 
                withoutEnlargement: true,
                background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
            }) // Square business logo, max 300x300
            .webp({ 
                quality: 90, // Higher quality for business logos
                effort: 4, // Higher compression effort for smaller file size
                nearLossless: false // Better compression
            }) // Convert to WebP with 90% quality
            .toBuffer();
        console.log('✅ [FileUploadService] Business logo processed successfully');

        // Upload to S3
        await s3.upload({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: newFilename,
            Body: processedBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000' // Cache for 1 year
        }).promise();
        console.log('✅ [FileUploadService] Business logo uploaded to S3');

        // Return the public URL of the uploaded file
        const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
        console.log('🔗 [FileUploadService] Business logo URL:', imageUrl);

        return imageUrl;
    } catch (error) {
        console.error('❌ [FileUploadService] Error processing/uploading business logo:', error);
        throw new Error('Failed to process and upload business logo');
    }
};
