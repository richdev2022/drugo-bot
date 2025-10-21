const crypto = require('crypto');
const bcryptjs = require('bcryptjs');
const { Admin, OTP, sequelize } = require('../models');
const { sendOTPEmail } = require('../config/brevo');
const { generateOTP, getOTPExpiry, isOTPValid } = require('../utils/otp');

const ADMIN_TOKEN_EXPIRY_MINUTES = parseInt(process.env.ADMIN_TOKEN_EXPIRY_MINUTES || '60', 10);

const generateToken = () => crypto.randomBytes(32).toString('hex');

// Basic role-permission mapping
const hasPermission = (role, action, table) => {
  if (!role) return false;
  if (role === 'Owner') return true;

  // Normalize table name for checks
  const t = (table || '').toLowerCase();

  const readOnlyTables = ['users','orders','order','orderitem','supportteam','supportchat','prescription','diagnosticbooking','diagnostictest','healthcareproduct','doctor','product','cart','appointment'];

  switch (role) {
    case 'Admin':
      // Admin can read/export everything and manage most tables
      if (action === 'read' || action === 'export') return true;
      if (action === 'create' || action === 'update' || action === 'delete') return true;
      if (action === 'manageStaff') return true;
      return false;
    case 'CustomerSupport':
      if (action === 'read') return true; // can read across tables
      if (action === 'export') return t === 'supportchat' || t === 'supportteam' || t === 'orders' || t === 'users';
      return false; // no write/delete
    case 'Auditor':
      // Auditor strictly read-only, can export any
      if (action === 'read' || action === 'export') return true;
      return false;
    default:
      return false;
  }
};

// Admin login - returns token
const adminLogin = async (email, password) => {
  if (!email || !password) throw new Error('Email and password are required');
  const admin = await Admin.findOne({ where: { email: email.toLowerCase() } });
  if (!admin) throw new Error('Invalid credentials');
  const ok = await bcryptjs.compare(password, admin.password);
  if (!ok) throw new Error('Invalid credentials');
  if (!admin.isActive) throw new Error('Admin account inactive');

  const token = generateToken();
  const expiry = new Date(Date.now() + ADMIN_TOKEN_EXPIRY_MINUTES * 60 * 1000);
  admin.token = token;
  admin.tokenExpiry = expiry;
  admin.lastLogin = new Date();
  await admin.save();

  return { token, expiresAt: expiry, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
};

// Middleware-like verifier (used in routes)
const verifyAdminToken = async (token) => {
  if (!token) return null;
  const admin = await Admin.findOne({ where: { token } });
  if (!admin) return null;
  if (!admin.tokenExpiry || new Date(admin.tokenExpiry) < new Date()) return null;
  return admin;
};

// Request admin password reset OTP (email)
const requestAdminPasswordResetOTP = async (email) => {
  if (!email) throw new Error('Email is required');
  const admin = await Admin.findOne({ where: { email: email.toLowerCase() } });
  // still generate OTP even if not found to avoid enumeration
  const otp = generateOTP();
  const expiresAt = getOTPExpiry();
  await OTP.create({ email: email.toLowerCase(), code: otp, purpose: 'admin_password_reset', expiresAt });
  if (admin) {
    await sendOTPEmail(email, otp, admin.name || 'Admin');
  }
  return { success: true, message: 'If this email exists, an OTP has been sent' };
};

// Verify admin OTP
const verifyAdminPasswordResetOTP = async (email, otp) => {
  if (!email || !otp) throw new Error('Email and OTP are required');
  const otpRecord = await OTP.findOne({ where: { email: email.toLowerCase(), code: otp, purpose: 'admin_password_reset', isUsed: false } });
  if (!otpRecord) throw new Error('Invalid OTP');
  if (!isOTPValid(otpRecord.expiresAt)) throw new Error('OTP expired');
  // mark used
  otpRecord.isUsed = true;
  otpRecord.usedAt = new Date();
  await otpRecord.save();
  return { success: true, message: 'OTP verified' };
};

// Complete admin password reset
const completeAdminPasswordReset = async (email, otp, newPassword) => {
  if (!email || !otp || !newPassword) throw new Error('Email, OTP and new password required');
  const otpRecord = await OTP.findOne({ where: { email: email.toLowerCase(), code: otp, purpose: 'admin_password_reset', isUsed: true } });
  if (!otpRecord) throw new Error('OTP not verified');
  const admin = await Admin.findOne({ where: { email: email.toLowerCase() } });
  if (!admin) throw new Error('Admin not found');
  admin.password = newPassword;
  await admin.save();
  return { success: true, message: 'Password reset successful' };
};

// Create staff user
const createStaff = async ({ name, email, password, role = 'Admin' }, createdBy) => {
  if (!name || !email || !password) throw new Error('Name, email and password are required');
  if (!createdBy || !hasPermission(createdBy.role, 'manageStaff', 'Admin')) {
    throw new Error('Permission denied');
  }
  if (!['Owner','Admin','CustomerSupport','Auditor'].includes(role)) {
    throw new Error('Invalid role');
  }
  if (createdBy.role !== 'Owner' && role === 'Owner') {
    throw new Error('Only Owner can create Owner');
  }
  const existing = await Admin.findOne({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error('Admin with this email already exists');
  const admin = await Admin.create({ name, email: email.toLowerCase(), password, role, isActive: true });
  return { success: true, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
};

// Generic fetch with pagination, filtering, search, date range, export
const fetchTable = async (tableName, query = {}, admin = null) => {
  const Model = sequelize.models[tableName];
  if (!Model) throw new Error('Table not found');
  if (!admin || !hasPermission(admin.role, 'read', tableName)) throw new Error('Permission denied');

  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)));
  const offset = (page - 1) * pageSize;

  const where = {};
  // simple search across common fields
  if (query.search) {
    const { Op } = require('sequelize');
    const term = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { phoneNumber: { [Op.iLike]: term } }
    ];
  }

  if (query.dateFrom || query.dateTo) {
    const { Op } = require('sequelize');
    where.createdAt = {};
    if (query.dateFrom) where.createdAt[Op.gte] = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt[Op.lte] = new Date(query.dateTo);
  }

  const { rows, count } = await Model.findAndCountAll({ where, offset, limit: pageSize, order: [['createdAt','DESC']] });
  return { items: rows, total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) };
};

// Generic add record
const addRecord = async (tableName, data, admin = null) => {
  const Model = sequelize.models[tableName];
  if (!Model) throw new Error('Table not found');
  if (!admin || !hasPermission(admin.role, 'create', tableName)) throw new Error('Permission denied');
  const rec = await Model.create(data);
  return rec;
};

// Generic update
const updateRecord = async (tableName, id, data, admin = null) => {
  const Model = sequelize.models[tableName];
  if (!Model) throw new Error('Table not found');
  if (!admin || !hasPermission(admin.role, 'update', tableName)) throw new Error('Permission denied');
  const rec = await Model.findByPk(id);
  if (!rec) throw new Error('Record not found');
  await rec.update(data);
  return rec;
};

// Generic delete
const deleteRecord = async (tableName, id, admin = null) => {
  const Model = sequelize.models[tableName];
  if (!Model) throw new Error('Table not found');
  if (!admin || !hasPermission(admin.role, 'delete', tableName)) throw new Error('Permission denied');
  const rec = await Model.findByPk(id);
  if (!rec) throw new Error('Record not found');
  await rec.destroy();
  return { success: true };
};

// Create backup OTP for user registration
const createBackupOTP = async (email, adminUser) => {
  if (!email) throw new Error('Email is required');
  if (!adminUser) throw new Error('Admin authentication required');
  if (!hasPermission(adminUser.role, 'create', 'OTP')) throw new Error('Permission denied - cannot create backup OTP');

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  // Create backup OTP record
  const otpRecord = await OTP.create({
    email: email.toLowerCase(),
    code: otp,
    purpose: 'registration',
    isBackupOTP: true,
    createdByAdmin: adminUser.name || adminUser.email,
    expiresAt: expiresAt,
    isUsed: false
  });

  return {
    success: true,
    message: `Backup OTP created for ${email}`,
    otp: otp,
    expiresAt: expiresAt,
    adminCreated: true
  };
};

// Get OTP status for troubleshooting
const getOTPStatus = async (email, adminUser) => {
  if (!email) throw new Error('Email is required');
  if (!adminUser) throw new Error('Admin authentication required');
  if (!hasPermission(adminUser.role, 'read', 'OTP')) throw new Error('Permission denied');

  const otpRecords = await OTP.findAll({
    where: {
      email: email.toLowerCase(),
      purpose: 'registration'
    },
    order: [['createdAt', 'DESC']],
    limit: 5
  });

  return {
    email: email,
    otpRecords: otpRecords.map(otp => ({
      id: otp.id,
      code: otp.code,
      isUsed: otp.isUsed,
      isBackupOTP: otp.isBackupOTP,
      createdByAdmin: otp.createdByAdmin,
      expiresAt: otp.expiresAt,
      createdAt: otp.createdAt,
      usedAt: otp.usedAt,
      sendAttempts: otp.sendAttempts
    })),
    hasValidOTP: otpRecords.some(otp => !otp.isUsed && new Date() <= otp.expiresAt)
  };
};

// Export table as CSV or JSON (no pagination)
const exportTable = async (tableName, query = {}, admin = null) => {
  const Model = sequelize.models[tableName];
  if (!Model) throw new Error('Table not found');
  if (!admin || !hasPermission(admin.role, 'export', tableName)) throw new Error('Permission denied');

  const where = {};
  if (query.search) {
    const { Op } = require('sequelize');
    const term = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { phoneNumber: { [Op.iLike]: term } }
    ];
  }
  if (query.dateFrom || query.dateTo) {
    const { Op } = require('sequelize');
    where.createdAt = {};
    if (query.dateFrom) where.createdAt[Op.gte] = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt[Op.lte] = new Date(query.dateTo);
  }

  const items = await Model.findAll({ where, order: [['createdAt','DESC']] });
  const format = (query.format || 'csv').toLowerCase();

  if (format === 'json') {
    return { contentType: 'application/json', filename: `${tableName}-export.json`, payload: JSON.stringify(items, null, 2) };
  }

  // CSV export
  const toCSV = (records) => {
    if (!records || records.length === 0) return '';
    const plain = records.map(r => (typeof r.toJSON === 'function' ? r.toJSON() : r));
    const headers = Array.from(new Set(plain.flatMap(obj => Object.keys(obj))));
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = [headers.join(',')].concat(plain.map(obj => headers.map(h => escape(obj[h])).join(',')));
    return rows.join('\n');
  };

  const csv = toCSV(items);
  return { contentType: 'text/csv', filename: `${tableName}-export.csv`, payload: csv };
};

module.exports = {
  adminLogin,
  verifyAdminToken,
  requestAdminPasswordResetOTP,
  verifyAdminPasswordResetOTP,
  completeAdminPasswordReset,
  createStaff,
  createBackupOTP,
  getOTPStatus,
  fetchTable,
  addRecord,
  updateRecord,
  deleteRecord,
  exportTable,
  hasPermission
};
