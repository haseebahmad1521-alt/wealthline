# Planet texture provenance

The images are NASA imagery, public domain (no copyright in the U.S.); NASA asks for credit, which the app
shows in its Credits sheet. Resized to 4096×2048 (`-4k`, desktop) and 2048×1024 (`-2k`, phones) with macOS `sips`
on Nov 1, 2026, plus an optional 8192×4096 tier (`-8k`, day and night only, Nov 2, 2026) that the app loads only on
capable devices once the scene runs smoothly. Not edited otherwise. The `day-8k` file comes from NASA's
21600×10800 version of the same image (`world.200407.3x21600x10800.jpg`).

| File | Source |
| --- | --- |
| `day-*.jpg` | NASA Earth Observatory, Blue Marble: Next Generation, July 2004 (Reto Stöckli, NASA GSFC). <https://visibleearth.nasa.gov/images/74092> (`world.200407.3x5400x2700.jpg`) |
| `night-*.jpg` | NASA Earth Observatory, Black Marble 2016 (Joshua Stevens, Miguel Román, NASA GSFC). <https://earthobservatory.nasa.gov/features/NightLights> (`BlackMarble_2016_3km.jpg`) |
| `milkyway-2k.jpg` | NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020. Gaia DR2: ESA/Gaia/DPAC. <https://svs.gsfc.nasa.gov/4851> (`starmap_2020_4k.exr`, tone-mapped to JPEG). Equirectangular in celestial coordinates (right ascension, declination). Nov 2, 2026: downsampled to 2048×1024 and median-filtered (5×5) so only the Milky Way's glow remains; the point stars are drawn from `stars.bin`. |
| `stars.bin` | Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991; CDS V/50, mirrored at <http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz>), public domain. 9,096 stars: J2000 position, V magnitude and B−V colour, packed by `scripts/build-stars.mjs`. |

The day texture is a fixed cloud-free composite and the night texture a 2016 composite: neither is live imagery. Only
the sunlight direction is live (computed from the clock in `src/lib/sun.ts`).
