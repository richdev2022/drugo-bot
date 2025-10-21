// Handle API errors with detailed logging
const handleApiError = (error, context = '') => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context: context
  };

  if (error.response) {
    errorLog.status = error.response.status;
    errorLog.data = error.response.data;

    console.error(`API Error [${error.response.status}] ${context}:`, error.response.data);

    return {
      success: false,
      message: error.response.data?.message || `API Error: ${error.response.status}`,
      status: error.response.status,
      code: error.response.data?.code || 'API_ERROR'
    };
  } else if (error.request) {
    errorLog.type = 'NO_RESPONSE';
    console.error(`API No Response ${context}:`, error.request);

    return {
      success: false,
      message: 'No response from server. Please check your connection and try again.',
      status: 0,
      code: 'NO_RESPONSE'
    };
  } else {
    errorLog.type = 'REQUEST_ERROR';
    errorLog.message = error.message;
    console.error(`API Request Error ${context}:`, error.message);

    return {
      success: false,
      message: error.message || 'An error occurred while processing your request.',
      status: 500,
      code: 'REQUEST_ERROR'
    };
  }
};

// Handle database errors with detailed logging
const handleDbError = (error, context = '') => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context: context,
    type: error.name,
    message: error.message
  };

  console.error(`Database Error [${error.name}] ${context}:`, error);

  // Handle specific Sequelize errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    const field = error.fields ? Object.keys(error.fields)[0] : 'field';
    return {
      success: false,
      message: `This ${field} is already in use. Please try another.`,
      code: 'DUPLICATE_ENTRY'
    };
  }

  if (error.name === 'SequelizeValidationError') {
    const details = error.errors.map(e => e.message).join(', ');
    return {
      success: false,
      message: `Validation error: ${details}`,
      code: 'VALIDATION_ERROR'
    };
  }

  if (error.name === 'SequelizeConnectionError') {
    return {
      success: false,
      message: 'Database connection failed. Please try again later.',
      code: 'CONNECTION_ERROR'
    };
  }

  return {
    success: false,
    message: 'Database operation failed. Please try again later.',
    code: 'DB_ERROR'
  };
};

// Handle validation errors
const handleValidationError = (validationResult) => {
  return {
    success: false,
    message: validationResult.error,
    code: 'VALIDATION_ERROR'
  };
};

// Wrap async route handlers to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// Create standardized error response
const createErrorResponse = (message, code = 'ERROR', status = 400) => {
  return {
    success: false,
    message,
    code,
    status,
    timestamp: new Date().toISOString()
  };
};

// Create standardized success response
const createSuccessResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  handleApiError,
  handleDbError,
  handleValidationError,
  asyncHandler,
  createErrorResponse,
  createSuccessResponse
};
