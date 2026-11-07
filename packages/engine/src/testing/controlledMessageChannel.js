/** Deterministic MessagePort queues with real ArrayBuffer transfer semantics. */
export function createControlledMessageChannel() {
  const ports = [{ queue: [] }, { queue: [] }];
  for (const [index, port] of ports.entries()) {
    port.closed = false;
    port.onmessage = null;
    port.start = () => {};
    port.close = () => {
      port.closed = true;
      port.queue.length = 0;
    };
    port.postMessage = (message, transfer = []) => {
      const value = structuredClone(message, { transfer });
      if (!port.closed && !ports[1 - index].closed)
        ports[1 - index].queue.push(value);
    };
    port.flush = () => {
      while (!port.closed && port.onmessage && port.queue.length)
        port.onmessage({ data: port.queue.shift() });
    };
  }
  return { port1: ports[0], port2: ports[1] };
}
