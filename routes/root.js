const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { user: req.user });
});

// Redirect /login to home for a cleaner UX
router.get('/login', (req, res) => {
  res.redirect('/');
});

module.exports = router;
