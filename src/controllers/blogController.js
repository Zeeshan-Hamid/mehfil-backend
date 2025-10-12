const Blog = require('../models/Blog');
const User = require('../models/User');
const { processAndUploadBlogImages } = require('../services/fileUploadService');
const { uploadInMemory } = require('../services/fileUploadService');
const slugify = require('slugify');

// Helper function to calculate reading time
const calculateReadingTime = (content) => {
  if (!content) return 0;
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

// Helper function to extract meta description from content
const extractMetaDescription = (content, maxLength = 160) => {
  if (!content) return '';
  // Remove HTML tags and get plain text
  const plainText = content.replace(/<[^>]*>/g, '');
  return plainText.length > maxLength ? plainText.substring(0, maxLength - 3) + '...' : plainText;
};

// Create a new blog post
exports.createBlog = async (req, res) => {
  try {
    const {
      title,
      featuredImage,
      featuredImageAlt,
      excerpt,
      content,
      category,
      tags,
      metaTitle,
      metaDescription,
      keywords,
      status = 'draft',
      embeddedMedia,
      internalLinks,
      commentsEnabled = true
    } = req.body;

    // Validate required fields
    if (!title || !content || !category) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title, content, and category are required.'
      });
    }

    // Get author information
    const author = await User.findById(req.user._id);
    if (!author) {
      return res.status(404).json({
        status: 'fail',
        message: 'Author not found.'
      });
    }

    // Create blog data
    const blogData = {
      title,
      featuredImage,
      featuredImageAlt,
      excerpt: excerpt || extractMetaDescription(content, 500),
      content,
      author: req.user._id,
      authorName: author.role === 'admin' ? 
        (author.customerProfile?.fullName || author.vendorProfile?.ownerName || 'Admin') :
        (author.customerProfile?.fullName || author.vendorProfile?.ownerName || 'Admin'),
      authorBio: author.role === 'admin' ? 
        'Administrator' :
        (author.vendorProfile?.businessName || 'Author'),
      authorImage: author.customerProfile?.profileImage || author.vendorProfile?.vendorProfileImage || null,
      category,
      tags: tags || [],
      metaTitle: metaTitle || title,
      metaDescription: metaDescription || extractMetaDescription(content),
      keywords: keywords || [],
      status,
      embeddedMedia: embeddedMedia || [],
      internalLinks: internalLinks || [],
      commentsEnabled,
      readingTime: calculateReadingTime(content)
    };

    const blog = await Blog.create(blogData);

    res.status(201).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error creating blog
    res.status(500).json({
      status: 'error',
      message: 'Failed to create blog post.',
      error: error.message
    });
  }
};

// Upload featured image
exports.uploadFeaturedImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No image file provided.'
      });
    }

    const imageUrl = await processAndUploadBlogImages([req.file], req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: {
        imageUrl: imageUrl[0]
      }
    });
  } catch (error) {
    // Error uploading featured image
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload featured image.',
      error: error.message
    });
  }
};

// Upload multiple images for embedded media
exports.uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No image files provided.'
      });
    }

    const imageUrls = await processAndUploadBlogImages(req.files, req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: {
        imageUrls
      }
    });
  } catch (error) {
    // Error uploading images
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload images.',
      error: error.message
    });
  }
};

// Upload embedded media
exports.uploadEmbeddedMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No media files provided.'
      });
    }

    const mediaUrls = await processAndUploadBlogImages(req.files, req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: {
        mediaUrls
      }
    });
  } catch (error) {
    // Error uploading embedded media
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload embedded media.',
      error: error.message
    });
  }
};

// Get all blogs with filtering and pagination
exports.getAllBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'published',
      category,
      author,
      search,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      featured,
      pinned
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (author) filter.author = author;
    if (featured === 'true') filter.isFeatured = true;
    if (pinned === 'true') filter.isPinned = true;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const blogs = await Blog.find(filter)
      .populate('author', 'customerProfile.fullName vendorProfile.ownerName role')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Blog.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: blogs.length,
      total,
      data: {
        blogs
      }
    });
  } catch (error) {
    // Error fetching blogs
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch blogs.',
      error: error.message
    });
  }
};

// Get blog by slug or ID
exports.getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug })
      .populate('author', 'customerProfile.fullName vendorProfile.ownerName role customerProfile.profileImage vendorProfile.vendorProfileImage')
      .populate('comments.user', 'customerProfile.fullName vendorProfile.ownerName role customerProfile.profileImage vendorProfile.vendorProfileImage');

    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    // No view count tracking needed

    res.status(200).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error fetching blog
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch blog post.',
      error: error.message
    });
  }
};

// Update blog post
exports.updateBlog = async (req, res) => {
  try {
    const { slug } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.author;
    delete updateData.publishedAt;

    // Recalculate reading time if content is updated
    if (updateData.content) {
      updateData.readingTime = calculateReadingTime(updateData.content);
    }

    // Update meta description if content is updated and no custom meta description
    if (updateData.content && !updateData.metaDescription) {
      updateData.metaDescription = extractMetaDescription(updateData.content);
    }

    const blog = await Blog.findOneAndUpdate(
      { slug, author: req.user._id },
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'customerProfile.fullName vendorProfile.ownerName role');

    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found or you do not have permission to update it.'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error updating blog
    res.status(500).json({
      status: 'error',
      message: 'Failed to update blog post.',
      error: error.message
    });
  }
};

// Delete blog post
exports.deleteBlog = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOneAndDelete({ slug, author: req.user._id });

    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found or you do not have permission to delete it.'
      });
    }

    res.status(204).json({
      status: 'success',
      message: 'Blog post deleted successfully.'
    });
  } catch (error) {
    // Error deleting blog
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete blog post.',
      error: error.message
    });
  }
};

// Add comment to blog
exports.addComment = async (req, res) => {
  try {
    const { slug } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        status: 'fail',
        message: 'Comment content is required.'
      });
    }

    const blog = await Blog.findOne({ slug });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    if (!blog.commentsEnabled) {
      return res.status(400).json({
        status: 'fail',
        message: 'Comments are disabled for this blog post.'
      });
    }

    const comment = {
      user: req.user._id,
      content,
      isApproved: true // Comments are immediately visible
    };

    blog.comments.push(comment);
    await blog.save();

    res.status(201).json({
      status: 'success',
      data: {
        comment: blog.comments[blog.comments.length - 1]
      }
    });
  } catch (error) {
    // Error adding comment
    res.status(500).json({
      status: 'error',
      message: 'Failed to add comment.',
      error: error.message
    });
  }
};

// Approve/Disapprove comment (Admin only)
exports.approveComment = async (req, res) => {
  try {
    const { slug, commentId } = req.params;
    const { isApproved } = req.body;

    const blog = await Blog.findOne({ slug });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    const comment = blog.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Comment not found.'
      });
    }

    comment.isApproved = isApproved;
    await blog.save();

    res.status(200).json({
      status: 'success',
      data: {
        comment
      }
    });
  } catch (error) {
    // Error approving comment
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve comment.',
      error: error.message
    });
  }
};

// Delete comment
exports.deleteComment = async (req, res) => {
  try {
    const { slug, commentId } = req.params;

    const blog = await Blog.findOne({ slug });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    const comment = blog.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Comment not found.'
      });
    }

    // Check if user is the comment author or admin
    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to delete this comment.'
      });
    }

    comment.remove();
    await blog.save();

    res.status(200).json({
      status: 'success',
      message: 'Comment deleted successfully.'
    });
  } catch (error) {
    // Error deleting comment
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete comment.',
      error: error.message
    });
  }
};

// Feature/Unfeature blog (Admin only)
exports.toggleFeatured = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    blog.isFeatured = !blog.isFeatured;
    blog.featuredAt = blog.isFeatured ? new Date() : null;
    await blog.save();

    res.status(200).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error toggling featured status
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle featured status.',
      error: error.message
    });
  }
};

// Pin/Unpin blog (Admin only)
exports.togglePinned = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    blog.isPinned = !blog.isPinned;
    blog.pinnedAt = blog.isPinned ? new Date() : null;
    await blog.save();

    res.status(200).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error toggling pinned status
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle pinned status.',
      error: error.message
    });
  }
};

// Get blog statistics (Admin only)
exports.getBlogStats = async (req, res) => {
  try {
    const stats = await Blog.aggregate([
      {
        $group: {
          _id: null,
          totalBlogs: { $sum: 1 },
          publishedBlogs: {
            $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] }
          },
          draftBlogs: {
            $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
          },
          featuredBlogs: {
            $sum: { $cond: ['$isFeatured', 1, 0] }
          },
          totalComments: { $sum: '$totalComments' }
        }
      }
    ]);

    const categoryStats = await Blog.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        stats: stats[0] || {
          totalBlogs: 0,
          publishedBlogs: 0,
          draftBlogs: 0,
          featuredBlogs: 0,
          totalViews: 0,
          totalComments: 0,
          totalLikes: 0
        },
        categoryStats
      }
    });
  } catch (error) {
    // Error fetching blog stats
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch blog statistics.',
      error: error.message
    });
  }
};

// ===== PUBLIC APIs (No Authentication Required) =====

// Get all published blogs (Public)
exports.getPublishedBlogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      sortBy = 'publishedAt', 
      sortOrder = 'desc',
      featured,
      pinned
    } = req.query;
    
    const query = { status: 'published' };
    
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (pinned === 'true') query.isPinned = true;
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const blogs = await Blog.find(query)
      .populate('author', 'authorName authorBio authorImage')
      .select('title slug excerpt featuredImage featuredImageAlt author authorName publishedAt category tags readingTime totalComments isFeatured isPinned')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await Blog.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        blogs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalBlogs: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    // Error fetching published blogs
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch blogs.',
      error: error.message
    });
  }
};

// Get single published blog by slug (Public)
exports.getPublicBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('author', 'authorName authorBio authorImage')
      .populate({
        path: 'comments.user',
        select: 'customerProfile.fullName customerProfile.profileImage'
      });

    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        blog
      }
    });
  } catch (error) {
    // Error fetching blog
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch blog.',
      error: error.message
    });
  }
};

// Get related blogs (Public)
exports.getRelatedBlogs = async (req, res) => {
  try {
    const { slug } = req.params;
    const { limit = 5 } = req.query;

    // First get the current blog to find its category and tags
    const currentBlog = await Blog.findOne({ slug, status: 'published' })
      .select('category tags');

    if (!currentBlog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    // Find related blogs based on category and tags
    const relatedBlogs = await Blog.find({
      _id: { $ne: currentBlog._id },
      status: 'published',
      $or: [
        { category: currentBlog.category },
        { tags: { $in: currentBlog.tags } }
      ]
    })
    .populate('author', 'authorName authorBio authorImage')
    .select('title slug excerpt featuredImage featuredImageAlt author authorName publishedAt category tags readingTime totalComments')
    .sort({ publishedAt: -1 })
    .limit(parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: {
        blogs: relatedBlogs,
        count: relatedBlogs.length
      }
    });
  } catch (error) {
    // Error fetching related blogs
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch related blogs.',
      error: error.message
    });
  }
};

// ===== AUTHENTICATED APIs (Login Required) =====

// Add comment to blog (Authenticated)
exports.addPublicComment = async (req, res) => {
  try {
    const { slug } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Comment content is required.'
      });
    }

    const blog = await Blog.findOne({ slug, status: 'published' });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    const newComment = {
      user: userId,
      content: content.trim(),
      isApproved: true // Comments are immediately visible
    };

    blog.comments.push(newComment);
    await blog.save();

    res.status(201).json({
      status: 'success',
      message: 'Comment added successfully.',
      data: {
        comment: newComment
      }
    });
  } catch (error) {
    // Error adding comment
    res.status(500).json({
      status: 'error',
      message: 'Failed to add comment.',
      error: error.message
    });
  }
};

// Like/Unlike blog (Authenticated)
exports.toggleBlogLike = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user._id;

    const blog = await Blog.findOne({ slug, status: 'published' });
    if (!blog) {
      return res.status(404).json({
        status: 'fail',
        message: 'Blog post not found.'
      });
    }

    // Check if user already liked this blog
    const existingLike = blog.likes.find(like => like.user.toString() === userId.toString());
    
    if (existingLike) {
      // Unlike - remove the like
      blog.likes = blog.likes.filter(like => like.user.toString() !== userId.toString());
      await blog.save();
      
      res.status(200).json({
        status: 'success',
        message: 'Blog unliked successfully.',
        data: {
          isLiked: false,
          likeCount: blog.likes.length
        }
      });
    } else {
      // Like - add the like
      blog.likes.push({ user: userId, likedAt: new Date() });
      await blog.save();
      
      res.status(200).json({
        status: 'success',
        message: 'Blog liked successfully.',
        data: {
          isLiked: true,
          likeCount: blog.likes.length
        }
      });
    }
  } catch (error) {
    // Error toggling blog like
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle like.',
      error: error.message
    });
  }
};
