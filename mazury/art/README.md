# Mazury sprite stacks

The boats, buildings, trees, jetty, and birds use the PNG slice sheet format described in [Making models](../../docs/making-models.md). The engine uses their horizontal cross-sections to bake rotating sprites.

## Repaint a stack

1. Edit the geometry in [templates/models.js](templates/models.js). Export it from the repository root with the upstream tool. Match the name and column count from the table.

   ```sh
   node tools/model-to-sheet.js mazury/art/templates/models.js sailboat /tmp/sailboat-template.png 5
   ```

2. Enlarge a copy of the template using nearest-neighbor scaling for ImageGen. Use the full sheet as the edit target and request actual transparency.
3. Fit the painted sheet to the template. The helper samples ImageGen's shading inside the template, keeps the opaque geometry, restricts colors to light and dark shades of each material, and saves a normalized RGBA sheet. Pass `jetty` as the last argument for the weathered cedar palette.

   ```sh
   node mazury/art/fit-sheet.js /tmp/sailboat-template.png /tmp/painted.png /tmp/sailboat-slices.png
   ```

4. Open `/examples/02-model-viewer/`, enter the slice size and column count, and drop the fitted PNG. Inspect a full turn before copying it into `art/`. The viewer reads every cell in a rectangle. Set the real slice count in the game when the grid has an unused cell.

| Asset | Slice size | Slices | Columns |
| --- | --- | --- | --- |
| Sailboat | 17 × 33 | 25 | 5 |
| Jib | 17 × 33 | 17 | 6 |
| Detailed sailboat | 43 × 99 | 75 | 15 |
| Detailed jib | 43 × 99 | 49 | 13 |
| Cottage | 21 × 29 | 19 | 6 |
| Boathouse | 36 × 31 | 24 | 6 |
| Detailed cottage | 63 × 87 | 55 | 18 |
| Detailed boathouse | 108 × 93 | 75 | 12 |
| Lakeside trees (six species) | 64 × 64 | 64 | 8 |
| Detailed lakeside trees (six species) | 192 × 192 | 192 | 16 |
| Jetty | 13 × 49 | 6 | 6 |
| Swan | 17 × 31 | 18 | 6 |
| Mallard | 35 × 21 | 11 | 4 |
| Cormorant | 43 × 29 | 12 | 4 |
| Crow | 37 × 23 | 14 | 4 |
| White stork | 47 × 39 | 25 | 5 |
| Regatta buoy | 15 × 15 | 16 | 4 |

The bird templates live in [templates/birds.js](templates/birds.js). Export their sheets with the same tool and pass the chosen species name. The mallard, cormorant, crow, and stork reserve the outside of each slice for wings. [bird-view.js](../bird-view.js) uses those voxels to bake five wing positions. The swimming mallard and perched crow use the center of each slice, which includes the folded wings.

## Built-in ImageGen prompts

### Regatta buoy

Export `regattaBuoy` from [regatta-buoy.js](templates/regatta-buoy.js) with four columns. The built-in ImageGen tool painted a 16× enlargement of the template. Fit the output to the original 60 × 60 sheet as `regatta-buoy-slices.png`. Registration, line ends, and numbered marks share the same stack.

> Production paint-over on the given registered transparent voxel slice atlas for an original Lake Niegocin sailing regatta buoy. Keep precisely the 4 columns by 4 rows, square canvas, silhouette, alignment and size of all 16 horizontal cross sections, row-major lowest first. Paint only existing opaque pixels. Sun-warmed safety-orange inflatable coated fabric with weathered burnt-orange bottom, fine subdued radial seam stitching in burnt sienna, bright honey-orange sheen, and preserve the cream reflective band in slices 7–8. Last tiny pixel is a pale lifting eye. Consistent shading and registered seam positions across adjacent slices, crisp pixel art. Empty space remains genuinely transparent. No captions, assembled view, scenery, additional objects, frames, new margins, or grid.

### Lakeside trees

Export `oak`, `birch`, `willow`, `pine`, `spruce` and `cherry` from [lakeside-trees.js](templates/lakeside-trees.js) with eight columns. For this repaint the six 512 × 512 templates occupied a three-by-two contact sheet in that order. ImageGen painted the combined sheet. Fit it to the original geometry with `fit-sheet.js`, split it back into six squares and tag each fitted species before copying it into `art/`.

```sh
node mazury/art/tag-tree-boughs.js willow /tmp/willow-fitted.png mazury/art/willow-slices.png
```

The tagger records each voxel’s supporting branch in the low three blue bits and the low red bit. The PNG stays opaque on the model and transparent elsewhere. The game reads those material groups before lighting the wood and leaves. Willow and birch have additional groups for their hanging sprays. Inspect each complete sheet in the model viewer at 64 × 64 with eight columns.

> Paint the registered horizontal slices in place. Give the oak warm olive leaves with ochre tips, the birch silver bark and lime foliage, and the willow long sage leaves. Use copper bark and blue-green needles for Scots pine, petrol and silver for spruce, and dusty pink blossoms amongst clear green for wild cherry. Keep value patches consistent across adjacent slices. Preserve thin limbs, isolated pixels, sky holes and transparent margins.

For the close view, export the six `Detail` recipes with 16 columns. They grow on a grid three times finer, with smaller lobes, needle tips, and bark marks. The wide view uses the original sheets. This workflow samples four representative slices per species for ImageGen, then transfers the painted values onto the full geometry before tagging the boughs.

```sh
mkdir -p /tmp/mazury-tree-detail
for species in oak birch willow pine spruce cherry; do
  node tools/model-to-sheet.js mazury/art/templates/lakeside-trees.js "${species}Detail" "/tmp/mazury-tree-detail/$species-template.png" 16
done
node mazury/art/paint-tree-detail.js /tmp/mazury-tree-detail /tmp/mazury-tree-detail/contact.png
# Repaint contact.png with ImageGen and save the result as paint.png.
node mazury/art/paint-tree-detail.js /tmp/mazury-tree-detail /tmp/mazury-tree-detail/contact.png /tmp/mazury-tree-detail/paint.png
for species in oak birch willow pine spruce cherry; do
  node mazury/art/tag-tree-boughs.js "$species" "/tmp/mazury-tree-detail/$species-fitted.png" "mazury/art/$species-detail-slices.png" 3
done
```

> Repaint the registered six-column, four-row tree cross-section sheet. Each species occupies a two-by-two block in the same order as above. Keep every leaf cluster and bark patch in place. Paint fine pixel highlights, narrow needles on the conifers, charcoal marks on silver birch bark, and soft pink cherry blossoms. Preserve the transparent areas and all holes between sprays.

### Detailed shore buildings

Export `cottage` and `boathouse` from [shore-buildings.js](templates/shore-buildings.js). The built-in ImageGen tool painted both atlases. The smaller existing stacks supply the wide views and cast shadows.

> Production repaint of this exact transparent voxel slice atlas for a Mazurian lakeside cottage. 18 columns by 4 rows, 1134 by 348, horizontal slices row-major and lowest first. Paint only existing opaque areas. Preserve every cell, perimeter, silhouette, thin roof edge, small trim piece, and transparent space. Limestone foundation, soft warm lime plaster with delicate grain, deep muted teal window glass, weathered timber doors, and fine russet clay tile courses. Keep adjacent slices consistent. Preserve alpha outside the original silhouettes. No assembled scene, typography, grids, borders or padding.

> Repaint this exact 12-column by 7-row transparent voxel atlas for a lakeside Mazurian timber boathouse. 1296 by 651 input, lowest horizontal slices first. Lock every existing shape, perimeter and cell location, including the narrow roof strips and little chimney squares. Use weathered warm cedar planks, discreet grain and seams, dark timber trim, sea-green glass and reddish clay pantiles with a little tonal variation. Keep lighting and materials consistent from slice to slice. Preserve alpha outside geometry and all empty cells. No added objects, assembled view, scenery, text, grids or frame.

### Sailboat

> Repaint this exact transparent sprite-stack template, a tiny Mazurian wooden dinghy. Preserve sheet perimeter, 5 columns by 5 rows, every slice position and silhouette. Row-major, lowest slices first. Preserve isolated tiny parts. Repaint only occupied areas, with deep chestnut and burgundy hull sides, warm honey-colored plank decking, pale sage gunwale, dark brown mast, creamy ivory sailcloth with subtle stitched bands in pale flax, sage pennant. Crisp pixel art, flat colors. Use no text, grid, padding, extra views or added objects. Truly transparent empty pixels. This is a set of horizontal sections, so preserve their geometry and registration precisely.

### Jib

The built-in ImageGen tool painted the separate jib atlas. The game fits its slices around the forestay and uses the same pose in the boat and its reflection.

> Repaint this exact row-major horizontal slice atlas for a tiny Mazurian sailing yacht's jib. The input image is the edit target and its geometry is locked. Six columns by three rows, 1020 x 990, no margins. Preserve the position, size and silhouette of every narrow curved strip of cloth and tiny square, and preserve all transparent gaps and the empty eighteenth cell. Paint muted ivory linen with a faint cooler gray-green tone, pale flax edging, and subtle golden stitching, using crisp pixel blocks and restrained shading. Match the existing miniature sprite-stack style. This is a production texture atlas, not an illustration of an assembled sail. No added objects, text, grid, backgrounds, frames, border or padding. Keep the output transparent outside the marks.

### Detailed sailboat and jib

The built-in ImageGen tool painted atlases exported from `detailedSailboat` and `detailedJib`. Fit them to their templates as `sailboat-detail-slices.png` and `jib-detail-slices.png`. The game bakes the assembled stack at full detail when the yacht is large on screen and at a lower detail when it is farther away.

> Production edit of a transparent voxel slice atlas for an original Mazurian cabin sloop. Keep the exact geometry and alignment of the reference atlas, 15 columns by 5 rows, 1290 × 990 input, row-major with lowest horizontal cross-sections first. Paint only the occupied pixels in each cell. Paint the lowest hull sections deep burgundy, the boot stripe muted sage, the upper hull and cabin warm aged ivory, the cockpit lightly weathered honey teak with thin seams, the windows sea-green smoked glass, the mast and hardware brushed muted metal, and the fine sail strips bone-white Dacron with subtle stitching. Keep positions and colors consistent across adjacent slices so they assemble as one yacht. Preserve the thin isolated rigging pixels and all outside alpha. Aim for refined readable material shading and crisp small details. No visible grid, labels, borders, drop shadows, assembled boat, extra cells, added objects or scenery. Output a truly transparent background.

> Production edit of this exact row-major voxel slice atlas of the triangular jib on a small Mazurian cabin sloop. The input geometry is locked, 13 columns by 4 rows, 1118 × 792 input, lowest horizontal slice first, including three empty cells. Preserve every thin occupied mark and exact registration. Paint only the existing strips in warm off-white Dacron with cooler gray-green edge shading and quiet flax seams. Keep the style crisp and consistent across adjacent slices. No illustration of the assembled sail, no added pixels outside the silhouette, no guides, text, padding, frames, objects, or background. Preserve true transparency.

### Boathouse

> Repaint this exact transparent sprite-stack template, a little wooden Mazurian boathouse. Preserve sheet perimeter, 6 columns by 4 rows, every slice position and silhouette. Row-major, lowest slices first. Repaint only occupied areas, with weathered warm-brown timber walls, a honey-amber glow in the tiny golden windows, a muted dark green chimney, dusty red terracotta roof tile strata in multiple bands of brick, vermilion, and warm brown. Crisp flat pixel art. Use no text, grid, padding, extra views or added objects. Truly transparent empty pixels. This is a set of horizontal sections, so preserve geometry and registration precisely.

### Cottage

> Repaint this exact six-column, four-row sheet of horizontal slices of a Mazurian lakeside cottage. Keep every silhouette and transparent region in place. Paint the roof strips with sunlit terracotta shingles and deep rose shadows, the cream walls with warm lime plaster, the window spots in dark teal, and the foundation in moss-grey stone. Use crisp pixel edges. Keep all pixels outside the template silhouettes transparent.

### Jetty

> Repaint this exact transparent sprite-stack template, a tiny Mazurian plank jetty. Preserve sheet perimeter, one row of 6 equal cells, every slice position and silhouette. Lowest slice at the left. Repaint only occupied areas in silvery cedar planks and weathered olive-brown posts, with contrasting seams and restrained wood grain. Crisp flat pixel art. Use no text, grid, padding, extra views or added objects. Truly transparent empty pixels. This is a set of horizontal sections, so preserve geometry and registration precisely.

### Water birds

The built-in ImageGen tool painted one sheet per species. Each prompt starts and ends with the shared instructions below, with the species paragraph inserted between them.

> Production game asset edit. Repaint this exact row-major voxel slice atlas in place, lowest slice first.

**Swan**

> First image 6 columns × 3 rows and 1020 × 930. This is a mute swan. Paint creamy white layered feathers with soft pearl-blue occlusion and occasional ivory highlights. Keep the tiny orange bill and charcoal mask. The second image is a swan anatomy reference only. Preserve the first image’s exact positions and shapes for the body, curved neck, head and beak. Do not reproduce the second image's grid, typography, orthographic drawings or water.

**Mallard**

> 4 columns × 3 rows and 1260 × 567. This is a drake mallard with separate wing panels. Repaint within the existing silhouettes with muted silvery-grey barred back feathers, chestnut breast, iridescent evergreen head, pale neck ring, yellow ochre bill, charcoal tail, and a restrained violet-blue wing patch. Keep the detached wing panels at their exact coordinates.

**Cormorant**

> 4 columns × 3 rows and 1376 × 696. This is a great cormorant with a long throat and detached wing panels. Paint within the silhouettes with slate-black charcoal, dark bronze scalloping on covert feathers, subtle blue-green upper highlights, creamy hooked bill, and a small warm ochre throat. Keep the detached wing panels at their exact coordinates.

**Shared ending**

> Treat the original cell layout, registration, aspect ratio and opacity mask as locked. There are no sheet margins, no separate illustration or assembled pose, no water, scenery, text, grid, frames or decorations. Preserve all genuinely transparent pixels and even isolated tiny occupied areas. The result is original crisp, hand-painted pixel art on a transparent atlas for the Mazury lake sailing prototype. Make the shading within each occupied region recognizably feathered at sprite scale, with soft narrow swatches of the supplied colors.

### Crow

The built-in ImageGen tool painted the crow with this prompt.

> Production edit for a voxel sprite atlas of a small hooded crow in a Mazurian lake sailing game. Repaint the provided four-column by four-row, 1184 by 736 sheet in place, lowest slices first. Lock the aspect ratio, cell positions, and every occupied silhouette, including the tiny leg voxels and the detached flying wing panels. Use ash-grey mantle feathers, cool charcoal head and belly shadows, glossy crow-black wings with a subtle slate-blue sheen, sharp layered primaries, and a black beak. Keep the existing material zones. Use restrained feather highlights and crisp pixel edges, matching the tiny playable bird scale. Every empty pixel stays genuinely transparent. No scenery, branch, type, cell lines, margins, or separate assembled view.
