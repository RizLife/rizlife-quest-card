import { createServer } from 'node:http';
import { config } from './src/server/config.mjs';
import { handleRequest } from './src/server/app.mjs';

createServer(handleRequest).listen(config.port, () => {
  console.log(`RizLife running on port ${config.port}`);
});
