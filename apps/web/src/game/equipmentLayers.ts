import type { LayerSheet } from "./characterRig";

/**
 * Maps an equippable item to the pose sheet that draws it on the character. Keys are either the plain
 * item id or `itemId:female` / `itemId:male` when a piece needs a different cut per body.
 *
 * The registry is empty because no equipment art exists yet. That is deliberate: an unregistered item
 * draws nothing rather than a shape guessing at its silhouette. To light a slot up, produce a sheet to
 * the spec in `data/characters/layers.json`, load it in the scene's preload, and add its entry here —
 * no other code changes are needed.
 *
 * Sheet requirements, matching the body sheets the rig already drives:
 *   - one row of 8 poses, drawn facing left, transparent background
 *   - at least 20 transparent pixels between poses so frames can be cut without clipping
 *   - every pose aligned to a shared bottom baseline and a shared y band
 *   - drawn over the same body proportions, so a sleeve lands on the arm it belongs to
 */
export const equipmentLayerSheets: Record<string, LayerSheet> = {};
