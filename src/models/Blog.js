const mongoose = require('mongoose');
const slugify = require('slugify');

// Sub-schema for Comments
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment must belong to a user.']
  },
  content: {
    type: String,
    required: [true, 'Comment content is required.'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters.']
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Sub-schema for Embedded Media
const embeddedMediaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['image', 'video', 'audio', 'document'],
    required: [true, 'Media type is required.']
  },
  url: {
    type: String,
    required: [true, 'Media URL is required.']
  },
  caption: {
    type: String,
    trim: true,
    maxlength: [500, 'Caption cannot exceed 500 characters.']
  },
  altText: {
    type: String,
    trim: true,
    maxlength: [200, 'Alt text cannot exceed 200 characters.']
  },
  position: {
    type: Number,
    default: 0
  }
});

// Sub-schema for Internal Links
const internalLinkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Link title is required.'],
    trim: true,
    maxlength: [200, 'Link title cannot exceed 200 characters.']
  },
  url: {
    type: String,
    required: [true, 'Link URL is required.'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Link description cannot exceed 500 characters.']
  },
  position: {
    type: Number,
    default: 0
  }
});

const blogSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Blog title is required.'],
    trim: true,
    maxlength: [200, 'Blog title cannot exceed 200 characters.']
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  featuredImage: {
    type: String,
    required: [true, 'Featured image is required.']
  },
  featuredImageAlt: {
    type: String,
    trim: true,
    maxlength: [200, 'Featured image alt text cannot exceed 200 characters.']
  },
  
  // Author Information
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Blog author is required.'],
    index: true
  },
  authorName: {
    type: String,
    required: [true, 'Author name is required.'],
    trim: true,
    maxlength: [100, 'Author name cannot exceed 100 characters.']
  },
  authorBio: {
    type: String,
    trim: true,
    maxlength: [500, 'Author bio cannot exceed 500 characters.']
  },
  authorImage: {
    type: String,
    default: null
  },
  
  // Content
  excerpt: {
    type: String,
    required: [true, 'Blog excerpt is required.'],
    trim: true,
    maxlength: [500, 'Excerpt cannot exceed 500 characters.']
  },
  content: {
    type: String,
    required: [true, 'Blog content is required.'],
    maxlength: [50000, 'Content cannot exceed 50000 characters.']
  },
  readingTime: {
    type: Number,
    default: 0,
    min: [0, 'Reading time cannot be negative.']
  },
  
  // Media and Links
  embeddedMedia: [embeddedMediaSchema],
  internalLinks: [internalLinkSchema],
  
  // Categorization
  category: {
    type: String,
    required: [true, 'Blog category is required.'],
    enum: [
      'Wedding Planning',
      'Event Planning',
      'Catering',
      'Photography',
      'Videography',
      'Decor',
      'Entertainment',
      'Venue',
      'Fashion & Beauty',
      'Travel',
      'Lifestyle',
      'Business',
      'Technology',
      'Tips & Guides',
      'Inspiration',
      'News',
      'Other'
    ],
    index: true
  },
  tags: {
    type: [String],
    index: true,
    validate: {
      validator: function(tags) {
        return tags.length <= 10;
      },
      message: 'Cannot have more than 10 tags.'
    }
  },
  
  // Comments
  comments: [commentSchema],
  commentsEnabled: {
    type: Boolean,
    default: true
  },
  totalComments: {
    type: Number,
    default: 0
  },
  
  // Likes
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalLikes: {
    type: Number,
    default: 0
  },
  
  // SEO and Status
  metaTitle: {
    type: String,
    trim: true,
    maxlength: [60, 'Meta title cannot exceed 60 characters.']
  },
  metaDescription: {
    type: String,
    trim: true,
    maxlength: [160, 'Meta description cannot exceed 160 characters.']
  },
  keywords: {
    type: [String],
    validate: {
      validator: function(keywords) {
        return keywords.length <= 20;
      },
      message: 'Cannot have more than 20 keywords.'
    }
  },
  
  // Publishing
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
    index: true
  },
  publishedAt: {
    type: Date
  },
  
  // Admin Features
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  featuredAt: {
    type: Date
  },
  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },
  pinnedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
blogSchema.index({ title: 'text', content: 'text', excerpt: 'text', tags: 'text' }, {
  name: 'BlogTextIndex',
  weights: { title: 10, tags: 5, excerpt: 3, content: 1 }
});

blogSchema.index({ author: 1, status: 1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ publishedAt: -1 });
blogSchema.index({ isFeatured: -1, publishedAt: -1 });
blogSchema.index({ isPinned: -1, publishedAt: -1 });

// Pre-save middleware to generate slug
blogSchema.pre('save', async function(next) {
  try {
    // Only generate slug if title is modified or slug doesn't exist
    if (this.isModified('title') || !this.slug) {
      await this.generateUniqueSlug();
    }
    
    // Calculate reading time if content is modified
    if (this.isModified('content')) {
      this.calculateReadingTime();
    }
    
    // Set publishedAt when status changes to published
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
      this.publishedAt = new Date();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to generate unique slug
blogSchema.methods.generateUniqueSlug = async function() {
  const Blog = this.constructor;
  
  // Create base slug from title
  let baseSlug = slugify(this.title, { 
    lower: true, 
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
  
  // If we still don't have a base slug, use a fallback
  if (!baseSlug) {
    baseSlug = 'blog-post';
  }
  
  // Add part of ObjectId for uniqueness (last 8 characters)
  const idSuffix = this._id ? this._id.toString().slice(-8) : '';
  let candidateSlug = baseSlug + (idSuffix ? '-' + idSuffix : '');
  
  // Check for uniqueness and modify if needed
  let counter = 1;
  let finalSlug = candidateSlug;
  
  while (await Blog.findOne({ slug: finalSlug, _id: { $ne: this._id } })) {
    finalSlug = candidateSlug + '-' + counter;
    counter++;
  }
  
  this.slug = finalSlug;
};

// Method to calculate reading time
blogSchema.methods.calculateReadingTime = function() {
  if (!this.content) {
    this.readingTime = 0;
    return;
  }
  
  // Average reading speed: 200 words per minute
  const wordsPerMinute = 200;
  const wordCount = this.content.split(/\s+/).length;
  this.readingTime = Math.ceil(wordCount / wordsPerMinute);
};

// Pre-save middleware to update comment count
blogSchema.pre('save', function(next) {
  if (this.isModified('comments')) {
    this.totalComments = this.comments.filter(comment => comment.isApproved).length;
  }
  if (this.isModified('likes')) {
    this.totalLikes = this.likes.length;
  }
  next();
});

// Virtual for formatted published date
blogSchema.virtual('formattedPublishedAt').get(function() {
  if (!this.publishedAt) return null;
  return this.publishedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for reading time display
blogSchema.virtual('readingTimeDisplay').get(function() {
  if (this.readingTime <= 1) {
    return '1 min read';
  }
  return `${this.readingTime} min read`;
});

// Virtual for comment count (approved only)
blogSchema.virtual('approvedCommentsCount').get(function() {
  return this.comments.filter(comment => comment.isApproved).length;
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;

