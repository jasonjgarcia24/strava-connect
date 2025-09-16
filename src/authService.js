const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const path = require('path');

// Initialize SQLite database
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'data', 'users.db'),
  logging: false
});

// Athlete model - represents individual athletes who own the data
const Athlete = sequelize.define('Athlete', {
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
    unique: true,
    allowNull: false
  },
  subdomain: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true // Optional: for custom athlete URLs like john.yourapp.com
  },
  stravaTokens: {
    type: DataTypes.TEXT,
    allowNull: true // Encrypted Strava tokens for this athlete
  },
  sheetsConfig: {
    type: DataTypes.TEXT,
    allowNull: true // Encrypted Google Sheets config for this athlete
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  planType: {
    type: DataTypes.ENUM('free', 'premium'),
    defaultValue: 'free'
  }
});

// User model - represents users who can access athlete data
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // Null for OAuth users
  },
  provider: {
    type: DataTypes.ENUM('local', 'google', 'strava'),
    allowNull: false,
    defaultValue: 'local'
  },
  providerId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('athlete', 'coach', 'admin'),
    allowNull: false,
    defaultValue: 'coach'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false  // Default to false, requiring approval for coaches
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// AthleteAccess model - manages coach access to athlete data
const AthleteAccess = sequelize.define('AthleteAccess', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  athleteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Athlete,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  accessLevel: {
    type: DataTypes.ENUM('read', 'admin'),
    defaultValue: 'read'
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  requestMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

// Define associations
Athlete.hasMany(AthleteAccess, { foreignKey: 'athleteId', as: 'accessGrants' });
User.hasMany(AthleteAccess, { foreignKey: 'userId', as: 'athleteAccess' });
AthleteAccess.belongsTo(Athlete, { foreignKey: 'athleteId' });
AthleteAccess.belongsTo(User, { foreignKey: 'userId' });

// Instance methods
User.prototype.validatePassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

Athlete.prototype.getApprovedCoaches = async function() {
  return await User.findAll({
    include: [{
      model: AthleteAccess,
      as: 'athleteAccess',
      where: { 
        athleteId: this.id, 
        isApproved: true 
      }
    }]
  });
};

User.prototype.getAccessibleAthletes = async function() {
  return await Athlete.findAll({
    include: [{
      model: AthleteAccess,
      as: 'accessGrants',
      where: { 
        userId: this.id, 
        isApproved: true 
      }
    }]
  });
};

class AuthService {
  constructor() {
    this.User = User;
    this.Athlete = Athlete;
    this.AthleteAccess = AthleteAccess;
    this.sequelize = sequelize;
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      const fs = require('fs');
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      await sequelize.authenticate();
      await sequelize.sync();
      
      console.log('✅ Authentication database initialized successfully');
      
      // Create default data if none exists
      const athleteCount = await Athlete.count();
      const userCount = await User.count();
      
      if (athleteCount === 0) {
        await this.createDefaultData();
      }
      
    } catch (error) {
      console.error('❌ Unable to initialize authentication database:', error);
      throw error;
    }
  }

  async createDefaultData() {
    try {
      // Create a sample athlete
      let athlete = await Athlete.findOne({ where: { email: 'athlete@example.com' } });
      if (!athlete) {
        athlete = await Athlete.create({
          name: 'Demo Athlete',
          email: 'athlete@example.com',
          subdomain: 'demo',
          planType: 'premium'
        });
      }

      // Create or find the athlete user account
      let athleteUser = await User.findOne({ where: { email: 'athlete@example.com' } });
      if (!athleteUser) {
        athleteUser = await User.create({
          username: 'athlete',
          email: 'athlete@example.com',
          password: 'athlete123',
          role: 'athlete',
          name: 'Demo Athlete',
          provider: 'local',
          isApproved: true
        });
      }

      // Ensure the athlete user has admin access to their own data
      let athleteAccess = await AthleteAccess.findOne({
        where: { userId: athleteUser.id, athleteId: athlete.id }
      });

      if (!athleteAccess) {
        await AthleteAccess.create({
          athleteId: athlete.id,
          userId: athleteUser.id,
          accessLevel: 'admin',
          isApproved: true,
          approvedAt: new Date()
        });
      }

      // Create or update admin user
      let adminUser = await User.findOne({ where: { email: 'admin@example.com' } });
      if (!adminUser) {
        adminUser = await User.create({
          username: 'admin',
          email: 'admin@example.com',
          password: 'admin123',
          role: 'admin',
          name: 'Platform Admin',
          provider: 'local',
          isApproved: true
        });
      } else if (!adminUser.isApproved) {
        // Update existing admin user to be approved
        await adminUser.update({ isApproved: true });
      }

      // Create demo coach user if it doesn't exist
      let coachUser = await User.findOne({ where: { email: 'coach@example.com' } });
      if (!coachUser) {
        coachUser = await User.create({
          username: 'coach',
          email: 'coach@example.com',
          password: 'coach123',
          role: 'coach',
          name: 'Demo Coach',
          provider: 'local',
          isApproved: true
        });

        // Give the coach access to the demo athlete's data
        await AthleteAccess.create({
          athleteId: athlete.id,
          userId: coachUser.id,
          accessLevel: 'read',
          isApproved: true,
          approvedAt: new Date(),
          requestMessage: 'Demo coach with approved access'
        });
      }

      console.log('✅ Default data ensured:');
      console.log('🏃‍♂️ Demo Athlete: athlete@example.com / athlete123');
      console.log('👥 Demo Coach: coach@example.com / coach123');
      console.log('🛡️ Platform Admin: admin@example.com / admin123');
      console.log('⚠️  Please change these credentials after first login!');

    } catch (error) {
      console.error('Error creating default data:', error);
    }
  }

  async findUserByEmail(email) {
    return await User.findOne({ where: { email } });
  }

  async findUserById(id) {
    return await User.findByPk(id);
  }

  async findUserByProvider(provider, providerId) {
    return await User.findOne({ 
      where: { 
        provider,
        providerId 
      } 
    });
  }

  async createUser(userData) {
    return await User.create(userData);
  }

  async updateUser(id, userData) {
    const user = await User.findByPk(id);
    if (user) {
      return await user.update(userData);
    }
    return null;
  }

  async approveUser(id) {
    return await this.updateUser(id, { isApproved: true });
  }

  async getAllUsers() {
    return await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });
  }

  async getPendingUsers() {
    return await User.findAll({
      where: { isApproved: false },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });
  }

  async deleteUser(id) {
    const user = await User.findByPk(id);
    if (user) {
      // Also delete any athlete access records
      await AthleteAccess.destroy({ where: { userId: id } });
      await user.destroy();
      return true;
    }
    return false;
  }

  // Athlete management methods
  async createAthlete(athleteData) {
    return await Athlete.create(athleteData);
  }

  async findAthleteById(id) {
    return await Athlete.findByPk(id);
  }

  async findAthleteByEmail(email) {
    return await Athlete.findOne({ where: { email } });
  }

  async findAthleteBySubdomain(subdomain) {
    return await Athlete.findOne({ where: { subdomain } });
  }

  async getAllAthletes() {
    return await Athlete.findAll({
      order: [['createdAt', 'DESC']]
    });
  }

  async updateAthlete(id, athleteData) {
    const athlete = await Athlete.findByPk(id);
    if (athlete) {
      return await athlete.update(athleteData);
    }
    return null;
  }

  // Access management methods
  async requestAthleteAccess(userId, athleteId, requestMessage = null) {
    return await AthleteAccess.create({
      userId,
      athleteId,
      requestMessage,
      isApproved: false
    });
  }

  async approveAthleteAccess(userId, athleteId) {
    const access = await AthleteAccess.findOne({
      where: { userId, athleteId }
    });
    if (access) {
      return await access.update({
        isApproved: true,
        approvedAt: new Date()
      });
    }
    return null;
  }

  async revokeAthleteAccess(userId, athleteId) {
    return await AthleteAccess.destroy({
      where: { userId, athleteId }
    });
  }

  async getUserAthleteAccess(userId, athleteId) {
    return await AthleteAccess.findOne({
      where: { userId, athleteId, isApproved: true }
    });
  }

  async getAthleteAccessRequests(athleteId) {
    const accessRecords = await AthleteAccess.findAll({
      where: { athleteId, isApproved: false },
      order: [['createdAt', 'DESC']]
    });

    // Manually fetch user data to avoid association issues
    const results = [];
    for (const access of accessRecords) {
      const user = await User.findByPk(access.userId, {
        attributes: ['id', 'name', 'email', 'avatar', 'provider']
      });
      if (user) {
        results.push({
          ...access.dataValues,
          User: user.dataValues
        });
      }
    }
    return results;
  }

  async getAthleteApprovedUsers(athleteId) {
    const accessRecords = await AthleteAccess.findAll({
      where: { athleteId, isApproved: true },
      order: [['approvedAt', 'DESC']]
    });

    // Manually fetch user data to avoid association issues
    const results = [];
    for (const access of accessRecords) {
      const user = await User.findByPk(access.userId, {
        attributes: ['id', 'name', 'email', 'avatar', 'provider']
      });
      if (user) {
        results.push({
          ...access.dataValues,
          User: user.dataValues
        });
      }
    }
    return results;
  }

  async getUserAccessibleAthletes(userId) {
    const accessRecords = await AthleteAccess.findAll({
      where: { userId, isApproved: true },
      order: [['approvedAt', 'DESC']]
    });

    // Manually fetch athlete data to avoid association issues
    const results = [];
    for (const access of accessRecords) {
      const athlete = await Athlete.findByPk(access.athleteId, {
        attributes: ['id', 'name', 'email', 'subdomain']
      });
      if (athlete) {
        results.push({
          ...access.dataValues,
          Athlete: athlete.dataValues
        });
      }
    }
    return results;
  }
}

module.exports = AuthService;