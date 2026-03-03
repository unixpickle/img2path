# img2path

`img2path` is a browser-based tool that converts a two-color raster image into a single SVG path.  
It runs fully client-side (no backend) and gives you both visual previews and copyable/exportable path data.

## What it does

- Accepts an uploaded image (drag-and-drop or file picker).
- Binarizes the image into foreground/background.
- Traces the foreground boundary into closed loops.
- Smooths and decimates the traced mesh to reduce path complexity.
- Exports:
  - SVG file (`trace.svg`)
  - Raw SVG `d` path string
  - OpenSCAD polygon code

## Processing notes

- Background color is inferred from image corners.
- The app assumes a mostly two-color input for best results.
- Transparent pixels are composited over white before processing.
- The generated SVG path uses `fill-rule="evenodd"` so holes are preserved.

## Project structure

- `index.html` - app layout and controls
- `styles.css` - styling and responsive layout
- `app.js` - image processing, tracing, smoothing, decimation, and export logic
