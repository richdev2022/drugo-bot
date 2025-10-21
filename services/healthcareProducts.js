const axios = require('axios');
const { HealthcareProduct, Cart, User, Product } = require('../models');
const { uploadImage, deleteImage } = require('./cloudinary');

// Drugs.ng API client with timeout
const drugsngAPI = axios.create({
  baseURL: process.env.DRUGSNG_API_BASE_URL || 'https://api.drugsng.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Search healthcare products
const searchHealthcareProducts = async (query) => {
  try {
    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required');
    }

    // Try to fetch from Drugs.ng API first
    try {
      const response = await drugsngAPI.get('/products/search', {
        params: { query, type: 'healthcare' }
      });
      if (response.data && response.data.products && response.data.products.length > 0) {
        return response.data.products;
      }
    } catch (apiError) {
      console.warn('Could not fetch from Drugs.ng API, using local database:', apiError.message);
    }

    // Fallback to local database
    const products = await HealthcareProduct.findAll({
      where: {
        isActive: true,
        [require('sequelize').Op.or]: [
          { name: { [require('sequelize').Op.iLike]: `%${query}%` } },
          { category: { [require('sequelize').Op.iLike]: `%${query}%` } },
          { description: { [require('sequelize').Op.iLike]: `%${query}%` } }
        ]
      }
    });

    return products;
  } catch (error) {
    console.error('Error searching healthcare products:', error);
    throw error;
  }
};

// Get products by category
const getHealthcareProductsByCategory = async (category) => {
  try {
    if (!category || typeof category !== 'string') {
      throw new Error('Category is required');
    }

    // Try to fetch from Drugs.ng API first
    try {
      const response = await drugsngAPI.get('/products/category', {
        params: { category, type: 'healthcare' }
      });
      if (response.data && response.data.products) {
        return response.data.products;
      }
    } catch (apiError) {
      console.warn('Could not fetch from Drugs.ng API, using local database:', apiError.message);
    }

    // Fallback to local database
    const products = await HealthcareProduct.findAll({
      where: {
        category: {
          [require('sequelize').Op.iLike]: `%${category}%`
        },
        isActive: true
      }
    });

    return products;
  } catch (error) {
    console.error('Error fetching healthcare products by category:', error);
    throw error;
  }
};

// Get all healthcare product categories
const getHealthcareCategories = async () => {
  try {
    // Try to fetch from Drugs.ng API first
    try {
      const response = await drugsngAPI.get('/products/categories', {
        params: { type: 'healthcare' }
      });
      if (response.data && response.data.categories) {
        return response.data.categories;
      }
    } catch (apiError) {
      console.warn('Could not fetch from Drugs.ng API, using local database:', apiError.message);
    }

    // Fallback to local database
    const products = await HealthcareProduct.findAll({
      where: { isActive: true },
      attributes: ['category'],
      raw: true,
      group: ['category']
    });

    return products.map(p => p.category);
  } catch (error) {
    console.error('Error fetching healthcare categories:', error);
    throw error;
  }
};

// Get product details
const getHealthcareProductDetails = async (productId) => {
  try {
    const product = await HealthcareProduct.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    return product;
  } catch (error) {
    console.error('Error fetching product details:', error);
    throw error;
  }
};

// Add healthcare product to cart
const addHealthcareProductToCart = async (userId, productId, quantity = 1) => {
  try {
    if (!userId || !productId || quantity < 1) {
      throw new Error('Invalid user ID, product ID, or quantity');
    }

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get product details
    const product = await HealthcareProduct.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (!product.isActive) {
      throw new Error('Product is not available');
    }

    if (product.stock < quantity) {
      throw new Error(`Only ${product.stock} units available`);
    }

    // Check if product already in cart
    let cartItem = await Cart.findOne({
      where: { userId, productId }
    });

    if (cartItem) {
      // Update quantity
      cartItem.quantity += quantity;
      await cartItem.save();
    } else {
      // Create new cart item
      cartItem = await Cart.create({
        userId,
        productId,
        quantity,
        price: product.price
      });
    }

    return {
      success: true,
      message: `${product.name} added to cart`,
      cartItem,
      productName: product.name,
      quantity: cartItem.quantity,
      price: product.price
    };
  } catch (error) {
    console.error('Error adding healthcare product to cart:', error);
    throw error;
  }
};

// Get user's cart
const getUserCart = async (userId) => {
  try {
    const cartItems = await Cart.findAll({
      where: { userId },
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'price']
        }
      ]
    });

    if (cartItems.length === 0) {
      return {
        items: [],
        totalAmount: 0,
        totalItems: 0
      };
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return {
      items: cartItems,
      totalAmount,
      totalItems: cartItems.length
    };
  } catch (error) {
    console.error('Error fetching user cart:', error);
    throw error;
  }
};

// Remove item from cart
const removeFromCart = async (userId, cartItemId) => {
  try {
    const cartItem = await Cart.findOne({
      where: { id: cartItemId, userId }
    });

    if (!cartItem) {
      throw new Error('Cart item not found');
    }

    await cartItem.destroy();

    return {
      success: true,
      message: 'Item removed from cart'
    };
  } catch (error) {
    console.error('Error removing from cart:', error);
    throw error;
  }
};

// Update cart item quantity
const updateCartItemQuantity = async (userId, cartItemId, quantity) => {
  try {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    const cartItem = await Cart.findOne({
      where: { id: cartItemId, userId }
    });

    if (!cartItem) {
      throw new Error('Cart item not found');
    }

    cartItem.quantity = quantity;
    await cartItem.save();

    return {
      success: true,
      message: 'Cart updated',
      cartItem
    };
  } catch (error) {
    console.error('Error updating cart item:', error);
    throw error;
  }
};

// Clear user's cart
const clearCart = async (userId) => {
  try {
    await Cart.destroy({ where: { userId } });

    return {
      success: true,
      message: 'Cart cleared'
    };
  } catch (error) {
    console.error('Error clearing cart:', error);
    throw error;
  }
};

// Upload healthcare product image
const uploadProductImage = async (fileBuffer, productId = null, filename = null) => {
  try {
    if (!fileBuffer) {
      throw new Error('File buffer is required');
    }

    // Upload to Cloudinary
    const uploadedFile = await uploadImage(fileBuffer, {
      folder: 'drugs-ng/products/healthcare',
      filename: filename || `healthcare-product-${productId || Date.now()}`
    });

    return {
      success: true,
      url: uploadedFile.url,
      publicId: uploadedFile.publicId,
      message: 'Product image uploaded successfully'
    };
  } catch (error) {
    console.error('Error uploading product image:', error);
    throw error;
  }
};

// Update product image
const updateProductImage = async (productId, fileBuffer, filename = null) => {
  try {
    if (!productId || !fileBuffer) {
      throw new Error('Product ID and file buffer are required');
    }

    // Get existing product
    const product = await HealthcareProduct.findByPk(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Upload new image
    const uploadResult = await uploadProductImage(fileBuffer, productId, filename);

    // Update product with new image URL
    product.imageUrl = uploadResult.url;
    await product.save();

    return {
      success: true,
      message: 'Product image updated successfully',
      productId: product.id,
      imageUrl: product.imageUrl
    };
  } catch (error) {
    console.error('Error updating product image:', error);
    throw error;
  }
};

// Get product image URL
const getProductImageUrl = async (productId) => {
  try {
    const product = await HealthcareProduct.findByPk(productId, {
      attributes: ['id', 'name', 'imageUrl']
    });

    if (!product) {
      throw new Error('Product not found');
    }

    return {
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl || null
    };
  } catch (error) {
    console.error('Error getting product image URL:', error);
    throw error;
  }
};

module.exports = {
  searchHealthcareProducts,
  getHealthcareProductsByCategory,
  getHealthcareCategories,
  getHealthcareProductDetails,
  addHealthcareProductToCart,
  getUserCart,
  removeFromCart,
  updateCartItemQuantity,
  clearCart,
  uploadProductImage,
  updateProductImage,
  getProductImageUrl
};
