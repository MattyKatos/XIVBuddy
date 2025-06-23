const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware');
const { Character, FC, User } = require('../models');
const { fetchLodestoneCharacter } = require('../utils/lodestone');

// List characters for the logged-in user
router.get('/', ensureAuth, async (req, res) => {
  const characters = await Character.findAll({ 
    where: { UserId: req.user.id },
    include: [{ model: FC }]
  });
  res.render('characters', { user: req.user, characters });
});

// Edit character form
router.get('/:id/edit', ensureAuth, async (req, res) => {
  const character = await Character.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!character) return res.status(404).send('Character not found');
  const fcs = await req.user.getFCs();
  res.render('character_edit', { user: req.user, character, fcs });
});

// Handle character edit
router.post('/:id/edit', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const character = await Character.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!character) return res.status(404).send('Character not found');
  const { name, lodestoneId, world, fcId } = req.body;
  character.name = name;
  character.lodestoneId = lodestoneId;
  character.world = world;
  character.FCId = fcId && fcId !== '' ? fcId : null;
  await character.save();
  res.redirect('/characters');
});

// Show character registration form
router.get('/new', ensureAuth, async (req, res) => {
  const fcs = await req.user.getFCs();
  res.render('character_new', { user: req.user, fcs });
});

// Handle character registration
router.post('/new', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  let { name, lodestoneId, world, fcId } = req.body;
  let fc = null;
  if (lodestoneId && (!name || !world)) {
    try {
      const data = await fetchLodestoneCharacter(lodestoneId);
      if (!name) name = data.name;
      if (!world) world = data.world;
      if (!fcId && data.fcName) {
        const userFCs = await req.user.getFCs();
        const match = userFCs.find(f => f.name === data.fcName || (f.tag && f.tag === data.fcTag));
        if (match) fcId = match.id;
      }
    } catch (e) {
      return res.status(400).send('Could not fetch Lodestone info: ' + e.message);
    }
  }
  if (fcId) {
    fc = await FC.findByPk(fcId);
    if (!fc) return res.status(400).send('Invalid FC');
  }
  await Character.create({
    name,
    lodestoneId,
    world,
    UserId: req.user.id,
    FCId: fc ? fc.id : null
  });
  res.redirect('/characters');
});

// Delete character
router.post('/:id/delete', ensureAuth, async (req, res) => {
  const character = await Character.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!character) return res.status(404).send('Character not found');
  await character.destroy();
  res.redirect('/characters');
});

module.exports = router;
