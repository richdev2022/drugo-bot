const axios = require('axios');

// WhatsApp API configuration
const whatsappAPI = axios.create({
  baseURL: 'https://graph.facebook.com/v20.0',
  headers: {
    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 15000
});

const isPermissionError = (error) => {
  const code = error?.response?.data?.error?.code;
  const message = error?.response?.data?.error?.message || '';
  return code === 10 || /does not have permission/i.test(message);
};

// Send message via WhatsApp
const sendWhatsAppMessage = async (phoneNumber, message) => {
  try {
    console.log(`📤 Sending WhatsApp message to ${phoneNumber}: "${message.substring(0, 50)}..."`);

    const payload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      text: { body: message }
    };

    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, payload);
    console.log(`✅ Message sent successfully to ${phoneNumber}. Message ID:`, response.data.messages?.[0]?.id);
    return response.data;
  } catch (error) {
    const log = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    };
    if (isPermissionError(error)) {
      console.error(`❌ WhatsApp permission error when sending to ${phoneNumber}:`, log);
      // Gracefully return without throwing to avoid breaking user flows
      return { success: false, permissionError: true, error: error.response?.data?.error };
    } else {
      console.error(`❌ Error sending WhatsApp message to ${phoneNumber}:`, log);
      throw error;
    }
  }
};

// Send interactive message with buttons
const sendInteractiveMessage = async (phoneNumber, bodyText, buttons) => {
  try {
    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      interactive: {
        type: 'button',
        body: {
          text: bodyText
        },
        action: {
          buttons: buttons.map(btn => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title
            }
          }))
        }
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error sending interactive message:', error.response?.data || error.message);
    throw error;
  }
};

// Mark message as read
const markMessageAsRead = async (messageId) => {
  try {
    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    });
    return response.data;
  } catch (error) {
    console.error('Error marking message as read:', error.response?.data || error.message);
    // Don't throw error, just log it
    return null;
  }
};

// Get media info by ID
const getMediaInfo = async (mediaId) => {
  try {
    const response = await whatsappAPI.get(`/${mediaId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching media info:', error.response?.data || error.message);
    throw error;
  }
};

// Download media content by URL (requires auth header)
const downloadMediaByUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
    });
    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || null
    };
  } catch (error) {
    console.error('Error downloading media by URL:', error.response?.data || error.message);
    throw error;
  }
};

// Download media by ID
const downloadMedia = async (mediaId) => {
  const info = await getMediaInfo(mediaId);
  const { buffer, contentType } = await downloadMediaByUrl(info.url);
  return { buffer, mimeType: contentType, info };
};

module.exports = {
  sendWhatsAppMessage,
  sendInteractiveMessage,
  markMessageAsRead,
  getMediaInfo,
  downloadMedia,
  isPermissionError
};
