'use strict';

module.exports = {
  up: async (sequelize) => {
    const t = sequelize.transaction();
    try {
      // Add new columns to sessions table
      await sequelize.sequelize.queryInterface.addColumn(
        'sessions',
        'token',
        {
          type: sequelize.DataTypes.STRING,
          allowNull: true,
          comment: 'Session token for authentication'
        },
        { transaction: await t }
      );

      await sequelize.sequelize.queryInterface.addColumn(
        'sessions',
        'userId',
        {
          type: sequelize.DataTypes.INTEGER,
          allowNull: true,
          comment: 'Reference to logged-in user'
        },
        { transaction: await t }
      );

      await sequelize.sequelize.queryInterface.addColumn(
        'sessions',
        'loginTime',
        {
          type: sequelize.DataTypes.DATE,
          allowNull: true,
          comment: 'When the user logged in'
        },
        { transaction: await t }
      );

      await sequelize.sequelize.queryInterface.changeColumn(
        'sessions',
        'lastActivity',
        {
          type: sequelize.DataTypes.DATE,
          allowNull: false,
          defaultValue: () => new Date(),
          comment: 'Last activity timestamp for idle timeout tracking'
        },
        { transaction: await t }
      );

      await (await t).commit();
      console.log('✅ Migration completed: Added token, userId, loginTime columns to sessions table');
    } catch (error) {
      await (await t).rollback();
      throw error;
    }
  },

  down: async (sequelize) => {
    const t = sequelize.transaction();
    try {
      await sequelize.sequelize.queryInterface.removeColumn(
        'sessions',
        'token',
        { transaction: await t }
      );
      await sequelize.sequelize.queryInterface.removeColumn(
        'sessions',
        'userId',
        { transaction: await t }
      );
      await sequelize.sequelize.queryInterface.removeColumn(
        'sessions',
        'loginTime',
        { transaction: await t }
      );
      await (await t).commit();
    } catch (error) {
      await (await t).rollback();
      throw error;
    }
  }
};