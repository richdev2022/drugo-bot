const multer = require('multer');
const path = require('path');

// Configure multer for in-memory storage (files won't be saved to disk)
const storage = multer.memoryStorage();

// File filter to allow only specific file types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, GIF, and PDF files are allowed.'), false);
  }
};

// Configure upload with size limits
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

/**
 * Middleware to handle single file upload
 */
const uploadSingleFile = upload.single('file');

/**
 * Middleware to handle multiple file uploads
 */
const uploadMultipleFiles = upload.array('files', 5);

/**
 * Validate uploaded file
 * @param {Object} file - Uploaded file object from multer
 * @returns {Object} - Validation result with status and message
 */
const validateUploadedFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!file.buffer) {
    return { valid: false, error: 'File buffer is empty' };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
};

/**
 * Extract file metadata
 * @param {Object} file - Uploaded file object
 * @returns {Object} - File metadata
 */
const getFileMetadata = (file) => {
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    encoding: file.encoding
  };
};

module.exports = {
  uploadSingleFile,
  uploadMultipleFiles,
  validateUploadedFile,
  getFileMetadata
};
