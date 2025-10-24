/**
 * Voice Processing Service
 * Handles WhatsApp voice notes: download, convert, transcribe, process
 * 
 * Supported Options:
 * 1. Google Cloud Speech-to-Text (recommended, free tier)
 * 2. OpenAI Whisper API (cheaper, supports 99 languages)
 * 3. AssemblyAI (simple, no installation needed)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadMedia, getMediaInfo } = require('../config/whatsapp');

/**
 * Voice Processor Class
 */
class VoiceProcessor {
  constructor(config = {}) {
    this.provider = config.provider || 'whisper'; // 'whisper', 'google', or 'assemblyai'
    this.whisperApiKey = process.env.OPENAI_API_KEY || config.whisperApiKey;
    this.googleCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS || config.googleCredentials;
    this.assemblyaiApiKey = process.env.ASSEMBLYAI_API_KEY || config.assemblyaiApiKey;
    this.tempDir = config.tempDir || path.join(__dirname, '../.temp/voice');
    
    // Ensure temp directory exists
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Process WhatsApp voice message
   * Main entry point
   */
  async processWhatsAppVoiceMessage(messageObject, phoneNumber) {
    try {
      console.log(`Processing voice message from ${phoneNumber}`);

      // Step 1: Get voice media info
      const mediaInfo = await getMediaInfo(messageObject.audio.id);
      
      // Step 2: Download voice file
      const audioFilePath = await this.downloadVoiceFile(
        messageObject.audio.id,
        mediaInfo.mime_type
      );

      console.log(`Voice file downloaded to: ${audioFilePath}`);

      // Step 3: Transcribe audio to text
      const transcribedText = await this.transcribeAudio(audioFilePath, 'en');

      console.log(`Transcribed text: ${transcribedText}`);

      // Step 4: Cleanup temp file
      this.cleanupTempFile(audioFilePath);

      return {
        success: true,
        text: transcribedText,
        originalMessageType: 'voice',
        transcriptionProvider: this.provider,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Voice processing error:', error);
      return {
        success: false,
        error: error.message,
        originalMessageType: 'voice'
      };
    }
  }

  /**
   * Download voice file from WhatsApp
   */
  async downloadVoiceFile(mediaId, mimeType) {
    try {
      const extension = this.getFileExtensionFromMimeType(mimeType);
      const fileName = `voice_${mediaId}_${Date.now()}.${extension}`;
      const filePath = path.join(this.tempDir, fileName);

      const { buffer } = await downloadMedia(mediaId);
      fs.writeFileSync(filePath, buffer);

      return filePath;
    } catch (error) {
      throw new Error(`Failed to download voice file: ${error.message}`);
    }
  }

  /**
   * Get file extension from MIME type
   */
  getFileExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/webm': 'webm'
    };
    return mimeMap[mimeType] || 'ogg'; // Default to ogg (WhatsApp's default)
  }

  /**
   * Transcribe audio file to text
   * Routes to appropriate provider
   */
  async transcribeAudio(filePath, language = 'en') {
    console.log(`Transcribing with provider: ${this.provider}`);

    switch (this.provider.toLowerCase()) {
      case 'whisper':
        return await this.transcribeWithWhisper(filePath, language);
      case 'google':
        return await this.transcribeWithGoogle(filePath, language);
      case 'assemblyai':
        return await this.transcribeWithAssemblyAI(filePath, language);
      default:
        throw new Error(`Unknown transcription provider: ${this.provider}`);
    }
  }

  /**
   * Transcribe using OpenAI Whisper API (RECOMMENDED)
   * Supports 99 languages including Nigerian languages
   * 
   * Setup:
   * 1. npm install openai
   * 2. export OPENAI_API_KEY=your-api-key
   */
  async transcribeWithWhisper(filePath, language = 'en') {
    if (!this.whisperApiKey) {
      throw new Error('OPENAI_API_KEY not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const audioStream = fs.createReadStream(filePath);
      const form = new FormData();
      form.append('file', audioStream);
      form.append('model', 'whisper-1');
      form.append('language', this.mapLanguageCode(language));
      // Optional: Add temperature for accuracy
      form.append('temperature', 0);

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${this.whisperApiKey}`
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      return response.data.text;
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  /**
   * Transcribe using Google Cloud Speech-to-Text
   * Free tier: 60 minutes/month
   * 
   * Setup:
   * 1. npm install @google-cloud/speech
   * 2. Create Google Cloud project and enable Speech-to-Text API
   * 3. Create service account and download JSON key
   * 4. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   */
  async transcribeWithGoogle(filePath, language = 'en') {
    if (!this.googleCredentials) {
      throw new Error('Google Cloud credentials not configured.');
    }

    try {
      const speech = require('@google-cloud/speech');
      const client = new speech.SpeechClient();

      const audioBytes = fs.readFileSync(filePath);
      const audio = {
        content: audioBytes.toString('base64')
      };

      const request = {
        audio: audio,
        config: {
          encoding: 'OGG_OPUS', // WhatsApp uses OGG_OPUS
          sampleRateHertz: 16000,
          languageCode: this.mapLanguageCode(language),
          model: 'latest_long',
          useEnhanced: true
        }
      };

      const [response] = await client.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      return transcription;
    } catch (error) {
      throw new Error(`Google Speech-to-Text failed: ${error.message}`);
    }
  }

  /**
   * Transcribe using AssemblyAI
   * Simple REST API, supports 99 languages
   * 
   * Setup:
   * 1. Sign up at https://www.assemblyai.com
   * 2. Get API key from dashboard
   * 3. export ASSEMBLYAI_API_KEY=your-api-key
   */
  async transcribeWithAssemblyAI(filePath, language = 'en') {
    if (!this.assemblyaiApiKey) {
      throw new Error('ASSEMBLYAI_API_KEY not configured.');
    }

    try {
      // Step 1: Upload audio file
      const audioBuffer = fs.readFileSync(filePath);
      const uploadResponse = await axios.post(
        'https://api.assemblyai.com/v2/upload',
        audioBuffer,
        {
          headers: {
            'Authorization': this.assemblyaiApiKey,
            'Content-Type': 'application/octet-stream'
          }
        }
      );

      const audioUrl = uploadResponse.data.upload_url;

      // Step 2: Submit transcription request
      const transcriptionResponse = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: audioUrl,
          language_code: this.mapLanguageCode(language),
          speaker_labels: true, // Identify speakers if multiple
          punctuate: true
        },
        {
          headers: {
            'Authorization': this.assemblyaiApiKey
          }
        }
      );

      const transcriptId = transcriptionResponse.data.id;

      // Step 3: Poll for completion
      return await this.pollAssemblyAITranscription(transcriptId);
    } catch (error) {
      throw new Error(`AssemblyAI transcription failed: ${error.message}`);
    }
  }

  /**
   * Poll AssemblyAI for transcription completion
   */
  async pollAssemblyAITranscription(transcriptId, maxRetries = 120, retryDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: {
              'Authorization': this.assemblyaiApiKey
            }
          }
        );

        if (response.data.status === 'completed') {
          return response.data.text;
        }

        if (response.data.status === 'error') {
          throw new Error(`Transcription failed: ${response.data.error}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } catch (error) {
        if (error.message.includes('Transcription failed')) throw error;
        console.log(`Poll attempt ${i + 1} failed, retrying...`);
      }
    }

    throw new Error('Transcription polling timeout');
  }

  /**
   * Map language names/codes to provider-specific codes
   */
  mapLanguageCode(language) {
    const languageMap = {
      // English variants
      'en': 'en',
      'english': 'en',
      'en-US': 'en-US',
      'en-GB': 'en-GB',
      
      // Nigerian languages
      'yo': 'yo', // Yoruba
      'yoruba': 'yo',
      'ig': 'ig', // Igbo
      'igbo': 'ig',
      'ha': 'ha', // Hausa
      'hausa': 'ha',
      
      // Other African languages
      'sw': 'sw', // Swahili
      'am': 'am', // Amharic
      'af': 'af', // Afrikaans
      
      // European
      'fr': 'fr', // French
      'de': 'de', // German
      'es': 'es', // Spanish
      'pt': 'pt', // Portuguese
      'pt-BR': 'pt-BR'
    };

    return languageMap[language.toLowerCase()] || 'en';
  }

  /**
   * Cleanup temporary file
   */
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp file: ${error.message}`);
    }
  }

  /**
   * Cleanup all temp files (should be called periodically)
   */
  cleanupAllTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        
        // Delete files older than 1 hour
        if (ageInHours > 1) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old temp file: ${file}`);
        }
      });
    } catch (error) {
      console.warn(`Failed to cleanup temp files: ${error.message}`);
    }
  }

  /**
   * Get transcription cost estimation
   */
  getTranscriptionCost(durationSeconds) {
    const costs = {
      'whisper': {
        costPer15Min: 0.006,
        costPerSecond: 0.006 / 900
      },
      'google': {
        costPerSecond: 0.024 / 60, // $0.024 per minute
        freeMinutes: 60 // Free tier
      },
      'assemblyai': {
        costPerMinute: 0.00625
      }
    };

    const providerCost = costs[this.provider] || {};
    const minutes = durationSeconds / 60;

    switch (this.provider) {
      case 'whisper':
        return providerCost.costPerSecond * durationSeconds;
      case 'google':
        return Math.max(0, minutes - providerCost.freeMinutes) * (providerCost.costPerSecond * 60);
      case 'assemblyai':
        return minutes * providerCost.costPerMinute;
      default:
        return 0;
    }
  }
}

// ============ SETUP GUIDE ============

const SETUP_GUIDE = `
=== VOICE TRANSCRIPTION SETUP GUIDE ===

OPTION 1: OpenAI Whisper (RECOMMENDED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost: $0.006 per 15 minutes (~$0.024 per hour)
Languages: 99 languages including Yoruba, Igbo, Hausa
Setup:
  1. npm install openai form-data
  2. Sign up at https://platform.openai.com
  3. Get API key from https://platform.openai.com/account/api-keys
  4. Add to .env: OPENAI_API_KEY=your-key
  5. Use in config: { provider: 'whisper' }

OPTION 2: Google Cloud Speech-to-Text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost: FREE first 60 minutes/month, then $0.024/min
Languages: 120+ languages
Setup:
  1. npm install @google-cloud/speech
  2. Create Google Cloud project
  3. Enable Speech-to-Text API
  4. Create service account & download JSON key
  5. Add to .env: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
  6. Use in config: { provider: 'google' }

OPTION 3: AssemblyAI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost: $0.00625 per minute (~$0.375/hour)
Languages: 99 languages
Setup:
  1. Sign up at https://www.assemblyai.com
  2. Get API key from dashboard
  3. Add to .env: ASSEMBLYAI_API_KEY=your-key
  4. Use in config: { provider: 'assemblyai' }

USAGE IN YOUR BOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { VoiceProcessor } = require('./services/voiceProcessor');
const voiceProcessor = new VoiceProcessor({ provider: 'whisper' });

// In your webhook handler:
if (messageObject.type === 'audio') {
  const result = await voiceProcessor.processWhatsAppVoiceMessage(
    messageObject,
    phoneNumber
  );
  
  if (result.success) {
    // Now process the transcribed text through NLP
    const nlpResult = await processUserInput(result.text, phoneNumber);
  }
}
`;

// ============ EXPORTS ============

module.exports = {
  VoiceProcessor,
  SETUP_GUIDE,
  createVoiceProcessor: (config) => new VoiceProcessor(config),
  setupGuide: () => console.log(SETUP_GUIDE)
};