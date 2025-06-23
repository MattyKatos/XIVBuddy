const express = require('express');
const passport = require('passport');
const router = express.Router();

// Redirect to Discord for authentication
router.get('/discord', passport.authenticate('discord'));

// Discord OAuth callback
router.get('/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/login'
  }),
  (req, res) => {
    // Successful authentication, redirect home or to dashboard
    res.redirect('/dashboard');
  }
);



// Logout route (optional, can be kept in root if preferred)
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

module.exports = router;
