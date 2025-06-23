const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware');
const { Plot, House, Channel, Server, ServerUser } = require('../models');
const { Op } = require('sequelize');

// GET /alerts - show user's alerts list
router.get('/', ensureAuth, async (req, res) => {
  const { Alert, Plot, Channel, House, Server } = require('../models');
  // Fetch all alerts for this user, include plot, channel, house, server
  const alerts = await Alert.findAll({
    where: { UserId: req.user.id },
    include: [
      { model: Plot, include: [House] },
      { model: Channel, include: [Server] }
    ]
  });
  res.render('alerts', { user: req.user, alerts });
});

// GET /alerts/new - show form to add alert
router.get('/new', ensureAuth, async (req, res) => {
  const { Plot, House, Channel, Server, ServerUser } = require('../models');
  // Get user's plots (owned via FC or Character)
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await req.user.getCharacters();
  const characterIds = characters.map(c => c.id);
  const houses = await House.findAll({
    where: {
      [require('sequelize').Op.or]: [
        { fcId: fcIds.length > 0 ? fcIds : null },
        { characterId: characterIds.length > 0 ? characterIds : null }
      ]
    }
  });
  const houseIds = houses.map(h => h.id);
  const plots = await Plot.findAll({ where: { HouseId: houseIds }, include: [House] });

  // Find Discord channels in servers where user is admin
  const adminServers = await req.user.getServers({
    include: [
      { model: ServerUser, where: { UserId: req.user.id, isAdmin: true } },
      { model: Channel }
    ]
  });
  let adminChannels = [];
  adminServers.forEach(server => {
    if (server.Channels) {
      server.Channels.forEach(chan => adminChannels.push({ ...chan.toJSON(), Server: server }));
    }
  });
  res.render('alert_new', { user: req.user, plots, houses, adminChannels });
});

// POST /alerts/new - create alert
router.post('/new', ensureAuth, require('express').urlencoded({ extended: true }), async (req, res) => {
  const { Alert, Channel, Server, ServerUser } = require('../models');
  const { plotId, houseId, channelId } = req.body;
  if ((!plotId && !houseId) || !channelId) {
    return res.status(400).send('Plot or house and channel required');
  }
  // Backend enforcement: Only Discord admins can register alerts
  // Find the channel and its server
  const channel = await Channel.findByPk(channelId, { include: [Server] });
  if (!channel || !channel.Server) {
    return res.status(400).send('Invalid channel');
  }
  // Check if user is admin in that server
  const admin = await ServerUser.findOne({
    where: {
      UserId: req.user.id,
      ServerId: channel.Server.id,
      isAdmin: true
    }
  });
  if (!admin) {
    return res.status(403).send('You must be a Discord admin in the server for the selected channel.');
  }

  if (houseId) {
    const { Plot } = require('../models');
    const plots = await Plot.findAll({ where: { HouseId: houseId } });
    for (const plot of plots) {
      await Alert.create({ UserId: req.user.id, PlotId: plot.id, ChannelId: channelId });
    }
  } else {
    await Alert.create({ UserId: req.user.id, PlotId: plotId, ChannelId: channelId });
  }
  res.redirect('/alerts');
});

// DELETE /alerts/:id/delete - delete alert
router.get('/:id/delete', ensureAuth, async (req, res) => {
  const { Alert } = require('../models');
  const alert = await Alert.findByPk(req.params.id);
  if (!alert || alert.UserId !== req.user.id) {
    return res.status(404).send('Alert not found or not yours.');
  }
  await alert.destroy();
  res.redirect('/alerts');
});

module.exports = router;
