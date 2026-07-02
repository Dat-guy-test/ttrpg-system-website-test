// ============================================================
// EDIT MODE
//
// Toggleable edit mode with an inspector panel. Clicking a node in
// edit mode selects it and shows its editable properties — name,
// description, hover text, cost, temperature, and position (fi/theta
// in degrees). Saving writes those values back onto the live
// TreeNode, repositions it if fi/theta changed, and redraws arcs so
// connections follow. An Export button serializes the whole tree
// back to the nodes.json shape and downloads it.
//
// Deliberately NOT in scope yet: editing `requires` (connections),
// adding/deleting nodes, mutual-exclusion group membership. Those
// are separate follow-up steps; `requires` and the exclusion group
// are still shown read-only here.
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
// This module only imports AppState — no local imports back into
// Tree.js / TreeNode.js — so both of those are free to import THIS
// module without creating a circular import.
// ============================================================

import AppState from './appState.js';


let panelEl  = null;
let bodyEl   = null; // re-rendered per selection
let statusEl = null; // small transient "Saved!" / error message


// ============================================================
// initEditMode
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
        <div class="editor-toolbar">
            <button class="editor-btn" id="editorExportBtn">Export nodes.json</button>
        </div>
        <div class="editor-status" id="editorStatus"></div>
        <div class="editor-body" id="editorBody">
            <em>Click a node to inspect it.</em>
        </div>
    `;

    document.body.appendChild(panelEl);
    bodyEl   = panelEl.querySelector('#editorBody');
    statusEl = panelEl.querySelector('#editorStatus');

    panelEl.querySelector('#editorExportBtn').addEventListener('click', exportTreeJSON);
}


// ============================================================
// toggleEditMode
// ============================================================
export function toggleEditMode() {
    AppState.editMode = !AppState.editMode;
    AppState.selectedNode = null;

    if (panelEl) panelEl.classList.toggle('editor-hidden', !AppState.editMode);
    setStatus('');
    renderInspector();

    console.log(`Edit mode ${AppState.editMode ? 'ON' : 'OFF'}`);
}


// ============================================================
// handleEditModeNodeClick
// Selects the clicked node for the inspector. (Only 'select'
// behaviour exists so far — add/connect/delete submodes are later
// steps.)
// ============================================================
export function handleEditModeNodeClick(node) {
    AppState.selectedNode = node;
    setStatus('');
    renderInspector();
}


// ============================================================
// renderInspector
// ============================================================
function renderInspector() {
    if (!bodyEl) return;

    const node = AppState.selectedNode;
    if (!node) {
        bodyEl.innerHTML = '<em>Click a node to inspect it.</em>';
        return;
    }

    const fiDeg    = -node.fi * 180 / Math.PI;
    const thetaDeg =  node.theta * 180 / Math.PI;

    bodyEl.innerHTML = `
        <div class="editor-field readonly">
            <span class="editor-label">ID</span><span>${escapeHtml(node.nodeId)}</span>
        </div>

        <label class="editor-label" for="ed-name">Name</label>
        <input id="ed-name" type="text" value="${escapeHtml(node.nodeName)}" />

        <label class="editor-label" for="ed-desc">Description (use &lt;D&gt; for line breaks)</label>
        <textarea id="ed-desc" rows="5">${escapeHtml(node.nodeDesc)}</textarea>

        <label class="editor-label" for="ed-hover">Hover text</label>
        <input id="ed-hover" type="text" value="${escapeHtml(node.hovertext)}" />

        <div class="editor-row">
            <div>
                <label class="editor-label" for="ed-cost">Cost</label>
                <input id="ed-cost" type="number" value="${node.nodeCost}" />
            </div>
            <div>
                <label class="editor-label" for="ed-temp">Temperature (K)</label>
                <input id="ed-temp" type="number" value="${node.temperature}" />
            </div>
        </div>

        <div class="editor-row">
            <div>
                <label class="editor-label" for="ed-fi">Fi (deg)</label>
                <input id="ed-fi" type="number" step="0.1" value="${fiDeg.toFixed(2)}" />
            </div>
            <div>
                <label class="editor-label" for="ed-theta">Theta (deg)</label>
                <input id="ed-theta" type="number" step="0.1" value="${thetaDeg.toFixed(2)}" />
            </div>
        </div>

        <div class="editor-field readonly">
            <span class="editor-label">Requires</span><span>${formatRequires(node.requires)}</span>
        </div>
        <div class="editor-field readonly">
            <span class="editor-label">Excl. group</span><span>${formatExclGroup(node.excl)}</span>
        </div>
        <div class="editor-field readonly">
            <span class="editor-label">Active</span><span>${node.nodeActive ? 'Yes' : 'No'}</span>
        </div>

        <button class="editor-btn editor-save-btn" id="ed-save">Save Changes</button>
    `;

    bodyEl.querySelector('#ed-save').addEventListener('click', () => saveNode(node));
}


// ============================================================
// saveNode
// Reads the form, writes values onto the live node, repositions it
// if fi/theta changed, and redraws arcs so connections follow.
// ============================================================
function saveNode(node) {
    const name  = bodyEl.querySelector('#ed-name').value.trim();
    const desc  = bodyEl.querySelector('#ed-desc').value;
    const hover = bodyEl.querySelector('#ed-hover').value;
    const cost  = Number(bodyEl.querySelector('#ed-cost').value);
    const temp  = Number(bodyEl.querySelector('#ed-temp').value);
    const fiDeg = Number(bodyEl.querySelector('#ed-fi').value);
    const thDeg = Number(bodyEl.querySelector('#ed-theta').value);

    if (!name) { setStatus('Name can\'t be empty.', true); return; }
    if (!Number.isFinite(cost) || cost < 0) { setStatus('Cost must be a non-negative number.', true); return; }
    if (!Number.isFinite(temp) || temp <= 0) { setStatus('Temperature must be a positive number.', true); return; }
    if (!Number.isFinite(fiDeg) || !Number.isFinite(thDeg)) { setStatus('Fi/theta must be numbers.', true); return; }

    node.nodeName    = name;
    node.nodeDesc    = desc;
    node.hovertext   = hover;
    node.nodeCost    = cost;
    node.temperature = temp; // NOTE: doesn't re-tint the already-loaded star texture — see caveat below

    const moved = fiDeg !== (-node.fi * 180 / Math.PI) || thDeg !== (node.theta * 180 / Math.PI);
    if (moved) {
        node.reposition(fiDeg, thDeg);
        AppState.tr.rebuildArcs(); // arc geometry is baked at draw time — redraw so it follows the move
    }

    setStatus(`Saved "${node.nodeName}".${moved ? ' Position updated.' : ''}`);
    renderInspector(); // refresh so displayed values reflect what actually got saved
}


// ============================================================
// exportTreeJSON
// Downloads the current in-memory tree as nodes.json.
// ============================================================
function exportTreeJSON() {
    if (!AppState.tr) { setStatus('Tree isn\'t loaded yet.', true); return; }

    const data = AppState.tr.toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'nodes.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus('Exported nodes.json — replace the file in your project and commit it.');
}


// ============================================================
// Small helpers
// ============================================================

function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('editor-status-error', !!isError);
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

function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
