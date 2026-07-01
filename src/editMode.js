// ============================================================
// EDIT MODE
//
// Step 1 of the skill-tree editor: a toggleable edit mode with a
// read-only inspector panel. Clicking a node in edit mode selects
// it and displays its fields in the panel — nothing is writable
// yet, and no new nodes/connections can be created yet. Those are
// separate follow-up steps built on top of this one.
//
// Exports:
//   initEditMode()   — builds the (hidden) panel DOM. Call once at
//                       boot, after AppState.scene exists.
//   toggleEditMode() — flips AppState.editMode and shows/hides the
//                       panel. Bound to the 'E' key in inputHandlers.js.
//   handleEditModeNodeClick(node) — called from TreeNode.onClick
//                       when AppState.editMode is true, instead of
//                       the normal perk-activation logic.
//
// This module only imports AppState — it has no local imports back
// into Tree.js / TreeNode.js, so Tree.js and TreeNode.js are free to
// import THIS module without creating a circular import.
// ============================================================

import AppState from './appState.js';


let panelEl  = null;
let bodyEl   = null; // the part of the panel that gets re-rendered per selection


// ============================================================
// initEditMode
// Builds the panel once, appends it to the document, and leaves it
// hidden until edit mode is toggled on.
// ============================================================
export function initEditMode() {
    panelEl = document.createElement('div');
    panelEl.id = 'editorPanel';
    panelEl.className = 'editor-panel editor-hidden';

    panelEl.innerHTML = `
        <div class="editor-header">
            <strong>Edit Mode</strong>
            <span class="editor-hint">press <kbd>E</kbd> to toggle</span>
        </div>
        <div class="editor-body" id="editorBody">
            <em>Click a node to inspect it.</em>
        </div>
    `;

    document.body.appendChild(panelEl);
    bodyEl = panelEl.querySelector('#editorBody');
}


// ============================================================
// toggleEditMode
// ============================================================
export function toggleEditMode() {
    AppState.editMode = !AppState.editMode;
    AppState.selectedNode = null;

    if (panelEl) {
        panelEl.classList.toggle('editor-hidden', !AppState.editMode);
    }
    renderInspector();

    console.log(`Edit mode ${AppState.editMode ? 'ON' : 'OFF'}`);
}


// ============================================================
// handleEditModeNodeClick
// Called from TreeNode.onClick instead of the perk-activation
// logic whenever AppState.editMode is true. For now this only
// selects the node for the read-only inspector — writing to its
// fields, adding nodes, and connecting nodes are later steps.
// ============================================================
export function handleEditModeNodeClick(node) {
    AppState.selectedNode = node;
    renderInspector();
}


// ============================================================
// renderInspector
// Re-renders the panel body from the currently selected node (or
// shows a placeholder if nothing is selected).
// ============================================================
function renderInspector() {
    if (!bodyEl) return;

    const node = AppState.selectedNode;
    if (!node) {
        bodyEl.innerHTML = '<em>Click a node to inspect it.</em>';
        return;
    }

    bodyEl.innerHTML = `
        <div class="editor-field"><span class="editor-label">ID</span><span>${escapeHtml(node.nodeId)}</span></div>
        <div class="editor-field"><span class="editor-label">Name</span><span>${escapeHtml(node.nodeName)}</span></div>
        <div class="editor-field"><span class="editor-label">Description</span><span>${formatDescription(node.nodeDesc)}</span></div>
        <div class="editor-field"><span class="editor-label">Hover text</span><span>${escapeHtml(node.hovertext)}</span></div>
        <div class="editor-field"><span class="editor-label">Cost</span><span>${node.nodeCost}</span></div>
        <div class="editor-field"><span class="editor-label">Temperature</span><span>${node.temperature} K</span></div>
        <div class="editor-field"><span class="editor-label">Position</span><span>fi ${(-node.fi * 180 / Math.PI).toFixed(1)}°, theta ${(node.theta * 180 / Math.PI).toFixed(1)}°</span></div>
        <div class="editor-field"><span class="editor-label">Active</span><span>${node.nodeActive ? 'Yes' : 'No'}</span></div>
        <div class="editor-field"><span class="editor-label">Requires</span><span>${formatRequires(node.requires)}</span></div>
        <div class="editor-field"><span class="editor-label">Excl. group</span><span>${formatExclGroup(node.excl)}</span></div>
    `;
}

/** Renders a node's requires array (strings = AND, arrays = OR groups) as readable text. */
function formatRequires(requires) {
    if (!requires || requires.length === 0) return 'None';
    return requires
        .map(req => Array.isArray(req) ? `one of [${req.join(', ')}]` : req)
        .join('; ');
}

/** Renders a node's shared mutual-exclusion group object, if any. */
function formatExclGroup(group) {
    if (!group) return 'None';
    const members = Array.isArray(group.members) ? group.members.join(', ') : '(invalid members list — check nodes.json)';
    return `"${group.label}" (max ${group.max} active, members: ${members})`;
}

/** Mirrors the <D>-as-linebreak convention used by the hover panel in TreeNode.js. */
function formatDescription(desc) {
    return escapeHtml(desc || '').split('&lt;D&gt;').join('<br>');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
