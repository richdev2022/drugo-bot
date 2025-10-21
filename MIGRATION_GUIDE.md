# Database Migration Guide - v2.0.0

## Overview

This guide provides step-by-step instructions to migrate from v1.x to v2.0.0 of the Drugs.ng WhatsApp Bot.

---

## Pre-Migration Checklist

- [ ] PostgreSQL database is accessible
- [ ] You have database admin credentials
- [ ] You have read/write access to the codebase
- [ ] A complete database backup has been created
- [ ] Maintenance window is scheduled (if production)
- [ ] Team is notified of the update

---

## Database Backup

### Create Full Database Backup

```bash
# PostgreSQL backup command
pg_dump -U postgres -h localhost drugs_ng_db > drugs_ng_backup_$(date +%Y%m%d_%H%M%S).sql

# Or if using a connection string
pg_dump "postgresql://user:password@localhost:5432/drugs_ng_db" > backup.sql

# Verify backup file
ls -lh backup.sql
```

### Backup Verification

```bash
# Check backup integrity (optional, for large files)
pg_dump -U postgres -h localhost --format=custom drugs_ng_db | wc -c

# Store backup securely
mkdir -p /secure/backups
mv backup.sql /secure/backups/
chmod 600 /secure/backups/backup.sql
```

---

## Migration Steps

### 1. Stop Application

```bash
# Stop the running WhatsApp bot service
npm run stop
# or
pm2 stop drugs-ng-bot
# or
docker-compose down
```

### 2. Create Migration Files

#### Option A: Using Migration Script

```bash
# Create migration directory if not exists
mkdir -p migrations

# Create migration file
cat > migrations/001_enhance_prescriptions_v2.js << 'EOF'
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Add new columns to prescriptions table
      await queryInterface.addColumn(
        'prescriptions',
        'extractedText',
        {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'OCR extracted text from prescription'
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'prescriptions',
        'extractionStatus',
        {
          type: Sequelize.ENUM('pending', 'extracted', 'failed'),
          defaultValue: 'pending',
          allowNull: false,
          comment: 'Status of OCR extraction'
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'prescriptions',
        'extractedAt',
        {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Timestamp when OCR extraction completed'
        },
        { transaction }
      );

      await transaction.commit();
      console.log('✓ Migration 001 completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('✗ Migration 001 failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Rollback: drop columns
      await queryInterface.removeColumn('prescriptions', 'extractedText', { transaction });
      await queryInterface.removeColumn('prescriptions', 'extractionStatus', { transaction });
      await queryInterface.removeColumn('prescriptions', 'extractedAt', { transaction });

      await transaction.commit();
      console.log('✓ Rollback 001 completed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('��� Rollback 001 failed:', error);
      throw error;
    }
  }
};
EOF
```

#### Option B: Direct SQL Execution

If not using a migration system, execute SQL directly:

```sql
-- Connect to PostgreSQL
psql -U postgres -d drugs_ng_db

-- Add new columns to prescriptions table
ALTER TABLE prescriptions
ADD COLUMN extractedText TEXT,
ADD COLUMN extractionStatus VARCHAR(20) DEFAULT 'pending',
ADD COLUMN extractedAt TIMESTAMP NULL;

-- Add constraints
ALTER TABLE prescriptions
ADD CONSTRAINT check_extraction_status 
CHECK (extractionStatus IN ('pending', 'extracted', 'failed'));

-- Verify changes
\d prescriptions
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'prescriptions' 
ORDER BY ordinal_position;
```

### 3. Update Environment Variables

```bash
# Edit your .env file (or set via environment)
cat >> .env << 'EOF'

# Session Management (v2.0.0)
SESSION_IDLE_TIMEOUT_MINUTES=10
TOKEN_EXPIRY_MINUTES=60
TOKEN_REFRESH_THRESHOLD_MINUTES=5

# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_BACKOFF_MULTIPLIER=2

# Timezone Configuration
DEFAULT_TIMEZONE=Africa/Lagos

EOF
```

### 4. Deploy New Code

```bash
# Pull latest code
git fetch origin
git checkout v2.0.0  # or main if updated

# Install dependencies
npm install

# Verify installation
npm list | grep -E "(pagination|orderParser|sessionToken|appointmentManagement|orderManagement)"
```

### 5. Verify Database Migration

```bash
# Check if columns were created
psql -U postgres -d drugs_ng_db << 'EOF'
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'prescriptions' 
ORDER BY ordinal_position;
EOF

# Expected output:
# extractedText       | text    | YES | null
# extractionStatus    | varchar | NO  | pending
# extractedAt         | timestamp | YES | null
```

### 6. Run Tests

```bash
# Run unit tests
npm test -- tests/unit/utils.test.js

# Check for any failures
# Expected: All tests should pass

# Run integration tests
npm test -- tests/integration/e2e.flows.test.js

# Manual smoke test
npm run dev

# In another terminal, test a simple command
# Send test message via WhatsApp
```

### 7. Cleanup Old Sessions

```bash
# Run cleanup script to remove expired sessions
node scripts/cleanup-sessions.js

# Expected output:
# Cleaned up X expired sessions

# Verify cleanup
psql -U postgres -d drugs_ng_db << 'EOF'
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM sessions WHERE state = 'NEW';
EOF
```

### 8. Start Application

```bash
# Start the application
npm start

# or using PM2
pm2 start ecosystem.config.js

# or using Docker
docker-compose up -d

# Verify it's running
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","uptime":"..."}
```

### 9. Monitor Logs

```bash
# Watch application logs
npm run logs
# or
tail -f logs/app.log

# Look for any errors or warnings
# Expected: "✓ Successfully started Drugs.ng WhatsApp Bot"
```

---

## Rollback Procedures

### If Migration Failed

```bash
# Stop the application
npm run stop

# Restore database from backup
psql -U postgres -d drugs_ng_db < backup.sql

# Revert code changes
git checkout v1.9.0  # or previous version

# Remove new environment variables from .env
# (manually remove v2.0.0 specific variables)

# Start previous version
npm install  # Uses package-lock.json from v1.9.0
npm start

# Verify restoration
curl http://localhost:3000/health
```

### If Performance Issues Occur

```bash
# Check database performance
psql -U postgres -d drugs_ng_db << 'EOF'
EXPLAIN ANALYZE
SELECT * FROM prescriptions WHERE extractionStatus = 'pending' LIMIT 10;
EOF

# If needed, create indexes
CREATE INDEX idx_prescriptions_extraction_status 
ON prescriptions(extractionStatus);

CREATE INDEX idx_sessions_last_activity 
ON sessions(lastActivity);
```

---

## Verification Checklist

After migration, verify the following:

### Database
- [ ] All new columns exist in prescriptions table
- [ ] Data integrity is maintained
- [ ] Indexes are created
- [ ] No constraint violations

### Code
- [ ] New services are loaded without errors
- [ ] All imports resolve correctly
- [ ] Environment variables are set
- [ ] Tests pass

### Functionality
- [ ] Users can upload prescriptions
- [ ] OCR extraction works
- [ ] Product search with pagination works
- [ ] Order placement works
- [ ] Doctor appointment booking works
- [ ] Session management works
- [ ] Token refresh works

### Performance
- [ ] API response times are acceptable
- [ ] Database queries are efficient
- [ ] No memory leaks detected
- [ ] CPU usage is normal

### User Experience
- [ ] WhatsApp messages are received
- [ ] Bot responds correctly
- [ ] Pagination navigation works
- [ ] Error messages are helpful
- [ ] Session timeout works

---

## Post-Migration Tasks

### 1. Data Cleanup

```bash
# Optional: Set extractionStatus for existing prescriptions
psql -U postgres -d drugs_ng_db << 'EOF'
UPDATE prescriptions 
SET extractionStatus = 'extracted'
WHERE extractedText IS NOT NULL;

UPDATE prescriptions 
SET extractionStatus = 'pending'
WHERE extractedText IS NULL;
EOF
```

### 2. Archive Old Sessions

```bash
# Archive sessions older than 30 days
node scripts/archive-sessions.js --days 30
```

### 3. Create Indexes for Performance

```bash
psql -U postgres -d drugs_ng_db << 'EOF'
-- Prescription indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_extraction_status 
ON prescriptions(extractionStatus);

CREATE INDEX IF NOT EXISTS idx_prescriptions_verification_status 
ON prescriptions(verificationStatus);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_phone_number_state 
ON sessions(phoneNumber, state);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity 
ON sessions(lastActivity);

-- Order indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_status 
ON orders(userId, status);

-- Appointment indexes
CREATE INDEX IF NOT EXISTS idx_appointments_user_date 
ON appointments(userId, dateTime);
EOF
```

### 4. Enable Monitoring

```bash
# Monitor database performance
npm run monitor:db

# Monitor application metrics
npm run monitor:app

# Setup alerts (if using monitoring system)
# Alert on: High error rate, Slow queries, Failed payments
```

### 5. Document Changes

```bash
# Create migration log
cat > MIGRATION_LOG.md << 'EOF'
# Migration Log

## Migration: v1.9.0 → v2.0.0
- **Date**: $(date)
- **Duration**: X minutes
- **Status**: ✓ Successful
- **Backed Up**: backup.sql
- **Changes**: Added prescription extraction, pagination, session management

## Data Validation
- Prescriptions: X records processed
- Sessions: X active sessions
- Orders: X orders migrated

## Issues Encountered
(none)

## Rollback Steps (if needed)
1. Stop application
2. Restore backup.sql
3. Checkout v1.9.0
4. npm start
EOF
```

---

## Common Issues & Solutions

### Issue 1: Column Already Exists
**Error**: `ERROR: column "extractedText" of relation "prescriptions" already exists`

**Solution**:
```bash
# Check if columns exist
psql -U postgres -d drugs_ng_db -c "\d prescriptions"

# If they exist, migration already ran
# You can safely proceed
```

### Issue 2: Enum Type Already Exists
**Error**: `ERROR: type "enum_prescriptions_extractionStatus" already exists`

**Solution**:
```bash
# Enum already created, skip this step
# Check existing enums
psql -U postgres -d drugs_ng_db -c "\dT enum*"
```

### Issue 3: Application Won't Start
**Error**: `Error: Model definition does not have data type...`

**Solution**:
```bash
# Clear Node cache
rm -rf node_modules/.cache

# Reinstall dependencies
npm install

# Check for version conflicts
npm ls

# Verify database connection
npm run db:test
```

### Issue 4: Performance Degradation
**Error**: Slow queries, high CPU usage

**Solution**:
```bash
# Analyze query plans
EXPLAIN ANALYZE SELECT * FROM prescriptions;

# Create missing indexes
CREATE INDEX idx_prescriptions_extraction_status ON prescriptions(extractionStatus);

# Vacuum database
VACUUM ANALYZE;

# Check for large tables
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

---

## Support Resources

- **Documentation**: See CHANGELOG.md for detailed features
- **Tests**: Run `npm test` to verify functionality
- **Logs**: Check `logs/app.log` for debug information
- **Database**: Use `psql` for direct database queries
- **Help**: Contact support@drugs.ng

---

## Timeline

| Step | Duration | Notes |
|------|----------|-------|
| Database Backup | 5-10 min | Critical |
| Code Deployment | 5 min | Download & install |
| Database Migration | 2-5 min | Run migration scripts |
| Tests & Verification | 10-15 min | Unit + integration tests |
| Monitoring | Ongoing | Check logs & metrics |
| Cleanup | 5 min | Remove old sessions |

**Total Time**: 30-50 minutes (depending on database size)

---

## Success Criteria

Migration is successful when:

✅ All database columns are created  
✅ Application starts without errors  
✅ All tests pass  
✅ User workflows are functional  
✅ No error spikes in logs  
✅ Session management works  
✅ OCR extraction saves to database  
✅ Pagination displays correctly  
✅ Payment retry logic works  
✅ Users can complete orders  

---

**Last Updated**: 2024-01-15  
**Version**: 2.0.0  
**Maintainer**: Drugs.ng Engineering Team
