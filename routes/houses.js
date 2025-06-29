const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ensureAuth } = require('../middleware');
const { FC, FCUser, House, Character, Plot } = require('../models');

// List houses for the logged-in user
router.get('/', ensureAuth, async (req, res) => {
  const { FCUser } = require('../models');
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await Character.findAll({ where: { UserId: req.user.id } });
  const characterIds = characters.map(c => c.id);

  // Only show houses the user should see
  let houses = await House.findAll({
    include: [
      { model: FC, as: 'OwningFC' },
      { model: Character, as: 'OwningCharacter' },
      { model: Character, as: 'SharedCharacters', through: { attributes: [] } }
    ]
  });
  houses = houses.filter(house => {
    if (["Small","Medium","Large"].includes(house.type)) {
      // Personal or FC house
      if (house.fcId) {
        // FC house: only if user is member
        return fcIds.includes(house.fcId);
      } else if (house.characterId) {
        // Personal: only if user owns or house is shared with their characters
        const sharedIds = (house.SharedCharacters || []).map(c => c.id);
        return characterIds.includes(house.characterId) || characterIds.some(id => sharedIds.includes(id));
      }
    } else if (house.type === "FC Room") {
      // FC Room: only character owner or shared
      const sharedIds = (house.SharedCharacters || []).map(c => c.id);
      return characterIds.includes(house.characterId) || characterIds.some(id => sharedIds.includes(id));
    } else if (house.type === "Apartment") {
      // Apartment: only character owner or shared
      const sharedIds = (house.SharedCharacters || []).map(c => c.id);
      return characterIds.includes(house.characterId) || characterIds.some(id => sharedIds.includes(id));
    }
    // All other types: default to not shown
    return false;
  });
  // Get FC roles for this user
  const fcRoles = {};
  for (const fc of fcs) {
    const fcu = await FCUser.findOne({ where: { FCId: fc.id, UserId: req.user.id } });
    fcRoles[fc.id] = fcu ? fcu.role : null;
  }
  res.render('houses', { user: { ...req.user.toJSON(), fcRoles }, houses });
});

// Show house registration form
router.get('/new', ensureAuth, async (req, res) => {
  const allFCs = await req.user.getFCs();
  // For FC house registration: only FCs that do NOT already own a house
  const fcs = [];
  for (const fc of allFCs) {
    if (!await fc.getFcHouse()) fcs.push(fc);
  }
  // For FC room registration: only FCs that DO own a house
  const fcRoomFCs = [];
  for (const fc of allFCs) {
    if (await fc.getFcHouse()) fcRoomFCs.push(fc);
  }
  const allCharacters = await Character.findAll({ where: { UserId: req.user.id } });

  // For personal house: exclude characters with Small/Medium/Large house
  const houseCharacters = [];
  for (const c of allCharacters) {
    const owned = await House.findOne({ where: { characterId: c.id, type: { [Op.in]: ['Small', 'Medium', 'Large'] } } });
    if (!owned) houseCharacters.push(c);
  }
  // For apartment: exclude characters with Apartment
  const apartmentCharacters = [];
  for (const c of allCharacters) {
    const owned = await House.findOne({ where: { characterId: c.id, type: 'Apartment' } });
    if (!owned) apartmentCharacters.push(c);
  }
  // For FC room: exclude characters who already have a room in any FC (type: 'FC Room')
  const fcRoomCharacters = [];
  for (const c of allCharacters) {
    const owned = await House.findOne({ where: { characterId: c.id, type: 'FC Room' } });
    if (!owned) fcRoomCharacters.push(c);
  }
  res.render('house_new', { user: req.user, fcs, fcRoomFCs, houseCharacters, apartmentCharacters, fcRoomCharacters });
});

// Handle house/apartment/FC room registration
router.post('/new', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const { housingType } = req.body;
  const { district, ward, plot, houseSize, fcId, characterId, building, room } = req.body;
  const { House, Apartment, PrivateChambers, Character, FC } = require('../models');

  try {
    if (housingType === 'house') {
      // Personal house: max 1 per character (type: Small, Medium, Large)
      // Apartment is a separate type
      let houseDistrict = Array.isArray(district) ? district.find(d => d) : district;
      let houseWard = Array.isArray(ward) ? ward.find(w => w) : ward;
      let housePlot = Array.isArray(plot) ? plot.find(p => p) : plot;
      let houseSizeVal = Array.isArray(houseSize) ? houseSize.find(s => s) : houseSize;
      let houseCharacterId = Array.isArray(characterId) ? characterId.find(c => c) : characterId;
      if (!houseDistrict || !houseWard || !housePlot || !houseSizeVal || !houseCharacterId) {
        return res.status(400).send('All fields are required for a personal house.');
      }
      // Only block if character already has a Small/Medium/Large house, but NOT if they have an apartment
      const owned = await House.findOne({ where: { characterId: houseCharacterId, type: { [Op.in]: ['Small', 'Medium', 'Large'] } } });
      if (owned) {
        return res.status(400).send('This character already owns a house.');
      }
      await House.create({
        district: houseDistrict,
        ward: houseWard,
        plot: housePlot,
        type: houseSizeVal,
        characterId: houseCharacterId
      });
      return res.redirect('/houses');
    } else if (housingType === 'apartment') {
      // Apartment: max 1 per character, type must be 'Apartment'
      let apartmentDistrict = Array.isArray(district) ? district.find(d => d) : district;
      let apartmentWard = Array.isArray(ward) ? ward.find(w => w) : ward;
      let apartmentPlot = Array.isArray(plot) ? plot.find(p => p) : plot;
      let apartmentCharacterId = Array.isArray(characterId) ? characterId.find(c => c) : characterId;
      if (!apartmentDistrict || !apartmentWard || !apartmentPlot || !apartmentCharacterId) {
        return res.status(400).send('All fields are required for an apartment.');
      }
      const owned = await House.findOne({ where: { characterId: apartmentCharacterId, type: 'Apartment' } });
      if (owned) {
        return res.status(400).send('This character already owns an apartment.');
      }
      await House.create({
        district: apartmentDistrict,
        ward: apartmentWard,
        plot: apartmentPlot,
        type: 'Apartment',
        characterId: apartmentCharacterId
      });
      return res.redirect('/houses');
    } else if (housingType === 'fc_house') {
      // FC house: max 1 per FC
      // Handle duplicate fields by picking the first non-empty value
      let fcHouseDistrict = Array.isArray(district) ? district.find(d => d) : district;
      let fcHouseWard = Array.isArray(ward) ? ward.find(w => w) : ward;
      let fcHousePlot = Array.isArray(plot) ? plot.find(p => p) : plot;
      let fcHouseSize = Array.isArray(houseSize) ? houseSize.find(s => s) : houseSize;
      let fcHouseId = Array.isArray(fcId) ? fcId.find(f => f) : fcId;
      if (!fcHouseDistrict || !fcHouseWard || !fcHousePlot || !fcHouseSize || !fcHouseId) {
        return res.status(400).send('All fields are required for an FC house.');
      }
      const owned = await House.findOne({ where: { fcId: fcHouseId } });
      if (owned) {
        return res.status(400).send('This FC already owns a house.');
      }
      await House.create({
        district: fcHouseDistrict,
        ward: fcHouseWard,
        plot: fcHousePlot,
        type: fcHouseSize,
        fcId: fcHouseId
      });
      return res.redirect('/houses');
    } else if (housingType === 'apartment') {
      // Apartment: max 1 per character, store in House with type 'Apartment'
      // Handle duplicate fields by picking the first non-empty value
      let apartmentDistrict = Array.isArray(district) ? district.find(d => d) : district;
      let apartmentWard = Array.isArray(ward) ? ward.find(w => w) : ward;
      let apartmentPlot = Array.isArray(plot) ? plot.find(p => p) : plot;
      let apartmentCharacterId = Array.isArray(characterId) ? characterId.find(c => c) : characterId;
      if (!apartmentDistrict || !apartmentWard || !apartmentPlot || !apartmentCharacterId) {
        return res.status(400).send('All fields are required for an apartment.');
      }
      const owned = await House.findOne({ where: { characterId: apartmentCharacterId, type: 'Apartment' } });
      if (owned) {
        return res.status(400).send('This character already owns an apartment.');
      }
      await House.create({
        district: apartmentDistrict,
        ward: apartmentWard,
        plot: apartmentPlot,
        type: 'Apartment',
        characterId: apartmentCharacterId
      });
      return res.redirect('/houses');
    } else if (housingType === 'fc_room') {
      // FC room: max 1 per character per FC, must be in FC and FC must own a house
      if (!room || !characterId || !fcId) {
        return res.status(400).send('All fields are required for an FC room.');
      }
      // Check character is in FC
      const fcUser = await FC.findOne({
        where: { id: fcId },
        include: [{ model: Character, where: { id: characterId } }]
      });
      if (!fcUser) {
        return res.status(400).send('Character must be a member of the selected FC.');
      }
      // Check FC owns a house
      const fcHouse = await House.findOne({ where: { fcId, type: { [Op.in]: ['Small', 'Medium', 'Large'] } } });
      if (!fcHouse) {
        return res.status(400).send('Selected FC does not own a house.');
      }
      // Enforce 1 FC room per character per FC
      const owned = await House.findOne({ where: { characterId, fcId, type: 'FC Room' } });
      if (owned) {
        return res.status(400).send('This character already owns a private chamber in this FC.');
      }
      await House.create({
        type: 'FC Room',
        plot: room, // use plot field for room number
        characterId,
        fcId
      });
      return res.redirect('/houses');
    } else {
      return res.status(400).send('Invalid housing type.');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error registering housing.');
  }
});

// Remove house
router.post('/:id/delete', ensureAuth, async (req, res) => {
  const { House, Character, FC } = require('../models');
  const house = await House.findByPk(req.params.id);
  if (!house) return res.status(404).send('House not found');
  let canRemove = false;
  if (house.characterId) {
    const owner = await Character.findByPk(house.characterId);
    canRemove = owner && owner.UserId === req.user.id;
  }
  if (house.fcId && !canRemove) {
    const fc = await FC.findByPk(house.fcId);
    canRemove = fc && fc.UserId === req.user.id;
  }
  if (!canRemove) return res.status(403).send('Forbidden');
  await house.destroy();
  res.redirect('/houses');
});

// Show house share page
router.get('/:id/share', ensureAuth, async (req, res) => {
  const house = await House.findByPk(req.params.id, {
    include: [
      { model: Character, as: 'SharedCharacters' }
    ]
  });
  // Get all servers the user belongs to
const userServers = await req.user.getServers();
const userServerIds = userServers.map(s => s.id);

// Find all users who are members of any of these servers
const { ServerUser, User } = require('../models');
const serverUsers = await ServerUser.findAll({
  where: { ServerId: userServerIds },
  attributes: ['UserId'],
  group: ['UserId']
});
const shareableUserIds = serverUsers.map(su => su.UserId);

// Fetch all characters owned by those users
const userCharacters = await Character.findAll({
  where: { UserId: shareableUserIds },
  order: [['name', 'ASC']]
});

let canManage = false;
if (house.characterId) {
  const owner = await Character.findByPk(house.characterId);
  canManage = owner && owner.UserId === req.user.id;
}
if (house.fcId && !canManage) {
  const fc = await FC.findByPk(house.fcId);
  canManage = fc && fc.UserId === req.user.id;
}
if (!canManage) return res.status(403).send('Forbidden');
res.render('house_share', { user: req.user, house, shared: house.SharedCharacters, userCharacters });
});

// Add shared character
router.post('/:id/share/add', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const house = await House.findByPk(req.params.id);
  const character = await Character.findByPk(req.body.characterId);
  if (!house || !character) return res.status(404).send('Not found');
  let canManage = false;
  if (house.characterId) {
    const owner = await Character.findByPk(house.characterId);
    canManage = owner && owner.UserId === req.user.id;
  }
  if (house.fcId && !canManage) {
    const fc = await FC.findByPk(house.fcId);
    canManage = fc && fc.UserId === req.user.id;
  }
  if (!canManage) return res.status(403).send('Forbidden');
  await house.addSharedCharacter(character);
  res.redirect(`/houses/${house.id}/share`);
});

// Remove shared character
router.post('/:id/share/remove', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const house = await House.findByPk(req.params.id);
  const character = await Character.findByPk(req.body.characterId);
  if (!house || !character) return res.status(404).send('Not found');
  let canManage = false;
  if (house.characterId) {
    const owner = await Character.findByPk(house.characterId);
    canManage = owner && owner.UserId === req.user.id;
  }
  if (house.fcId && !canManage) {
    const fc = await FC.findByPk(house.fcId);
    canManage = fc && fc.UserId === req.user.id;
  }
  if (!canManage) return res.status(403).send('Forbidden');
  await house.removeSharedCharacter(character);
  res.redirect(`/houses/${house.id}/share`);
});

// Show single house detail page
router.get('/:id', ensureAuth, async (req, res) => {
  const house = await House.findByPk(req.params.id, {
    include: [
      { model: FC, as: 'OwningFC' },
      { model: Character, as: 'OwningCharacter' }
    ]
  });
  if (!house) return res.status(404).send('House not found');
  // Only allow access if user owns the FC or Character
  let canView = false;
  if (house.characterId) {
    const owner = await Character.findByPk(house.characterId);
    canView = owner && owner.UserId === req.user.id;
  }
  if (house.fcId && !canView) {
    const fc = await FC.findByPk(house.fcId);
    canView = fc && fc.UserId === req.user.id;
  }
  if (!canView) return res.status(403).send('Forbidden');
  // Get plots for this house
  const plots = await Plot.findAll({ where: { HouseId: house.id } });
  res.render('house_show', { user: req.user, house, plots });
});

module.exports = router;
