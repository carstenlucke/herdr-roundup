// The zoom steps of the PDF and image viewers. Pure, so tests/zoom-steps.test.mjs runs it in node.

export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** The step after `current` (the scale shown now, which Fit also has): up, the next larger
 *  one; down, the next smaller; at the ends it stays there. */
export const nextZoom = (current, up) => up ? ZOOMS.find((z) => z > current + 0.001) ?? ZOOMS.at(-1) : [...ZOOMS].reverse().find((z) => z < current - 0.001) ?? ZOOMS[0];
