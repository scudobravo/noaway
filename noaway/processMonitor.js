/**
 * Lightweight process detection for product analytics only.
 * Detects if Microsoft Teams, Slack, Zoom, or Discord are running.
 * Returns normalized app ids: teams, slack, zoom, discord.
 * No other process data is collected. Failures return [] so validation is never blocked.
 */

const { exec } = require('child_process');
const { platform } = process;

const ALLOWED_APPS = ['teams', 'slack', 'zoom', 'discord'];

/**
 * Parse macOS/Unix ps -ax output. Match process names for our apps only.
 * @param {string} stdout
 * @returns {string[]}
 */
function parsePsOutput(stdout) {
  const found = new Set();
  const lower = (stdout || '').toLowerCase();
  if (lower.includes('microsoft teams') || (lower.includes('teams') && lower.includes('.app'))) found.add('teams');
  if (lower.includes('slack')) found.add('slack');
  if (lower.includes('zoom')) found.add('zoom');
  if (lower.includes('discord')) found.add('discord');
  return ALLOWED_APPS.filter((a) => found.has(a));
}

/**
 * Parse Windows tasklist output. Image name is first column.
 * @param {string} stdout
 * @returns {string[]}
 */
function parseTasklistOutput(stdout) {
  const found = new Set();
  const lines = (stdout || '').split(/\r?\n/);
  for (const line of lines) {
    const img = line.trim().split(/\s+/)[0] || '';
    const name = img.toLowerCase();
    if (name.includes('teams')) found.add('teams');
    if (name === 'slack.exe') found.add('slack');
    if (name.includes('zoom')) found.add('zoom');
    if (name.includes('discord')) found.add('discord');
  }
  return ALLOWED_APPS.filter((a) => found.has(a));
}

/**
 * Detect if Microsoft Teams, Slack, Zoom, or Discord are running.
 * Uses ps -ax (macOS/Linux) or tasklist (Windows). Returns normalized array
 * e.g. ["teams", "slack"]. On any error returns [] so validation never fails.
 * @returns {Promise<string[]>}
 */
function detectCommunicationApps() {
  return new Promise((resolve) => {
    const timeout = 3000;
    let killed = false;

    const done = (result) => {
      if (killed) return;
      killed = true;
      resolve(Array.isArray(result) ? result.filter((a) => ALLOWED_APPS.includes(a)) : []);
    };

    if (platform === 'win32') {
      exec('tasklist', { timeout, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          done([]);
          return;
        }
        done(parseTasklistOutput(stdout));
      });
    } else {
      exec('ps -ax', { timeout }, (err, stdout, stderr) => {
        if (err) {
          done([]);
          return;
        }
        done(parsePsOutput(stdout));
      });
    }
  });
}

module.exports = {
  detectCommunicationApps,
};
