import { gpsStorageKey, readRecordings, writeRecordings, recordingLimits, distanceMeters } from './gps-store.js';

const storageHelp = 'Recording could not be saved. Tracking is paused; keep this page open and retry Finish after making browser storage available. Use only one Trail Gauge tab. Existing data is not deleted.';
const errorText = { 1: 'Location permission denied. Allow location for this site in browser settings, then Resume.',
  2: 'Location unavailable. Move to an open area, then Resume.', 3: 'Location timed out. Check location access, then Resume.' };

export class GPSRecorder {
  constructor({ storage, geolocation, now = Date.now, id = () => crypto.randomUUID(), changed = () => {} }) {
    Object.assign(this, { storage, geolocation, now, id, changed });
    this.watch = null;
    this.generation = 0;
    this.message = '';
    this.blocked = false;
    this.breakBefore = true;
    try {
      this.saved = storage.getItem(gpsStorageKey);
      this.data = readRecordings(storage);
      if (this.data.active) {
        this.data.active.status = 'paused';
        this.event('Reload interrupted tracking. Resume explicitly; the missing interval is a gap.');
        this.message = 'Recovered paused recording. No location was collected while this page was closed.';
        this.persist();
      }
    } catch (error) {
      this.data = { version: 1, active: null, hikes: [] };
      this.blocked = true;
      this.message = 'Recording storage unavailable or unreadable. Existing data is untouched. Restore browser storage access and reload. ' + error.message;
      console.error('GPS recording storage read failed', error);
    }
  }

  event(text) {
    const events = this.data.active?.events;
    if (events && events.at(-1)?.text !== text && events.length < 200) events.push({ at: this.now(), text });
  }

  stopWatch() {
    this.generation++;
    if (this.watch !== null) this.geolocation?.clearWatch(this.watch);
    this.watch = null;
    this.breakBefore = true;
  }

  persist() {
    try { this.write(this.data); return true; }
    catch (error) {
      this.stopWatch();
      if (this.data.active) { this.data.active.status = 'paused'; this.event(storageHelp); }
      this.message = storageHelp;
      console.error('GPS recording storage write failed', error);
      return false;
    }
  }

  write(next) {
    if (this.storage.getItem(gpsStorageKey) !== this.saved) {
      throw Error('Recording data changed in another tab. Reload after finishing in the other tab; no data was overwritten.');
    }
    writeRecordings(this.storage, next);
    this.saved = JSON.stringify(next);
  }

  start(consent) {
    if (!consent) { this.message = 'Check the consent box before pressing Start.'; this.changed(); return; }
    if (this.blocked || this.data.active) return;
    if (this.data.hikes.length >= recordingLimits.hikes) {
      this.message = 'This browser holds 20 recordings. Explicitly delete a completed recording before starting another.';
      this.changed(); return;
    }
    this.data.active = { id: this.id(), startedAt: this.now(), status: 'paused',
      source: this.geolocation?.simulation === true ? 'simulation' : 'device', points: [], events: [] };
    this.event('Explicit consent given for foreground location recording.');
    if (this.persist()) this.resume();
    else this.changed();
  }

  resume() {
    const hike = this.data.active;
    if (!hike || this.blocked || hike.status === 'recording') return;
    if (this.limitReached()) return;
    if (!this.geolocation) {
      this.message = 'Geolocation unavailable. Use a supported browser and HTTPS (or this computer’s localhost). No tracking started.';
      this.event(this.message); this.persist(); this.changed(); return;
    }
    hike.status = 'recording';
    this.resumedAt = this.now();
    this.message = 'Waiting for an accurate GPS fix. Keep this screen open and unlocked.';
    this.event('Tracking started or resumed; a new route segment begins.');
    if (!this.persist()) { this.changed(); return; }
    const generation = ++this.generation;
    try {
      const watch = this.geolocation.watchPosition(position => {
        if (generation === this.generation) this.position(position);
      }, error => {
        if (generation === this.generation) this.pause(errorText[error.code] ?? 'Location failed. Check browser location settings, then Resume.');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      // Some test adapters can invoke callbacks synchronously.
      if (generation === this.generation) this.watch = watch;
      else this.geolocation.clearWatch(watch);
    } catch (error) {
      console.error('GPS watch failed', error);
      this.pause('Location could not start. Check secure connection and browser location access, then Resume.');
    }
    this.changed();
  }

  limitReached() {
    const hike = this.data.active;
    if (!hike) return false;
    if (this.now() - hike.startedAt >= recordingLimits.hours * 3600000 || hike.points.length >= recordingLimits.points) {
      this.pause('Demo limit reached (4 hours or 7,200 accepted points). Finish this recording.');
      return true;
    }
    return false;
  }

  position(position) {
    const hike = this.data.active;
    if (hike?.status !== 'recording' || this.limitReached()) return;
    const { latitude: lat, longitude: lon, accuracy } = position.coords ?? {};
    const at = position.timestamp;
    const previous = hike.points.at(-1);
    if (![lat, lon, accuracy, at].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || accuracy < 0
      || accuracy > recordingLimits.accuracy || at < this.resumedAt || at > this.now() + 5000 || this.now() - at > recordingLimits.gap
      || (previous && at <= previous.at)) {
      this.breakBefore = true;
      this.message = 'Low-quality or stale GPS fix omitted. Accuracy must be within 100 m; no distance is bridged across missing fixes.';
      this.event(this.message); this.persist(); this.changed(); return;
    }
    const point = { lat, lon, accuracy, at, breakBefore: this.breakBefore || !previous || at - previous.at > recordingLimits.gap };
    if (previous && !point.breakBefore && distanceMeters(previous, point) / ((at - previous.at) / 1000) > 15) {
      this.breakBefore = true;
      this.message = 'Implausible GPS jump omitted. Next accepted fix starts a new segment.';
      this.event(this.message); this.persist(); this.changed(); return;
    }
    if (point.breakBefore && previous) this.event('GPS gap: distance is not connected across this interval.');
    hike.points.push(point);
    this.breakBefore = false;
    this.message = `Tracking • latest reported accuracy ±${Math.round(accuracy)} m. GPS distance is approximate, not a safety or navigation tool.`;
    this.persist(); this.changed();
  }

  pause(reason = 'Paused by you. Resume explicitly when ready.') {
    const hike = this.data.active;
    if (!hike) return;
    this.stopWatch(); hike.status = 'paused';
    this.message = reason; this.event(reason); this.persist(); this.changed();
  }

  checkFreshness() {
    const hike = this.data.active;
    if (hike?.status !== 'recording' || this.limitReached()) return;
    if (this.now() - (hike.points.at(-1)?.at ?? hike.startedAt) > recordingLimits.gap) {
      this.breakBefore = true;
      this.message = 'GPS gap: no recent accepted fix. Distance is incomplete; keep the screen open or Pause.';
      this.event(this.message); this.persist(); this.changed();
    }
  }

  finish() {
    const hike = this.data.active;
    if (!hike) return false;
    this.stopWatch(); hike.status = 'paused';
    const completed = { ...hike, status: 'finished', finishedAt: this.now() };
    const next = { ...this.data, active: null, hikes: [...this.data.hikes, completed] };
    try { this.write(next); }
    catch (error) {
      this.message = storageHelp; this.event(storageHelp);
      console.error('GPS finish save failed', error); this.changed(); return false;
    }
    this.data = next; this.message = 'Completed recording saved privately in this browser.';
    this.changed(); return true;
  }

  deleteHike(id) {
    const next = { ...this.data, hikes: this.data.hikes.filter(hike => hike.id !== id) };
    try { this.write(next); }
    catch (error) {
      this.message = 'Deletion could not be saved. The recording remains; restore browser storage access and retry.';
      console.error('GPS deletion save failed', error); this.changed(); return false;
    }
    this.data = next; this.message = 'Selected recording deleted from this browser.'; this.changed(); return true;
  }
}
