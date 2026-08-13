// objectPool.js — Design Pattern #7: Object Pool
//
// Recycles short-lived, identically-shaped objects to avoid per-tick
// allocation and GC churn in the match hot loop. The engine emits a handful of
// log entries every iteration; parsing them into typed events was allocating a
// fresh object per entry per tick. A pool lets `emitLogEvents` acquire → fill →
// emit → release the same objects over and over.
//
// Safety contract (important): pooled objects MUST NOT be retained across the
// acquire/release cycle. Consumers read them synchronously and release them
// before the next acquire. The one place this is used (emitLogEvents) emits on
// a synchronous bus, so the objects are released only after every subscriber
// has finished reading them.
//
// Public API:
//   createObjectPool({ create, reset, initialSize }) → {
//     acquire()   → an object (from the free list, or freshly created)
//     release(o)  → reset + return an object to the free list
//     clear()     → drop all pooled objects
//     size        → free-list length
//     allocated   → total objects ever created (for diagnostics)
//   }

export function createObjectPool({ create, reset, initialSize = 0 }) {
  if (typeof create !== 'function') {
    throw new TypeError('createObjectPool requires a create() factory');
  }
  const free = [];
  let allocated = 0;

  for (let i = 0; i < initialSize; i++) {
    free.push(create());
    allocated++;
  }

  return {
    acquire() {
      if (free.length > 0) return free.pop();
      allocated++;
      return create();
    },
    release(obj) {
      if (obj == null) return;
      if (reset) reset(obj);
      free.push(obj);
    },
    clear() {
      free.length = 0;
      allocated = 0;
    },
    get size() {
      return free.length;
    },
    get allocated() {
      return allocated;
    },
  };
}
