const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware');

const { Character, FC, House, Plot, Crop, Server, Channel, Alert, ServerUser } = require('../models');
router.get('/', ensureAuth, async (req, res) => {
  const userId = req.user.id;
const { ServerUser, FC, House, Character, Plot, Crop } = require('../models');

// Get all servers the user belongs to
const userServersList = await req.user.getServers();
const userServerIds = userServersList.map(s => s.id);

// Find all users who are members of any of these servers
const serverUsers = await ServerUser.findAll({
  where: { ServerId: userServerIds },
  attributes: ['UserId'],
  group: ['UserId']
});
const shareableUserIds = serverUsers.map(su => su.UserId);

// Get all FCs the user is a member of
const fcs = await req.user.getFCs();
const fcIds = fcs.map(fc => fc.id);

// Get all characters owned by the user
const characters = await Character.findAll({ where: { UserId: userId } });
const characterIds = characters.map(c => c.id);

// Get all houses, then filter them using the same logic as houses.js
let houses = await House.findAll({
  include: [
    { model: FC, as: 'OwningFC' },
    { model: Character, as: 'OwningCharacter' }
  ]
});
houses = houses.filter(house => {
  if (["Small","Medium","Large"].includes(house.type)) {
    if (house.fcId) {
      // FC house: only if user is member
      return fcIds.includes(house.fcId);
    } else if (house.characterId) {
      // Personal: only if user owns or house is shared with them
      return characterIds.includes(house.characterId) || (house.sharedWith && house.sharedWith.includes(req.user.id));
    }
  } else if (house.type === "FC Room") {
    // FC Room: only character owner
    return characterIds.includes(house.characterId);
  } else if (house.type === "Apartment") {
    // Apartment: only character owner
    return characterIds.includes(house.characterId);
  }
  // All other types: default to not shown
  return false;
});
const houseIds = houses.map(h => h.id);
const plots = await Plot.count({ where: { HouseId: houseIds } });
const plotIds = await Plot.findAll({ where: { HouseId: houseIds }, attributes: ['id'] }).then(ps => ps.map(p => p.id));
const crops = await Crop.count({ where: { PlotId: plotIds } });
  // Discord server/channel stats (only servers linked to user)
  const userServers = await req.user.getServers({ include: [{ model: Channel }] });
  const discordServers = userServers.length;
  const discordChannels = userServers.reduce((sum, srv) => sum + (srv.Channels ? srv.Channels.length : 0), 0);
  // Alert statistics
  const userAlerts = await Alert.count({ where: { UserId: userId } });

  // Find servers where user is admin
  const adminServers = await req.user.getServers({
    include: [{ model: ServerUser, where: { UserId: userId, isAdmin: true } }]
  });
  const adminServerIds = adminServers.map(s => s.id);
  // Find channels in those servers
  const adminChannels = await Channel.findAll({ where: { ServerId: adminServerIds } });
  const adminChannelIds = adminChannels.map(c => c.id);
  // Count alerts in those channels
  const adminServerAlerts = await Alert.count({ where: { ChannelId: adminChannelIds } });

  const stats = {
  characters: characters.length,
  fcs: fcs.length,
  houses: houses.length,
  plots,
  crops,
  discordServers,
  discordChannels,
  alerts: userAlerts,
  adminServerAlerts
};
res.render('dashboard', { user: req.user, stats, discordClientId: process.env.DISCORD_CLIENT_ID });
});

module.exports = router;
