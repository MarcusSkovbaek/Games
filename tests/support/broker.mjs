// Local MQTT broker (Aedes) speaking MQTT-over-WebSocket, used by unit and E2E tests so the
// sync layer is exercised against a real, spec-compliant broker implementation.
import { createRequire } from 'node:module';
import { WebSocketServer, createWebSocketStream } from 'ws';

const require = createRequire(import.meta.url);
const aedesFactory = require('aedes');

export async function startBroker({ port = 0 } = {}) {
  const aedes = aedesFactory();
  const sockets = new Set();
  const wss = new WebSocketServer({
    port,
    handleProtocols: (protocols) => (protocols.has('mqtt') ? 'mqtt' : false),
  });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    const stream = createWebSocketStream(ws);
    stream.on('error', () => {});
    aedes.handle(stream);
  });
  await new Promise((resolve) => wss.on('listening', resolve));
  const actualPort = wss.address().port;
  return {
    port: actualPort,
    url: `ws://127.0.0.1:${actualPort}`,
    aedes,
    // Abruptly kill every client connection (simulates network loss).
    dropClients() {
      for (const ws of sockets) ws.terminate();
    },
    async close() {
      for (const ws of sockets) ws.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => aedes.close(resolve));
    },
  };
}
