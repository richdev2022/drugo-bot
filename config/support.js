// Support team configuration
const supportTeams = [
  {
    id: 1,
    name: 'General Support',
    phoneNumber: process.env.SUPPORT_PHONE_NUMBER_1 || '2347051583304',
    role: 'general',
    isActive: true
  },
  {
    id: 2,
    name: 'Order Support',
    phoneNumber: process.env.SUPPORT_PHONE_NUMBER_2 || '2345678901',
    role: 'orders',
    isActive: true
  },
  {
    id: 3,
    name: 'Medical Support',
    phoneNumber: process.env.SUPPORT_PHONE_NUMBER_3 || '3456789012',
    role: 'medical',
    isActive: true
  },
  {
    id: 4,
    name: 'Technical Support',
    phoneNumber: process.env.SUPPORT_PHONE_NUMBER_4 || '4567890123',
    role: 'technical',
    isActive: true
  }
];

// Get active support teams
const getActiveSupportTeams = () => {
  return supportTeams.filter(team => team.isActive);
};

// Get support team by role
const getSupportTeamByRole = (role) => {
  return supportTeams.find(team => team.role === role && team.isActive);
};

// Get default support team (general)
const getDefaultSupportTeam = () => {
  return supportTeams.find(team => team.role === 'general' && team.isActive);
};

module.exports = {
  supportTeams,
  getActiveSupportTeams,
  getSupportTeamByRole,
  getDefaultSupportTeam
};
