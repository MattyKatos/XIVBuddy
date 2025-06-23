require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const path = require('path');

const app = express();

// Trust first proxy (needed for secure cookies/session behind proxies)
app.set('trust proxy', 1);

// Database connection
const { sequelize } = require('./models');

// EJS for simple templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, images)
app.use(express.static(path.join(__dirname, 'public')));

const fetch = require('node-fetch');

/**
 * Get a valid Discord access token for a user, refreshing if needed.
 * @param {User} user Sequelize user instance
 * @returns {Promise<string>} accessToken
 */
async function getValidDiscordAccessToken(user) {
  // If token is still valid, return it
  if (user.accessToken && user.tokenExpiresAt && user.tokenExpiresAt > new Date(Date.now() + 60 * 1000)) {
    return user.accessToken;
  }
  // Otherwise, refresh
  if (!user.refreshToken) throw new Error('No refresh token available');
  const params = new URLSearchParams();
  params.append('client_id', process.env.DISCORD_CLIENT_ID);
  params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', user.refreshToken);
  params.append('redirect_uri', process.env.DISCORD_CALLBACK_URL);
  params.append('scope', 'identify');
  const resp = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!resp.ok) {
    throw new Error('Failed to refresh Discord token: ' + (await resp.text()));
  }
  const data = await resp.json();
  user.accessToken = data.access_token;
  if (data.refresh_token) user.refreshToken = data.refresh_token;
  user.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 604800) * 1000);
  await user.save();
  return user.accessToken;
}

// Session middleware
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite3', dir: '/app/data' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: true, // Only send cookie over HTTPS
    sameSite: 'lax' // Helps with OAuth and cross-site requests
  }
}));

// Import the configured passport instance (registers Discord strategy)
const passport = require('./auth');

// Initialize Passport.js middleware after session middleware
app.use(passport.initialize());
app.use(passport.session());


// Routes
const rootRouter = require('./routes/root');
app.use('/', rootRouter);

const housesRouter = require('./routes/houses');
app.use('/houses', housesRouter);

const fcsRouter = require('./routes/fcs');
app.use('/fcs', fcsRouter);

const charactersRouter = require('./routes/characters');
app.use('/characters', charactersRouter);

const plotsRouter = require('./routes/plots');
app.use('/plots', plotsRouter);

const cropsRouter = require('./routes/crops');
app.use('/crops', cropsRouter);

const authRouter = require('./routes/auth');
app.use('/auth', authRouter);

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

const dashboardRouter = require('./routes/dashboard');
app.use('/dashboard', dashboardRouter);

// Mount channels router for channel actions
const channelsRouter = require('./routes/channels');
app.use('/channels', channelsRouter);

// Mount main routes.js router for /servers and other subroutes
const mainRouter = require('./routes');
app.use('/', mainRouter);

const PORT = process.env.PORT || 3000;
// Start server (database should be migrated manually; do not sync in production)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
// To sync DB in development only, run: sequelize.sync() manually in a script or REPL
