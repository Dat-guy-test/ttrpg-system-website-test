// ============================================================
// PERK EFFECTS
//
// Bridges TreeNode/Tree (the skill tree) to characterState.js (the
// character sheet). A tree node may carry an `effect` describing
// what it does to the sheet when active:
//
//   { type: 'characteristic'|'skillExperience'|'skillImprovisation',
//     key: string,     // e.g. 'forma', 'sila' — see EFFECT_TYPES
//     amount: number }
//
// applyNodeEffect(node)  — called from TreeNode.onClick on activation
// removeNodeEffect(node) — called from TreeNode.onClick on deactivation,
//                          and from Tree.setNodeEffect() when an
//                          active node's effect definition is edited
//
// Both are safe to call on a node with no effect (no-op).
//
// This module only imports characterState.js and characterSheet.js —
// neither of which import anything tree-related — so TreeNode.js and
// Tree.js can import this without creating a circular import.
// ============================================================

import { setPerkModifier, clearPerkModifiers, EFFECT_TYPES } from './characterState.js';
import { refreshCharacterSheet } from './characterSheet.js';

/** @param {import('./TreeNode.js').TreeNode} node */
export function applyNodeEffect(node) {
    if (!node.effect || !node.effect.type || !node.effect.key) return;

    const effectDef = EFFECT_TYPES.find(e => e.value === node.effect.type);
    if (!effectDef) {
        console.error(`perkEffects: unknown effect type "${node.effect.type}" on node "${node.nodeId}".`);
        return;
    }

    setPerkModifier(
        effectDef.fieldPath(node.effect.key),
        `node:${node.nodeId}`,
        node.effect.amount,
        `${effectDef.label}: ${node.nodeName}`
    );
    refreshCharacterSheet();
}

/** @param {import('./TreeNode.js').TreeNode} node */
export function removeNodeEffect(node) {
    if (!node.effect) return;
    clearPerkModifiers(`node:${node.nodeId}`);
    refreshCharacterSheet();
}
