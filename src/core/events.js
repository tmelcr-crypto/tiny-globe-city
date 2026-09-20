// Tiny event bus. Systems talk through this.
const handlers = {};

// Returns a function that takes the handler off again — a system that can be
// torn down (or a test that builds one per case) needs that.
export const on = (type, fn) => {
  (handlers[type] ||= []).push(fn);
  return () => {
    const list = handlers[type];
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  };
};

export const emit = (type, data) => (handlers[type] || []).slice().forEach((fn) => fn(data));
