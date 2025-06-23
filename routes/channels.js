const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware');
const { Channel, Server, ServerUser } = require('../models');

// POST /channels/:id/delete - remove a channel if user is admin for the server
router.post('/:id/delete', ensureAuth, async (req, res) => {
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
