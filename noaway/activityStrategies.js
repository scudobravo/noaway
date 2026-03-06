/**
 * Activity strategies - keyboard (keyTap) and mouse (tiny move).
 * All robotjs calls are wrapped in try/catch to avoid crashes on permission errors.
 */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Keyboard strategy: simulate shift key tap.
 * @returns {boolean} true if executed without error
 */
function keyboardStrategy() {
  try {
    const robot = require('robotjs');
    robot.keyTap('shift');
    return true;
  } catch (err) {
    if (typeof global.logger !== 'undefined') {
      global.logger.error('RobotJS keyboard', err.message);
    }
    return false;
  }
}

/**
 * Mouse strategy: move by small random offset then back. Very small so user does not notice.
 * Offset is never (0, 0) so the system registers actual movement.
 * @returns {boolean} true if executed without error
 */
function mouseStrategy() {
  try {
    const robot = require('robotjs');
    const pos = robot.getMousePos();
    let dx = randomInt(-2, 2);
    let dy = randomInt(-2, 2);
    if (dx === 0 && dy === 0) {
      dx = 1;
    }
    robot.moveMouse(pos.x + dx, pos.y + dy);
    robot.moveMouse(pos.x, pos.y);
    return true;
  } catch (err) {
    if (typeof global.logger !== 'undefined') {
      global.logger.error('RobotJS mouse', err.message);
    }
    return false;
  }
}

module.exports = {
  keyboardStrategy,
  mouseStrategy,
};
