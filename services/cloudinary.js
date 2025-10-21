const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload file to Cloudinary
 * @param {Buffer|Stream} fileBuffer - File buffer or stream to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Cloudinary folder path
 * @param {string} options.filename - File name (without extension)
 * @param {string} options.resourceType - Resource type (image, video, raw, etc.)
 * @returns {Promise<Object>} - Cloudinary upload response with secure_url
 */
const uploadImage = async (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const {
        folder = 'drugs-ng',
        filename = `image-${Date.now()}`,
        resourceType = 'auto'
      } = options;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: filename,
          resource_type: resourceType,
          overwrite: true,
          invalidate: true
        },
        (error, result) => {
          if (error) {
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              width: result.width,
              height: result.height,
              bytes: result.bytes
            });
          }
        }
      );

      // Handle both Buffer and Stream inputs
      if (Buffer.isBuffer(fileBuffer)) {
        uploadStream.end(fileBuffer);
      } else if (fileBuffer instanceof Readable) {
        fileBuffer.pipe(uploadStream);
      } else {
        reject(new Error('Invalid file input: must be Buffer or Stream'));
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Upload image from URL
 * @param {string} imageUrl - URL of the image to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Cloudinary upload response
 */
const uploadImageFromUrl = async (imageUrl, options = {}) => {
  try {
    const {
      folder = 'drugs-ng',
      filename = `image-${Date.now()}`,
      resourceType = 'auto'
    } = options;

    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      public_id: filename,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes
    };
  } catch (error) {
    throw new Error(`Cloudinary upload from URL failed: ${error.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID of the image to delete
 * @returns {Promise<Object>} - Deletion result
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Cloudinary deletion failed: ${error.message}`);
  }
};

/**
 * Get image URL with transformations
 * @param {string} publicId - Public ID of the image
 * @param {Object} transformations - Transformation options
 * @returns {string} - Transformed image URL
 */
const getTransformedUrl = (publicId, transformations = {}) => {
  try {
    const {
      width = null,
      height = null,
      quality = 'auto',
      crop = 'fill',
      gravity = 'auto'
    } = transformations;

    return cloudinary.url(publicId, {
      secure: true,
      quality,
      crop,
      gravity,
      ...(width && { width }),
      ...(height && { height })
    });
  } catch (error) {
    throw new Error(`Failed to generate transformed URL: ${error.message}`);
  }
};

module.exports = {
  uploadImage,
  uploadImageFromUrl,
  deleteImage,
  getTransformedUrl,
  cloudinary
};
