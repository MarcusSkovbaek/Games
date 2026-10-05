// `npm run dev`: serves the repo and runs a local MQTT broker, so the app can be tried on
// several browser tabs (or phones on the same network via --host) without public brokers.
import { startStatic } from './static.mjs';
import { startBroker } from './broker.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const web = await startStatic({ root, port: Number(process.env.PORT) || 5173 });
const broker = await startBroker({ port: Number(process.env.BROKER_PORT) || 9001 });
console.log(`SKÅL dev server:  ${web.url}/skaal/?broker=${encodeURIComponent(broker.url)}`);
console.log('(Without ?broker=… the app uses the public brokers from skaal/js/config.js.)');
