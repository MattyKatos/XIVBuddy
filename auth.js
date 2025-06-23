const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { User } = require('./models');

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const [user] = await User.findOrCreate({
      where: { discordId: profile.id },
      defaults: {
        username: profile.username,
        discriminator: profile.discriminator
      }
    });
    let changed = false;
    if (user.username !== profile.username || user.discriminator !== profile.discriminator) {
      user.username = profile.username;
      user.discriminator = profile.discriminator;
      changed = true;
    }
    // Update avatar if changed
    if (user.avatar !== profile.avatar) {
      user.avatar = profile.avatar;
      changed = true;
    }
    if (accessToken && user.accessToken !== accessToken) {
      user.accessToken = accessToken;
      changed = true;
    }
    if (refreshToken && user.refreshToken !== refreshToken) {
      user.refreshToken = refreshToken;
      changed = true;
    }
    if (profile.expires_in) {
      const expires = new Date(Date.now() + profile.expires_in * 1000);
      user.tokenExpiresAt = expires;
      changed = true;
    } else if (!user.tokenExpiresAt) {
      user.tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      changed = true;
    }
    if (changed) await user.save();
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

module.exports = passport;

