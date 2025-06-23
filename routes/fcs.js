const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware');
const { FC, FCUser, User, Server } = require('../models');

// Show FC registration form
router.get('/new', ensureAuth, (req, res) => {
  res.render('fc_new', { user: req.user });
});

// Handle FC registration
const { fetchLodestoneFC } = require('../utils/lodestone');

router.post('/new', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const { lodestoneId } = req.body;
  if (!lodestoneId) {
    return res.status(400).send('Lodestone ID is required');
  }
  let fcName = null;
  try {
    const data = await fetchLodestoneFC(lodestoneId);
    fcName = data.name;
    if (!fcName) throw new Error('No name returned from Lodestone');
  } catch (e) {
    return res.status(400).send('Could not fetch FC info from Lodestone: ' + e.message);
  }
  // Create the Free Company with fetched name
  const fc = await FC.create({ name: fcName, lodestoneId, UserId: req.user.id });
  // Associate the current user as owner
  await FCUser.create({ FCId: fc.id, UserId: req.user.id, role: 'owner' });
  res.redirect('/fcs');
});

// List Free Companies for the logged-in user
router.get('/', ensureAuth, async (req, res) => {
  // FCs user is a member of
  const memberFCs = await req.user.getFCs();
  const memberFCIds = memberFCs.map(fc => fc.id);
  // FCs shared with user's servers
  const userServers = await req.user.getServers();
  const userServerIds = userServers.map(s => s.id);
  // Find all FCs shared with any of user's servers
  const sharedFCs = await FC.findAll({
    include: [{ model: require('../models').Server, where: { id: userServerIds }, required: true }]
  });
  // Merge and dedupe
  const allFCs = [...memberFCs, ...sharedFCs.filter(fc => !memberFCIds.includes(fc.id))];
  // Get roles for FCs user is a member of
  const fcRoles = {};
  for (const fc of memberFCs) {
    const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
    fcRoles[fc.id] = fcu ? fcu.role : null;
  }
  res.render('fcs', { user: req.user, fcs: allFCs, fcRoles });
});

// FC management UI
router.get('/:id/manage', ensureAuth, async (req, res) => {
  const fc = await FC.findByPk(req.params.id);
  if (!fc) return res.status(404).send('FC not found');
  const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
  const canManage = fcu && (fcu.role === 'owner' || fcu.role === 'admin');
  if (!canManage) return res.status(403).send('Not authorized');
  const fcUsers = await FCUser.findAll({ where: { FCId: fc.id }, include: [User] });
  const fcServers = await fc.getServers();
  const userServers = await req.user.getServers();
  res.render('fc_manage', { user: req.user, fc, fcUsers, canManage, fcServers, userServers });
});

// Add server to FC (by serverId from dropdown)
router.post('/:id/add_server', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const fc = await FC.findByPk(req.params.id);
  if (!fc) return res.status(404).send('FC not found');
  const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
  if (!fcu || (fcu.role !== 'owner' && fcu.role !== 'admin')) return res.status(403).send('Not authorized');
  const { serverId } = req.body;
  const server = await Server.findByPk(serverId);
  if (!server) return res.status(404).send('Server not found');
  await fc.addServer(server);
  res.redirect(`/fcs/${fc.id}/manage`);
});

// Remove server from FC
router.post('/:id/remove_server', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const fc = await FC.findByPk(req.params.id);
  if (!fc) return res.status(404).send('FC not found');
  const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
  if (!fcu || (fcu.role !== 'owner' && fcu.role !== 'admin')) return res.status(403).send('Not authorized');
  const { discordId } = req.body;
  const server = await Server.findOne({ where: { discordId } });
  if (!server) return res.status(404).send('Server not found');
  await fc.removeServer(server);
  res.redirect(`/fcs/${fc.id}/manage`);
});

// Join FC
router.post('/:id/join', ensureAuth, async (req, res) => {
  const fc = await FC.findByPk(req.params.id, {
    include: [{ model: require('../models').Server }]
  });
  if (!fc) return res.status(404).send('FC not found');
  // Check if already a member
  const existing = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
  if (existing) return res.redirect('/fcs');
  // Check if user can see this FC (shared with a server they're in)
  const userServers = await req.user.getServers();
  const userServerIds = userServers.map(s => s.id);
  const shared = fc.Servers && fc.Servers.some(s => userServerIds.includes(s.id));
  if (!shared) return res.status(403).send('You cannot join this FC.');
  // Add user as member
  await FCUser.create({ FCId: fc.id, UserId: req.user.id, role: 'member' });
  res.redirect('/fcs');
});

module.exports = router;

