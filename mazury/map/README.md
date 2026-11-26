# Lake Niegocin map data

The map uses Poland's projected EPSG:2180 grid. It covers 10.2 × 11.1 km at 3 metres per source raster pixel. Its northwest corner is easting 677400 m and northing 690500 m. The lakes, islands, woodland, arable fields, meadows, wetlands, roads and building footprints come from the Giżycko County BDOT10k archive dated 31 December 2023. Niegocin's source polygon covers 24.20 km² and contains two islands. The chart preserves the original traced rings, including both island holes. [WODGiK county archive](https://wodgik.warmia.mazury.pl/bdot10k.php) · [GUGiK BDOT10k](https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/)

Relief comes from the fully populated GUGiK NMT coverage in the PL-KRON86-NH vertical datum. The export samples it on a 10 m grid, resamples it to the game grid, and stores height in 0.5 m steps for Niegocin. The exporter widens the encoding step when a taller elevation range requires it. The game interpolates the height map, then renders the ground as horizontal slices with shaded exposed faces. Trees and buildings follow the lifted ground. The whole-lake view shows the same relief with a live boat marker. The distance from shore drives the color of the shallows. Close zooms use finer terrain tiles and show ground cover such as reeds and meadow flowers. [GUGiK NMT](https://www.geoportal.gov.pl/en/data/digital-elevation-model-dem/)

## Regenerate

1. Download the [Giżycko County archive](https://wodgik.warmia.mazury.pl/map/pliki/public.php?plik=2806_gizycki.zip), unpack the nested `2806_GPKG.zip`, and put its GeoPackages in one directory.
2. Download the [Niegocin elevation grid from GUGiK](https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=DTM_PL-KRON86-NH&CRS=EPSG%3A2180&RESPONSE_CRS=EPSG%3A2180&BBOX=677400,679400,687600,690500&WIDTH=1020&HEIGHT=1110&FORMAT=AAIGRID).
3. Run the exporter with Python, NumPy, Pillow, Rasterio, SciPy, and Shapely.

   ```sh
   python3 mazury/map/build-map.py /path/to/gizycko-geopackages /path/to/elevation.asc
   ```

The exporter writes `survey.js` with the map bounds, surveyed water rings and settlement coordinates. It also writes `terrain.png`. Its red, green and blue channels encode the land-cover class, elevation and unsigned distance to the closest water or land cell respectively. Class 20 denotes water. The renderer and boat collision read the same raster. The browser needs only the checked-in assets.

`buildings.js` records locations, approximate footprint dimensions, headings, and storey counts from BDOT10k within 720 survey metres of mapped lakes. The sailing view shows a selection of these sites as sprite stacks. Larger footprints take priority where sites crowd each other on the compressed map. A building appears only if its full rotated footprint, a 0.75 m foundation margin, and its projected roof clear the playable waterline. Cottage and boathouse finishes are illustrative.

## Ekomarina detail

The first playable harbour uses a manually traced shoreline from a 0.5 m per pixel Geoportal orthophoto export. The crop is 1,500 × 1,100 pixels and its EPSG:2180 bounds are 681050, 688550 to 681800, 689100. The polygons in [harbor.js](../harbor.js) drive collision inside the crop and replace the shoreline in the terrain renderer around Ekomarina, including removing the raster footprints of the former quays and piers. The rendering sampler evaluates the vector contour at the waterline and interpolates signed distance farther back. The marina overlays the three pontoons, quay, and shore-clipped apron on that same terrain. The 12 × 4.5 m marked practice berth and dashed approach are gameplay guides placed on that geometry. [Geoportal orthophotomap](https://www.geoportal.gov.pl/en/data/orthophotomap-orto/) · [Giżycko municipal orthophoto annex](https://bip-v1-files.idcom-jst.pl/sites/3080/wiadomosci/801600/files/uchwaa_nr_6_-_23.01.2025_r..pdf)

## Playable distance

The chart uses source coordinates. The world uses [a radial projection](../lake-world.js) that preserves metres around Ekomarina, blends across two short bands, and compresses outer radial distances by 18:1. The terrain sampler and shoreline collision share the inverse projection. The 320 m harbour circle is one-to-one, so the yacht, berths and walking surfaces retain their dimensions. The outer ratio describes radial distances. Whole routes include the harbour and the transition bands.

## Ground relief

[relief.js](../relief.js) sets the vertical projection and slice height. The renderer uses 0.75 m elevation slices and tapers the lift to zero at the waterline. These controls affect the appearance, while navigation and harbour geometry work on the surveyed horizontal plane. Niegocin's mapped land rises to around 164 m above sea level. It has low hills, and the renderer accepts higher terrain on a height map with a larger range.
