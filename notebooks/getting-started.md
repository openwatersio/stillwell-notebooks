# Getting started with Stillwell

[Stillwell](https://openwatersio.github.io/stillwell/docs/) by [Open Waters](https://openwaters.io) is an open store of observed and predicted water levels from tide, river and lake gauges around the world. The data is published at `https://stillwell.openwaters.io/` as Parquet files (tables stored by column) and JSON files (metadata). You do not need an account or a local database.

The queries in this notebook run against the live store each day when the page is built, and the page loads with their results. These results are from ${stats.date.toISOString().slice(0, 10)}. The station search runs in your browser.

## Set up DuckDB

`db` runs the station search in your browser with DuckDB-WASM. Ranged reads let it request parts of a file instead of downloading the whole file. We set the time zone to UTC so queries group dates consistently. The other queries ran with DuckDB, also in UTC, when the page was built.

The `table` helper displays query results. Charts use Observable Plot.

```js pinned
// Create a DuckDB client with ranged reads enabled
const db = await DuckDBClient.of({}, { filesystem: { forceFullHTTPReads: false } });
// All times are UTC
await db.query("SET GLOBAL TimeZone = 'UTC'");

// Shows results as a table, with years written without a thousands separator.
const table = (data) => Inputs.table(data, { format: { year: String, first: String, last: String } });
```

## Stations

```html
<style>
  .station-stat:empty::before { content: "…"; }
  .station-map:empty {
    aspect-ratio: 2.05;
    display: grid;
    place-items: center;
    background: light-dark(#eaf4f8, #172b36);
    border-radius: 8px;
  }
  .station-map:empty::before { content: "Loading station map…"; }
</style>
```

```sql output=mapStations database=duckdb hidden pinned
SELECT id, name, round(lat, 2) AS lat, round(lon, 2) AS lon
FROM 'https://stillwell.openwaters.io/stations.parquet'
WHERE id = preferred
```

```sql output=stats database=duckdb hidden pinned
SET VARIABLE files = (
  SELECT list(DISTINCT 'https://stillwell.openwaters.io/stations/years/' || source || '.parquet')
  FROM 'https://stillwell.openwaters.io/stations.parquet'
  WHERE first IS NOT NULL
);
SELECT (SELECT count(*) FROM 'https://stillwell.openwaters.io/stations.parquet') AS stations,
  (SELECT count(*) FROM read_json('https://stillwell.openwaters.io/sources.json')) AS sources,
  sum(coalesce(good, 0) + coalesce(interpolated, 0) + coalesce(preliminary, 0) + coalesce(suspect, 0)
    + coalesce(bad, 0))::DOUBLE AS observations,
  min(year) AS first
FROM read_parquet(getvariable('files'), union_by_name = true)
```

```js hidden
const topojson = await import("https://esm.sh/topojson-client@3.1.0");
const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json");
const land = topojson.feature(world, world.objects.land);
```

Stillwell contains [<span class="station-stat">${stats[0].stations.toLocaleString("en-US")}</span> stations](https://openwatersio.github.io/stillwell/docs/guides/stations/) from [<span class="station-stat">${stats[0].sources}</span> sources](https://openwatersio.github.io/stillwell/docs/sources/), with [<span class="station-stat">${(stats[0].observations / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })}</span> billion observations](https://openwatersio.github.io/stillwell/docs/reference/observations/) going back to <span class="station-stat">${stats[0].first}</span>. These totals are calculated from the published station catalog and the observation inventory of each source with observations.

The map shows only records where `id = preferred`, keeping one record from each group of linked stations. The totals above include all records. Some stations have no observations yet. Hover over a dot to see its name and ID.

The files use a common layout, with [quality flags](https://openwatersio.github.io/stillwell/docs/guides/quality-control/) and, where available, offsets between [reference heights (datums)](https://openwatersio.github.io/stillwell/docs/guides/datums/).

```sql output=mapCredits database=duckdb hidden pinned
SELECT DISTINCT attribution
FROM 'https://stillwell.openwaters.io/stations.parquet'
WHERE id = preferred AND attribution <> ''
ORDER BY attribution
```

```html
<div class="station-map" role="status" aria-live="polite">${Plot.plot({
  width,
  projection: "equal-earth",
  ariaLabel: "World map of Stillwell stations",
  marks: [
    Plot.sphere({ fill: "#eaf4f8", stroke: "#adbcc5" }),
    Plot.geo(land, { fill: "#d5ddd5" }),
    Plot.dot(mapStations, {
      x: "lon", y: "lat", r: 1.8, fill: "#167a9b", fillOpacity: 0.6,
      title: (d) => `${d.name}\n${d.id}`, tip: true
    })
  ]
})}</div>
<details>
  <summary>Credits for the stations on this map (${mapCredits.length.toLocaleString("en-US")})</summary>
  <ul>${mapCredits.map((d) => html`<li>${d.attribution}</li>`)}</ul>
</details>
```

### Find a station

Each row in `stations.parquet` describes a station record. Enter all or part of a name and select **Submit**. The search ignores capitalization.

Changing this search updates the results below. The later examples still use `rws/hoekvanholland`.

```js
const name = view(Inputs.text({ label: "Name", value: "hoek van holland", submit: true }));
```

```js
table(found)
```

```sql output=found database=var:db hidden pinned
SELECT id, name, products, year(first) AS first, year(last) AS last, attribution
FROM 'https://stillwell.openwaters.io/stations.parquet'
WHERE name ILIKE ${`%${name}%`} AND id = preferred
ORDER BY id
```

- `id` names the station everywhere in the store. It's the source's ID, then the station's ID within it: `rws/hoekvanholland` is Rijkswaterstaat's Hoek van Holland gauge.
- `id = preferred` keeps one station from each group of linked stations. Several sources can publish the same gauge, and `preferred` names the one to read for its measured levels; [Stations](https://openwatersio.github.io/stillwell/docs/guides/stations/) explains how it's chosen. Leave the filter out to see every copy.
- `products` lists what the station has: measured `levels`, measured high and low waters (`extremes`), and the source's tide `predictions` and `predicted_extremes`.
- `first` and `last` show the first and last years of its record. They do not mean every year in between has data.

`ILIKE` matches the name without regard to capitalization; `%` matches any surrounding text. The <code>$\{…}</code> expression passes the search text to SQL as a parameter.

### Find stations by location

This query finds five stations near latitude 51.98° N, longitude 4.12° E. `lat` and `lon` are coordinates in degrees; `km` is an approximate distance. This local approximation is not suitable for distances across the world.

```js
table(nearest)
```

```sql output=nearest database=duckdb hidden pinned
SELECT id, name, kind, status, lat, lon,
  round(111.2 * sqrt((lat - 51.98) ^ 2 + ((lon - 4.12) * cos(radians(51.98))) ^ 2), 1) AS km,
  attribution
FROM 'https://stillwell.openwaters.io/stations.parquet'
WHERE id = preferred
ORDER BY km, id LIMIT 5
```

The [station reference](https://openwatersio.github.io/stillwell/docs/reference/stations/) describes the other columns, including data availability, quality information and attribution.

## Check which years are available

Before reading observations, check which files exist. Each source has an inventory at `stations/years/<source>.parquet`. It lists observation files and counts their values by quality flag. Here are Hoek van Holland's entries from 2020 onward:

```js
table(years)
```

```sql output=years database=duckdb hidden pinned
SELECT year, hours, good, interpolated, preliminary, suspect + bad AS flagged
FROM 'https://stillwell.openwaters.io/stations/years/rws.parquet'
WHERE id = 'rws/hoekvanholland' AND year >= 2020
ORDER BY year
```

```js pinned
Plot.plot({
  x: { label: null, tickFormat: "d", interval: 1 },
  y: { label: "Values", grid: true },
  color: { legend: true, domain: ["good", "interpolated", "preliminary", "flagged"], range: ["#4c78a8", "#72b7b2", "#eeca3b", "#e45756"] },
  marks: [
    Plot.barY(
      Array.from(years).flatMap((d) => ["good", "interpolated", "preliminary", "flagged"].map((flag) => ({ year: d.year, flag, n: d[flag] }))),
      { x: "year", y: "n", fill: "flag", order: ["good", "interpolated", "preliminary", "flagged"], tip: true }
    )
  ]
})
```

`hours` counts hours with at least one value. A complete year of hourly or more frequent measurements covers 8,760 hours, or 8,784 in a leap year. A smaller count means some hours are missing or the record covers only part of the year. This count does not detect missing measurements within an hour.

**Good** values are ones the source has checked, **interpolated** ones it filled in, and **preliminary** ones it hasn't checked yet. Most recent data is preliminary. [Quality control](https://openwatersio.github.io/stillwell/docs/guides/quality-control/) explains each flag and which to keep.

## Read observed water levels

A year's file is at `obs/<id>/<year>.parquet`. Read one year, leaving out values flagged suspect or bad. Each row is one measurement with its `time`, `level_m`, `flag` and `datum`. This query sums up each day's lowest and highest level:

```sql output=levels database=duckdb hidden pinned
SELECT time::DATE AS day, min(level_m) AS low_m, max(level_m) AS high_m, count(*) AS "values"
FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet'
WHERE flag <= 2
GROUP BY day ORDER BY day
```

```js pinned
Plot.plot({
  width,
  height: 240,
  x: { label: null },
  y: { label: "Level (m, NAP)", grid: true },
  // One bar per day, so a day with no values shows as a gap.
  marks: [Plot.rectY(levels, { x: "day", interval: "day", y1: "low_m", y2: "high_m", fill: "#167a9b", tip: true })]
})
```

The chart shows each day's range of ${d3.sum(levels, (d) => d.values).toLocaleString("en-US")} values after filtering. This station reports at 10-minute intervals; missing or excluded values can leave gaps.

When reading observations:

- **Times are UTC.** DuckDB-WASM returns them as milliseconds since 1970. A `Date` made from one shows in your local time zone unless you format it in UTC, as with `toISOString()`.
- **Levels are in meters above a reference height**, called a datum. Each row names its datum. Hoek van Holland uses NAP, the Dutch national height system. [Refer them to another datum](#refer-levels-to-another-datum) below.
- **`flag <= 2`** keeps every value not flagged suspect or bad, including preliminary ones. Use the [quality flag definitions](https://openwatersio.github.io/stillwell/docs/guides/quality-control/) to decide which values suit your analysis.
- **Select only the columns you need.** With ranged reads, DuckDB then fetches only those columns.

### Read several years

To read several years, list their files and pass the list to `read_parquet`. The server can't list a folder, so a wildcard such as `obs/rws/hoekvanholland/*.parquet` doesn't work. Build the list from the years list instead, which also means you never ask for a year that doesn't exist:

```js
table(fiveYears)
```

```sql output=fiveYears database=duckdb hidden pinned
SET VARIABLE files = (
  SELECT list('https://stillwell.openwaters.io/obs/' || id || '/' || year || '.parquet' ORDER BY year)
  FROM 'https://stillwell.openwaters.io/stations/years/rws.parquet'
  WHERE id = 'rws/hoekvanholland' AND epoch = 1 AND year BETWEEN 2021 AND 2025
);
SELECT year(time) AS year, count(*) AS "values", round(avg(level_m), 3) AS mean_m,
  max(level_m) AS highest_m
FROM read_parquet(getvariable('files'), union_by_name = true)
WHERE flag <= 2
GROUP BY ALL ORDER BY year
```

`epoch = 1` selects the station's original datum period. A change in reference height starts a new period, with separate files; see [datum epochs](https://openwatersio.github.io/stillwell/docs/guides/datums/#datum-epochs) before adapting these paths to another station. `union_by_name = true` matches columns by name and fills missing columns with nulls.

The result gives each year's count, average level and highest recorded level after filtering. These summaries use the available values; they do not fill gaps.

## Refer levels to another datum

A station's `datums` column lists offsets in meters. Add an offset to express the same water level relative to another reference height. This example converts NAP levels to mean sea level (`MSL`) and lowest astronomical tide (`LAT`). An unavailable offset produces a null result.

```js
table(inDatums)
```

```sql output=inDatums database=duckdb hidden pinned
SELECT l.time::TIMESTAMP AS time, l.level_m AS nap_m,
  round(l.level_m + s.datums['MSL'], 3) AS msl_m,
  round(l.level_m + s.datums['LAT'], 3) AS lat_m
FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet' l,
  'https://stillwell.openwaters.io/stations.parquet' s
WHERE s.id = 'rws/hoekvanholland' AND l.flag <= 2
ORDER BY l.time LIMIT 5
```

${inDatums[0].lat_m == null ? "This station has no LAT offset, so `lat_m` is null." : `A level of ${inDatums[0].nap_m.toFixed(2)} m in NAP is ${inDatums[0].lat_m.toFixed(2)} m above LAT.`} [Datums](https://openwatersio.github.io/stillwell/docs/guides/datums/) explains where each offset comes from and how to convert a station whose zero has moved.

When displaying levels, include the credits in `attribution`. When using datum offsets, include `datums_attribution` too. Hoek van Holland's credits are:

```sql output=credits database=duckdb hidden pinned
SELECT attribution, datums_attribution
FROM 'https://stillwell.openwaters.io/stations.parquet'
WHERE id = 'rws/hoekvanholland'
```

${[credits[0].attribution, ...(credits[0].datums_attribution ?? [])].filter(Boolean).map((c) => `- ${c}`).join("\n")}

[Terms](https://openwatersio.github.io/stillwell/docs/guides/terms/) covers what each source asks for.

## Compare with the tide prediction

Rijkswaterstaat also publishes tide predictions for Hoek van Holland. This query matches observations and predictions at the same time, subtracts the prediction from the observation, and finds the three days in 2025 with the largest positive difference. `surge_m` names that difference in the result; it does not identify its cause.

```js
table(surgeDays)
```

```sql output=surgeDays database=duckdb hidden pinned
SELECT o.time::DATE AS day, round(max(o.level_m - p.level_m), 2) AS surge_m,
  max(o.level_m) AS highest_m
FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet' o
JOIN 'https://stillwell.openwaters.io/predictions/rws/hoekvanholland/2025.parquet' p USING (time)
WHERE o.flag <= 2
GROUP BY day ORDER BY surge_m DESC, day LIMIT 3
```

The chart shows the day with the largest difference, plus the day before and the day after:

```sql output=surge database=duckdb hidden pinned
WITH top AS (
  SELECT o.time::DATE AS day
  FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet' o
  JOIN 'https://stillwell.openwaters.io/predictions/rws/hoekvanholland/2025.parquet' p USING (time)
  WHERE o.flag <= 2
  GROUP BY day ORDER BY round(max(o.level_m - p.level_m), 2) DESC, day LIMIT 1
)
SELECT o.time::TIMESTAMP AS time, o.level_m AS measured_m, p.level_m AS predicted_m
FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet' o
JOIN 'https://stillwell.openwaters.io/predictions/rws/hoekvanholland/2025.parquet' p USING (time), top
WHERE o.flag <= 2 AND o.time >= top.day - INTERVAL 1 DAY AND o.time < top.day + INTERVAL 2 DAY
ORDER BY o.time
```

```js pinned
Plot.plot({
  width,
  height: 260,
  x: { label: null },
  y: { label: "Level (m, NAP)", grid: true },
  color: { legend: true },
  marks: [
    Plot.lineY(surge, { x: "time", y: "measured_m", stroke: () => "Measured" }),
    Plot.lineY(surge, { x: "time", y: "predicted_m", stroke: () => "Predicted", strokeDasharray: "3,2" })
  ]
})
```

The prediction and the measurements must share a datum to compare, as both do here. [Predictions](https://openwatersio.github.io/stillwell/docs/reference/predictions/) covers the predicted high and low waters too.

## Compare with earlier years

This query compares the current year's monthly average levels with averages for the same calendar months over the previous ten years. It averages the available measurements after filtering. The current month may be incomplete, and missing data can affect either average.

```js
table(months)
```

```sql output=months database=duckdb hidden pinned
SET VARIABLE files = (
  SELECT list('https://stillwell.openwaters.io/obs/' || id || '/' || year || '.parquet' ORDER BY year)
  FROM 'https://stillwell.openwaters.io/stations/years/rws.parquet'
  WHERE id = 'rws/hoekvanholland' AND epoch = 1 AND year >= year(current_date) - 10
);
SELECT month(time) AS month,
  round(avg(level_m) FILTER (year(time) = year(current_date)), 3) AS this_year_m,
  round(avg(level_m) FILTER (year(time) < year(current_date)), 3) AS previous_10_years_m
FROM read_parquet(getvariable('files'), union_by_name = true)
WHERE flag <= 2
GROUP BY ALL ORDER BY month
```

```js pinned
Plot.plot({
  x: { label: "Month", ticks: 12 },
  y: { label: "Mean level (m, NAP)", grid: true },
  color: { legend: true },
  marks: [
    Plot.lineY(months, { x: "month", y: "previous_10_years_m", stroke: () => "Previous 10 years", marker: true }),
    Plot.lineY(months, { x: "month", y: "this_year_m", stroke: () => "This year", marker: true })
  ]
})
```

## Further reading

- [Sources](https://openwatersio.github.io/stillwell/docs/sources/) for where the data comes from and the terms it comes under.
- [Stations](https://openwatersio.github.io/stillwell/docs/guides/stations/), [Datums](https://openwatersio.github.io/stillwell/docs/guides/datums/) and [Quality control](https://openwatersio.github.io/stillwell/docs/guides/quality-control/) for what the values mean.
- [Stations](https://openwatersio.github.io/stillwell/docs/reference/stations/) and [Observations](https://openwatersio.github.io/stillwell/docs/reference/observations/) for every column in the store.
