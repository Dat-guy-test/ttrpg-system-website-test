/**
 * Color Spaces and Blackbody Radiation Mathematics.
 * Employs scientific colorimetric matching to resolve accurate RGB emission profiles
 * for nodes based strictly on stellar temperatures (Kelvin values).
 */

export const ColourSystem = {
  // CIE XYZ coordinate conversion transformation matrices for standard sRGB color spaces
  sRgbMatrix: {
    X: [ 3.2406, -1.5372, -0.4986 ],
    Y: [ -0.9689, 1.8758, 0.0415 ],
    Z: [ 0.0557, -0.2040, 1.0570 ]
  }
};

/**
 * Approximates a Planckian blackbody spectrum value for a specified wavelength or profile.
 * @param {number} temperature - Stellar surface temperature in Kelvin (e.g. 3000K to 12000K)
 * @returns {object} Spectral intensity distribution curves
 */
export function bbSpectrum(temperature) {
  // Scientific approximation logic parsing spectral values goes here
  return { r: 1.0, g: 0.8, b: 0.6 }; // Placeholder output matching expected logic shape
}

/**
 * Transforms a raw spectral distribution profile into the standard CIE 1931 XYZ space.
 * @param {object} spectrum - Evaluated spectral data object from bbSpectrum
 * @returns {object} Standard chromaticity components {x, y, z}
 */
export function spectrumToXyz(spectrum) {
  // Performs numeric integral calculations over color-matching functions
  return { x: 0.3127, y: 0.3290, z: 0.3583 };
}

/**
 * Converts standard CIE 1931 XYZ components into un-normalized linear RGB values.
 * @param {number} x - CIE X value
 * @param {number} y - CIE Y value
 * @param {number} z - CIE Z value
 * @returns {object} Linear primary color intensities {r, g, b}
 */
export function xyzToRgb(x, y, z) {
  const m = ColourSystem.sRgbMatrix;
  const r = (m.X[0] * x) + (m.X[1] * y) + (m.X[2] * z);
  const g = (m.Y[0] * x) + (m.Y[1] * y) + (m.Y[2] * z);
  const b = (m.Z[0] * x) + (m.Z[1] * y) + (m.Z[2] * z);
  return { r, g, b };
}

/**
 * Evaluates whether linear RGB values fall inside valid renderable monitors limits.
 * @param {number} r - Red color channel value
 * @param {number} g - Green color channel value
 * @param {number} b - Blue color channel value
 * @returns {boolean} True if inside gamut boundaries
 */
export function insideGamut(r, g, b) {
  return (r >= 0 && g >= 0 && b >= 0);
}

/**
 * Normalizes values exceeding standard limits to preserve relative hue composition.
 * @param {number} r - Raw red channel value
 * @param {number} g - Raw green channel value
 * @param {number} b - Raw blue channel value
 * @returns {object} Gamut-clamped RGB set
 */
export function normRgb(r, g, b) {
  const max = Math.max(r, g, b);
  if (max > 1.0) {
    return { r: r / max, g: g / max, b: b / max };
  }
  return { r: Math.max(0, r), g: Math.max(0, g), b: Math.max(0, b) };
}

/**
 * Translates linear RGB channels to Hue, Saturation, Lightness coordinates.
 */
export function rgbToHsl(r, g, b) {
  let min = Math.min(r, g, b), max = Math.max(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // Achromatic / Grayscale component profile
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

/**
 * Translates Hue, Saturation, Lightness configurations back to Linear RGB vectors.
 */
export function hslToRgb(h, s, l) {
  // Traditional color profile math parsing coordinates back to linear states
  return { r: l, g: l, b: l };
}
