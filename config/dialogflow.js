const dialogflow = require('dialogflow');
const fs = require('fs');
const path = require('path');

let sessionClient = null;
let dialogflowEnabled = false;

// Check if Dialogflow is properly configured
const checkDialogflowConfig = () => {
  try {
    // Check if service account key file exists
    const keyPath = path.join(__dirname, '../service-account-key.json');

    if (!fs.existsSync(keyPath)) {
      console.warn('⚠️  Dialogflow: service-account-key.json not found. Using fallback NLP.');
      return false;
    }

    // Check if project ID is set
    if (!process.env.DIALOGFLOW_PROJECT_ID) {
      console.warn('⚠️  Dialogflow: DIALOGFLOW_PROJECT_ID not set. Using fallback NLP.');
      return false;
    }

    // Try to initialize the client
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    sessionClient = new dialogflow.SessionsClient();

    console.log('✓ Dialogflow configured and ready');
    return true;
  } catch (error) {
    console.warn('⚠️  Dialogflow initialization failed:', error.message);
    console.warn('   Using fallback NLP instead.');
    return false;
  }
};

// Initialize Dialogflow on module load
dialogflowEnabled = checkDialogflowConfig();

// Check if Dialogflow is enabled
const isDialogflowEnabled = () => {
  return dialogflowEnabled && sessionClient !== null && process.env.DIALOGFLOW_PROJECT_ID;
};

// Create Dialogflow session
const createDialogflowSession = (sessionId) => {
  if (!isDialogflowEnabled()) {
    throw new Error('Dialogflow is not enabled');
  }

  const projectId = process.env.DIALOGFLOW_PROJECT_ID;
  if (!projectId) {
    throw new Error('DIALOGFLOW_PROJECT_ID not set');
  }

  return sessionClient.sessionPath(projectId, sessionId);
};

module.exports = {
  sessionClient,
  createDialogflowSession,
  isDialogflowEnabled
};
