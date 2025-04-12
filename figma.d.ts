declare namespace figma {
  interface BaseNode {
    id: string;
    parent: BaseNode | null;
    name: string;
    type: string;
    children?: BaseNode[];
    remove(): void;
    clone(): BaseNode;
    insertChild(index: number, node: SceneNode): void;
  }

  interface SceneNode extends BaseNode {
    x: number;
    y: number;
    visible: boolean;
    fills?: Paint[];
    strokes?: Paint[];
    strokeWeight?: number;
    // Можно добавить width и height, если они требуются для расчетов
    width?: number;
    height?: number;
  }

  interface VectorNode extends SceneNode {
    type: "VECTOR";
    vectorPaths: Array<{
      windingRule: string;
      data: string;
    }>;
    fills: Paint[];
    strokes: Paint[];
    strokeWeight: number;
    outlineStroke(): VectorNode | null;
  }

  interface Paint {
    type: string;
    color: RGB;
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

  interface UI {
    showUI(html: string, options: { width: number; height: number }): void;
    onmessage: (callback: (msg: any) => void) => void;
  }

  interface CurrentPage {
    selection: SceneNode[];
    children: SceneNode[];
  }

  interface Root extends BaseNode {
    children: SceneNode[];
  }

  const ui: UI;
  const currentPage: CurrentPage;
  const root: Root;

  function createNodeFromSvg(svg: string): SceneNode;
  function flatten(nodes: SceneNode[], parent: BaseNode): SceneNode;
  function notify(message: string): void;
}

declare const __html__: string;
