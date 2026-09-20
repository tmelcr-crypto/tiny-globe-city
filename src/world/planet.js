// The one number the whole world is built from. It lives on its own so the
// land (globe.js) and the shape of it (terrain.js) can both have it without
// importing each other.
//
// Metres. Sized so a city built to human scale (1 unit = 1 m, player 1.5 m)
// actually fits with enough density to look like a city from the camera — on a
// 50 m globe, realistically sized buildings cover the whole planet.
export const GLOBE_RADIUS = 160;
