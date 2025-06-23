const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    dialect: 'mysql',
    logging: false
  }
);

// Discord Users
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  discordId: { type: DataTypes.STRING, unique: true, allowNull: false },
  username: { type: DataTypes.STRING },
  discriminator: { type: DataTypes.STRING },
  accessToken: { type: DataTypes.STRING },
  refreshToken: { type: DataTypes.STRING },
  tokenExpiresAt: { type: DataTypes.DATE },
  avatar: { type: DataTypes.STRING },
});

// Discord Servers (Guilds)
const Server = sequelize.define('Server', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  discordId: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING },
});

// ServerUser join table (for server membership and admin flag)
const ServerUser = sequelize.define('ServerUser', {
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
});
User.belongsToMany(Server, { through: ServerUser, onDelete: 'CASCADE' });
Server.belongsToMany(User, { through: ServerUser, onDelete: 'CASCADE' });
ServerUser.belongsTo(User, { onDelete: 'CASCADE' });
ServerUser.belongsTo(Server, { onDelete: 'CASCADE' });
User.hasMany(ServerUser, { onDelete: 'CASCADE' });
Server.hasMany(ServerUser, { onDelete: 'CASCADE' });

// Discord Channels
const Channel = sequelize.define('Channel', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  discordId: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING },
});
Channel.belongsTo(Server, { foreignKey: { allowNull: false }, onDelete: 'CASCADE' });
Server.hasMany(Channel, { onDelete: 'CASCADE' });


// FFXIV Characters
const Character = sequelize.define('Character', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  lodestoneId: { type: DataTypes.STRING },
  world: { type: DataTypes.STRING },
});

// Free Companies
const FC = sequelize.define('FC', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  tag: { type: DataTypes.STRING },
  lodestoneId: { type: DataTypes.STRING },
  UserId: { type: DataTypes.INTEGER, allowNull: false }
});

// FC membership join table
const FCUser = sequelize.define('FCUser', {
  role: { type: DataTypes.STRING, defaultValue: 'member' } // e.g. 'owner', 'member'
});
User.belongsToMany(FC, { through: FCUser, onDelete: 'CASCADE' });
FC.belongsToMany(User, { through: FCUser, onDelete: 'CASCADE' });
// Add explicit associations for eager loading
FCUser.belongsTo(User, { onDelete: 'CASCADE' });
User.hasMany(FCUser, { onDelete: 'CASCADE' });

// FC-server join table
const FCServer = sequelize.define('FCServer', {});
FC.belongsToMany(Server, { through: FCServer, onDelete: 'CASCADE' });
Server.belongsToMany(FC, { through: FCServer, onDelete: 'CASCADE' });

// Houses
const House = sequelize.define('House', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  district: { type: DataTypes.STRING },
  ward: { type: DataTypes.INTEGER },
  plot: { type: DataTypes.INTEGER },
  type: { type: DataTypes.STRING }, // e.g. "Small", "Medium", "Large"
  // fcId and characterId are added by associations, but we can validate them here
}, {
  validate: {
    mustHaveOwner() {
      if (this.type === 'FC Room') {
        if (!this.fcId || !this.characterId) {
          throw new Error('FC Room must have both fcId and characterId.');
        }
      } else {
        if ((!this.fcId && !this.characterId) || (this.fcId && this.characterId)) {
          throw new Error('House must have exactly one owner: either fcId or characterId.');
        }
      }
    }
  }
});

// Apartments
const Apartment = sequelize.define('Apartment', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  building: { type: DataTypes.STRING }, // e.g. "Mist Apt Bldg 1"
  room: { type: DataTypes.INTEGER },
});
Apartment.belongsTo(Character, { foreignKey: { name: 'characterId', allowNull: false }, as: 'Owner', onDelete: 'CASCADE' });
Character.hasOne(Apartment, { foreignKey: { name: 'characterId', allowNull: false }, as: 'Apartment', onDelete: 'CASCADE' });

// Private Chambers (FC rooms)
const PrivateChambers = sequelize.define('PrivateChambers', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  room: { type: DataTypes.INTEGER },
});
PrivateChambers.belongsTo(Character, { foreignKey: { name: 'characterId', allowNull: false }, as: 'Owner', onDelete: 'CASCADE' });
PrivateChambers.belongsTo(FC, { foreignKey: { name: 'fcId', allowNull: false }, as: 'FC', onDelete: 'CASCADE' });
Character.hasOne(PrivateChambers, { foreignKey: { name: 'characterId', allowNull: false }, as: 'PrivateChambers' });
FC.hasMany(PrivateChambers, { foreignKey: { name: 'fcId', allowNull: false }, as: 'PrivateChambers' });

// Plots (Farming plots)
const { v4: uuidv4 } = require('uuid');

// Plots (Farming plots)
const Plot = sequelize.define('Plot', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  uid: { type: DataTypes.STRING, unique: true, allowNull: false, defaultValue: uuidv4 },
  type: { type: DataTypes.ENUM('Deluxe Garden Patch', 'Oblong Garden Patch', 'Round Garden Patch', 'Flowerpot'), allowNull: false },
  beds: { type: DataTypes.INTEGER, allowNull: false },
  HouseId: { type: DataTypes.INTEGER, allowNull: false }
});

// House sharing: many-to-many between House and Character
const HouseCharacter = sequelize.define('HouseCharacter', {});

// Crops (plantings in beds)
const Crop = sequelize.define('Crop', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cropName: { type: DataTypes.STRING, allowNull: false },
  bedNumber: { type: DataTypes.INTEGER, allowNull: false },
  plantedAt: { type: DataTypes.DATE, allowNull: false },
  harvestedAt: { type: DataTypes.DATE, allowNull: true },
  neverHarvest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  fullyGrown: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  lastTendedAt: { type: DataTypes.DATE, allowNull: true },
  PlotId: { type: DataTypes.INTEGER, allowNull: false }
});

// Associations
User.hasMany(Character, { onDelete: 'CASCADE' });
Character.belongsTo(User, { onDelete: 'CASCADE' });
User.hasMany(FC, { onDelete: 'CASCADE' });
FC.belongsTo(User, { onDelete: 'CASCADE' });
FC.hasMany(Character, { onDelete: 'CASCADE' });
Character.belongsTo(FC, { foreignKey: { allowNull: true }, onDelete: 'CASCADE' });
FC.hasOne(House, { foreignKey: { name: 'fcId', allowNull: true }, as: 'FcHouse', onDelete: 'CASCADE' });
House.belongsTo(FC, { foreignKey: { name: 'fcId', allowNull: true }, as: 'OwningFC', onDelete: 'CASCADE' });
Character.hasOne(House, { foreignKey: { name: 'characterId', allowNull: true }, as: 'CharacterHouse', onDelete: 'CASCADE' });
House.belongsTo(Character, { foreignKey: { name: 'characterId', allowNull: true }, as: 'OwningCharacter', onDelete: 'CASCADE' });
Character.belongsTo(House, { foreignKey: { name: 'houseId', allowNull: true }, as: 'OwnedHouse', onDelete: 'CASCADE' });
House.belongsToMany(Character, { through: HouseCharacter, as: 'SharedCharacters', onDelete: 'CASCADE' });
Character.belongsToMany(House, { through: HouseCharacter, as: 'SharedHouses', onDelete: 'CASCADE' });
House.hasMany(Plot, { onDelete: 'CASCADE' });
Plot.belongsTo(House, { onDelete: 'CASCADE' });
Plot.hasMany(Crop, { onDelete: 'CASCADE' });
Crop.belongsTo(Plot, { onDelete: 'CASCADE' });
Server.hasMany(Channel);

// Alerts: user can link a plot to a channel for notifications
const Alert = sequelize.define('Alert', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  // Foreign keys below
});

// AlertQueue: pending alerts to be processed
const AlertQueue = sequelize.define('AlertQueue', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  serverId: { type: DataTypes.STRING, allowNull: false },
  channelId: { type: DataTypes.STRING, allowNull: false },
  plotId: { type: DataTypes.INTEGER, allowNull: false },
  plotName: { type: DataTypes.STRING, allowNull: false },
  plantInfo: { type: DataTypes.JSON, allowNull: false }, // all info needed to mark plants as tended
  sent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW }
});
AlertQueue.belongsTo(Plot, { foreignKey: 'plotId', onDelete: 'CASCADE' });
Plot.hasMany(AlertQueue, { foreignKey: 'plotId', onDelete: 'CASCADE' });
User.hasMany(Alert, { onDelete: 'CASCADE' });
Alert.belongsTo(User, { onDelete: 'CASCADE' });
Plot.hasMany(Alert, { onDelete: 'CASCADE' });
Alert.belongsTo(Plot, { onDelete: 'CASCADE' });
Channel.hasMany(Alert, { onDelete: 'CASCADE' });
Alert.belongsTo(Channel, { onDelete: 'CASCADE' });

// Export all models and sequelize instance
// --- CASCADING DELETE HOOKS ---

// 1. If a character is deleted, delete houses owned by the character
Character.addHook('beforeDestroy', async (character, options) => {
  const houses = await House.findAll({ where: { characterId: character.id } });
  for (const house of houses) {
    await house.destroy({ transaction: options.transaction });
  }
});

// 2. If an FC is deleted, delete houses owned by the FC
FC.addHook('beforeDestroy', async (fc, options) => {
  const houses = await House.findAll({ where: { fcId: fc.id } });
  for (const house of houses) {
    await house.destroy({ transaction: options.transaction });
  }
});

// 3. If a house is deleted and it is an FC house, delete FC rooms (PrivateChambers)
House.addHook('beforeDestroy', async (house, options) => {
  // If FC house, delete FC rooms (PrivateChambers)
  if (house.fcId) {
    const fcRooms = await PrivateChambers.findAll({ where: { fcId: house.fcId } });
    for (const room of fcRooms) {
      await room.destroy({ transaction: options.transaction });
    }
  }
});


module.exports = {
  sequelize,
  User,
  Server,
  ServerUser,
  Channel,
  Character,
  FC,
  FCUser,
  FCServer,
  House,
  Plot,
  Crop,
  HouseCharacter,
  Alert,
  AlertQueue
};
