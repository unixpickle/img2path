(function () {
  const els = {
    fileInput: document.getElementById("fileInput"),
    sourceDropzone: document.getElementById("sourceDropzone"),
    sourceEmptyMessage: document.getElementById("sourceEmptyMessage"),
    smoothIterations: document.getElementById("smoothIterations"),
    smoothIterationsValue: document.getElementById("smoothIterationsValue"),
    targetSegments: document.getElementById("targetSegments"),
    targetSegmentsValue: document.getElementById("targetSegmentsValue"),
    sourceCanvas: document.getElementById("sourceCanvas"),
    binaryCanvas: document.getElementById("binaryCanvas"),
    svgPanel: document.getElementById("svgPanel"),
    binaryPanel: document.getElementById("binaryPanel"),
    outputTabSvg: document.getElementById("outputTabSvg"),
    outputTabBinary: document.getElementById("outputTabBinary"),
    textFormatSvg: document.getElementById("textFormatSvg"),
    textFormatScad: document.getElementById("textFormatScad"),
    svgContainer: document.getElementById("svgContainer"),
    pathData: document.getElementById("pathData"),
    pathSizeValue: document.getElementById("pathSizeValue"),
    segmentCountValue: document.getElementById("segmentCountValue"),
    copyPathBtn: document.getElementById("copyPathBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
  };

  const state = {
    width: 0,
    height: 0,
    colors: null,
    mask: null,
    svgText: "",
    svgPathText: "",
    scadText: "",
    textFormat: "svg",
    outputSegmentCount: 0,
    resetTargetSegments: true,
    targetSegmentsMin: 5,
    targetSegmentsMax: 10000,
  };

  const TARGET_SEGMENTS_DEFAULT = 500;
  const TARGET_SEGMENTS_MIN_DEFAULT = 5;
  const TARGET_SEGMENTS_MAX_DEFAULT = 10000;
  const TARGET_SLIDER_MIN = 0;
  const TARGET_SLIDER_MAX = 1000;

  const sourceCtx = els.sourceCanvas.getContext("2d", { willReadFrequently: true });
  const binaryCtx = els.binaryCanvas.getContext("2d");

  initTargetSegmentsControl();
  initSourceDropzone();
  els.smoothIterations.addEventListener("input", () => {
    els.smoothIterationsValue.textContent = els.smoothIterations.value;
    if (state.colors) processImage();
  });

  els.targetSegments.addEventListener("input", () => {
    els.targetSegmentsValue.textContent = String(getTargetSegmentsFromSlider());
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

  els.copyPathBtn.addEventListener("click", async () => {
    if (!els.pathData.value) return;
    const text = els.pathData.value;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }

    if (!copied) {
      els.pathData.focus();
      els.pathData.select();
      try {
        copied = document.execCommand("copy");
      } catch (_) {
        copied = false;
      }
    }

    if (!copied) return;
    const old = els.copyPathBtn.textContent;
    els.copyPathBtn.textContent = "Copied";
    setTimeout(() => {
      els.copyPathBtn.textContent = old;
    }, 900);
  });

  els.outputTabSvg.addEventListener("click", () => setOutputTab("svg"));
  els.outputTabBinary.addEventListener("click", () => setOutputTab("binary"));
  els.textFormatSvg.addEventListener("click", () => setTextFormat("svg"));
  els.textFormatScad.addEventListener("click", () => setTextFormat("scad"));
  setOutputTab("svg");
  setTextFormat("svg");
  setSourceLoaded(false);
  renderTextOutput();

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
    state.resetTargetSegments = true;
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

  function setTextFormat(format) {
    const svgActive = format === "svg";
    state.textFormat = svgActive ? "svg" : "scad";
    els.textFormatSvg.classList.toggle("active", svgActive);
    els.textFormatScad.classList.toggle("active", !svgActive);
    els.textFormatSvg.setAttribute("aria-selected", svgActive ? "true" : "false");
    els.textFormatScad.setAttribute("aria-selected", svgActive ? "false" : "true");
    renderTextOutput();
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
    const baseLoops = meshToLoops(mesh);
    const minTargetSegments = baseLoops.length > 0 ? baseLoops.length * 3 : 1;
    updateTargetSegmentsControl(mesh.segments.length, minTargetSegments, state.resetTargetSegments);
    state.resetTargetSegments = false;
    mesh = smoothMesh(mesh, Number(els.smoothIterations.value) || 0);
    const targetSegments = getTargetSegmentsFromSlider();
    mesh = decimateMeshToTarget(mesh, targetSegments);
    const loops = meshToLoops(mesh);
    const outputSegmentCount = loops.reduce((total, loop) => total + loop.length, 0);
    const path = loopsToPathData(loops, mesh.coords, height);
    const scad = loopsToOpenScad(loops, mesh.coords);
    const svg = pathToSvg(path, width, height);

    state.svgText = svg;
    state.svgPathText = path;
    state.scadText = scad;
    state.outputSegmentCount = outputSegmentCount;
    els.svgContainer.innerHTML = svg;
    renderTextOutput();
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

  function decimateMeshToTarget(mesh, targetSegments) {
    if (mesh.segments.length === 0) return mesh;
    if (targetSegments <= 0) return mesh;

    const adj = new Array(mesh.coords.length);
    for (let i = 0; i < adj.length; i++) adj[i] = new Set();

    let segmentCount = 0;
    for (const [a, b] of mesh.segments) {
      if (a === b) continue;
      if (adj[a].has(b)) continue;
      adj[a].add(b);
      adj[b].add(a);
      segmentCount++;
    }

    if (targetSegments >= segmentCount) return mesh;

    const active = new Array(mesh.coords.length).fill(true);
    const versions = new Array(mesh.coords.length).fill(0);
    const heap = new MinHeap((x, y) => x.area2 - y.area2);

    for (let i = 0; i < adj.length; i++) {
      pushCollapseCandidate(i);
    }

    while (segmentCount > targetSegments && heap.size() > 0) {
      const item = heap.pop();
      if (!item) break;

      const v = item.v;
      if (!active[v] || versions[v] !== item.version) continue;
      if (adj[v].size !== 2) continue;

      const neighbors = Array.from(adj[v]);
      const a = neighbors[0];
      const b = neighbors[1];
      if (!active[a] || !active[b] || a === b) continue;
      if (adj[a].has(b)) continue;

      if (adj[a].delete(v)) segmentCount--;
      if (adj[b].delete(v)) segmentCount--;
      adj[v].clear();
      active[v] = false;
      versions[v]++;

      adj[a].add(b);
      adj[b].add(a);
      segmentCount++;
      versions[a]++;
      versions[b]++;

      pushCollapseCandidate(a);
      pushCollapseCandidate(b);
    }

    return compactMesh(mesh.coords, adj, active);

    function pushCollapseCandidate(v) {
      if (!active[v] || adj[v].size !== 2) return;
      const neighbors = Array.from(adj[v]);
      const a = neighbors[0];
      const b = neighbors[1];
      if (!active[a] || !active[b] || a === b) return;
      const area2 = doubledTriangleArea(mesh.coords[a], mesh.coords[v], mesh.coords[b]);
      heap.push({
        area2,
        v,
        version: versions[v],
      });
    }
  }

  function doubledTriangleArea(a, b, c) {
    return Math.abs((a.x - b.x) * (c.y - b.y) - (a.y - b.y) * (c.x - b.x));
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

  function loopsToOpenScad(loops, coords) {
    if (!loops || loops.length === 0) return "";

    const loopData = [];
    for (const loop of loops) {
      const points = loop.map((idx) => ({ x: coords[idx].x, y: coords[idx].y }));
      if (points.length < 3) continue;
      const area = polygonSignedArea(points);
      const absArea = Math.abs(area);
      if (absArea < 1e-9) continue;
      loopData.push({
        points,
        signedArea: area,
        absArea,
        probe: findProbePoint(points, area),
        parent: -1,
        depth: 0,
      });
    }

    if (loopData.length === 0) return "";

    for (let i = 0; i < loopData.length; i++) {
      let bestParent = -1;
      let bestArea = Infinity;
      const probe = loopData[i].probe;
      for (let j = 0; j < loopData.length; j++) {
        if (i === j) continue;
        if (loopData[j].absArea <= loopData[i].absArea + 1e-9) continue;
        if (!pointInPolygonEvenOdd(probe, loopData[j].points)) continue;
        if (loopData[j].absArea < bestArea) {
          bestArea = loopData[j].absArea;
          bestParent = j;
        }
      }
      loopData[i].parent = bestParent;
    }

    for (let i = 0; i < loopData.length; i++) {
      let depth = 0;
      let p = loopData[i].parent;
      while (p >= 0) {
        depth++;
        p = loopData[p].parent;
      }
      loopData[i].depth = depth;
    }

    const primaryIndices = [];
    for (let i = 0; i < loopData.length; i++) {
      if (loopData[i].depth % 2 === 0) primaryIndices.push(i);
    }
    if (primaryIndices.length === 0) return "";

    const statements = [];

    for (const outerIdx of primaryIndices) {
      const holeIndices = [];
      for (let i = 0; i < loopData.length; i++) {
        if (loopData[i].parent === outerIdx && loopData[i].depth % 2 === 1) {
          holeIndices.push(i);
        }
      }
      statements.push(buildScadPolygonStatement(loopData, outerIdx, holeIndices));
    }

    if (statements.length === 1) return statements[0];
    return ["union() {", ...statements.map((s) => `  ${s}`), "}"].join("\n");
  }

  function buildScadPolygonStatement(loopData, outerIdx, holeIndices) {
    const points = [];
    const paths = [];

    appendLoop(loopData[outerIdx], 1);
    for (const holeIdx of holeIndices) {
      appendLoop(loopData[holeIdx], -1);
    }

    const pointsText = points.map((p) => `[${fmtScad(p.x)}, ${fmtScad(p.y)}]`).join(", ");
    const pathsText = paths.map((path) => `[${path.join(", ")}]`).join(", ");
    return `polygon(points=[${pointsText}], paths=[${pathsText}]);`;

    function appendLoop(loop, desiredOrientationSign) {
      const shouldReverse = desiredOrientationSign > 0 ? loop.signedArea < 0 : loop.signedArea > 0;
      const ordered = shouldReverse ? loop.points.slice().reverse() : loop.points;
      const offset = points.length;
      const path = [];
      for (let i = 0; i < ordered.length; i++) {
        points.push(ordered[i]);
        path.push(offset + i);
      }
      paths.push(path);
    }
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

  function fmtScad(x) {
    return (Math.round(x * 1e6) / 1e6).toString();
  }

  function updatePathStats(path, segmentCount) {
    const bytes = path ? new TextEncoder().encode(path).length : 0;
    const kb = bytes / 1024;
    els.pathSizeValue.textContent = `${kb.toFixed(2)} KB`;
    els.segmentCountValue.textContent = String(segmentCount || 0);
  }

  function renderTextOutput() {
    const text = state.textFormat === "scad" ? state.scadText : state.svgPathText;
    els.pathData.value = text || "";
    updatePathStats(text || "", state.outputSegmentCount || 0);
    els.copyPathBtn.disabled = !text;
  }

  function polygonSignedArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return 0.5 * sum;
  }

  function findProbePoint(points, signedArea) {
    const centroid = polygonCentroid(points, signedArea);
    if (centroid && pointInPolygonEvenOdd(centroid, points)) return centroid;

    const boxCenter = polygonBoundsCenter(points);
    if (pointInPolygonEvenOdd(boxCenter, points)) return boxCenter;

    const orientationSign = signedArea >= 0 ? 1 : -1;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const n = {
        x: (-dy / len) * orientationSign * 1e-4,
        y: (dx / len) * orientationSign * 1e-4,
      };
      const probe = { x: mid.x + n.x, y: mid.y + n.y };
      if (pointInPolygonEvenOdd(probe, points)) return probe;
    }
    return points[0];
  }

  function polygonCentroid(points, signedArea) {
    if (Math.abs(signedArea) < 1e-12) return null;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const cross = a.x * b.y - b.x * a.y;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    const scale = 1 / (6 * signedArea);
    return { x: cx * scale, y: cy * scale };
  }

  function polygonBoundsCenter(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: 0.5 * (minX + maxX), y: 0.5 * (minY + maxY) };
  }

  function pointInPolygonEvenOdd(point, polygon) {
    const x = point.x;
    const y = point.y;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j];
      const b = polygon[i];
      if (pointOnSegment(point, a, b, 1e-9)) return true;
      const intersects = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointOnSegment(p, a, b, eps) {
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) > eps) return false;
    const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
    return dot <= eps;
  }

  function initTargetSegmentsControl() {
    state.targetSegmentsMin = TARGET_SEGMENTS_MIN_DEFAULT;
    state.targetSegmentsMax = TARGET_SEGMENTS_MAX_DEFAULT;
    els.targetSegments.min = String(TARGET_SLIDER_MIN);
    els.targetSegments.max = String(TARGET_SLIDER_MAX);
    els.targetSegments.step = "1";
    els.targetSegments.value = String(segmentsToSliderPosition(TARGET_SEGMENTS_DEFAULT));
    els.targetSegmentsValue.textContent = String(TARGET_SEGMENTS_DEFAULT);
  }

  function getTargetSegmentsFromSlider() {
    const sliderPos = Number(els.targetSegments.value);
    return sliderPositionToSegments(sliderPos);
  }

  function sliderPositionToSegments(sliderPos) {
    const pos = clamp(sliderPos, TARGET_SLIDER_MIN, TARGET_SLIDER_MAX);
    const min = state.targetSegmentsMin;
    const max = state.targetSegmentsMax;
    if (max <= min) return min;
    const t = (pos - TARGET_SLIDER_MIN) / (TARGET_SLIDER_MAX - TARGET_SLIDER_MIN);
    const value = Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function segmentsToSliderPosition(segments) {
    const min = state.targetSegmentsMin;
    const max = state.targetSegmentsMax;
    if (max <= min) return TARGET_SLIDER_MIN;
    const clamped = clamp(segments, min, max);
    const t = (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return Math.round(TARGET_SLIDER_MIN + t * (TARGET_SLIDER_MAX - TARGET_SLIDER_MIN));
  }

  function updateTargetSegmentsControl(maxSegments, minSegments, forceReset) {
    const max = Math.max(1, Math.floor(maxSegments || 0));
    const requestedMin = Math.max(1, Math.floor(minSegments || 1));
    const min = Math.min(requestedMin, max);
    const maxChanged = state.targetSegmentsMax !== max;
    const minChanged = state.targetSegmentsMin !== min;
    const rangeChanged = maxChanged || minChanged;

    state.targetSegmentsMin = min;
    state.targetSegmentsMax = max;

    let selectedSegments;
    if (forceReset || rangeChanged) {
      selectedSegments = Math.min(TARGET_SEGMENTS_DEFAULT, max);
    } else {
      selectedSegments = getTargetSegmentsFromSlider();
    }
    selectedSegments = clamp(selectedSegments, min, max);

    els.targetSegments.value = String(segmentsToSliderPosition(selectedSegments));
    els.targetSegmentsValue.textContent = String(selectedSegments);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  class MinHeap {
    constructor(compareFn) {
      this.compareFn = compareFn;
      this.items = [];
    }

    size() {
      return this.items.length;
    }

    push(value) {
      this.items.push(value);
      this.bubbleUp(this.items.length - 1);
    }

    pop() {
      if (this.items.length === 0) return null;
      if (this.items.length === 1) return this.items.pop();
      const min = this.items[0];
      this.items[0] = this.items.pop();
      this.bubbleDown(0);
      return min;
    }

    bubbleUp(index) {
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (this.compareFn(this.items[index], this.items[parent]) >= 0) break;
        this.swap(index, parent);
        index = parent;
      }
    }

    bubbleDown(index) {
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;

        if (left < this.items.length && this.compareFn(this.items[left], this.items[smallest]) < 0) {
          smallest = left;
        }
        if (right < this.items.length && this.compareFn(this.items[right], this.items[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === index) return;
        this.swap(index, smallest);
        index = smallest;
      }
    }

    swap(i, j) {
      const temp = this.items[i];
      this.items[i] = this.items[j];
      this.items[j] = temp;
    }
  }
})();
