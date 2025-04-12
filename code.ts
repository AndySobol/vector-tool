/// <reference types="@figma/plugin-typings" />

/*
  Plugin: Vector Optimizer

  Функционал:
    1. Clean Vector – функция deeplyFlatten распаковывает группы, объединяет слои и сохраняет fills.
    2. Optimize Vector – пересэмплирует SVG-путь выбранного векторного узла по числу ключевых точек, сохраняя cornerRadius.
    3. Filled to Stroke – преобразует вектор с заливкой (Fill) в вектор с обводкой (Stroke). Если в векторе обнаружены кривые (команда "C"),
       то форма считается сложной и, в случае составных путей, остаётся только внутренний контур (полость). Для сложных фигур (несколько путей)
       для каждого контура с кривыми создаётся отдельный stroke‑узел, после чего они объединяются через figma.union и flatten,
       чтобы получить один итоговый VECTOR. Итоговый узел центрируется в родительском контейнере, применяется обводка,
       а значение cornerRadius копируется или вычисляется (если исходно равно 0).
*/

/* ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ================== */
interface Point {
    x: number;
    y: number;
  }
  
  function nearlyEqual(p1: Point, p2: Point, epsilon = 0.001): boolean {
    return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
  }
  
  function distance(p1: Point, p2: Point): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  
  function douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points;
    const getDistance = (point: Point, start: Point, end: Point): number => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx === 0 && dy === 0) return distance(point, start);
      const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
      const clampedT = Math.max(0, Math.min(1, t));
      const projX = start.x + clampedT * dx;
      const projY = start.y + clampedT * dy;
      return distance(point, { x: projX, y: projY });
    };
    let maxDistance = 0, index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const d = getDistance(points[i], points[0], points[points.length - 1]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (maxDistance >= epsilon) {
      const recResults1 = douglasPeucker(points.slice(0, index + 1), epsilon);
      const recResults2 = douglasPeucker(points.slice(index), epsilon);
      return recResults1.slice(0, -1).concat(recResults2);
    } else {
      return [points[0], points[points.length - 1]];
    }
  }
  
  function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const mt = 1 - t;
    return {
      x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
    };
  }
  
  function parsePathDataToKeyPoints(pathData: string): { points: Point[]; closed: boolean } {
    let points: Point[] = [];
    let closed = false;
    const commandRegex = /([MLCZ])([^MLCZ]*)/gi;
    let match;
    while ((match = commandRegex.exec(pathData)) !== null) {
      const command = match[1];
      const params = match[2].trim();
      if (command === "M" || command === "L") {
        const numbers = params.match(/[-+]?[0-9]*\.?[0-9]+/g)?.map(Number) || [];
        for (let i = 0; i < numbers.length; i += 2) {
          points.push({ x: numbers[i], y: numbers[i + 1] });
        }
      } else if (command === "C") {
        const numbers = params.match(/[-+]?[0-9]*\.?[0-9]+/g)?.map(Number) || [];
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
  
  function buildPathDataFromPoints(points: Point[], closed: boolean): string {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    if (closed) d += " Z";
    return d;
  }
  
  function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
    for (const pt of points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { minX, minY, maxX, maxY };
  }
  
  /* ================== HEX COLOR ФУНКЦИЯ ================== */
  function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  
  /* ================== CORE TYPES ================== */
  interface Paint {
    type: string;
    color: RGB;
    visible?: boolean;
  }
  interface SolidPaint extends Paint {
    type: "SOLID";
    color: RGB;
  }
  interface RGB {
    r: number;
    g: number;
    b: number;
  }
  interface Transform extends Array<[number, number, number]> {}
  
  interface BaseNode {
    id: string;
    parent: BaseNode | null;
    name: string;
    type: string;
    children?: BaseNode[];
    remove(): void;
    clone(): BaseNode;
  }
  interface SceneNode extends BaseNode {
    x: number;
    y: number;
    width?: number;
    height?: number;
    fills?: Paint[];
    strokes?: Paint[];
    strokeWeight?: number;
    cornerRadius?: number;
  }
  interface VectorNode extends SceneNode {
    type: "VECTOR";
    vectorPaths: { windingRule: string; data: string }[];
    fills: Paint[];
    strokes: Paint[];
    strokeWeight: number;
    outlineStroke: () => VectorNode | null;
  }
  
  const DEFAULT_PAINT: SolidPaint = {
    type: "SOLID",
    color: { r: 0.5, g: 0.5, b: 0.5 },
  };
  
  const IDENTITY: Transform = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  
  function getVisibleFills(node: SceneNode): Paint[] {
    const isVisible = (fill: Paint) =>
      typeof fill === "object" && fill !== null && (fill as any).visible !== false;
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0 && node.fills.some(isVisible)) {
      return node.fills.filter(isVisible);
    }
    return [];
  }
  
  function getAbsoluteTransformDiff(a: SceneNode, b: SceneNode): { x: number; y: number } {
    const aTransform = ("absoluteTransform" in a && (a as any).absoluteTransform) || IDENTITY;
    const bTransform = ("absoluteTransform" in b && (b as any).absoluteTransform) || IDENTITY;
    return { x: bTransform[0][2] - aTransform[0][2], y: bTransform[1][2] - aTransform[1][2] };
  }
  
  /* ================== CLEAN VECTOR ================== */
  function deeplyFlatten(nodes: readonly SceneNode[]): VectorNode {
    const nameToUse = nodes.length === 1 ? nodes[0].name : "Flattened";
    let fillToUse: Paint[] = [];
    const workingList: SceneNode[] = [...nodes];
    for (let i = 0; i < workingList.length; i++) {
      const current = workingList[i];
      if (!current.parent) continue;
      const parent = current.parent;
      const isTopLevel = parent.type === "PAGE";
      if ("children" in current && current.type !== "BOOLEAN_OPERATION") {
        workingList.push(...current.children);
        if (!isTopLevel) {
          for (const child of current.children) {
            const diff = getAbsoluteTransformDiff(parent, child);
            (parent as any).appendChild(child);
            child.x = diff.x;
            child.y = diff.y;
          }
          if (!(current as any).removed) current.remove();
          workingList.splice(i, 1);
          i--;
        }
      }
    }
    for (let i = 0; i < workingList.length; i++) {
      const current = workingList[i];
      let visibleFills: Paint[] = [];
      if (fillToUse.length === 0 && current && current.type !== "FRAME" && (visibleFills = getVisibleFills(current)).length) {
        fillToUse = visibleFills;
        break;
      }
    }
    const initialFlatten = figma.flatten(workingList);
    if (!initialFlatten.parent) throw new Error("initialFlatten не имеет родителя");
    const clonedFlatten = initialFlatten.clone();
    initialFlatten.parent.appendChild(clonedFlatten);
    clonedFlatten.x = initialFlatten.x;
    clonedFlatten.y = initialFlatten.y;
    const union = figma.union([initialFlatten, clonedFlatten], initialFlatten.parent);
    const finalFlatten = figma.flatten([union]);
    finalFlatten.fills = fillToUse.length ? fillToUse : [DEFAULT_PAINT];
    finalFlatten.name = nameToUse;
    return finalFlatten as VectorNode;
  }
  
  /* ================== OPTIMIZE VECTOR ================== */
  function uniformResamplePoints(points: Point[], targetCount: number): Point[] {
    const n = points.length;
    if (n === 0) return [];
    let distances: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const d = distance(p1, p2);
      distances.push(d);
      totalLength += d;
    }
    const step = totalLength / targetCount;
    let newPoints: Point[] = [];
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
        y: pStart.y + t * (pEnd.y - pStart.y),
      });
    }
    return newPoints;
  }
  
  function optimizePathDataToPointCount(pathData: string, targetCount: number): string {
    const { points, closed } = parsePathDataToKeyPoints(pathData);
    const origCount = points.length;
    if (origCount === 0) return "";
    if (origCount === targetCount) return pathData;
    const newPoints = uniformResamplePoints(points, targetCount);
    return buildPathDataFromPoints(newPoints, closed);
  }
  
  function optimizeVectorOnNode(node: SceneNode, targetCount: number): void {
    if (node.type !== "VECTOR" || !(node as any).vectorPaths) return;
    const originalCornerRadius = (node as any).cornerRadius;
    const desiredCount = Math.max(2, Math.floor(targetCount));
    const optimizedPaths = (node as any).vectorPaths.map((path: { windingRule: string; data: string }) => {
      const newData = optimizePathDataToPointCount(path.data, desiredCount);
      return { windingRule: path.windingRule, data: newData };
    });
    (node as any).vectorPaths = optimizedPaths;
    if (originalCornerRadius !== undefined) {
      (node as any).cornerRadius = originalCornerRadius;
    }
  }
  
  /* ================== GET PATH DATA ================== */
  function getPathData(node: VectorNode): string {
    if (node.vectorPaths && node.vectorPaths.length > 0) {
      return node.vectorPaths[0].data;
    }
    return "";
  }
  
  /* ================== ФУНКЦИИ ДЛЯ FILLED TO STROKE ================== */
  
  /**
   * Извлекает внутренний субпуть из составного пути.
   * Если в строке d-атрибута содержится более одного начального "M", возвращает второй субпуть.
   */
  function extractOuterSubpath(pathData: string): string {
    const parts = pathData.split(/(?=M)/);
    return parts[0].trim();
  }

  /**
 * Применяет вертикальный сдвиг к координатам пути.
 * Для команд с парными координатами (M, L, T) добавляет смещение только к y-координате.
 * Для кривых (C) – ко всем парам y (команды вида C: [x1,y1, x2,y2, x,y]).
 * Для команды V – смещает значение, а для H оставляет без изменений.
 */

  function translatePathData(pathData: string, dy: number): string {
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
      // Получаем все числа в строке команды.
      const numbers = paramsStr.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
      let newParams: number[] = [];
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
              numbers[i], numbers[i + 1] + dy,
              numbers[i + 2], numbers[i + 3] + dy,
              numbers[i + 4], numbers[i + 5] + dy
            );
          }
          break;
        case "Q":
          for (let i = 0; i < numbers.length; i += 4) {
            newParams.push(
              numbers[i], numbers[i + 1] + dy,
              numbers[i + 2], numbers[i + 3] + dy
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
        // Команды без параметров и прочие – оставляем как есть.
        default:
          newParams = numbers;
          break;
      }
      result += cmd + " " + newParams.join(" ") + " ";
    }
    return result.trim();
  }
  
  /**
   * Создаёт векторный узел из SVG без лишней обёртки.
   */
  function createStrokeVectorFromSvg(svgString: string, targetParent: SceneNode): VectorNode | null {
    const svgNode = figma.createNodeFromSvg(svgString);
    let strokeVector: VectorNode | null = null;
    if (svgNode.type === "VECTOR") {
      strokeVector = svgNode as VectorNode;
    } else if (
      (svgNode.type === "GROUP" || svgNode.type === "FRAME") &&
      svgNode.children &&
      svgNode.children.length > 0
    ) {
      for (const child of svgNode.children) {
        if (child.type === "VECTOR") {
          strokeVector = child as VectorNode;
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
  
  /**
   * Оценивает cornerRadius по данным SVG-пути.
   * Если в пути присутствуют команды "M" и "C", рассчитывает округление по разнице между координатой M и первой координатой C.
   */
  function estimateCornerRadiusFromPathData(pathData: string): number {
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
  
  /**
   * Генерирует путь прямоугольника с закруглёнными углами.
   */
  function createRoundedRectPath(
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    radius: number
  ): string {
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    const r = Math.min(radius, width / 2, height / 2);
    return `M ${bbox.minX + r} ${bbox.minY} ` +
           `H ${bbox.maxX - r} ` +
           `A ${r} ${r} 0 0 1 ${bbox.maxX} ${bbox.minY + r} ` +
           `V ${bbox.maxY - r} ` +
           `A ${r} ${r} 0 0 1 ${bbox.maxX - r} ${bbox.maxY} ` +
           `H ${bbox.minX + r} ` +
           `A ${r} ${r} 0 0 1 ${bbox.minX} ${bbox.maxY - r} ` +
           `V ${bbox.minY + r} ` +
           `A ${r} ${r} 0 0 1 ${bbox.minX + r} ${bbox.minY} Z`;
  }
  
  /**
   * Строит путь по bounding box с заданными offset'ами.
   * Если cornerRadius > 0, генерируется путь с закруглением, иначе – простой прямоугольный путь.
   */
  function createRectPath(
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    offsets: { min: number; max: number },
    cornerRadius: number
  ): string {
    const newBBox = {
      minX: bbox.minX + offsets.min,
      minY: bbox.minY + offsets.min,
      maxX: bbox.maxX + offsets.max,
      maxY: bbox.maxY + offsets.max,
    };
    if (cornerRadius > 0) {
      return createRoundedRectPath(newBBox, cornerRadius);
    } else {
      return `M ${newBBox.minX} ${newBBox.maxY} V ${newBBox.minY} H ${newBBox.maxX} V ${newBBox.maxY} Z`;
    }
  }
  
  /**
   * Функция Filled to Stroke.
   * Если в векторе один путь и d-атрибут содержит кривые ("C"), оставляет исходный путь.
   * Если несколько путей, для каждого пути с кривыми создаёт отдельный stroke‑узел,
   * затем объединяет их через figma.union и flatten для получения одного итогового вектора.
   * При этом, если составной d-атрибут содержит несколько субпутей (например, внешний и внутренний контур),
   * выбирается внутренний субпуть (с помощью extractInnerSubpath).
   * Итоговый узел центрируется в родительском контейнере, заливка удаляется, применяется обводка,
   * а значение cornerRadius (либо заданное, либо вычисленное) сохраняется.
   */
  function filledToStrokeForNode(node: SceneNode, strokeWidth: number): void {
    if (node.type !== "VECTOR" || !node.parent) return;
    const vectorNode = node as VectorNode;
    const fillColor = (vectorNode.fills && vectorNode.fills.length > 0)
      ? vectorNode.fills[0].color
      : { r: 0, g: 0, b: 0 };
    const hexColor = rgbToHex(fillColor.r, fillColor.g, fillColor.b);
    const paths = vectorNode.vectorPaths;
    if (!paths || paths.length === 0) {
      figma.notify("Нет данных пути у вектора.");
      return;
    }
    const absBB = node.absoluteBoundingBox;
    const width = absBB?.width || node.width || 24;
    const height = absBB?.height || node.height || 24;
  
    let originalPathData = getPathData(vectorNode);
    // Если в d-атрибуте несколько субпутей, выбираем внешний (первый) вместо внутреннего
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
  
    let finalNode: SceneNode;
    // Если вектор содержит один путь…
    if (paths.length === 1) {
      let newPath: string;
      if (originalPathData.includes("C")) {
        // Для кривых применяем вертикальное смещение – stroke выравнивается по центру
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
        figma.notify("Не удалось создать stroke vector.");
        return;
      }
      strokeVector.fills = [];
      strokeVector.strokes = [{ type: "SOLID", color: fillColor }];
      strokeVector.strokeWeight = strokeWidth;
      strokeVector.strokeJoin = "MITER";
      strokeVector.name = "Union";
      finalNode = strokeVector;
    }
    // Если вектор содержит несколько путей – считаем его сложным.
    else {
      let newNodes: VectorNode[] = [];
      for (let i = 0; i < paths.length; i++) {
        let pathData = paths[i].data;
        // Если у пути несколько субпутей, выбираем внешний контур
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
            // Назначаем внешний контур первому узлу, а для остальных – внутренний (хотя фактически внутренний уже удаляется)
            strokeVector.name = i === 0 ? "Outer" : "Inner";
            newNodes.push(strokeVector);
          }
        }
      }
      if (newNodes.length === 0) {
        figma.notify("Filled to Stroke не создал новые узлы.");
        return;
      }
      let unionNode = figma.union(newNodes, node.parent);
      let finalFlatten = figma.flatten([unionNode]);
      finalNode = finalFlatten;
    }
  
    // Центрирование итогового узла в родительском контейнере (если заданы размеры)
    if ("width" in node.parent && "height" in node.parent && "width" in finalNode && "height" in finalNode) {
      finalNode.x = (node.parent.width - finalNode.width) / 2;
      finalNode.y = (node.parent.height - finalNode.height) / 2;
    }
  
    if (computedCR !== undefined) {
      (finalNode as any).cornerRadius = computedCR;
    }
  
    node.parent.appendChild(finalNode);
    node.remove();
  }
  
  
  /* ================== ОБРАБОТКА UI ================== */
  function groupNodesByParent(nodes: SceneNode[]): { [parentId: string]: SceneNode[] } {
    const groups: { [parentId: string]: SceneNode[] } = {};
    for (const node of nodes) {
      if (!node.parent) continue;
      const parentId = node.parent.id;
      if (!groups[parentId]) groups[parentId] = [];
      groups[parentId].push(node);
    }
    return groups;
  }
  
  function getNodesByScope(scope: string): SceneNode[] {
    const nodes: SceneNode[] = [];
    function traverse(node: BaseNode): void {
      if ("children" in node) {
        for (const child of node.children) {
          if (child.type === "VECTOR") nodes.push(child);
          traverse(child);
        }
      }
    }
    if (scope === "selection") {
      return figma.currentPage.selection.filter((n): n is SceneNode => n.type === "VECTOR" && n.parent !== null);
    } else if (scope === "page") {
      traverse(figma.currentPage);
    } else if (scope === "document") {
      for (const page of figma.root.children) traverse(page);
    }
    return nodes;
  }
  
  figma.ui.onmessage = (msg) => {
    const scope: string = msg.scope;
    const command: string = msg.command;
    if (command === "clean") {
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("Не найдено векторных объектов в выбранной области.");
        return;
      }
      const grouped = groupNodesByParent(nodes);
      const cleanedNodes: VectorNode[] = [];
      for (const parentId in grouped) {
        const group = grouped[parentId];
        const clean = deeplyFlatten(group);
        cleanedNodes.push(clean);
      }
      figma.currentPage.selection = cleanedNodes;
      figma.notify("Clean Vector выполнен.");
    } else if (command === "optimize") {
      const targetCount: number = Math.floor(Number(msg.targetPoints)) || 2;
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("Не найдено векторных объектов для оптимизации.");
        return;
      }
      for (const node of nodes) {
        optimizeVectorOnNode(node, targetCount);
      }
      figma.notify("Optimize Vector выполнен.");
    } else if (command === "filled") {
      const strokeW: number = parseFloat(msg.strokeWidth);
      const nodes = getNodesByScope(scope);
      if (nodes.length === 0) {
        figma.notify("Не найдено векторных объектов для Filled to Stroke.");
        return;
      }
      for (const node of nodes) {
        filledToStrokeForNode(node, strokeW);
      }
      figma.notify("Filled to Stroke выполнен.");
    } else {
      figma.notify("Неизвестная команда.");
    }
  };
  
  figma.on("selectionchange", () => {
    const selection = figma.currentPage.selection;
    if (
      selection.length === 1 &&
      selection[0].type === "VECTOR" &&
      (selection[0] as any).vectorPaths &&
      (selection[0] as any).vectorPaths.length > 0
    ) {
      const total = (selection[0] as any).vectorPaths.reduce(
        (acc: number, path: { data: string }) => {
          const { points } = parsePathDataToKeyPoints(path.data);
          return acc + points.length;
        },
        0
      );
      figma.ui.postMessage({ type: "selectionUpdated", count: total });
    }
  });
  
  figma.showUI(__html__, { width: 480, height: 820 });
  