# Geoktimonas API Worker (Cloudflare D1)

## 1) Configure
- Create D1 database:
  - `npx wrangler d1 create geoktimonas-db`
- Copy returned `database_id` into `wrangler.toml`.

## 2) Apply schema
- Local:
  - `npx wrangler d1 execute geoktimonas-db --local --file=schema.sql`
- Remote:
  - `npx wrangler d1 execute geoktimonas-db --remote --file=schema.sql`

## 3) Run locally
- `npx wrangler dev`

## 4) Deploy
- `npx wrangler deploy`

## API
- `GET /api/health`
- `GET /api/parcels?user_id=<id>`
- `POST /api/parcels` with JSON body including `user_id`
- `DELETE /api/parcels/:id?user_id=<id>`
