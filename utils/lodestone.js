const fetch = require('node-fetch');
const cheerio = require('cheerio');

/**
 * Fetch character info from Lodestone by lodestoneId.
 * @param {string} lodestoneId
 * @returns {Promise<{name: string, world: string, fcName?: string, fcTag?: string}>}
 */
async function fetchLodestoneCharacter(lodestoneId) {
  const url = `https://na.finalfantasyxiv.com/lodestone/character/${lodestoneId}/`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch Lodestone page');
  const html = await resp.text();
  const $ = cheerio.load(html);
  const name = $('.frame__chara__name').first().text().trim();
  const world = $('.frame__chara__world').first().text().trim().replace(/[()]/g, '');
  let fcName, fcTag;
  const fcBlock = $('.character__freecompany__name').first();
  if (fcBlock.length) {
    fcName = fcBlock.text().trim();
    fcTag = $('.character__freecompany__tag').first().text().replace(/[[\]]/g, '').trim();
  }
  return { name, world, fcName, fcTag };
}

/**
 * Fetch FC info from Lodestone by lodestoneId.
 * @param {string} lodestoneId
 * @returns {Promise<{name: string, tag?: string}>}
 */
async function fetchLodestoneFC(lodestoneId) {
  const url = `https://na.finalfantasyxiv.com/lodestone/freecompany/${lodestoneId}/`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch Lodestone FC page');
  const html = await resp.text();
  const $ = cheerio.load(html);
  const name = $('.entry__freecompany__name').first().text().trim();
  const tag = $('.entry__freecompany__tag').first().text().replace(/[\[\]]/g, '').trim();
  return { name, tag };
}

module.exports = { fetchLodestoneCharacter, fetchLodestoneFC };
