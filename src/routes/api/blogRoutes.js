const express = require('express');
const router = express.Router();
const blogController = require('../../controllers/blogController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { uploadInMemory } = require('../../services/fileUploadService');

// Public routes (no authentication required)
router.get('/public', blogController.getPublishedBlogs);
router.get('/public/:slug', blogController.getPublicBlogBySlug);
router.get('/public/:slug/related', blogController.getRelatedBlogs);

// Admin routes (authentication required)
router.get('/', protect, restrictTo('admin'), blogController.getAllBlogs);
router.get('/stats', protect, restrictTo('admin'), blogController.getBlogStats);
router.get('/admin/:slug', protect, restrictTo('admin'), blogController.getBlogBySlug);

// Protected routes (authentication required)
router.use(protect);

// Blog CRUD operations (Admin only)
router.post('/', restrictTo('admin'), blogController.createBlog);
router.put('/:slug', restrictTo('admin'), blogController.updateBlog);
router.delete('/:slug', restrictTo('admin'), blogController.deleteBlog);

// Image upload routes (Admin only)
router.post('/upload/featured-image', 
  restrictTo('admin'), 
  uploadInMemory.single('image'), 
  blogController.uploadFeaturedImage
);

router.post('/upload/multiple-images', 
  restrictTo('admin'), 
  uploadInMemory.array('images', 10), 
  blogController.uploadMultipleImages
);

router.post('/upload/embedded-media', 
  restrictTo('admin'), 
  uploadInMemory.array('media', 10), 
  blogController.uploadEmbeddedMedia
);

// Admin management routes
router.patch('/:slug/feature', restrictTo('admin'), blogController.toggleFeatured);
router.patch('/:slug/pin', restrictTo('admin'), blogController.togglePinned);

// Public comment and like routes (Authentication required)
router.post('/public/:slug/comments', protect, blogController.addPublicComment);
router.post('/public/:slug/like', protect, blogController.toggleBlogLike);

// Admin comment routes (Admin only)
router.post('/:slug/comments', restrictTo('admin'), blogController.addComment);
router.delete('/:slug/comments/:commentId', restrictTo('admin'), blogController.deleteComment);

// Comment approval (Admin only)
router.patch('/:slug/comments/:commentId/approve', 
  restrictTo('admin'), 
  blogController.approveComment
);

module.exports = router;
