const { Sequelize } = require('sequelize');
require('dotenv').config();

// Support both DATABASE_URL (Neon) and individual DB variables
let sequelize;

const isValidDatabaseUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return /^postgres(?:ql)?:\/\//i.test(url.trim());
};

if (isValidDatabaseUrl(process.env.DATABASE_URL)) {
  // Use Neon connection string with optimized settings for serverless
  try {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000
      },
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        },
        keepAlive: true,
        connectTimeout: 60000 // 60 seconds
      },
      ssl: true,
      native: false,
      retry: {
        max: 3
      }
    });
    console.log('✓ Using DATABASE_URL for PostgreSQL connection');
  } catch (err) {
    console.error('Invalid DATABASE_URL provided, falling back to individual DB vars:', err.message);
  }
}

if (!sequelize) {
  // Fall back to individual DB variables
  sequelize = new Sequelize(
    process.env.DB_NAME || 'drugsng_fallback',
    process.env.DB_USER || 'drugsng_user',
    process.env.DB_PASSWORD || 'your_secure_password',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
  console.log('✓ Using individual DB vars for PostgreSQL connection');
}

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to PostgreSQL:', error);
  }
};

module.exports = {
  sequelize,
  testConnection
};
