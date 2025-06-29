const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ensureAuth } = require('../middleware');
const { Crop, Plot, House, Character, FC, AlertQueue } = require('../models');

// Helper for house access logic
async function userCanAccessHouse(req, house) {
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await Character.findAll({ where: { UserId: req.user.id } });
  const characterIds = characters.map(c => c.id);
  const sharedCharacters = await house.getSharedCharacters();
  const sharedIds = (sharedCharacters || []).map(c => c.id);
  return (
    (house.fcId && fcIds.includes(house.fcId)) ||
    (house.characterId && characterIds.includes(house.characterId)) ||
    characterIds.some(id => sharedIds.includes(id))
  );
}

// List all crops
router.get('/', ensureAuth, async (req, res) => {
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
    return false;
  });
  const houseIds = houses.map(h => h.id);
  const plots = await Plot.findAll({ where: { HouseId: houseIds } });
  const plotIds = plots.map(p => p.id);
  const crops = await Crop.findAll({ where: { PlotId: plotIds } });
  res.render('crops', { user: req.user, crops, plots, houses });
});

// Show new crop form
router.get('/new', ensureAuth, async (req, res) => {
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
  const plots = await Plot.findAll({ where: { HouseId: houses.map(h => h.id) } });
  res.render('crop_new', { user: req.user, plots, houses });
});

// Handle new crop creation
router.post('/new', ensureAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const { plotId, bedNumber, cropName, neverHarvest, fullyGrown } = req.body;
  if (!plotId || !bedNumber || !cropName) {
    return res.status(400).send('Plot, Bed Number, and Crop Name are required.');
  }
  const plot = await Plot.findByPk(plotId);
  if (!plot) return res.status(404).send('Plot not found');
  // Ownership check omitted for brevity
  const crop = await Crop.create({
    PlotId: plotId,
    bedNumber,
    cropName,
    plantedAt: new Date(),
    harvestedAt: !!neverHarvest ? null : null,
    neverHarvest: !!neverHarvest,
    fullyGrown: !!fullyGrown
  });
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ crop });
  } else {
    res.redirect('/crops');
  }
});

// Handle crop harvest (delete crop)
router.post('/:id/harvest', ensureAuth, async (req, res) => {
  const crop = await Crop.findByPk(req.params.id);
  if (!crop) return res.status(404).send('Crop not found');
  // Ownership check: user must own the plot/house
  const plot = await Plot.findByPk(crop.PlotId);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');

    if (!(await userCanAccessHouse(req, house))) {
      return res.status(403).send('Not authorized');
    }
  await crop.destroy();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ success: true });
  } else {
    res.redirect('/crops');
  }
});

// Tend all crops (GET: confirm, POST: perform)
router.get('/tend-all', ensureAuth, async (req, res) => {
  // Option 1: Render a simple confirmation page
  res.send(`<html><body><h2>Tend All Crops</h2><form method="POST" action="/crops/tend-all"><button type="submit">Confirm Tend All</button></form><a href='/crops'>Cancel</a></body></html>`);
});

router.post('/tend-all', ensureAuth, async (req, res) => {
  const fcs = await req.user.getFCs();
  const fcIds = fcs.map(fc => fc.id);
  const characters = await Character.findAll({ where: { UserId: req.user.id } });
  const characterIds = characters.map(c => c.id);
  // Fetch all houses with sharing info
  const houses = await House.findAll({
    include: [
      { model: FC, as: 'OwningFC' },
      { model: Character, as: 'OwningCharacter' },
      { model: Character, as: 'SharedCharacters', through: { attributes: [] } }
    ]
  });
  // Filter houses to include owned or shared
  const filteredHouses = houses.filter(house => {
    if (["Small","Medium","Large"].includes(house.type)) {
      if (house.fcId) {
        return fcIds.includes(house.fcId);
      } else if (house.characterId) {
        const sharedIds = (house.SharedCharacters || []).map(c => c.id);
        return characterIds.includes(house.characterId) || characterIds.some(id => sharedIds.includes(id));
      }
    } else if (house.type === "FC Room" || house.type === "Apartment") {
      const sharedIds = (house.SharedCharacters || []).map(c => c.id);
      return characterIds.includes(house.characterId) || characterIds.some(id => sharedIds.includes(id));
    }
    return false;
  });
  const houseIds = filteredHouses.map(h => h.id);
  const plots = await Plot.findAll({ where: { HouseId: houseIds } });
  const plotIds = plots.map(p => p.id);
  const crops = await Crop.findAll({ where: { PlotId: plotIds } });
  const now = new Date();
  for (const crop of crops) {
    crop.lastTendedAt = now;
    await crop.save();
  }

  // Remove alert queue entries if all crops in plot are now not overdue
  if (crops.length > 0) {
    const plotId = crops[0].PlotId;
    const allNotOverdue = crops.every(c => c.lastTendedAt && (now - new Date(c.lastTendedAt)) < 20 * 60 * 60 * 1000);
    if (allNotOverdue) {
      await AlertQueue.destroy({ where: { plotId } });
    }
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ success: true });
  } else {
    res.redirect('/crops');
  }
});

// Tend a single crop
router.post('/:id/tend', ensureAuth, async (req, res) => {
  const crop = await Crop.findByPk(req.params.id);
  if (!crop) return res.status(404).send('Crop not found');
  // Ownership check: user must own the plot/house
  const plot = await Plot.findByPk(crop.PlotId);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');

  // Check if user owns the house (FC or Character)
  if (!(await userCanAccessHouse(req, house))) {
    return res.status(403).send('Not authorized');
  }
  crop.lastTendedAt = new Date();
  await crop.save();

  // Remove alert queue entries if all crops in plot are now not overdue
  const allCrops = await Crop.findAll({ where: { PlotId: crop.PlotId } });
  const now = new Date();
  const allNotOverdue = allCrops.every(c => c.lastTendedAt && (now - new Date(c.lastTendedAt)) < 20 * 60 * 60 * 1000);
  if (allNotOverdue) {
    await AlertQueue.destroy({ where: { plotId: crop.PlotId } });
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ crop });
  } else {
    res.redirect('/crops');
  }
});

// Mark crop as Do Not Harvest
router.post('/:id/donotharvest', ensureAuth, async (req, res) => {
  const crop = await Crop.findByPk(req.params.id);
  if (!crop) return res.status(404).send('Crop not found');
  // Ownership check: user must own the plot/house
  const plot = await Plot.findByPk(crop.PlotId);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');

  if (!(await userCanAccessHouse(req, house))) {
    return res.status(403).send('Not authorized');
  }
  crop.neverHarvest = true;
  await crop.save();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ crop });
  } else {
    res.redirect('/crops');
  }
});

// Mark crop as Fully Grown
router.post('/:id/mark-fullygrown', ensureAuth, async (req, res) => {
  const crop = await Crop.findByPk(req.params.id);
  if (!crop) return res.status(404).send('Crop not found');
  // Ownership check: user must own the plot/house
  const plot = await Plot.findByPk(crop.PlotId);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');
  if (!(await userCanAccessHouse(req, house))) {
    return res.status(403).send('Not authorized');
  }
  crop.fullyGrown = true;
  await crop.save();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ crop });
  } else {
    res.redirect('/crops');
  }
});

// Mark crop as Not Fully Grown
router.post('/:id/mark-not-fullygrown', ensureAuth, async (req, res) => {
  const crop = await Crop.findByPk(req.params.id);
  if (!crop) return res.status(404).send('Crop not found');
  // Ownership check: user must own the plot/house
  const plot = await Plot.findByPk(crop.PlotId);
  if (!plot) return res.status(404).send('Plot not found');
  const house = await House.findByPk(plot.HouseId);
  if (!house) return res.status(404).send('House not found');
  if (!(await userCanAccessHouse(req, house))) {
    return res.status(403).send('Not authorized');
  }
  crop.fullyGrown = false;
  await crop.save();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.json({ crop });
  } else {
    res.redirect('/crops');
  }
});

module.exports = router;
