const CryptoJS = require('crypto-js');

// Encrypt data
const encryptData = (data) => {
  try {
    const ciphertext = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      process.env.ENCRYPTION_KEY
    ).toString();
    
    return { encryptedData: ciphertext };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
};

// Decrypt data
const decryptData = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, process.env.ENCRYPTION_KEY);
    const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    
    return decryptedData;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
};

// Generate secure token
const generateToken = () => {
  return CryptoJS.lib.WordArray.random(32).toString();
};

module.exports = {
  encryptData,
  decryptData,
  generateToken
};