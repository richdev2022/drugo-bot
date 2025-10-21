const { Doctor } = require('../models');
const { uploadImage, deleteImage } = require('./cloudinary');

/**
 * Upload doctor profile image
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {number} doctorId - Doctor ID (optional)
 * @param {string} filename - Custom filename (optional)
 * @returns {Promise<Object>} - Upload result with URL
 */
const uploadDoctorImage = async (fileBuffer, doctorId = null, filename = null) => {
  try {
    if (!fileBuffer) {
      throw new Error('File buffer is required');
    }

    // Upload to Cloudinary
    const uploadedFile = await uploadImage(fileBuffer, {
      folder: 'drugs-ng/doctors',
      filename: filename || `doctor-${doctorId || Date.now()}`
    });

    return {
      success: true,
      url: uploadedFile.url,
      publicId: uploadedFile.publicId,
      message: 'Doctor image uploaded successfully'
    };
  } catch (error) {
    console.error('Error uploading doctor image:', error);
    throw error;
  }
};

/**
 * Update doctor profile image in database
 * @param {number} doctorId - Doctor ID
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} filename - Custom filename (optional)
 * @returns {Promise<Object>} - Update result
 */
const updateDoctorImage = async (doctorId, fileBuffer, filename = null) => {
  try {
    if (!doctorId || !fileBuffer) {
      throw new Error('Doctor ID and file buffer are required');
    }

    // Get existing doctor
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    // Upload new image
    const uploadResult = await uploadDoctorImage(fileBuffer, doctorId, filename);

    // Update doctor with new image URL
    doctor.imageUrl = uploadResult.url;
    await doctor.save();

    return {
      success: true,
      message: 'Doctor image updated successfully',
      doctorId: doctor.id,
      doctorName: doctor.name,
      imageUrl: doctor.imageUrl
    };
  } catch (error) {
    console.error('Error updating doctor image:', error);
    throw error;
  }
};

/**
 * Get doctor image URL
 * @param {number} doctorId - Doctor ID
 * @returns {Promise<Object>} - Doctor details with image URL
 */
const getDoctorImageUrl = async (doctorId) => {
  try {
    const doctor = await Doctor.findByPk(doctorId, {
      attributes: ['id', 'name', 'specialty', 'location', 'imageUrl']
    });

    if (!doctor) {
      throw new Error('Doctor not found');
    }

    return {
      doctorId: doctor.id,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      location: doctor.location,
      imageUrl: doctor.imageUrl || null
    };
  } catch (error) {
    console.error('Error getting doctor image URL:', error);
    throw error;
  }
};

/**
 * Get all doctors with their image URLs
 * @param {Object} filters - Filter options (specialty, location, etc.)
 * @returns {Promise<Array>} - List of doctors with image URLs
 */
const getDoctorsWithImages = async (filters = {}) => {
  try {
    const where = {};

    if (filters.specialty) {
      where.specialty = filters.specialty;
    }

    if (filters.location) {
      where.location = filters.location;
    }

    if (filters.available !== undefined) {
      where.available = filters.available;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const doctors = await Doctor.findAll({
      where,
      attributes: ['id', 'name', 'specialty', 'location', 'available', 'rating', 'imageUrl'],
      order: [['rating', 'DESC']]
    });

    return doctors.map(doctor => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      location: doctor.location,
      available: doctor.available,
      rating: doctor.rating,
      imageUrl: doctor.imageUrl || null
    }));
  } catch (error) {
    console.error('Error getting doctors with images:', error);
    throw error;
  }
};

/**
 * Delete doctor image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Deletion result
 */
const deleteDoctorImage = async (publicId) => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }

    const result = await deleteImage(publicId);

    return {
      success: true,
      message: 'Doctor image deleted successfully',
      result
    };
  } catch (error) {
    console.error('Error deleting doctor image:', error);
    throw error;
  }
};

module.exports = {
  uploadDoctorImage,
  updateDoctorImage,
  getDoctorImageUrl,
  getDoctorsWithImages,
  deleteDoctorImage
};
