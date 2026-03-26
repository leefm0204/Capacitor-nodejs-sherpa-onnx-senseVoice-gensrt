// lib/srt-writer.js
// JavaScript wrapper for the native SrtWriter C++ class.

const addon = require("./addon");

/**
 * SrtWriter utility.
 * @class
 */
class SrtWriter {
  /**
   * @param {string} filename - Absolute path to output SRT
   */
  constructor(filename) {
    if (!addon.SrtWriter) {
      throw new Error(
        "Native SrtWriter not found in addon. Ensure srt-writer.cc is compiled.",
      );
    }
    this.handle = new addon.SrtWriter(filename);
  }

  /**
   * Initialize the file for writing.
   * @returns {boolean}
   */
  initialize() {
    return this.handle.initialize();
  }

  /**
   * Add a speech segment to the SRT.
   * @param {number} start - Start time in seconds.
   * @param {number} duration - Duration in seconds.
   * @param {string} text - Transcription text.
   */
  addSegment(start, duration, text) {
    this.handle.addSegment(start, duration, text);
  }

  /**
   * Finalize and close the SRT file.
   */
  finalize() {
    this.handle.finalize();
  }
}

module.exports = {
  SrtWriter,
};
