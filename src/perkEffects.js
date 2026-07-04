// ============================================================
// PERK EFFECTS
//
// Bridges TreeNode/Tree (the skill tree) to characterState.js (the
// character sheet). A tree node may carry an `effects` array — one
// node can grant any number of independent stat bumps:
//
//   effects: [
//     { type: 'characteristic',    key: 'forma',    amount: 1 },
//     { type: 'skillExperience',   key: 'sila',      amount: 5 },
//     { type: 'skillImprovisation', key: 'sila',      amount: 1 },
//   ]
//
// Each entry gets its own stable modifier source id —
// `node:<nodeId>:<index in effects array>` — so multiple effects on
// the same node (even two targeting the same stat) apply and clear
// independently instead of overwriting one another.
//
// applyNodeEffect(node)  — called from TreeNode.onClick on activation
// removeNodeEffect(node) — called from TreeNode.onClick on deactivation,
//                          and from Tree's addNodeEffect()/
//                          removeNodeEffectAt() when an active node's
//                          effects list is edited
//
// Both are safe to call on a node with no effects (no-op).
//
// This module only imports characterState.js and characterSheet.js —
// neither of which import anything tree-related — so TreeNode.js and
// Tree.js can import this without creating a circular import.
// ============================================================

import { setPerkModifier, clearPerkModifiers, EFFECT_TYPES } from './characterState.js';
import { refreshCharacterSheet } from './characterSheet.js';

/** @param {import('./TreeNode.js').TreeNode} node */
export function applyNodeEffect(node) {
    if (!Array.isArray(node.effects) || node.effects.length === 0) return;

    node.effects.forEach((effect, index) => {
        if (!effect || !effect.type) return;

        const effectDef = EFFECT_TYPES.find(e => e.value === effect.type);
        if (!effectDef) {
            console.error(`perkEffects: unknown effect type "${effect.type}" on node "${node.nodeId}" (effect #${index}).`);
            return;
        }
        if (effectDef.needsKey !== false && !effect.key) return; // malformed — missing required target

        setPerkModifier(
            effectDef.fieldPath(effect.key),
            `node:${node.nodeId}:${index}`,
            effect.amount,
            `${effectDef.label}: ${node.nodeName}`
        );
    });

    refreshCharacterSheet();
}

/** @param {import('./TreeNode.js').TreeNode} node */
export function removeNodeEffect(node) {
    if (!Array.isArray(node.effects) || node.effects.length === 0) return;

    node.effects.forEach((_, index) => clearPerkModifiers(`node:${node.nodeId}:${index}`));

    refreshCharacterSheet();
}
