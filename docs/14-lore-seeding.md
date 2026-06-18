# 14 — Lore Seeding

Lore seeding is an optional onboarding step that imports a JSONL dataset through
the review pipeline as a background job (`LORE_SEED`). When a compatible dataset
is available, a "seed with official lore" checkbox appears on the New Crawl form.
The job runs in the worker process and lands entities as auto-approved change sets.
The checkbox is hidden when no dataset is present — the server checks for the file
before rendering the form.

> **Roadmap scope.** This is a **shipped onboarding** feature (the `LORE_SEED`
> job + New Crawl checkbox; see [`PROGRESS.md`](./PROGRESS.md), 2026-06-13), driven
> by a **DM-supplied** JSONL file. It is *distinct from* the **M10 shared canon
> library** ([`11-roadmap.md`](./11-roadmap.md)), which will ship importable,
> first-party canonical DCC content (the 18 floors, common mob types, archetypes)
> as reviewable `IMPORT` change sets. Lore seeding is the bring-your-own,
> available-now half; M10 is the curated-library half. Both import through the
> same review pipeline.

## Legal note

The official Dungeon Crawler Carl dataset is copyrighted by its author and is
**intentionally not distributed with this project**. You must bring your own
dataset. The schema below is generic — any JSONL file conforming to it works.

## File format

The dataset is a JSON Lines file (`.jsonl`): one JSON object per line, no trailing
commas, UTF-8 encoded.

```
{ "text": "#<Name>\n<markdown body...>", "meta": "<source reference>" }
```

- The `text` field must start with `#<Name>` on the first line (the entity name).
  Lines that do not start with `#` are skipped.
- The rest of `text` is the body used for entity classification and
  summary/description extraction.
- `meta` is a free-form string (URL, chapter ref, etc.) stored as provenance.

### Synthetic example (no copyrighted text)

```jsonl
{"text": "#Rusty Dagger\nis an item. A worn iron blade, +1 to attack.", "meta": "example"}
{"text": "#Goblin Scout\nis a mob. A small green skirmisher found on early floors.", "meta": "example"}
{"text": "#Iron Vault\nis a location. A reinforced room used as a safe resting point.", "meta": "example"}
```

Save this as `dungeon-crawler-carl.jsonl` (or point `LORE_SEED_FILE` at it) to
verify your setup without any real lore content.

## Where to put the file

### Default path

Place the file at the repo/app root as `dungeon-crawler-carl.jsonl`. The app and
worker both look for `<process.cwd()>/dungeon-crawler-carl.jsonl` by default.

### Custom path via environment variable

Set `LORE_SEED_FILE` to an absolute path **inside the container** to use a
different filename or location:

```
LORE_SEED_FILE=/data/my-lore-dataset.jsonl
```

## Docker / container setup

Both the `app` and `worker` services must have access to the file. The
`docker-compose.yml` includes commented-out volume mounts on both services — opt
in by uncommenting them:

```yaml
# In docker-compose.yml, under the `app` service:
volumes:
  - ./dungeon-crawler-carl.jsonl:/app/dungeon-crawler-carl.jsonl:ro

# And the same block under the `worker` service.
```

The mount is **commented out by default** because podman (and Docker) will error
or create an empty directory if the host file does not exist.

### Raw `docker run` example

```sh
docker run \
  -v "$PWD/dungeon-crawler-carl.jsonl:/app/dungeon-crawler-carl.jsonl:ro" \
  -e DATABASE_URL="..." \
  crawldirector-app
```

For a custom path inside the container:

```sh
docker run \
  -v "$PWD/my-lore.jsonl:/app/my-lore.jsonl:ro" \
  -e LORE_SEED_FILE=/app/my-lore.jsonl \
  -e DATABASE_URL="..." \
  crawldirector-app
```

Run the same mount on the worker container — it processes the job and needs to
read the file too:

```sh
docker run \
  -v "$PWD/dungeon-crawler-carl.jsonl:/app/dungeon-crawler-carl.jsonl:ro" \
  -e DATABASE_URL="..." \
  crawldirector-worker npm run worker
```
