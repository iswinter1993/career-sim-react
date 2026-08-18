// Minimal browser-safe stand-in for the Node "events" builtin.
//
// The vendored @bleckert/football-simulator bundle starts with
//   import { EventEmitter as j } from "events"
// and its legacy `Game` class does `class Game extends EventEmitter`.
// The modern `RealTimeEngine` (the only engine the demo uses) never touches
// it, so we only need a constructor that satisfies `extends`. The basic
// methods below are stubbed just in case something is instantiated anyway.
export class EventEmitter {
  constructor() {
    this._events = Object.create(null);
  }

  on(event, listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    wrapper.listener = listener;
    return this.on(event, wrapper);
  }

  off(event, listener) {
    const list = this._events[event];
    if (!list) return this;
    this._events[event] = list.filter((l) => l !== listener && l.listener !== listener);
    return this;
  }

  removeListener(event, listener) {
    return this.off(event, listener);
  }

  removeAllListeners(event) {
    if (event) delete this._events[event];
    else this._events = Object.create(null);
    return this;
  }

  emit(event, ...args) {
    const list = this._events[event];
    if (!list || !list.length) return false;
    list.slice().forEach((l) => l.apply(this, args));
    return true;
  }

  listeners(event) {
    return (this._events[event] || []).slice();
  }

  listenerCount(event) {
    return (this._events[event] || []).length;
  }
}

export default EventEmitter;
