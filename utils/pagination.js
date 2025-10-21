// Pagination utilities for conversational lists

const parseNavigationCommand = (message, currentPage, totalPages) => {
  if (!message || typeof message !== 'string') return null;
  const nav = message.trim().toLowerCase();
  if (nav === 'next' && currentPage < totalPages) return currentPage + 1;
  if (nav === 'previous' && currentPage > 1) return currentPage - 1;
  const numMatch = message.trim().match(/^\d+$/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    if (n >= 1 && n <= totalPages) return n;
  }
  return null;
};

const buildPaginatedListMessage = (items, page, totalPages, title = '', itemFormatter = (i) => i.name || String(i)) => {
  let message = `${title} (Page ${page}/${totalPages})\n\n`;
  items.forEach((item, index) => {
    const content = itemFormatter(item, index) || '';
    message += `${index + 1}. ${content}\n\n`;
  });

  message += `📍 *Navigation:*\n`;
  if (page > 1) message += `• Type "Previous" to go to page ${page - 1}\n`;
  if (page < totalPages) message += `• Type "Next" to go to page ${page + 1}\n`;
  message += `• Type a number (1-${items.length}) to select an item\n`;

  return message;
};

/**
 * Centralized pagination formatter for consistent pagination across all flows
 * @param {Array} items - Array of items to paginate
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} title - Title of the list (e.g., "Medicines", "Doctors")
 * @param {Function} itemFormatter - Function to format each item (receives item and index)
 * @param {Object} options - Additional options: showPageInfo (bool), showNumbers (bool), showNavigation (bool)
 * @returns {Object} Formatted pagination object with message and metadata
 */
const centralPaginationFormatter = (items, currentPage, totalPages, title = '', itemFormatter = (i) => i.name || String(i), options = {}) => {
  const {
    showPageInfo = true,
    showNumbers = true,
    showNavigation = true,
    itemsPerLine = 1
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      message: `No items to display for "${title}"`,
      totalPages,
      currentPage,
      itemCount: 0,
      numberedItems: []
    };
  }

  let message = '';

  if (showPageInfo) {
    message += `${title} (Page ${currentPage}/${totalPages})\n\n`;
  } else if (title) {
    message += `${title}\n\n`;
  }

  const numberedItems = [];
  items.forEach((item, index) => {
    const displayNum = index + 1;
    const content = itemFormatter(item, index) || '';
    message += `${showNumbers ? `${displayNum}. ` : ''}${content}\n\n`;
    numberedItems.push({
      index: displayNum,
      item,
      displayText: content
    });
  });

  if (showNavigation) {
    message += `📍 *Navigation:*\n`;
    if (currentPage > 1) message += `• Type "Previous" to go to page ${currentPage - 1}\n`;
    if (currentPage < totalPages) message += `• Type "Next" to go to page ${currentPage + 1}\n`;
    if (showNumbers) {
      message += `• Type a number (1-${items.length}) to select an item\n`;
    }
  }

  return {
    success: true,
    message,
    totalPages,
    currentPage,
    itemCount: items.length,
    numberedItems,
    canGoPrevious: currentPage > 1,
    canGoNext: currentPage < totalPages
  };
};

/**
 * Attach numbered options to items for selection
 * @param {Array} items - Array of items to attach numbers to
 * @param {number} startIndex - Starting index for numbering (default: 1)
 * @returns {Array} Items with numbered options attached
 */
const attachNumberedOptions = (items, startIndex = 1) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const displayNumber = startIndex + index;
    return {
      ...item,
      displayNumber,
      selectionKey: String(displayNumber)
    };
  });
};

/**
 * Parse a user selection from paginated options
 * @param {string} userInput - User input (e.g., "1", "next", "previous")
 * @param {number} maxOptions - Maximum number of options available
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @returns {Object} Parsed selection with type and value
 */
const parseUserSelection = (userInput, maxOptions, currentPage, totalPages) => {
  if (!userInput || typeof userInput !== 'string') {
    return { valid: false, type: null, value: null };
  }

  const input = userInput.trim().toLowerCase();

  if (input === 'next' || input === 'n') {
    if (currentPage < totalPages) {
      return { valid: true, type: 'paginate', direction: 'next', targetPage: currentPage + 1 };
    }
    return { valid: false, type: 'paginate', direction: 'next', error: 'Already on last page' };
  }

  if (input === 'previous' || input === 'prev' || input === 'p') {
    if (currentPage > 1) {
      return { valid: true, type: 'paginate', direction: 'previous', targetPage: currentPage - 1 };
    }
    return { valid: false, type: 'paginate', direction: 'previous', error: 'Already on first page' };
  }

  const numMatch = input.match(/^\d+$/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    if (num >= 1 && num <= maxOptions) {
      return { valid: true, type: 'select', index: num - 1, displayNumber: num };
    }
    return { valid: false, type: 'select', error: `Invalid selection. Choose 1-${maxOptions}` };
  }

  return { valid: false, type: 'unknown', error: 'Invalid input. Type a number, "next", or "previous"' };
};

module.exports = {
  parseNavigationCommand,
  buildPaginatedListMessage,
  centralPaginationFormatter,
  attachNumberedOptions,
  parseUserSelection
};
