// Saves a DuckDB secret that names this project in the User-Agent of requests to the store, as Stillwell asks.
// Notebook Kit opens a new DuckDB for each build-time query, so the secret is persistent. The npm scripts point HOME
// at notebooks/.observable/home, which keeps it, and DuckDB's extensions, out of your own home directory.
import { DuckDBInstance } from "@duckdb/node-api";

const instance = await DuckDBInstance.create();
const connection = await instance.connect();
await connection.run(`CREATE OR REPLACE PERSISTENT SECRET stillwell (
  TYPE http,
  SCOPE 'https://stillwell.openwaters.io/',
  EXTRA_HTTP_HEADERS MAP {'User-Agent': 'stillwell-notebooks/1.0 (https://github.com/openwatersio/stillwell-notebooks)'}
)`);
connection.disconnectSync();
instance.closeSync();
