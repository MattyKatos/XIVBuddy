// alert_watcher.js
// Checks all plots with alerts, and adds entries to the AlertQueue if not already present.

const { sequelize, Alert, AlertQueue, Plot, Channel, Server, House, Crop } = require('./models');
const { Op } = require('sequelize');

async function runAlertWatcher() {
  // Get all alerts, with plot, channel, server, house, and crops
  const alerts = await Alert.findAll({
    include: [
      { model: Plot, include: [House, { model: Crop }] },
      { model: Channel, include: [Server] }
    ]
  });
  const now = new Date();
  let overdueCount = 0;
  for (const alert of alerts) {
    const plot = alert.Plot;
    const channel = alert.Channel;
    const server = channel && channel.Server;
    if (!plot || !channel || !server) continue;
    // Compose plot name
    const plotName = `${plot.type} (${plot.House ? plot.House.district + ' Ward ' + plot.House.ward + ' Plot ' + plot.House.plot : 'N/A'})`;
    // Gather plant info: all crops in plot
    let crops = plot.Crops || [];
    crops = crops.filter(crop => !(crop.neverHarvest && crop.fullyGrown));
    if (crops.length === 0) continue;
    // Only alert if ALL crops are overdue
    const ALERT_THRESHOLD_MS = 20 * 60 * 60 * 1000; // 20 hours
    // Find the crop with the oldest last tended time in the plot
    const oldestTend = crops.reduce((oldest, crop) => {
      const lastTended = crop.lastTendedAt ? new Date(crop.lastTendedAt) : new Date(crop.createdAt);
      return (!oldest || lastTended < oldest) ? lastTended : oldest;
    }, null);
    if (!oldestTend || (now - oldestTend) <= ALERT_THRESHOLD_MS) continue;

    // Find last alert queue entry for this plot/channel/server
    const lastAlert = await AlertQueue.findOne({
      where: {
        plotId: plot.id,
        channelId: channel.discordId,
        serverId: server.discordId
      },
      order: [['createdAt', 'DESC']]
    });

    // Only alert if no alert ever sent, or at least one crop has been tended since last alert
    // Only alert if no alert ever sent, or the oldest crop has been tended since the last alert
    const anyTendedSinceLastAlert = lastAlert
      ? oldestTend > lastAlert.createdAt
      : true;

    if (!lastAlert || anyTendedSinceLastAlert) {
      const plantInfo = crops.map(crop => ({
        id: crop.id,
        cropName: crop.cropName,
        bedNumber: crop.bedNumber,
        plantedAt: crop.plantedAt,
        harvestedAt: crop.harvestedAt,
        neverHarvest: crop.neverHarvest,
        fullyGrown: crop.fullyGrown,
        lastTendedAt: crop.lastTendedAt
      }));
      await AlertQueue.create({
        plotId: plot.id,
        channelId: channel.discordId,
        serverId: server.discordId,
        plotName,
        plantInfo
      });
      console.log(`[ALERT] Overdue: ${plotName} in #${channel.name} (${server.name})`);
      overdueCount++;
    } else {
      console.log(`[ALERT] Skipped: ${plotName} in #${channel.name} (${server.name}) - no crops tended since last alert`);
    }
  }
  if (overdueCount === 0) {
    console.log(`[ALERT] No overdue plots found at ${now.toISOString()}`);
  }
}

function startWatcher() {
  runAlertWatcher();
  setInterval(runAlertWatcher, 45 * 60 * 1000); // every 45 min
}

if (require.main === module) {
  // In production, do not sync DB here. Ensure migrations are run manually.
  startWatcher();
}

module.exports = runAlertWatcher;
