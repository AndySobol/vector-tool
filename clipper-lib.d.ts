declare module 'clipper-lib' {
    namespace ClipperLib {
      enum PolyType {
        ptSubject = 0,
        ptClip = 1
      }
      
      enum ClipType {
        ctIntersection = 0,
        ctUnion = 1,
        ctDifference = 2,
        ctXor = 3
      }
      
      enum PolyFillType {
        pftEvenOdd = 0,
        pftNonZero = 1,
        pftPositive = 2,
        pftNegative = 3
      }
      
      interface IntPoint {
        X: number;
        Y: number;
      }
      
      type Path = IntPoint[];
      type Paths = Path[];
      
      class Clipper {
        constructor();
        AddPath(path: Path, polyType: PolyType, closed: boolean): void;
        AddPaths(paths: Paths, polyType: PolyType, closed: boolean): void;
        Execute(clipType: ClipType, solution: Paths, subjFillType: PolyFillType, clipFillType: PolyFillType): boolean;
      }
      
      const Paths: {
        new(): Paths;
      };
    }
    
    export default ClipperLib;
  }
  