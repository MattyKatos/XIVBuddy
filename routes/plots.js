const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ensureAuth } = require('../middleware');
const { Plot, House, Character } = require('../models');

// List all plots for user's houses
router.get('/', ensureAuth, async (req, res) => {
  const { FCUser } = require('../models');
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await Character.findAll({ where: { UserId: req.user.id } });
  const characterIds = characters.map(c => c.id);
  // Only show houses the user should see
  let houses = await House.findAll({
    include: [
      { model: require('../models').FC, as: 'OwningFC' },
      { model: require('../models').Character, as: 'OwningCharacter' }
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
    return false;
  });
  const houseIds = houses.map(h => h.id);
  const plots = await Plot.findAll({ where: { HouseId: houseIds } });
  // Get FC roles for this user
  const fcRoles = {};
  for (const fc of fcs) {
    const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
    fcRoles[fc.id] = fcu ? fcu.role : null;
  }
  res.render('plots', { user: { ...req.user.toJSON(), fcRoles }, plots, houses });
});

// Show plot registration form
router.get('/new', ensureAuth, async (req, res) => {
  const houseId = req.query.houseId;
  if (houseId) {
    // Fetch the selected house with associations
    const house = await House.findByPk(houseId, {
      include: [
        { model: require('../models').FC, as: 'OwningFC' },
        { model: require('../models').Character, as: 'OwningCharacter' }
      ]
    });
    if (!house) return res.status(404).send('House not found');
    return res.render('plot_new', { user: req.user, house, houses: [] });
  }
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await Character.findAll({ where: { UserId: req.user.id } });
  const characterIds = characters.map(c => c.id);
  const houses = await House.findAll({
    where: {
      [Op.or]: [
        { fcId: fcIds.length > 0 ? fcIds : null },
        { characterId: characterIds.length > 0 ? characterIds : null }
      ]
    }
  });
  res.render('plot_new', { user: req.user, houses });
});

// Handle plot registration
router.post('/new', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const { houseId, type, beds } = req.body;
  if (!houseId || !type) {
    return res.status(400).send('House and Type are required.');
  }
  let bedsNum = parseInt(beds, 10);
  if (isNaN(bedsNum)) {
    if (type === 'Deluxe Garden Patch') bedsNum = 8;
    else if (type === 'Oblong Garden Patch') bedsNum = 6;
    else if (type === 'Round Garden Patch') bedsNum = 4;
    else if (type === 'Flowerpot') bedsNum = 1;
    else bedsNum = 0;
  }
  const plot = await Plot.create({ HouseId: houseId, type, beds: bedsNum });
  res.redirect('/plots');
});

// Delete a plot
router.get('/:id/delete', ensureAuth, async (req, res) => {
  const { FCUser } = require('../models');
  const plot = await Plot.findByPk(req.params.id);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');
  // FC house: only FC owner/admin can delete
  if (house.fcId) {
    const fcu = await FCUser.findOne({ where: { FCId: house.fcId, UserId: req.user.id } });
    if (!fcu || (fcu.role !== 'owner' && fcu.role !== 'admin')) {
      return res.status(403).send('Only FC owner/admins can edit plots for this FC house.');
    }
  } else if (house.characterId) {
    // Personal house: only character owner
    const characters = await Character.findAll({ where: { UserId: req.user.id } });
    const characterIds = characters.map(c => c.id);
    if (!characterIds.includes(house.characterId)) {
      return res.status(403).send('Not authorized');
    }
  } else {
    return res.status(403).send('Not authorized');
  }
  await plot.destroy();
  res.redirect('/plots');
});

module.exports = router;

