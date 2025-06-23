const express = require('express');
const router = express.Router();
const { ensureAuth } = require('./middleware');
const { FC, FCUser, House, Character, Plot, Crop } = require('./models');
const { fetchLodestoneFC } = require('./utils/lodestone');

// Place all your route handlers here, e.g.
// router.get('/', ...)

router.use('/servers', require('./routes/servers'));
router.use('/alerts', require('./routes/alerts'));
router.use('/alerts', require('./routes/alerts'));

module.exports = router;
