declare module "js-aruco2/src/aruco.js" {
  export const AR: {
    Detector: new (cfg: { dictionaryName: string }) => {
      detect(img: { width: number; height: number; data: Uint8ClampedArray }): {
        id: number;
        corners: { x: number; y: number }[];
      }[];
    };
    Dictionary: new (name: string) => { generateSVG(id: number): string; markSize: number };
  };
}
declare module "js-aruco2/src/dictionaries/aruco_4x4_1000.js";
