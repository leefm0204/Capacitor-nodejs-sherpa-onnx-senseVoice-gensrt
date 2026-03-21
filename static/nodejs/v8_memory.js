'use strict';

/**
 * Advanced V8 Memory Management Module
 * Uses V8 C++ APIs exposed through libnode.so for fine-grained memory control
 */

const v8 = require('v8');
const vm = require('vm');

// Enable GC programmatically
v8.setFlagsFromString('--expose_gc');
const collectGarbage = vm.runInNewContext('gc');

// ============================================================================
// Configuration
// ============================================================================
const MEMORY_CONFIG = {
  // Heap limits (in MB)
  initialHeapSize: 64,
  maxHeapSize: 512,
  
  // Triggers
  heapUsageThreshold: 0.75,      // Trigger GC at 75% heap usage
  externalMemoryThreshold: 0.8,   // Trigger GC when external memory high
  rssThreshold: 300,              // Trigger GC when RSS > 300MB
  
  // Monitoring
  checkInterval: 5000,           // Check every 5 seconds
  aggressiveGCInterval: 2000,    // Aggressive GC every 2 seconds when high memory
  
  // Logging
  logLevel: 'info',              // 'debug', 'info', 'warn', 'error'
};

// ============================================================================
// Memory Statistics Tracker
// ============================================================================
class MemoryTracker {
  constructor() {
    this.history = [];
    this.maxHistorySize = 50; // Reduced for mobile
    this.lastGC = 0;
    this.gcCount = 0;
    this.peakRSS = 0;
    this.peakHeap = 0;
    this.lastDeepStatsTime = 0;
    this.cachedDeepStats = null;
  }

  getStats(deep = false) {
    const now = Date.now();
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();

    // Cache expensive space statistics
    let spaces = null;
    if (deep || (now - this.lastDeepStatsTime > 30000)) {
      spaces = v8.getHeapSpaceStatistics().map(space => ({
        name: space.space_name,
        used: space.space_used_size / 1024 / 1024,
      }));
      this.cachedDeepStats = spaces;
      this.lastDeepStatsTime = now;
    } else {
      spaces = this.cachedDeepStats;
    }

    const stats = {
      timestamp: now,
      heap: {
        used: heapStats.used_heap_size / 1024 / 1024,
        limit: heapStats.heap_size_limit / 1024 / 1024,
        usagePercent: (heapStats.used_heap_size / (heapStats.heap_size_limit || 1)) * 100,
      },
      external: {
        memory: heapStats.external_memory / 1024 / 1024,
      },
      process: {
        rss: memUsage.rss / 1024 / 1024,
        external: memUsage.external / 1024 / 1024,
      },
      spaces,
      gc: {
        count: this.gcCount,
        timeSinceGC: now - this.lastGC,
      },
    };

    this.peakRSS = Math.max(this.peakRSS, stats.process.rss);
    this.peakHeap = Math.max(this.peakHeap, stats.heap.used);

    this.history.push(stats);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    return stats;
  }

  getTrend() {
    if (this.history.length < 5) return 'stable';
    const recent = this.history.slice(-5);
    const diff = recent[recent.length - 1].heap.used - recent[0].heap.used;
    return diff > 5 ? 'increasing' : (diff < -5 ? 'decreasing' : 'stable');
  }

  reset() {
    this.history = [];
    this.lastGC = 0;
    this.gcCount = 0;
  }
}

// ============================================================================
// Memory Manager
// ============================================================================
class MemoryManager {
  constructor(config = MEMORY_CONFIG) {
    this.config = config;
    this.tracker = new MemoryTracker();
    this.monitoringInterval = null;
    this.aggressiveGCMode = false;
    this.listeners = {
      gc: [],
      warning: [],
      critical: [],
    };
  }

  log(level, message, data = null) {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.indexOf(level) < levels.indexOf(this.config.logLevel)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [V8 Memory ${level.toUpperCase()}]`;
    
    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  forceGC(reason = 'Manual') {
    if (typeof collectGarbage === 'function') {
      const before = this.tracker.getStats();
      collectGarbage();
      const after = this.tracker.getStats();
      
      this.tracker.gcCount++;
      this.tracker.lastGC = Date.now();
      
      const freed = before.heap.used - after.heap.used;
      this.log('info', `${reason} GC: Freed ${freed.toFixed(2)}MB`, {
        before: before.heap.used.toFixed(2),
        after: after.heap.used.toFixed(2),
        freed: freed.toFixed(2),
      });
      
      this.emit('gc', { before, after, freed });
      
      return freed;
    }
    return 0;
  }

  checkMemoryPressure() {
    const stats = this.tracker.getStats();
    if (!stats || !stats.heap || !stats.external) return { pressure: 'none', stats };

    let pressure = 'none';
    
    // Check heap usage
    if (stats.heap.usagePercent > 90) {
      pressure = 'critical';
    } else if (stats.heap.usagePercent > this.config.heapUsageThreshold * 100) {
      pressure = 'high';
    }
    
    // Check RSS
    if (stats.process.rss > this.config.rssThreshold) {
      pressure = pressure === 'critical' ? 'critical' : 'high';
    }
    
    // Check external memory
    if (stats.external.memory > stats.heap.limit * this.config.externalMemoryThreshold) {
      pressure = pressure === 'critical' ? 'critical' : 'high';
    }
    
    return { pressure, stats };
  }

  startMonitoring() {
    this.log('info', 'Starting V8 memory monitoring', {
      initialHeap: this.config.initialHeapSize,
      maxHeap: this.config.maxHeapSize,
      threshold: this.config.heapUsageThreshold * 100 + '%',
    });

    this.monitoringInterval = setInterval(() => {
      const { pressure, stats } = this.checkMemoryPressure();
      
      if (pressure === 'critical') {
        this.log('error', 'CRITICAL: Memory pressure critical!', {
          heap: `${stats.heap.used.toFixed(2)} / ${stats.heap.limit.toFixed(2)}MB`,
          rss: `${stats.process.rss.toFixed(2)}MB`,
          external: `${stats.external.memory.toFixed(2)}MB`,
        });
        
        this.emit('critical', stats);
        this.forceGC('Critical pressure');
        
        // Enter aggressive GC mode
        if (!this.aggressiveGCMode) {
          this.enterAggressiveGCMode();
        }
      } else if (pressure === 'high') {
        this.log('warn', 'HIGH: Memory pressure elevated', {
          heap: `${stats.heap.used.toFixed(2)}MB (${stats.heap.usagePercent.toFixed(1)}%)`,
          rss: `${stats.process.rss.toFixed(2)}MB`,
        });
        
        this.emit('warning', stats);
        this.forceGC('High pressure');
      }
      
      // Exit aggressive mode if memory is under control
      if (this.aggressiveGCMode && pressure === 'none') {
        this.exitAggressiveGCMode();
      }
      
      // Log periodic summary
      this.log('debug', 'Memory status', {
        heap: `${stats.heap.used.toFixed(2)}MB`,
        rss: `${stats.process.rss.toFixed(2)}MB`,
        trend: this.tracker.getTrend(),
        gcCount: stats.gc.count,
      });
    }, this.config.checkInterval);
  }

  enterAggressiveGCMode() {
    this.aggressiveGCMode = true;
    this.log('warn', 'Entering aggressive GC mode');
    
    const aggressiveInterval = setInterval(() => {
      const { pressure } = this.checkMemoryPressure();
      if (pressure !== 'critical' && pressure !== 'high') {
        clearInterval(aggressiveInterval);
        this.exitAggressiveGCMode();
      } else {
        this.forceGC('Aggressive mode');
      }
    }, this.config.aggressiveGCInterval);
  }

  exitAggressiveGCMode() {
    this.aggressiveGCMode = false;
    this.log('info', 'Exiting aggressive GC mode');
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.log('info', 'Memory monitoring stopped');
    }
  }

  getReport() {
    const stats = this.tracker.getStats();
    const trend = this.tracker.getTrend();
    
    return {
      current: stats,
      trend: trend,
      peaks: {
        rss: this.tracker.peakRSS,
        heap: this.tracker.peakHeap,
      },
      gc: {
        count: this.tracker.gcCount,
        avgTimeBetweenGC: this.tracker.gcCount > 0 
          ? (Date.now() - this.tracker.lastGC) / this.tracker.gcCount 
          : 0,
      },
      config: this.config,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
  MemoryManager,
  MemoryTracker,
  collectGarbage,
  
  // Quick access function
  gc: () => {
    if (typeof collectGarbage === 'function') {
      collectGarbage();
      return true;
    }
    return false;
  },
  
  // Get current memory stats
  getMemoryStats: () => {
    const tracker = new MemoryTracker();
    return tracker.getStats();
  },
};
