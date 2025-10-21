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

module.exports = {
  parseNavigationCommand,
  buildPaginatedListMessage
};
