# Photographs

This folder holds every photograph the application shows, served as-is by Vite at `/img/...`.

It is filled by `node scripts/fetch-assets.mjs` (also run by `start.bat`, `verify.bat` and
`capture-screenshots.bat`) from the licensed sources recorded in `../../assets.manifest.json` —
Pexels and Unsplash, both free for commercial use without attribution. Each entry in the manifest
says what the picture depicts and which record it stands for; every one was opened and checked
against that record before it was listed.

Layout:

- `venue/hero.jpg` — the room: login backdrop, the rail's venue card, the manager/host/club banner
- `venue/main-dining.jpg`, `venue/bar-area.jpg`, `venue/vip-lounge.jpg` — the three seeded floors
- `menu/<code>.jpg` — one per seeded menu item (`st01.jpg` … `sp02.jpg`)
- `bottles/bs-jd.jpg`, `bottles/bs-gg.jpg` — the two bottle-service bottles

If a file is missing the application does not break: every picture renders through a component
with a drawn understudy (`DishArt`, `BottleArt`, `VenueArt`, `LoungeScene`).
