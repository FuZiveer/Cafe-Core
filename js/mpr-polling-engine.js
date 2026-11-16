(function (root) {
  "use strict";
  const VERSION = "2.1.0";
  const WINDOW_MS = 500;
  const LEADING_WARMUP_MS = 500;
  const median = (a) => {
    if (!a.length) return 0;
    const b = [...a];
    const k = Math.floor(b.length / 2);
    let left = 0;
    let right = b.length - 1;
    while (left < right) {
      const pivot = b[Math.floor((left + right) / 2)];
      let i = left;
      let j = right;
      while (i <= j) {
        while (b[i] < pivot) i++;
        while (b[j] > pivot) j--;
        if (i <= j) {
          [b[i], b[j]] = [b[j], b[i]];
          i++;
          j--;
        }
      }
      if (k <= j) right = j;
      else if (k >= i) left = i;
      else break;
    }
    return b[k];
  };
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const deviation = (a, m) => Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
  class Capture {
    constructor(options = {}) {
      this.reset(options);
    }
    reset({ source = "pointermove", clockGrain = 1 } = {}) {
      this.source = source;
      this.clockGrain = clockGrain;
      this.samples = [];
      this.arrivals = [];
      this.arrivalTimes = [];
      this.buckets = [];
      this.frames = [];
      this.lastFrame = null;
      this.firstArrival = null;
      this.lastArrival = null;
      this.lastStamp = null;
      this.expanded = 0;
      this.invalid = 0;
      this.equal = 0;
      this.interruption = null;
      this.overflow = false;
      this.revision = 0;
      this.cached = null;
    }
    frame(t) {
      if (this.lastFrame != null && t > this.lastFrame) {
        this.frames.push(t - this.lastFrame);
        if (this.frames.length > 120) this.frames.shift();
      }
      this.lastFrame = t;
    }
    interrupt(reason) {
      this.interruption = reason;
      this.cached = null;
    }
    ingest(event, arrival) {
      if (event.isTrusted !== true || event.pointerType !== "mouse" || this.interruption || this.overflow) return;
      let batch = [];
      try {
        batch = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      } catch {
      }
      if (!batch.length) batch = [event];
      if (batch.length > 1) this.expanded += batch.length - 1;
      if (this.firstArrival === null) this.firstArrival = arrival;
      if (this.lastArrival !== null) this.arrivals.push(arrival - this.lastArrival);
      this.lastArrival = arrival;
      this.arrivalTimes.push(arrival);
      const bucket = Math.floor((arrival - this.firstArrival) / WINDOW_MS);
      for (const sample of batch) {
        if (this.samples.length >= 200000) {
          this.overflow = true;
          break;
        }
        const t = sample.timeStamp;
        if (!Number.isFinite(t) || t < 0 || (this.lastStamp !== null && t < this.lastStamp)) {
          this.invalid++;
          continue;
        }
        if (t === this.lastStamp) this.equal++;
        this.samples.push(t);
        if (this.samples.length > 1) this.buckets[bucket] = (this.buckets[bucket] || 0) + 1;
        this.lastStamp = t;
      }
      this.revision++;
    }
    snapshot(now, force = false) {
      if (!force && this.cached && now - this.cached.at < 250) return this.cached.value;
      const count = this.samples.length;
      const duration = this.firstArrival === null ? 0 : Math.max(0, now - this.firstArrival);
      const avgRate = duration > 0 ? Math.max(0, count - 1) * 1000 / duration : 0;
      let intervalStartIdx = 1;
      if (count > 0) {
        const tWarm = this.samples[0] + LEADING_WARMUP_MS;
        while (intervalStartIdx < count && this.samples[intervalStartIdx - 1] < tWarm) {
          intervalStartIdx++;
        }
      }
      const intervals = [];
      for (let i = intervalStartIdx; i < count; i++) intervals.push(this.samples[i] - this.samples[i - 1]);
      const positive = intervals.filter((x) => x > 0);
      const period = median(positive);
      const windows = Array.from({ length: Math.floor(duration / WINDOW_MS) }, (_, i) => (this.buckets[i] || 0) * (1000 / WINDOW_MS));
      const windowMean = mean(windows);
      const windowCV = windowMean > 0 ? deviation(windows, windowMean) / windowMean : 0;
      const enough = duration >= 3000 && count >= 100;
      const frameMs = median(this.frames);
      const dispatchMs = median(this.arrivals);
      const phases = frameMs > 0 ? this.arrivalTimes.slice(-240).map((t) => (2 * Math.PI * (t % frameMs)) / frameMs) : [];
      const phaseConcentration = Math.hypot(mean(phases.map(Math.cos)), mean(phases.map(Math.sin)));
      const frameAligned =
        this.frames.length >= 30 &&
        this.arrivals.length >= 60 &&
        frameMs > 0 &&
        phaseConcentration > 0.95 &&
        Math.abs(dispatchMs - frameMs) / frameMs < 0.08 &&
        this.arrivals.filter((x) => Math.abs(x - frameMs) < frameMs * 0.2).length / this.arrivals.length > 0.8;
      const frameLimited = enough && this.expanded === 0 && frameAligned;
      const limited = frameLimited || (enough && this.source === "pointermove" && this.expanded === 0);
      const bad = this.invalid > 0 || this.overflow;
      const deliveryGapCount = this.arrivals.filter((x) => x >= 100).length;
      const duplicateShare = intervals.length ? this.equal / intervals.length : 0;
      const resolutionRatio =
        period > 0 && Number.isFinite(this.clockGrain) && this.clockGrain > 0 ? period / this.clockGrain : 0;
      const timingIntervals = positive.filter((x) => x < 100);
      const resolvableIntervals = timingIntervals.filter((x) => x + 1e-6 >= this.clockGrain * 2);
      const metricPeriod = median(resolvableIntervals);
      const timingOK =
        enough &&
        !limited &&
        !bad &&
        !this.interruption &&
        period > 0 &&
        Number.isFinite(this.clockGrain) &&
        resolutionRatio >= 4 - 1e-6 &&
        duplicateShare <= 0.01 &&
        timingIntervals.length >= 50 &&
        resolvableIntervals.length >= 20;
      const consistencyOK = enough && !limited && !bad && !this.interruption;
      const liveStabilityOK =
        windows.length >= 2 && duration >= LEADING_WARMUP_MS + 300 && !bad && !this.interruption;
      const windowPeak = windows.length ? Math.max(...windows) : null;
      const canReportWindowPeak =
        windowPeak != null &&
        !bad &&
        !this.interruption &&
        count >= 30 &&
        duration >= LEADING_WARMUP_MS + 300;
      const intervalMean = mean(resolvableIntervals);
      const sd = deviation(resolvableIntervals, intervalMean);
      const liveJitterOK =
        resolvableIntervals.length >= 8 && intervalMean > 0 && !bad && !this.interruption;
      let status = !count ? "waiting" : !enough ? "short" : limited ? "limited" : "sufficient";
      if (bad) status = "invalid";
      if (this.interruption) status = "interrupted";
      const value = {
        version: VERSION,
        status,
        frameLimited,
        source: this.source,
        count,
        duration,
        expanded: this.expanded,
        interruption: this.interruption,
        clockGrain: this.clockGrain,
        frameMs,
        phaseConcentration,
        equalTimestamps: this.equal,
        duplicateShare,
        resolutionRatio,
        deliveryGapCount,
        intervalTiming: timingOK ? "available" : "limited",
        invalid: this.invalid,
        avgRate,
        avgInterval: avgRate > 0 ? 1000 / avgRate : null,
        peakRate: canReportWindowPeak ? windowPeak : null,
        jitter: timingOK || liveJitterOK ? (sd / intervalMean) * 100 : null,
        jitterMs: timingOK || liveJitterOK ? sd : null,
        deviation: timingOK ? sd : null,
        stability: consistencyOK || liveStabilityOK ? Math.max(0, 100 * (1 - windowCV)) : null,
        lowRate: consistencyOK ? Math.min(...windows) : null,
        gaps: timingOK ? resolvableIntervals.filter((x) => x > metricPeriod * 3).length : null,
        period: timingOK ? metricPeriod : null,
        intervals: timingOK ? resolvableIntervals.slice(-180) : [],
        rates: windows.slice(-180),
        windowCount: windows.length
      };
      this.cached = { at: now, value };
      return value;
    }
  }
  root.MprPollingEngine = { Capture, VERSION, WINDOW_MS };
})(typeof globalThis !== "undefined" ? globalThis : window);