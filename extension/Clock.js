function formatTime(time) {
  if (time < 0 || time == null) {
    return '0:00';
  }

  const msCount = (time % 1000) / 1000;
  const ms = msCount.toString().slice(2, 2);
  const secs = Math.floor(time / 1000);
  const mins = Math.floor(secs / 60);

  const m = mins % 60;
  let s = secs % 60;
  s = s < 10 ? `0${s}` : s;

  const formatted = `${m}:${s}`;
  return formatted;
}

class Clock {
  constructor(initialTime) {
    this.time = initialTime;
    this.tickListeners = [];
    this.timer = null;
  }

  onTick(callback) {
    this.tickListeners.push(callback);
  }

  formattedTime() {
    return formatTime(this.time);
  }

  start() {
    if (this.time <= 0) {
      this.tickListeners.forEach(listener => listener(0));
      return;
    }

    const interval = Math.min(100, this.time);
    this.timer = setTimeout(() => {
      this.time = Math.max(this.time - 100, 0);
      this.tickListeners.forEach(listener => listener(this.time));
      this.start.bind(this)();
    }, interval);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  destroy() {
    this.time = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
