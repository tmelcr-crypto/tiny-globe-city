// Tiny event bus. Systems talk through this.
const handlers = {};
export const on = (type, fn) => (handlers[type] ||= []).push(fn);
export const emit = (type, data) => (handlers[type] || []).forEach((fn) => fn(data));
