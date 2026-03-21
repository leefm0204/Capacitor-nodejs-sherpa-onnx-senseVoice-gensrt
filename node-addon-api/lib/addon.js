/** @typedef {import('./types').WaveObject} WaveObject */

const path = require('path');

// Resolve the absolute path to the addon
const addonPath = path.resolve(__dirname, './sherpa-onnx.node');

// Load the native addon
const addon = require(addonPath);

module.exports = addon;

/**
 * Read a wave file from disk.
 * @function module.exports.readWave
 * @param {string} filename
 * @param {boolean} [enableExternalBuffer=true]
 * @returns {WaveObject}
 */

/**
 * Read a wave from binary buffer.
 * @function module.exports.readWaveFromBinary
 * @param {Uint8Array} data - Binary contents of a wave file.
 * @param {boolean} [enableExternalBuffer=true]
 * @returns {WaveObject}
 */

/**
 * Write a wave file to disk.
 * @function module.exports.writeWave
 * @param {string} filename
 * @param {WaveObject} obj - { samples: Float32Array, sampleRate: number }
 * @returns {boolean}
 */
