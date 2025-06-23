# XIVBuddy

XIVBuddy is a web application for managing your Final Fantasy XIV (FFXIV) characters, Free Companies, houses, and Discord integration. It features a modern dashboard, Discord OAuth login, and tools to help you organize and monitor your FFXIV experience.

## Features
- **Discord OAuth Login:** Secure authentication via Discord.
- **Modern Dashboard:** Overview of your characters, Free Companies, houses, and alerts.
- **Character Management:** Register, edit, and remove your FFXIV characters.
- **Free Company Management:** Manage your FCs and members.
- **Housing Tools:** Track personal, FC, and apartment housing.
- **Alerts:** Set up and manage reminders and alerts.
- **Responsive UI:** Clean, modern, and mobile-friendly interface.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) (for easy setup)
- MySQL (if not using Docker)

### Setup (Docker)
1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/XIVBuddy.git
   cd XIVBuddy
   ```
2. **Copy and configure environment variables:**
   ```sh
   cp .env.example .env
   # Edit .env and fill in Discord and MySQL credentials
   ```
3. **Build and start the services:**
   ```sh
   docker-compose build
   docker-compose up -d
   ```
4. **Visit the app:**
   Open [http://localhost:8080](http://localhost:8080) in your browser.

### Setup (Manual/Development)
1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your secrets.
3. **Start the app:**
   ```sh
   npm start
   ```

## Environment Variables
Create a `.env` file in the project root. Example:
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:8080/auth/discord/callback
SESSION_SECRET=your_session_secret
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=xivbuddy
```

## Project Structure
- `index.js` — Main Express app
- `routes/` — Express route handlers
- `views/` — EJS templates for UI
- `models.js` — Sequelize models
- `public/` — Static assets (CSS, JS)
- `docker-compose.yml` — Docker services

## License
MIT

---

**XIVBuddy** is not affiliated with Square Enix or Final Fantasy XIV. All trademarks are property of their respective owners.
