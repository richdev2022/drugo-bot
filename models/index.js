const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcryptjs = require('bcryptjs');

// Verify Sequelize instance
if (!sequelize || typeof sequelize.define !== 'function') {
  console.error('Sequelize instance is not properly initialized');
  process.exit(1);
}

// User Model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  drugsngUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  drugsngToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcryptjs.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcryptjs.hash(user.password, 10);
      }
    }
  },
  tableName: 'users'
});

// Admin Model (for internal staff and owner)
const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('Owner','Admin','CustomerSupport','Auditor'),
    allowNull: false,
    defaultValue: 'Admin'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  token: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  hooks: {
    beforeCreate: async (admin) => {
      if (admin.password) {
        admin.password = await bcryptjs.hash(admin.password, 10);
      }
    },
    beforeUpdate: async (admin) => {
      if (admin.changed('password')) {
        admin.password = await bcryptjs.hash(admin.password, 10);
      }
    }
  },
  tableName: 'admins'
});

// Product Model
const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'products'
});

// Doctor Model
const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  specialty: {
    type: DataTypes.STRING,
    allowNull: false
  },
  location: {
    type: DataTypes.STRING,
    allowNull: false
  },
  available: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  rating: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'doctors'
});

// Order Model
const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('Processing', 'Shipped', 'Delivered', 'Cancelled'),
    defaultValue: 'Processing'
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.ENUM('Flutterwave', 'Paystack', 'Cash on Delivery'),
    allowNull: false
  },
  paymentStatus: {
    type: DataTypes.ENUM('Pending', 'Paid', 'Failed'),
    defaultValue: 'Pending'
  },
  paymentReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shippingAddress: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  orderDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  drugsngOrderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hasPrescription: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'orders'
});

// OrderItem Model
const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Order,
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Product,
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  }
}, {
  tableName: 'order_items'
});

// Appointment Model
const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Doctor,
      key: 'id'
    }
  },
  dateTime: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('Scheduled', 'Completed', 'Cancelled'),
    defaultValue: 'Scheduled'
  },
  notes: {
    type: DataTypes.TEXT
  },
  drugsngAppointmentId: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'appointments'
});

// Session Model
const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  state: {
    type: DataTypes.ENUM('NEW', 'REGISTERING', 'REGISTERED', 'LOGGING_IN', 'LOGGED_IN', 'SUPPORT_CHAT'),
    defaultValue: 'NEW'
  },
  data: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  supportTeamId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'support_teams',
      key: 'id'
    }
  }
}, {
  tableName: 'sessions'
});

// SupportTeam Model
const SupportTeam = sequelize.define('SupportTeam', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  role: {
    type: DataTypes.ENUM('general', 'orders', 'medical', 'technical'),
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'support_teams'
});

// SupportChat Model
const SupportChat = sequelize.define('SupportChat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customerPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supportTeamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SupportTeam,
      key: 'id'
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isFromCustomer: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'support_chats'
});

// Cart Model
const Cart = sequelize.define('Cart', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Product,
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  }
}, {
  tableName: 'carts'
});

// OTP Model for email verification
const OTP = sequelize.define('OTP', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false
  },
  purpose: {
    type: DataTypes.ENUM('registration', 'password_reset', 'email_verification'),
    defaultValue: 'email_verification'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isBackupOTP: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Indicates if this OTP was manually created by admin as backup'
  },
  createdByAdmin: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Admin name/ID who created this backup OTP'
  },
  // Optional metadata to store encrypted registration snapshot or other contextual info
  meta: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Optional metadata (e.g., encrypted registration data)'
  },
  sendAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of times send was attempted'
  },
  lastSendAttemptAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last send attempt'
  }
}, {
  tableName: 'otps',
  indexes: [
    {
      fields: ['email', 'purpose']
    }
  ]
});

// Diagnostic Tests Model
const DiagnosticTest = sequelize.define('DiagnosticTest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  sampleType: {
    type: DataTypes.STRING,
    comment: 'e.g., Blood, Urine, Saliva'
  },
  collectionTime: {
    type: DataTypes.STRING,
    comment: 'e.g., 30 minutes, 1 hour'
  },
  resultTime: {
    type: DataTypes.STRING,
    comment: 'e.g., 24 hours, 48 hours'
  },
  labPartner: {
    type: DataTypes.STRING,
    comment: 'Name of the lab providing the test'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'diagnostic_tests'
});

// Healthcare Products Model
const HealthcareProduct = sequelize.define('HealthcareProduct', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'e.g., First Aid, Medical Devices, Health Supplements'
  },
  description: {
    type: DataTypes.TEXT
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  brand: {
    type: DataTypes.STRING
  },
  usage: {
    type: DataTypes.TEXT,
    comment: 'How to use the product'
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'healthcare_products'
});

// Diagnostic Test Booking Model
const DiagnosticBooking = sequelize.define('DiagnosticBooking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  diagnosticTestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: DiagnosticTest,
      key: 'id'
    }
  },
  sampleCollectionDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sampleCollectionLocation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('Scheduled', 'Completed', 'Cancelled', 'Pending'),
    defaultValue: 'Pending'
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  paymentStatus: {
    type: DataTypes.ENUM('Pending', 'Paid', 'Failed'),
    defaultValue: 'Pending'
  },
  paymentReference: {
    type: DataTypes.STRING
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'diagnostic_bookings'
});

// Support Rating Model
const SupportRating = sequelize.define('SupportRating', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  supportChatId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  customerPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supportTeamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'support_teams',
      key: 'id'
    }
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5
    }
  },
  feedback: {
    type: DataTypes.TEXT
  },
  ratedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'support_ratings'
});

// Prescription Model for medicine orders
const Prescription = sequelize.define('Prescription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Order,
      key: 'id'
    }
  },
  fileUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'URL or path to the prescription file (PDF/Image)'
  },
  extractedText: {
    type: DataTypes.TEXT,
    comment: 'OCR extracted text from prescription'
  },
  verificationStatus: {
    type: DataTypes.ENUM('Pending', 'Verified', 'Rejected'),
    defaultValue: 'Pending'
  },
  pharmacistNotes: {
    type: DataTypes.TEXT
  },
  verifiedBy: {
    type: DataTypes.STRING,
    comment: 'Pharmacist name or ID'
  },
  verifiedAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'prescriptions'
});

// Define relationships
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

Order.hasMany(OrderItem, { foreignKey: 'orderId' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

Product.hasMany(OrderItem, { foreignKey: 'productId' });
OrderItem.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(Appointment, { foreignKey: 'userId' });
Appointment.belongsTo(User, { foreignKey: 'userId' });

Doctor.hasMany(Appointment, { foreignKey: 'doctorId' });
Appointment.belongsTo(Doctor, { foreignKey: 'doctorId' });

Session.belongsTo(SupportTeam, { foreignKey: 'supportTeamId' });
SupportTeam.hasMany(Session, { foreignKey: 'supportTeamId' });

SupportChat.belongsTo(SupportTeam, { foreignKey: 'supportTeamId' });
SupportTeam.hasMany(SupportChat, { foreignKey: 'supportTeamId' });

User.hasMany(Cart, { foreignKey: 'userId' });
Cart.belongsTo(User, { foreignKey: 'userId' });

Product.hasMany(Cart, { foreignKey: 'productId' });
Cart.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(DiagnosticBooking, { foreignKey: 'userId' });
DiagnosticBooking.belongsTo(User, { foreignKey: 'userId' });

DiagnosticTest.hasMany(DiagnosticBooking, { foreignKey: 'diagnosticTestId' });
DiagnosticBooking.belongsTo(DiagnosticTest, { foreignKey: 'diagnosticTestId' });

Order.hasMany(Prescription, { foreignKey: 'orderId' });
Prescription.belongsTo(Order, { foreignKey: 'orderId' });

SupportTeam.hasMany(SupportRating, { foreignKey: 'supportTeamId' });
SupportRating.belongsTo(SupportTeam, { foreignKey: 'supportTeamId' });

// Initialize database with proper error handling
const initializeDatabase = async () => {
  try {
    // First, test the connection
    await sequelize.authenticate();
    console.log('✓ Database connection verified');

    // Sync models
    await sequelize.sync({ alter: true }); // Use alter to safely modify existing tables
    console.log('✓ Database models synchronized successfully');

    // Seed initial data if needed
    await seedInitialData();
    console.log('✓ Database initialization complete');
  } catch (error) {
    console.error('❌ Error synchronizing database models:', error.message);
    throw error; // Re-throw to be handled by caller
  }
};

// Seed initial data with better error handling
const seedInitialData = async () => {
  try {
    // Seed support teams
    const supportTeamCount = await SupportTeam.count();
    if (supportTeamCount === 0) {
      try {
        const { supportTeams } = require('../config/support');
        const teamsToCreate = supportTeams.map(({ id, ...team }) => team);
        await SupportTeam.bulkCreate(teamsToCreate, { ignoreDuplicates: true });
        console.log('✓ Support teams seeded');
      } catch (error) {
        console.warn('⚠️  Could not seed support teams:', error.message);
      }
    }

    // Seed products
    const productCount = await Product.count();
    if (productCount === 0) {
      try {
        const sampleProducts = [
          { name: "Paracetamol 500mg", category: "Analgesic", description: "Pain relief medication", price: 500, stock: 100, isActive: true },
          { name: "Insulin Vial", category: "Anti-diabetic", description: "Diabetes medication", price: 2000, stock: 50, isActive: true },
          { name: "Amoxicillin 500mg", category: "Antibiotic", description: "Antibiotic medication", price: 800, stock: 75, isActive: true },
          { name: "Vitamin C Tablets", category: "Vitamins", description: "Immune system support", price: 300, stock: 200, isActive: true },
          { name: "Blood Pressure Monitor", category: "Healthcare Devices", description: "Home BP monitoring device", price: 5000, stock: 30, isActive: true },
          { name: "Cough Syrup", category: "Cough & Cold", description: "Effective cough relief", price: 400, stock: 150, isActive: true },
          { name: "Multivitamins", category: "Vitamins", description: "Daily vitamin supplement", price: 1200, stock: 80, isActive: true },
          { name: "Hand Sanitizer", category: "Hygiene", description: "70% alcohol hand sanitizer", price: 250, stock: 200, isActive: true }
        ];

        await Product.bulkCreate(sampleProducts, { ignoreDuplicates: true });
        console.log('✓ Sample products seeded');
      } catch (error) {
        console.warn('⚠️  Could not seed products:', error.message);
      }
    }

    // Seed doctors
    const doctorCount = await Doctor.count();
    if (doctorCount === 0) {
      try {
        const sampleDoctors = [
          { name: "Dr. Adaobi", specialty: "Cardiologist", location: "Lagos", available: true, rating: 4.8, isActive: true },
          { name: "Dr. Ken", specialty: "Pediatrician", location: "Abuja", available: true, rating: 4.5, isActive: true },
          { name: "Dr. Ngozi", specialty: "Dermatologist", location: "Port Harcourt", available: true, rating: 4.7, isActive: true },
          { name: "Dr. Tunde", specialty: "General Practitioner", location: "Kano", available: true, rating: 4.6, isActive: true },
          { name: "Dr. Fatima", specialty: "Gynecologist", location: "Enugu", available: true, rating: 4.9, isActive: true },
          { name: "Dr. Chukwu", specialty: "Neurologist", location: "Lagos", available: true, rating: 4.7, isActive: true },
          { name: "Dr. Okafor", specialty: "Orthopedic", location: "Abuja", available: false, rating: 4.4, isActive: true }
        ];

        await Doctor.bulkCreate(sampleDoctors, { ignoreDuplicates: true });
        console.log('✓ Sample doctors seeded');
      } catch (error) {
        console.warn('⚠️  Could not seed doctors:', error.message);
      }
    }

    // Seed diagnostic tests
    const diagnosticTestCount = await DiagnosticTest.count();
    if (diagnosticTestCount === 0) {
      try {
        const sampleDiagnosticTests = [
          { name: "Blood Test (Full Blood Count)", category: "Blood Tests", description: "Complete blood count (CBC) test", price: 2500, sampleType: "Blood", collectionTime: "15 minutes", resultTime: "24 hours", labPartner: "Lancet Laboratories", isActive: true },
          { name: "COVID-19 Rapid Test", category: "Rapid Tests", description: "COVID-19 antigen rapid test", price: 1500, sampleType: "Nasal Swab", collectionTime: "5 minutes", resultTime: "15 minutes", labPartner: "Medplus Labs", isActive: true },
          { name: "Blood Sugar Test", category: "Metabolic Tests", description: "Fasting glucose test", price: 1500, sampleType: "Blood", collectionTime: "10 minutes", resultTime: "24 hours", labPartner: "Pathcare Diagnostics", isActive: true },
          { name: "Thyroid Function Test", category: "Endocrine Tests", description: "TSH, T3, T4 levels", price: 3000, sampleType: "Blood", collectionTime: "15 minutes", resultTime: "48 hours", labPartner: "Lancet Laboratories", isActive: true },
          { name: "Lipid Profile", category: "Metabolic Tests", description: "Cholesterol and triglycerides test", price: 2000, sampleType: "Blood", collectionTime: "10 minutes", resultTime: "24 hours", labPartner: "Medplus Labs", isActive: true },
          { name: "Urinalysis", category: "Urinary Tests", description: "Complete urine analysis", price: 1000, sampleType: "Urine", collectionTime: "10 minutes", resultTime: "24 hours", labPartner: "Pathcare Diagnostics", isActive: true },
          { name: "Malaria Test", category: "Infectious Disease Tests", description: "Blood smear and rapid malaria test", price: 1800, sampleType: "Blood", collectionTime: "15 minutes", resultTime: "30 minutes", labPartner: "Medplus Labs", isActive: true },
          { name: "Typhoid Test", category: "Infectious Disease Tests", description: "Typhoid screening test", price: 2000, sampleType: "Blood", collectionTime: "15 minutes", resultTime: "24 hours", labPartner: "Lancet Laboratories", isActive: true }
        ];

        await DiagnosticTest.bulkCreate(sampleDiagnosticTests, { ignoreDuplicates: true });
        console.log('✓ Sample diagnostic tests seeded');
      } catch (error) {
        console.warn('⚠️  Could not seed diagnostic tests:', error.message);
      }
    }

    // Seed healthcare products
    const healthcareProductCount = await HealthcareProduct.count();
    if (healthcareProductCount === 0) {
      try {
        const sampleHealthcareProducts = [
          { name: "First Aid Kit", category: "First Aid", description: "Complete home first aid kit", price: 3500, stock: 50, brand: "SafeFirst", usage: "For minor injuries and emergency care", isActive: true },
          { name: "Digital Thermometer", category: "Medical Devices", description: "Fast and accurate temperature reading", price: 2000, stock: 75, brand: "Braun", usage: "Place under tongue for 30 seconds", isActive: true },
          { name: "Oximeter", category: "Medical Devices", description: "Finger pulse oximeter", price: 4500, stock: 40, brand: "Omron", usage: "Place finger in device and press button", isActive: true },
          { name: "Glucose Meter", category: "Medical Devices", description: "Blood glucose monitoring device", price: 5000, stock: 30, brand: "Accu-Chek", usage: "Use with test strips for glucose reading", isActive: true },
          { name: "Elastic Bandage", category: "First Aid", description: "Compression wrap for sprains", price: 800, stock: 100, brand: "3M", usage: "Wrap around affected area firmly", isActive: true },
          { name: "Sterile Gauze Pads", category: "First Aid", description: "Pack of 10 sterile gauze pads", price: 500, stock: 150, brand: "Johnson & Johnson", usage: "For wound cleaning and dressing", isActive: true },
          { name: "Antibiotic Cream", category: "First Aid", description: "Antibacterial ointment", price: 600, stock: 80, brand: "Neosporin", usage: "Apply to minor cuts and scrapes", isActive: true },
          { name: "Pain Relief Gel", category: "Topical", description: "Menthol-based pain relief gel", price: 1200, stock: 60, brand: "Volini", usage: "Apply to affected area and massage", isActive: true }
        ];

        await HealthcareProduct.bulkCreate(sampleHealthcareProducts, { ignoreDuplicates: true });
        console.log('✓ Sample healthcare products seeded');
      } catch (error) {
        console.warn('⚠️  Could not seed healthcare products:', error.message);
      }
    }

    // Seed admin owner
    try {
      const adminCount = await sequelize.models.Admin ? await Admin.count() : 0;
      if (adminCount === 0) {
        const ownerEmail = process.env.OWNER_EMAIL || 'sundayitodo500@gmail.com';
        const ownerPassword = process.env.OWNER_PASSWORD || 'MyPassword@123';
        await Admin.create({ name: 'Owner', email: ownerEmail.toLowerCase(), password: ownerPassword, role: 'Owner', isActive: true });
        console.log('✓ Owner admin seeded');
      }
    } catch (err) {
      console.warn('⚠️  Could not seed owner admin:', err.message);
    }
  } catch (error) {
    console.error('❌ Error seeding initial data:', error.message);
  }
};

module.exports = {
  sequelize,
  User,
  Admin,
  Product,
  Doctor,
  Order,
  OrderItem,
  Appointment,
  Session,
  SupportTeam,
  SupportChat,
  Cart,
  OTP,
  DiagnosticTest,
  HealthcareProduct,
  DiagnosticBooking,
  SupportRating,
  Prescription,
  initializeDatabase
};
