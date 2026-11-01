# Planet texture provenance

All three images are NASA imagery, public domain (no copyright in the U.S.); NASA asks for credit, which the app
shows in its Credits sheet. Resized to 4096×2048 (`-4k`, desktop) and 2048×1024 (`-2k`, phones) with macOS `sips`
on Nov 1, 2026. Not edited otherwise.

| File | Source |
| --- | --- |
| `day-*.jpg` | NASA Earth Observatory, Blue Marble: Next Generation, July 2004 (Reto Stöckli, NASA GSFC). <https://visibleearth.nasa.gov/images/74092> (`world.200407.3x5400x2700.jpg`) |
| `night-*.jpg` | NASA Earth Observatory, Black Marble 2016 (Joshua Stevens, Miguel Román, NASA GSFC). <https://earthobservatory.nasa.gov/features/NightLights> (`BlackMarble_2016_3km.jpg`) |
| `stars-*.jpg` | NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020. Gaia DR2: ESA/Gaia/DPAC. <https://svs.gsfc.nasa.gov/4851> (`starmap_2020_4k.exr`, tone-mapped to JPEG). Equirectangular in celestial coordinates (right ascension, declination). |

The day texture is a fixed cloud-free composite and the night texture a 2016 composite: neither is live imagery. Only
the sunlight direction is live (computed from the clock in `src/lib/sun.ts`).
