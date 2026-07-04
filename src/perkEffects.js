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
// refreshPerksTaken() rebuilds the sheet's "Wybrane Perki" list from
// scratch based on which tree nodes are CURRENTLY active — called
// unconditionally on every activation/deactivation (regardless of
// whether the node carries any stat effects), so it lives as its own
// function rather than being folded into apply/removeNodeEffect above.
//
// This module imports appState.js (a pure leaf — see its own header
// comment — so this creates no cycle) plus characterState.js and
// characterSheet.js — neither of which import anything tree-related —
// so TreeNode.js and Tree.js can import this without creating a
// circular import.
// ============================================================

import AppState from './appState.js';
import { setPerkModifier, clearPerkModifiers, setPerksTaken, EFFECT_TYPES } from './characterState.js';
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

/**
 * Rebuilds the "Wybrane Perki" list on the character sheet from
 * scratch, based on which tree nodes are CURRENTLY active. Call this
 * after every activation/deactivation — unlike apply/removeNodeEffect,
 * it doesn't matter whether the node carries any stat effects; a
 * perk with no stat effect at all should still show up in this list.
 */
export function refreshPerksTaken() {
    if (!AppState.tr) return;
    const active = AppState.tr.nodes
        .filter(n => n.nodeActive)
        .map(n => ({ id: n.nodeId, name: n.nodeName }));
    setPerksTaken(active);
    refreshCharacterSheet();
}
