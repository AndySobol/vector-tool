"use strict";
(() => {
  // code.ts
  function nearlyEqual(p1, p2, epsilon = 1e-3) {
    return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
  }
  function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  function parsePathDataToKeyPoints(pathData) {
    var _a, _b;
    let points = [];
    let closed = false;
    const commandRegex = /([MLCZ])([^MLCZ]*)/gi;
    let match;
    while ((match = commandRegex.exec(pathData)) !== null) {
      const command = match[1];
      const params = match[2].trim();
      if (command === "M" || command === "L") {
        const numbers = ((_a = params.match(/[-+]?[0-9]*\.?[0-9]+/g)) == null ? void 0 : _a.map(Number)) || [];
        for (let i = 0; i < numbers.length; i += 2) {
          points.push({ x: numbers[i], y: numbers[i + 1] });
        }
      } else if (command === "C") {
        const numbers = ((_b = params.match(/[-+]?[0-9]*\.?[0-9]+/g)) == null ? void 0 : _b.map(Number)) || [];
        for (let i = 0; i < numbers.length; i += 6) {
          points.push({ x: numbers[i + 4], y: numbers[i + 5] });
        }
      } else if (command.toUpperCase() === "Z") {
        closed = true;
      }
    }
    if (closed && points.length > 1 && nearlyEqual(points[0], points[points.length - 1])) {
      points.pop();
    }
    return { points, closed };
  }
  function buildPathDataFromPoints(points, closed) {
    if (points.length === 0)
      return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    if (closed)
      d += " Z";
    return d;
  }
  function getBoundingBox(points) {
    if (points.length === 0)
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
    for (const pt of points) {
      if (pt.x < minX)
        minX = pt.x;
      if (pt.y < minY)
        minY = pt.y;
      if (pt.x > maxX)
        maxX = pt.x;
      if (pt.y > maxY)
        maxY = pt.y;
    }
    return { minX, minY, maxX, maxY };
  }
  function rgbToHex(r, g, b) {
    const toHex = (n) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  var DEFAULT_PAINT = {
    type: "SOLID",
    color: { r: 0.5, g: 0.5, b: 0.5 }
  };
  var IDENTITY = [
    [1, 0, 0],
    [0, 1, 0]
  ];
  function getVisibleFills(node) {
    const isVisible = (fill) => typeof fill === "object" && fill !== null && fill.visible !== false;
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0 && node.fills.some(isVisible)) {
      return node.fills.filter(isVisible);
    }
    return [];
  }
  function getAbsoluteTransformDiff(a, b) {
    const aTransform = "absoluteTransform" in a && a.absoluteTransform || IDENTITY;
    const bTransform = "absoluteTransform" in b && b.absoluteTransform || IDENTITY;
    return { x: bTransform[0][2] - aTransform[0][2], y: bTransform[1][2] - aTransform[1][2] };
  }
  function deeplyFlatten(nodes) {
    const nameToUse = nodes.length === 1 ? nodes[0].name : "Flattened";
    let fillToUse = [];
    const workingList = [...nodes];
    for (let i = 0; i < workingList.length; i++) {
      const current = workingList[i];
      if (!current.parent)
        continue;
      const parent = current.parent;
      const isTopLevel = parent.type === "PAGE";
      if ("children" in current && current.type !== "BOOLEAN_OPERATION") {
        workingList.push(...current.children);
        if (!isTopLevel) {
          for (const child of current.children) {
            const diff = getAbsoluteTransformDiff(parent, child);
            parent.appendChild(child);
            child.x = diff.x;
            child.y = diff.y;
          }
          if (!current.removed)
            current.remove();
          workingList.splice(i, 1);
          i--;
        }
      }
    }
    for (let i = 0; i < workingList.length; i++) {
      const current = workingList[i];
      let visibleFills = [];
      if (fillToUse.length === 0 && current && current.type !== "FRAME" && (visibleFills = getVisibleFills(current)).length) {
        fillToUse = visibleFills;
        break;
      }
    }
    const initialFlatten = figma.flatten(workingList);
    if (!initialFlatten.parent)
      throw new Error("initialFlatten \u043D\u0435 \u0438\u043C\u0435\u0435\u0442 \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044F");
    const clonedFlatten = initialFlatten.clone();
    initialFlatten.parent.appendChild(clonedFlatten);
    clonedFlatten.x = initialFlatten.x;
    clonedFlatten.y = initialFlatten.y;
    const union = figma.union([initialFlatten, clonedFlatten], initialFlatten.parent);
    const finalFlatten = figma.flatten([union]);
    finalFlatten.fills = fillToUse.length ? fillToUse : [DEFAULT_PAINT];
    finalFlatten.name = nameToUse;
    return finalFlatten;
  }
  function uniformResamplePoints(points, targetCount) {
    const n = points.length;
    if (n === 0)
      return [];
    let distances = [];
    let totalLength = 0;
    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const d = distance(p1, p2);
      distances.push(d);
      totalLength += d;
    }
    const step = totalLength / targetCount;
    let newPoints = [];
    newPoints.push(points[0]);
    let currentDistance = 0;
    let segmentIndex = 0;
    for (let i = 1; i < targetCount; i++) {
      const targetDist = i * step;
      while (currentDistance + distances[segmentIndex] < targetDist) {
        currentDistance += distances[segmentIndex];
        segmentIndex++;
        if (segmentIndex >= n) {
          segmentIndex = n - 1;
          break;
        }
      }
      const remain = targetDist - currentDistance;
      const t = remain / distances[segmentIndex];
      const pStart = points[segmentIndex];
      const pEnd = points[(segmentIndex + 1) % n];
      newPoints.push({
        x: pStart.x + t * (pEnd.x - pStart.x),
        y: pStart.y + t * (pEnd.y - pStart.y)
      });
    }
    return newPoints;
  }
  function optimizePathDataToPointCount(pathData, targetCount) {
    const { points, closed } = parsePathDataToKeyPoints(pathData);
    const origCount = points.length;
    if (origCount === 0)
      return "";
    if (origCount === targetCount)
      return pathData;
    const newPoints = uniformResamplePoints(points, targetCount);
    return buildPathDataFromPoints(newPoints, closed);
  }
  function optimizeVectorOnNode(node, targetCount) {
    if (node.type !== "VECTOR" || !node.vectorPaths)
      return;
    const originalCornerRadius = node.cornerRadius;
    const desiredCount = Math.max(2, Math.floor(targetCount));
    const optimizedPaths = node.vectorPaths.map((path) => {
      const newData = optimizePathDataToPointCount(path.data, desiredCount);
      return { windingRule: path.windingRule, data: newData };
    });
    node.vectorPaths = optimizedPaths;
    if (originalCornerRadius !== void 0) {
      node.cornerRadius = originalCornerRadius;
    }
  }
  function getPathData(node) {
    if (node.vectorPaths && node.vectorPaths.length > 0) {
      return node.vectorPaths[0].data;
    }
    return "";
  }
  function extractOuterSubpath(pathData) {
    const parts = pathData.split(/(?=M)/);
    return parts[0].trim();
  }
  function translatePathData(pathData, dy) {
    var _a;
    const commandRegex = /([MLCQTAVHZ])([^MLCQTAVHZ]*)/gi;
    let result = "";
    let match;
    while ((match = commandRegex.exec(pathData)) !== null) {
      const cmd = match[1];
      const paramsStr = match[2].trim();
      if (paramsStr.length === 0) {
        result += cmd + " ";
        continue;
      }
      const numbers = ((_a = paramsStr.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)) == null ? void 0 : _a.map(Number)) || [];
      let newParams = [];
      switch (cmd) {
        case "M":
        case "L":
        case "T":
          for (let i = 0; i < numbers.length; i += 2) {
            newParams.push(numbers[i], numbers[i + 1] + dy);
          }
          break;
        case "C":
          for (let i = 0; i < numbers.length; i += 6) {
            newParams.push(
              numbers[i],
              numbers[i + 1] + dy,
              numbers[i + 2],
              numbers[i + 3] + dy,
              numbers[i + 4],
              numbers[i + 5] + dy
            );
          }
          break;
        case "Q":
          for (let i = 0; i < numbers.length; i += 4) {
            newParams.push(
              numbers[i],
              numbers[i + 1] + dy,
              numbers[i + 2],
              numbers[i + 3] + dy
            );
          }
          break;
        case "V":
          for (const n of numbers) {
            newParams.push(n + dy);
          }
          break;
        case "H":
          newParams = numbers;
          break;
        default:
          newParams = numbers;
          break;
      }
      result += cmd + " " + newParams.join(" ") + " ";
    }
    return result.trim();
  }
  function createStrokeVectorFromSvg(svgString, targetParent) {
    const svgNode = figma.createNodeFromSvg(svgString);
    let strokeVector = null;
    if (svgNode.type === "VECTOR") {
      strokeVector = svgNode;
    } else if ((svgNode.type === "GROUP" || svgNode.type === "FRAME") && svgNode.children && svgNode.children.length > 0) {
      for (const child of svgNode.children) {
        if (child.type === "VECTOR") {
          strokeVector = child;
          break;
        }
      }
      if (strokeVector) {
        targetParent.appendChild(strokeVector);
        svgNode.remove();
      }
    }
    return strokeVector;
  }
  function estimateCornerRadiusFromPathData(pathData) {
    const mMatch = pathData.match(/M\s*([\d.]+)\s+([\d.]+)/);
    const cMatch = pathData.match(/C\s*([\d.]+)\s+([\d.]+)/);
    if (mMatch && cMatch) {
      const xM = parseFloat(mMatch[1]);
      const xC = parseFloat(cMatch[1]);
      const k = 0.5522847498;
      return Math.abs(xM - xC) / k;
    }
    return 0;
  }
  function createRoundedRectPath(bbox, radius) {
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    const r = Math.min(radius, width / 2, height / 2);
    return `M ${bbox.minX + r} ${bbox.minY} H ${bbox.maxX - r} A ${r} ${r} 0 0 1 ${bbox.maxX} ${bbox.minY + r} V ${bbox.maxY - r} A ${r} ${r} 0 0 1 ${bbox.maxX - r} ${bbox.maxY} H ${bbox.minX + r} A ${r} ${r} 0 0 1 ${bbox.minX} ${bbox.maxY - r} V ${bbox.minY + r} A ${r} ${r} 0 0 1 ${bbox.minX + r} ${bbox.minY} Z`;
  }
  function createRectPath(bbox, offsets, cornerRadius) {
    const newBBox = {
      minX: bbox.minX + offsets.min,
      minY: bbox.minY + offsets.min,
      maxX: bbox.maxX + offsets.max,
      maxY: bbox.maxY + offsets.max
    };
    if (cornerRadius > 0) {
      return createRoundedRectPath(newBBox, cornerRadius);
    } else {
      return `M ${newBBox.minX} ${newBBox.maxY} V ${newBBox.minY} H ${newBBox.maxX} V ${newBBox.maxY} Z`;
    }
  }
  function filledToStrokeForNode(node, strokeWidth) {
    if (node.type !== "VECTOR" || !node.parent)
      return;
    const vectorNode = node;
    const fillColor = vectorNode.fills && vectorNode.fills.length > 0 ? vectorNode.fills[0].color : { r: 0, g: 0, b: 0 };
    const hexColor = rgbToHex(fillColor.r, fillColor.g, fillColor.b);
    const paths = vectorNode.vectorPaths;
    if (!paths || paths.length === 0) {
      figma.notify("\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u0443\u0442\u0438 \u0443 \u0432\u0435\u043A\u0442\u043E\u0440\u0430.");
      return;
    }
    const absBB = node.absoluteBoundingBox;
    const width = (absBB == null ? void 0 : absBB.width) || node.width || 24;
    const height = (absBB == null ? void 0 : absBB.height) || node.height || 24;
    let originalPathData = getPathData(vectorNode);
    if ((originalPathData.match(/M/g) || []).length > 1) {
      originalPathData = extractOuterSubpath(originalPathData);
    }
    let computedCR = node.cornerRadius;
    if (!computedCR || computedCR === 0) {
      const estimatedCR = estimateCornerRadiusFromPathData(originalPathData);
      if (estimatedCR > 0) {
        computedCR = estimatedCR;
      }
    }
    let finalNode;
    if (paths.length === 1) {
      let newPath;
      if (originalPathData.includes("C")) {
        newPath = translatePathData(originalPathData, strokeWidth / 2);
      } else {
        const { points } = parsePathDataToKeyPoints(originalPathData);
        const bbox = getBoundingBox(points);
        newPath = createRectPath(bbox, { min: 1.5, max: 0.5 }, computedCR);
      }
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
        <path d="${newPath}" stroke="${hexColor}" stroke-width="${strokeWidth}" fill="none" stroke-linejoin="miter"/>
      </svg>`;
      const strokeVector = createStrokeVectorFromSvg(svgString, node.parent);
      if (!strokeVector) {
        figma.notify("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C stroke vector.");
        return;
      }
      strokeVector.fills = [];
      strokeVector.strokes = [{ type: "SOLID", color: fillColor }];
      strokeVector.strokeWeight = strokeWidth;
      strokeVector.strokeJoin = "MITER";
      strokeVector.name = "Union";
      finalNode = strokeVector;
    } else {
      let newNodes = [];
      for (let i = 0; i < paths.length; i++) {
        let pathData = paths[i].data;
        if ((pathData.match(/M/g) || []).length > 1) {
          pathData = extractOuterSubpath(pathData);
        }
        if (pathData.includes("C")) {
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
            <path d="${translatePathData(pathData, strokeWidth / 2)}" stroke="${hexColor}" stroke-width="${strokeWidth}" fill="none" stroke-linejoin="miter"/>
          </svg>`;
          const strokeVector = createStrokeVectorFromSvg(svgString, node.parent);
          if (strokeVector) {
            strokeVector.fills = [];
            strokeVector.strokes = [{ type: "SOLID", color: fillColor }];
            strokeVector.strokeWeight = strokeWidth;
            strokeVector.strokeJoin = "MITER";
            strokeVector.name = i === 0 ? "Outer" : "Inner";
            newNodes.push(strokeVector);
          }
        }
      }
      if (newNodes.length === 0) {
        figma.notify("Filled to Stroke \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043B \u043D\u043E\u0432\u044B\u0435 \u0443\u0437\u043B\u044B.");
        return;
      }
      let unionNode = figma.union(newNodes, node.parent);
      let finalFlatten = figma.flatten([unionNode]);
      finalNode = finalFlatten;
    }
    if ("width" in node.parent && "height" in node.parent && "width" in finalNode && "height" in finalNode) {
      finalNode.x = (node.parent.width - finalNode.width) / 2;
      finalNode.y = (node.parent.height - finalNode.height) / 2;
    }
    if (computedCR !== void 0) {
      finalNode.cornerRadius = computedCR;
    }
    node.parent.appendChild(finalNode);
    node.remove();
  }
  function groupNodesByParent(nodes) {
    const groups = {};
    for (const node of nodes) {
      if (!node.parent)
        continue;
      const parentId = node.parent.id;
      if (!groups[parentId])
        groups[parentId] = [];
      groups[parentId].push(node);
    }
    return groups;
  }
  function getNodesByScope(scope) {
    const nodes = [];
    function traverse(node) {
      if ("children" in node) {
        for (const child of node.children) {
          if (child.type === "VECTOR")
            nodes.push(child);
          traverse(child);
        }
      }
    }
    if (scope === "selection") {
      return figma.currentPage.selection.filter((n) => n.type === "VECTOR" && n.parent !== null);
    } else if (scope === "page") {
      traverse(figma.currentPage);
    } else if (scope === "document") {
      for (const page of figma.root.children)
        traverse(page);
    }
    return nodes;
  }
  figma.ui.onmessage = (msg) => {
    const scope = msg.scope;
    const command = msg.command;
    if (command === "clean") {
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432\u0435\u043A\u0442\u043E\u0440\u043D\u044B\u0445 \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438.");
        return;
      }
      const grouped = groupNodesByParent(nodes);
      const cleanedNodes = [];
      for (const parentId in grouped) {
        const group = grouped[parentId];
        const clean = deeplyFlatten(group);
        cleanedNodes.push(clean);
      }
      figma.currentPage.selection = cleanedNodes;
      figma.notify("Clean Vector \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D.");
    } else if (command === "optimize") {
      const targetCount = Math.floor(Number(msg.targetPoints)) || 2;
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432\u0435\u043A\u0442\u043E\u0440\u043D\u044B\u0445 \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432 \u0434\u043B\u044F \u043E\u043F\u0442\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u0438.");
        return;
      }
      for (const node of nodes) {
        optimizeVectorOnNode(node, targetCount);
      }
      figma.notify("Optimize Vector \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D.");
    } else if (command === "filled") {
      const strokeW = parseFloat(msg.strokeWidth);
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432\u0435\u043A\u0442\u043E\u0440\u043D\u044B\u0445 \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432 \u0434\u043B\u044F Filled to Stroke.");
        return;
      }
      for (const node of nodes) {
        filledToStrokeForNode(node, strokeW);
      }
      figma.notify("Filled to Stroke \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D.");
    } else {
      figma.notify("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430.");
    }
  };
  figma.on("selectionchange", () => {
    const selection = figma.currentPage.selection;
    if (selection.length === 1 && selection[0].type === "VECTOR" && selection[0].vectorPaths && selection[0].vectorPaths.length > 0) {
      const total = selection[0].vectorPaths.reduce(
        (acc, path) => {
          const { points } = parsePathDataToKeyPoints(path.data);
          return acc + points.length;
        },
        0
      );
      figma.ui.postMessage({ type: "selectionUpdated", count: total });
    }
  });
  figma.showUI(__html__, { width: 480, height: 820 });
})();
