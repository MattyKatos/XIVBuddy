const express = require('express');
const router = express.Router();
const { Server, Channel, ServerUser } = require('../models');
const { ensureAuth } = require('../middleware');

// GET /servers - list all servers and their channels for the logged-in user
router.get('/', ensureAuth, async (req, res) => {
  try {
    const servers = await req.user.getServers({
      include: [
        { model: Channel },
        { model: ServerUser }, // Load all ServerUsers for member count
      ],
      order: [['name', 'ASC']]
    });
    // Add memberCount to each server
    servers.forEach(server => {
      server.memberCount = server.ServerUsers ? server.ServerUsers.length : 0;
      // Find the ServerUser entry for the current user
      const myMembership = server.ServerUsers.find(su => su.UserId === req.user.id);
      server.isCurrentUserAdmin = !!(myMembership && myMembership.isAdmin);
    });
    res.render('servers', { servers, user: req.user });
  } catch (err) {
    console.error('Error fetching servers:', err);
    res.status(500).send('Failed to load servers');
  }
});

// POST /channels/:id/delete - remove a channel if user is admin for the server
router.post('/channels/:id/delete', ensureAuth, async (req, res) => {
  const { Channel, Server, ServerUser } = require('../models');
  const channel = await Channel.findByPk(req.params.id, { include: [Server] });
  if (!channel || !channel.Server) {
    return res.status(404).send('Channel not found');
  }
  // Check if user is admin for the server
  const admin = await ServerUser.findOne({
    where: {
      UserId: req.user.id,
      ServerId: channel.Server.id,
      isAdmin: true
    }
  });
  if (!admin) {
    return res.status(403).send('You must be a Discord admin for this server to remove channels.');
  }
  await channel.destroy();
  res.redirect('/servers');
});

module.exports = router;
