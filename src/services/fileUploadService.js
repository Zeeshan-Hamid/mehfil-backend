const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const sharp = require('sharp');

// 1. Multer Configuration to store files in memory
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type, only images are allowed!'), false);
  }
};

exports.uploadInMemory = multer({ storage: memoryStorage, fileFilter });


// 2. Image Processing and S3 Upload Logic
const s3 = new S3Client({
  credentials: {
    secretAccessKey: process.env.AWS_SECRET_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID
  },
  region: process.env.AWS_REGION
});

exports.processAndUploadImages = async (files, userId) => {
  const uploadedUrls = await Promise.all(
    files.map(async (file) => {
      // Create a unique filename for the optimized image
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const newFilename = `events/${userId}-${uniqueSuffix}.webp`;

      // Process the image: resize and convert to WebP
      const processedBuffer = await sharp(file.buffer)
        .resize({ width: 1920, height: 1080, fit: 'inside' }) // Resize to max dimensions
        .webp({ quality: 80 }) // Convert to WebP with 80% quality
        .toBuffer();

      // Prepare the upload command for S3
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: newFilename,
        Body: processedBuffer,
        ContentType: 'image/webp' // Set the correct MIME type
      });

      // Upload to S3
      await s3.send(command);

      // Return the public URL of the uploaded file
      return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
    })
  );

  return uploadedUrls;
}; 