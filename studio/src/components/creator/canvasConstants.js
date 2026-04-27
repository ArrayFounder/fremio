export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

const WIDTH_SCALE = CANVAS_WIDTH / 480;
const HEIGHT_SCALE = CANVAS_HEIGHT / 853;

export const DEFAULT_ELEMENT_MIN = Math.round(60 * WIDTH_SCALE);
export const DEFAULT_UPLOAD_WIDTH = Math.round(160 * WIDTH_SCALE);
export const DEFAULT_UPLOAD_HEIGHT = Math.round(160 * HEIGHT_SCALE);
export const BACKGROUND_MIN_SHORT_SIDE = Math.round(120 * Math.min(WIDTH_SCALE, HEIGHT_SCALE));
