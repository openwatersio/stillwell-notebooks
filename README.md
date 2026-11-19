# Stillwell notebooks

[Observable](https://observablehq.com/notebook-kit/) notebooks that read [Stillwell](https://openwatersio.github.io/stillwell/docs/), Open Waters' store of water levels. Each notebook runs its queries with DuckDB in the reader's browser, against the live files at `https://stillwell.openwaters.io/`.

They're published at https://openwatersio.github.io/stillwell-notebooks/.

## Add a notebook

1. Add an HTML file to [notebooks/](notebooks/) in [Notebook Kit's format](https://observablehq.com/notebook-kit/): a `<notebook>` element with a `<title>` and one `<script>` per cell. [getting-started.html](notebooks/getting-started.html) is an example.
2. Open it in a pull request. The [Pages workflow](.github/workflows/pages.yml) builds it, and deploys it once it's merged.

The file name is the notebook's address: `notebooks/tides.html` publishes at `/stillwell-notebooks/tides.html`. The index lists every notebook by its `<title>`. [index.js](index.js) writes it on every build, so don't edit `notebooks/index.html`.

Cells read the store through a DuckDB client with ranged reads, so a query fetches only the parts of a file it needs:

```js
const db = await DuckDBClient.of({}, { filesystem: { forceFullHTTPReads: false } });
```

Without `forceFullHTTPReads: false`, Notebook Kit downloads each file whole. Each query opens its own connection, so settings need `SET GLOBAL`. Results are Arrow tables, with times as milliseconds since 1970.

## Preview and build

```bash
npm install
npm run preview
```

`npm run preview` serves the notebooks and reloads them on change. `npm run build` writes the site to `dist/`.

Don't format the notebooks with Prettier. It ends expression cells such as `table(found)` with a semicolon, which turns them into statements that display nothing.
