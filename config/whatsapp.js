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

const sendTypingIndicator = async (phoneNumber) => {
  try {
    await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      typing: true
    });
  } catch (error) {
    console.warn(`⚠️  Could not send typing indicator to ${phoneNumber}:`, error.message);
  }
};

const sendTypingStop = async (phoneNumber) => {
  try {
    await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      typing: false
    });
  } catch (error) {
    console.warn(`⚠️  Could not stop typing indicator for ${phoneNumber}:`, error.message);
  }
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
      return { success: false, permissionError: true, error: error.response?.data?.error };
    } else {
      console.error(`❌ Error sending WhatsApp message to ${phoneNumber}:`, log);
      throw error;
    }
  }
};

// Send interactive message with buttons
const sendInteractiveMessage = async (phoneNumber, bodyText, buttons) => {
  console.log(`📤 Sending INTERACTIVE (buttons) to ${phoneNumber}`);
  try {
    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
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

// Send interactive message with a list
const sendListMessage = async (phoneNumber, bodyText, buttonText, sections) => {
  console.log(`📤 Sending INTERACTIVE (list) to ${phoneNumber}`);
  try {
    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: bodyText
        },
        action: {
          button: buttonText,
          sections: sections.map(section => ({
            title: section.title,
            rows: section.rows.map(row => ({
              id: row.id,
              title: row.title,
              description: row.description || ''
            }))
          }))
        }
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error sending list message:', error.response?.data || error.message);
    throw error;
  }
};

// Send a location request message
const sendLocationRequestMessage = async (phoneNumber, bodyText, buttonText = "📍 Share Location") => {
  console.log(`📤 Sending LOCATION REQUEST to ${phoneNumber}`);
  try {
    const response = await whatsappAPI.post(`/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: {
          text: bodyText
        },
        action: {
          name: 'send_location'
        }
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error sending location request message:', error.response?.data || error.message);
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
  sendListMessage,
  sendLocationRequestMessage,
  sendTypingIndicator,
  sendTypingStop,
  markMessageAsRead,
  getMediaInfo,
  downloadMedia,
  isPermissionError
};
