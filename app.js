(function () {
  const els = {
    fileInput: document.getElementById("fileInput"),
    sourceDropzone: document.getElementById("sourceDropzone"),
    sourceEmptyMessage: document.getElementById("sourceEmptyMessage"),
    smoothIterations: document.getElementById("smoothIterations"),
    smoothIterationsValue: document.getElementById("smoothIterationsValue"),
    decimateAngle: document.getElementById("decimateAngle"),
    decimateAngleValue: document.getElementById("decimateAngleValue"),
    sourceCanvas: document.getElementById("sourceCanvas"),
    binaryCanvas: document.getElementById("binaryCanvas"),
    svgPanel: document.getElementById("svgPanel"),
    binaryPanel: document.getElementById("binaryPanel"),
    outputTabSvg: document.getElementById("outputTabSvg"),
    outputTabBinary: document.getElementById("outputTabBinary"),
    svgContainer: document.getElementById("svgContainer"),
    pathData: document.getElementById("pathData"),
    downloadBtn: document.getElementById("downloadBtn"),
  };

  const state = {
    width: 0,
    height: 0,
    colors: null,
    mask: null,
    svgText: "",
  };

  const sourceCtx = els.sourceCanvas.getContext("2d", { willReadFrequently: true });
  const binaryCtx = els.binaryCanvas.getContext("2d");

  initSourceDropzone();
  els.smoothIterations.addEventListener("input", () => {
    els.smoothIterationsValue.textContent = els.smoothIterations.value;
    if (state.colors) processImage();
  });

  els.decimateAngle.addEventListener("input", () => {
    els.decimateAngleValue.textContent = els.decimateAngle.value;
    if (state.colors) processImage();
  });

  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (!file) return;
    await handleFile(file);
    els.fileInput.value = "";
  });

  els.downloadBtn.addEventListener("click", () => {
    if (!state.svgText) return;
    const blob = new Blob([state.svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trace.svg";
    a.click();
    URL.revokeObjectURL(url);
  });

  els.outputTabSvg.addEventListener("click", () => setOutputTab("svg"));
  els.outputTabBinary.addEventListener("click", () => setOutputTab("binary"));
  setOutputTab("svg");
  setSourceLoaded(false);

  function initSourceDropzone() {
    const dropzone = els.sourceDropzone;
    dropzone.addEventListener("click", () => {
      els.fileInput.click();
    });

    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.fileInput.click();
      }
    });

    dropzone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", (e) => {
      if (!dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove("drag-over");
      }
    });

    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      const fileList = e.dataTransfer && e.dataTransfer.files;
      if (!fileList || fileList.length === 0) return;
      const file = Array.from(fileList).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      await handleFile(file);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const img = await loadImage(file);
    drawSource(img);
    ingestSourcePixels();
    processImage();
    setSourceLoaded(true);
  }

  function setSourceLoaded(loaded) {
    els.sourceDropzone.classList.toggle("empty", !loaded);
    els.sourceDropzone.setAttribute(
      "aria-label",
      loaded ? "Original image panel. Click or drag to replace image." : "Original image panel. Drag file here or click to upload."
    );
    if (els.sourceEmptyMessage) {
      els.sourceEmptyMessage.textContent = "drag file here or click to upload";
    }
  }

  function setOutputTab(tab) {
    const svgActive = tab === "svg";
    els.svgPanel.classList.toggle("panel-hidden", !svgActive);
    els.binaryPanel.classList.toggle("panel-hidden", svgActive);
    els.outputTabSvg.classList.toggle("active", svgActive);
    els.outputTabBinary.classList.toggle("active", !svgActive);
    els.outputTabSvg.setAttribute("aria-selected", svgActive ? "true" : "false");
    els.outputTabBinary.setAttribute("aria-selected", svgActive ? "false" : "true");
  }

  function drawSource(img) {
    state.width = img.naturalWidth || img.width;
    state.height = img.naturalHeight || img.height;
    els.sourceCanvas.width = state.width;
    els.sourceCanvas.height = state.height;
    els.binaryCanvas.width = state.width;
    els.binaryCanvas.height = state.height;
    sourceCtx.clearRect(0, 0, state.width, state.height);
    sourceCtx.drawImage(img, 0, 0, state.width, state.height);
  }

  function ingestSourcePixels() {
    const imageData = sourceCtx.getImageData(0, 0, state.width, state.height);
    const rgba = imageData.data;
    const colors = new Float64Array(state.width * state.height * 3);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3) {
      const a = rgba[i + 3] / 255;
      colors[p] = rgba[i] * a + (1 - a) * 255;
      colors[p + 1] = rgba[i + 1] * a + (1 - a) * 255;
      colors[p + 2] = rgba[i + 2] * a + (1 - a) * 255;
    }
    state.colors = colors;
  }

  function processImage() {
    const width = state.width;
    const height = state.height;
    if (!width || !height || !state.colors) return;

    const bg = estimateBackground(state.colors, width, height);
    const fg = estimateForeground(state.colors, bg);
    const mask = binarizeAlongAxis(state.colors, width, height, bg, fg);
    normalizeMaskWithCorners(mask, width, height);
    state.mask = mask;
    drawMask(mask, width, height);

    let mesh = traceBoundaryMesh(mask, width, height);
    mesh = smoothMesh(mesh, Number(els.smoothIterations.value) || 0);
    mesh = decimateMesh(mesh, Number(els.decimateAngle.value) || 0);
    const loops = meshToLoops(mesh);
    const path = loopsToPathData(loops, mesh.coords, height);
    const svg = pathToSvg(path, width, height);

    state.svgText = svg;
    els.svgContainer.innerHTML = svg;
    els.pathData.value = path;
    els.downloadBtn.disabled = !path;
  }

  function estimateBackground(colors, width, height) {
    const side = Math.max(1, Math.floor(Math.min(width, height) * 0.03));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const corners = [
      [0, 0],
      [width - side, 0],
      [0, height - side],
      [width - side, height - side],
    ];
    for (const [x0, y0] of corners) {
      for (let y = y0; y < y0 + side; y++) {
        for (let x = x0; x < x0 + side; x++) {
          const i = (y * width + x) * 3;
          r += colors[i];
          g += colors[i + 1];
          b += colors[i + 2];
          n++;
        }
      }
    }
    return [r / n, g / n, b / n];
  }

  function estimateForeground(colors, bg) {
    let maxDist = -1;
    let maxIndex = 0;
    for (let i = 0; i < colors.length; i += 3) {
      const dr = colors[i] - bg[0];
      const dg = colors[i + 1] - bg[1];
      const db = colors[i + 2] - bg[2];
      const d = dr * dr + dg * dg + db * db;
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    const cutoff = maxDist * 0.7;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < colors.length; i += 3) {
      const dr = colors[i] - bg[0];
      const dg = colors[i + 1] - bg[1];
      const db = colors[i + 2] - bg[2];
      const d = dr * dr + dg * dg + db * db;
      if (d >= cutoff) {
        r += colors[i];
        g += colors[i + 1];
        b += colors[i + 2];
        n++;
      }
    }
    if (n === 0) {
      return [colors[maxIndex], colors[maxIndex + 1], colors[maxIndex + 2]];
    }
    return [r / n, g / n, b / n];
  }

  function binarizeAlongAxis(colors, width, height, bg, fg) {
    const mask = new Uint8Array(width * height);
    const axis = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]];
    const axisNormSq = axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2];
    if (axisNormSq < 1e-8) return mask;
    const midpointProjection = 0.5 * axisNormSq;
    for (let i = 0, p = 0; p < colors.length; i++, p += 3) {
      const dr = colors[p] - bg[0];
      const dg = colors[p + 1] - bg[1];
      const db = colors[p + 2] - bg[2];
      const projection = dr * axis[0] + dg * axis[1] + db * axis[2];
      mask[i] = projection > midpointProjection ? 1 : 0;
    }
    return mask;
  }

  function normalizeMaskWithCorners(mask, width, height) {
    const side = Math.max(1, Math.floor(Math.min(width, height) * 0.03));
    let n = 0;
    let fg = 0;
    const corners = [
      [0, 0],
      [width - side, 0],
      [0, height - side],
      [width - side, height - side],
    ];
    for (const [x0, y0] of corners) {
      for (let y = y0; y < y0 + side; y++) {
        for (let x = x0; x < x0 + side; x++) {
          const i = y * width + x;
          fg += mask[i];
          n++;
        }
      }
    }
    if (fg > n / 2) {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] ? 0 : 1;
    }
  }

  function drawMask(mask, width, height) {
    const imageData = binaryCtx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i] ? 0 : 255;
      const p = i * 4;
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }
    binaryCtx.putImageData(imageData, 0, 0);
  }

  function traceBoundaryMesh(mask, width, height) {
    const segments = [];

    function getPixelUp(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0;
      const yImg = height - 1 - y;
      return mask[yImg * width + x];
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!getPixelUp(x, y)) continue;

        let p1 = { x, y };
        let p2 = { x: x + 1, y };
        let p3 = { x: x + 1, y: y + 1 };
        let p4 = { x, y: y + 1 };

        const left = getPixelUp(x - 1, y);
        const right = getPixelUp(x + 1, y);
        const top = getPixelUp(x, y + 1);
        const bottom = getPixelUp(x, y - 1);
        const center = { x: x + 0.5, y: y + 0.5 };

        if (!left && !top && getPixelUp(x - 1, y + 1)) p4 = midpoint(p4, center);
        if (!left && !bottom && getPixelUp(x - 1, y - 1)) p1 = midpoint(p1, center);
        if (!right && !top && getPixelUp(x + 1, y + 1)) p3 = midpoint(p3, center);
        if (!right && !bottom && getPixelUp(x + 1, y - 1)) p2 = midpoint(p2, center);

        if (!left) segments.push([p1, p4]);
        if (!right) segments.push([p3, p2]);
        if (!top) segments.push([p4, p3]);
        if (!bottom) segments.push([p2, p1]);
      }
    }

    return newIndexMesh(segments);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  }

  function newIndexMesh(segments) {
    const coords = [];
    const indexedSegments = [];
    const pointToIndex = new Map();

    for (const [a, b] of segments) {
      const i0 = addCoord(a);
      const i1 = addCoord(b);
      if (i0 !== i1) indexedSegments.push([i0, i1]);
    }

    return {
      coords,
      segments: indexedSegments,
    };

    function addCoord(c) {
      const key = `${round6(c.x)},${round6(c.y)}`;
      if (pointToIndex.has(key)) return pointToIndex.get(key);
      const idx = coords.length;
      pointToIndex.set(key, idx);
      coords.push({ x: c.x, y: c.y });
      return idx;
    }
  }

  function smoothMesh(mesh, iterations) {
    let out = mesh;
    for (let i = 0; i < iterations; i++) {
      const grad = smoothingGradient(out);
      const step = optimalSmoothingStepSizeSquares(out, grad);
      if (!Number.isFinite(step) || Math.abs(step) < 1e-12) break;
      const nextCoords = new Array(out.coords.length);
      for (let j = 0; j < out.coords.length; j++) {
        nextCoords[j] = {
          x: out.coords[j].x + grad[j].x * step,
          y: out.coords[j].y + grad[j].y * step,
        };
      }
      out = { coords: nextCoords, segments: out.segments };
    }
    return out;
  }

  function smoothingGradient(mesh) {
    const grad = new Array(mesh.coords.length);
    for (let i = 0; i < grad.length; i++) grad[i] = { x: 0, y: 0 };

    for (const [i0, i1] of mesh.segments) {
      const p1 = mesh.coords[i0];
      const p2 = mesh.coords[i1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      grad[i0].x += dx;
      grad[i0].y += dy;
      grad[i1].x -= dx;
      grad[i1].y -= dy;
    }
    return grad;
  }

  function optimalSmoothingStepSizeSquares(mesh, grad) {
    let polyA = 0;
    let polyB = 0;

    for (const [i0, i1] of mesh.segments) {
      const p1 = mesh.coords[i0];
      const p2 = mesh.coords[i1];
      const g1 = grad[i0];
      const g2 = grad[i1];
      const gDiffX = g1.x - g2.x;
      const gDiffY = g1.y - g2.y;
      const pDiffX = p1.x - p2.x;
      const pDiffY = p1.y - p2.y;
      polyA += gDiffX * gDiffX + gDiffY * gDiffY;
      polyB += 2 * (pDiffX * gDiffX + pDiffY * gDiffY);
    }

    if (polyA < 1e-12) return 0;
    return -polyB / (2 * polyA);
  }

  function decimateMesh(mesh, angleToleranceDeg) {
    if (mesh.segments.length === 0) return mesh;
    const adj = new Array(mesh.coords.length);
    for (let i = 0; i < adj.length; i++) adj[i] = new Set();
    for (const [a, b] of mesh.segments) {
      adj[a].add(b);
      adj[b].add(a);
    }

    const active = new Array(mesh.coords.length).fill(true);
    const queue = [];
    for (let i = 0; i < adj.length; i++) {
      if (adj[i].size === 2) queue.push(i);
    }

    const tolRad = (angleToleranceDeg * Math.PI) / 180;
    const maxCos = -Math.cos(tolRad);

    while (queue.length > 0) {
      const v = queue.pop();
      if (!active[v] || adj[v].size !== 2) continue;
      const neighbors = Array.from(adj[v]);
      const a = neighbors[0];
      const b = neighbors[1];
      if (!active[a] || !active[b] || a === b) continue;

      const vaX = mesh.coords[a].x - mesh.coords[v].x;
      const vaY = mesh.coords[a].y - mesh.coords[v].y;
      const vbX = mesh.coords[b].x - mesh.coords[v].x;
      const vbY = mesh.coords[b].y - mesh.coords[v].y;
      const la = Math.hypot(vaX, vaY);
      const lb = Math.hypot(vbX, vbY);
      if (la < 1e-9 || lb < 1e-9) continue;

      const cosAngle = (vaX * vbX + vaY * vbY) / (la * lb);
      if (cosAngle > maxCos) continue;

      adj[a].delete(v);
      adj[b].delete(v);
      adj[v].clear();
      active[v] = false;

      adj[a].add(b);
      adj[b].add(a);
      if (adj[a].size === 2) queue.push(a);
      if (adj[b].size === 2) queue.push(b);
    }

    const remapped = compactMesh(mesh.coords, adj, active);
    return remapped;
  }

  function compactMesh(coords, adj, active) {
    const mapping = new Array(coords.length).fill(-1);
    const outCoords = [];
    for (let i = 0; i < coords.length; i++) {
      if (!active[i]) continue;
      if (adj[i].size === 0) continue;
      mapping[i] = outCoords.length;
      outCoords.push(coords[i]);
    }

    const edges = new Set();
    const outSegments = [];
    for (let i = 0; i < adj.length; i++) {
      if (mapping[i] < 0) continue;
      for (const j of adj[i]) {
        if (mapping[j] < 0) continue;
        const a = mapping[i];
        const b = mapping[j];
        if (a === b) continue;
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (edges.has(key)) continue;
        edges.add(key);
        outSegments.push(a < b ? [a, b] : [b, a]);
      }
    }

    return { coords: outCoords, segments: outSegments };
  }

  function meshToLoops(mesh) {
    const adj = new Array(mesh.coords.length);
    for (let i = 0; i < adj.length; i++) adj[i] = [];
    for (const [a, b] of mesh.segments) {
      adj[a].push(b);
      adj[b].push(a);
    }

    const visited = new Set();
    const loops = [];
    for (let start = 0; start < adj.length; start++) {
      for (const next of adj[start]) {
        const edgeKey = undirectedEdgeKey(start, next);
        if (visited.has(edgeKey)) continue;

        const loop = traceLoop(start, next, adj, visited);
        if (loop && loop.length >= 3) loops.push(loop);
      }
    }
    return loops;
  }

  function traceLoop(start, first, adj, visited) {
    const loop = [start];
    let prev = start;
    let curr = first;
    visited.add(undirectedEdgeKey(prev, curr));

    const maxSteps = adj.length * 4 + 20;
    for (let step = 0; step < maxSteps; step++) {
      loop.push(curr);
      const nbrs = adj[curr];
      if (!nbrs || nbrs.length === 0) return null;
      if (curr === start) {
        loop.pop();
        return loop;
      }

      let next = -1;
      if (nbrs.length === 1) {
        next = nbrs[0];
      } else {
        for (const n of nbrs) {
          if (n !== prev) {
            next = n;
            break;
          }
        }
        if (next < 0) next = nbrs[0];
      }

      const key = undirectedEdgeKey(curr, next);
      if (visited.has(key)) {
        if (next === start) return loop;
        return null;
      }
      visited.add(key);
      prev = curr;
      curr = next;
    }
    return null;
  }

  function loopsToPathData(loops, coords, height) {
    const parts = [];
    for (const loop of loops) {
      const pts = loop.map((idx) => ({
        x: coords[idx].x,
        y: height - coords[idx].y,
      }));
      if (pts.length < 3) continue;
      parts.push(`M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`);
      for (let i = 1; i < pts.length; i++) {
        parts.push(`L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`);
      }
      parts.push("Z");
    }
    return parts.join(" ");
  }

  function pathToSvg(pathData, width, height) {
    if (!pathData) return "";
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
      `<path d="${pathData}" fill="#111" fill-rule="evenodd"/>`,
      "</svg>",
    ].join("");
  }

  function undirectedEdgeKey(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  function round6(x) {
    return Math.round(x * 1e6) / 1e6;
  }

  function fmt(x) {
    return (Math.round(x * 1000) / 1000).toString();
  }
})();
