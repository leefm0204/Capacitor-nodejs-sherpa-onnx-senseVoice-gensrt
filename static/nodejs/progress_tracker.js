'use strict';

class ProgressTracker {
  constructor(filename, duration, options = {}) {
    this.filename = filename;
    this.duration = duration;
    this.processed = 0;
    this.segmentsCount = 0;
    this.startTime = Date.now();
    this.lastProgress = -1;
    this.lastUpdateTime = 0;
    this.updateThrottle = options.updateThrottle || 2000;
    this.sendCallback = options.sendCallback || null;

    // EMA speed tracking
    this.emaSpeed = 0;
    this.emaAlpha = 0.25; // Smoothing factor
    this.lastProcessed = 0;
    this.lastTimestamp = this.startTime;

    this.cachedMetrics = null;
  }

  calculateMetrics() {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    
    // Calculate instantaneous speed since last update
    const dt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    const dProcessed = Math.max(0, this.processed - this.lastProcessed);
    const instantSpeed = dProcessed / dt;

    // Update EMA speed
    if (this.emaSpeed === 0 && instantSpeed > 0) {
      this.emaSpeed = instantSpeed;
    } else if (instantSpeed > 0) {
      this.emaSpeed = (this.emaSpeed * (1 - this.emaAlpha)) + (instantSpeed * this.emaAlpha);
    }

    const progress = this.duration > 0
      ? Math.min(100, Math.round((this.processed / this.duration) * 100))
      : 0;
    
    // Use EMA speed for metrics if available, fallback to overall average
    const displaySpeed = this.emaSpeed > 0 ? this.emaSpeed : (elapsed > 0 ? this.processed / elapsed : 0);
    
    const remaining = displaySpeed > 0 && this.duration > 0
      ? Math.max(0, (this.duration - this.processed) / displaySpeed)
      : 0;

    return {
      progress,
      elapsed,
      speed: displaySpeed,
      remaining,
      timestamp: now,
      instantSpeed,
      segmentsCount: this.segmentsCount,
    };
  }

  update(processed, segmentsCount = 0) {
    const now = Date.now();

    // Update tracking vars for EMA calc
    this.processed = processed;
    this.segmentsCount = segmentsCount;
    const metrics = this.calculateMetrics();
    
    // Now we can set lastProcessed for the *next* turn
    this.lastProcessed = processed;
    this.lastTimestamp = now;

    if (now - this.lastUpdateTime < this.updateThrottle) {
      return;
    }

    if (metrics.progress === this.lastProgress && now - this.lastUpdateTime < 5000) {
      return;
    }

    this.lastProgress = metrics.progress;
    this.lastUpdateTime = now;
    this.cachedMetrics = metrics;

    this.outputProgress(metrics);
  }

  outputProgress(metrics) {
    if (this.sendCallback) {
      const progressData = {
        filename: this.filename,
        progress: metrics.progress,
        processed: this.processed,
        duration: this.duration,
        speed: metrics.speed,
        remaining: metrics.remaining,
        elapsed: metrics.elapsed,
        segmentsCount: metrics.segmentsCount,
      };

      this.sendCallback(progressData);
    }
  }

  complete(segmentsCount = 0) {
    const finalMetrics = this.calculateMetrics();
    this.segmentsCount = segmentsCount;

    if (this.sendCallback) {
      const finalProgressData = {
        filename: this.filename,
        progress: 100,
        processed: this.duration,
        duration: this.duration,
        speed: finalMetrics.speed,
        remaining: 0,
        elapsed: finalMetrics.elapsed,
        segmentsCount: this.segmentsCount,
      };

      this.sendCallback(finalProgressData);
    }
  }
}

module.exports = { ProgressTracker };
