#!/usr/bin/env node

/**
 * Direct Migration Script for Session Table Columns
 * This script adds missing token, userId, and loginTime columns to the sessions table
 * Run this if the columns are still missing after application startup
 */

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

const runMigration = async () => {
  try {
    console.log('🔄 Starting session table migration...\n');
    
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    const queryInterface = sequelize.getQueryInterface();
    
    // Describe current table structure
    console.log('📋 Current table structure:');
    const currentStructure = await queryInterface.describeTable('sessions');
    console.log(JSON.stringify(currentStructure, null, 2));
    console.log('');

    // List of columns to add
    const columnsToAdd = [
      {
        name: 'token',
        definition: {
          type: DataTypes.STRING(500),
          allowNull: true,
          comment: 'Session token for authentication'
        }
      },
      {
        name: 'userId',
        definition: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: 'Reference to logged-in user'
        }
      },
      {
        name: 'loginTime',
        definition: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: 'When the user logged in'
        }
      }
    ];

    // Add missing columns
    for (const column of columnsToAdd) {
      try {
        if (currentStructure[column.name]) {
          console.log(`✓ Column '${column.name}' already exists, skipping...`);
          continue;
        }

        console.log(`➕ Adding column '${column.name}'...`);
        await queryInterface.addColumn('sessions', column.name, column.definition);
        console.log(`✓ Successfully added '${column.name}' column\n`);
      } catch (error) {
        console.error(`❌ Error adding '${column.name}' column: ${error.message}`);
        console.log('   Attempting raw SQL as fallback...');

        try {
          const sqlType = column.name === 'token' ? 'VARCHAR(500)' : 
                         column.name === 'userId' ? 'INTEGER' : 
                         'TIMESTAMP WITH TIME ZONE';
          
          const sql = `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "${column.name}" ${sqlType}`;
          console.log(`   Executing: ${sql}`);
          
          await sequelize.query(sql);
          console.log(`✓ Successfully added '${column.name}' via raw SQL\n`);
        } catch (sqlError) {
          if (sqlError.message.includes('already exists') || sqlError.message.includes('duplicate')) {
            console.log(`✓ Column '${column.name}' already exists in database\n`);
          } else {
            console.error(`❌ Raw SQL also failed: ${sqlError.message}\n`);
            throw sqlError;
          }
        }
      }
    }

    // Verify final structure
    console.log('📊 Verifying final table structure:');
    const finalStructure = await queryInterface.describeTable('sessions');
    const hasToken = !!finalStructure.token;
    const hasUserId = !!finalStructure.userId;
    const hasLoginTime = !!finalStructure.loginTime;

    console.log(`  - token: ${hasToken ? '✓ EXISTS' : '✗ MISSING'}`);
    console.log(`  - userId: ${hasUserId ? '✓ EXISTS' : '✗ MISSING'}`);
    console.log(`  - loginTime: ${hasLoginTime ? '✓ EXISTS' : '✗ MISSING'}`);
    console.log('');

    if (hasToken && hasUserId && hasLoginTime) {
      console.log('✅✅✅ MIGRATION SUCCESSFUL - ALL COLUMNS PRESENT ✅✅✅\n');
      console.log('The bot is now ready to handle session tokens properly.');
      console.log('Users will be able to maintain active sessions after login.');
      process.exit(0);
    } else {
      console.error('❌ MIGRATION INCOMPLETE - Some columns are still missing');
      console.error('Please check your database permissions and try again.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Run the migration
runMigration();