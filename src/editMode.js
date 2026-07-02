// ============================================================
// EDIT MODE
//
// Toggleable skill-tree editor with three submodes:
//   select  — click a node to inspect/edit its properties (default)
//   addNode — click the purple debug sphere to place a new node
//   connect — click a dependent node, then its prerequisite, to link them
//
// Regardless of submode, clicking an existing ARC in edit mode asks
// to delete that requirement (see handleEditModeConnectionClick,
// called from Tree.js's createLinesNTubes click handlers).
//
// Exports:
//   initEditMode()                  — builds the (hidden) panel DOM.
//   toggleEditMode()                — flips AppState.editMode, bound to 'E'.
//   handleEditModeNodeClick(node)   — called from TreeNode.onClick.
//   handleTreesphereClick(hit)      — called from Tree.js's treesphere.onClick.
//   handleEditModeConnectionClick(tree, ownerIndex, reqIndex)
//                                    — called from Tree.js's arc click handlers.
//
// This module only imports AppState — no local imports back into
// Tree.js / TreeNode.js — so both are free to import THIS module
// without creating a circular import.
//
// Still out of scope (later steps): deleting nodes, editing the
// mutual-exclusion group a node belongs to.
// ============================================================

import AppState from './appState.js';


let panelEl  = null;
let bodyEl   = null; // re-rendered per selection / submode
let statusEl = null; // small transient status/error message


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
        <div class="editor-toolbar" id="editorModeButtons">
            <button class="editor-btn editor-mode-btn" data-mode="select">Select</button>
            <button class="editor-btn editor-mode-btn" data-mode="addNode">Add Node</button>
            <button class="editor-btn editor-mode-btn" data-mode="connect">Connect</button>
            <button class="editor-btn editor-mode-btn" data-mode="deleteNode">Delete Node</button>
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
    panelEl.querySelector('#editorModeButtons').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (btn) setEditSubMode(btn.dataset.mode);
    });

    updateModeButtons();
}


// ============================================================
// toggleEditMode
// ============================================================
export function toggleEditMode() {
    AppState.editMode = !AppState.editMode;
    AppState.editSubMode = 'select';
    AppState.selectedNode = null;
    AppState.connectSourceNode = null;
    AppState.pendingNewNodePos = null;

    if (panelEl) panelEl.classList.toggle('editor-hidden', !AppState.editMode);
    updateModeButtons();
    setStatus('');
    renderInspector();

    console.log(`Edit mode ${AppState.editMode ? 'ON' : 'OFF'}`);
}


// ============================================================
// setEditSubMode
// ============================================================
function setEditSubMode(mode) {
    AppState.editSubMode = mode;
    AppState.connectSourceNode = null;
    AppState.pendingNewNodePos = null;
    updateModeButtons();

    const hints = {
        select:     'Click a node to inspect and edit it.',
        addNode:    'Click anywhere on the purple sphere to place a new node.',
        connect:    'Click the DEPENDENT node first, then click its PREREQUISITE. Click an existing connection any time to delete it.',
        deleteNode: 'Click a node to delete it (you\'ll be asked to confirm).',
    };
    setStatus(hints[mode] || '');
    renderInspector();
}

function updateModeButtons() {
    if (!panelEl) return;
    panelEl.querySelectorAll('.editor-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === AppState.editSubMode);
    });
}


// ============================================================
// handleEditModeNodeClick
// Routes a node click based on the current submode.
// ============================================================
export function handleEditModeNodeClick(node) {
    if (AppState.editSubMode === 'connect') {
        handleConnectClick(node);
        return;
    }
    if (AppState.editSubMode === 'deleteNode') {
        deleteNodeWithConfirm(node);
        return;
    }
    // 'select' (and 'addNode', if the user happens to click an existing
    // node instead of empty sphere) both just select it for inspection.
    AppState.selectedNode = node;
    AppState.pendingNewNodePos = null;
    setStatus('');
    renderInspector();
}

/** Shared by the deleteNode submode click and the inspector's own Delete button. */
function deleteNodeWithConfirm(node) {
    const ok = window.confirm(`Delete node "${node.nodeName}" (id ${node.nodeId})? This also removes any connections that reference it.`);
    if (!ok) return;

    AppState.tr.removeNode(node.nodeId);
    if (AppState.selectedNode && AppState.selectedNode.nodeId === node.nodeId) {
        AppState.selectedNode = null;
    }
    setStatus(`Deleted "${node.nodeName}".`);
    renderInspector();
}

function handleConnectClick(node) {
    if (!AppState.connectSourceNode) {
        AppState.connectSourceNode = node;
        setStatus(`Dependent node: "${node.nodeName}". Now click its prerequisite.`);
        return;
    }

    const dependent = AppState.connectSourceNode;
    AppState.connectSourceNode = null;

    if (dependent.nodeId === node.nodeId) {
        setStatus('A node can\'t require itself — pick a different prerequisite.', true);
        return;
    }
    const alreadyLinked = dependent.requires.some(req => !Array.isArray(req) && req === node.nodeId);
    if (alreadyLinked) {
        setStatus(`"${dependent.nodeName}" already requires "${node.nodeName}".`, true);
        return;
    }

    AppState.tr.addRequirement(dependent.nodeId, node.nodeId);
    setStatus(`"${dependent.nodeName}" now requires "${node.nodeName}". Click another dependent node to keep connecting.`);

    if (AppState.selectedNode && AppState.selectedNode.nodeId === dependent.nodeId) {
        renderInspector(); // refresh the open inspector if it's showing the node we just changed
    }
}


// ============================================================
// handleTreesphereClick  (addNode submode)
// ============================================================
export function handleTreesphereClick(hit) {
    if (!AppState.editMode || AppState.editSubMode !== 'addNode') return;

    // Nodes sit ON the same sphere surface as this debug sphere, so a
    // click that also hit an actual node fires both handlers off one
    // ray. Treat that as "clicked the node", not "place a node here".
    const alsoHitNode = AppState.intersects.some(i => i.object && i.object.nodeId !== undefined);
    if (alsoHitNode) return;

    const { fiDeg, thetaDeg } = AppState.tr.worldPointToFiTheta(hit.point);
    AppState.pendingNewNodePos = { fiDeg, thetaDeg };
    AppState.selectedNode = null;
    renderInspector();
    setStatus(`Placed at fi=${fiDeg.toFixed(1)}°, theta=${thetaDeg.toFixed(1)}°. Fill in the fields and click "Create Node".`);
}


// ============================================================
// handleEditModeConnectionClick  (arc click → delete, any submode)
// ============================================================
export function handleEditModeConnectionClick(tree, ownerIndex, reqIndex) {
    const owner = tree.nodes[ownerIndex];
    if (!owner || owner.requires[reqIndex] === undefined) return;

    const removed = owner.requires[reqIndex];
    const label = Array.isArray(removed) ? `one of [${removed.join(', ')}]` : removed;
    const ok = window.confirm(`Remove this connection?\n"${owner.nodeName}" requires ${label}`);
    if (!ok) return;

    tree.removeRequirement(owner.nodeId, reqIndex);
    setStatus(`Removed a requirement from "${owner.nodeName}".`);

    if (AppState.selectedNode && AppState.selectedNode.nodeId === owner.nodeId) {
        renderInspector();
    }
}


// ============================================================
// renderInspector — dispatches to the right form for current state
// ============================================================
function renderInspector() {
    if (!bodyEl) return;

    if (AppState.pendingNewNodePos) {
        renderNewNodeForm(AppState.pendingNewNodePos.fiDeg, AppState.pendingNewNodePos.thetaDeg);
        return;
    }
    if (!AppState.selectedNode) {
        bodyEl.innerHTML = '<em>Click a node to inspect it.</em>';
        return;
    }
    renderExistingNodeForm(AppState.selectedNode);
}


// ============================================================
// Existing-node form (properties + requirements)
// ============================================================
function renderExistingNodeForm(node) {
    const fiDeg    = -node.fi * 180 / Math.PI;
    const thetaDeg =  node.theta * 180 / Math.PI;

    const requiresRows = (node.requires.length === 0)
        ? '<em>No requirements.</em>'
        : node.requires.map((req, i) => {
            const label = Array.isArray(req) ? `OR: ${req.join(', ')}` : `AND: ${req}`;
            return `<div class="editor-req-row">
                <span>${escapeHtml(label)}</span>
                <button class="editor-btn editor-btn-small" data-remove-req="${i}">✕</button>
            </div>`;
        }).join('');

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

        <div class="editor-row">
            <button class="editor-btn editor-save-btn" id="ed-save">Save Changes</button>
            <button class="editor-btn editor-btn-danger" id="ed-delete">Delete Node</button>
        </div>

        <label class="editor-label">Requirements</label>
        ${requiresRows}
        <div class="editor-row">
            <input id="ed-new-req" type="text" placeholder="id — or id1,id2 for OR" />
            <button class="editor-btn editor-btn-small" id="ed-add-req">Add</button>
        </div>
        <div class="editor-hint">Tip: you can also switch to Connect mode and click nodes directly.</div>

        <div class="editor-field readonly">
            <span class="editor-label">Excl. group</span><span>${formatExclGroup(node.excl)}</span>
        </div>
        <div class="editor-field readonly">
            <span class="editor-label">Active</span><span>${node.nodeActive ? 'Yes' : 'No'}</span>
        </div>
    `;

    bodyEl.querySelector('#ed-save').addEventListener('click', () => saveNode(node));
    bodyEl.querySelector('#ed-delete').addEventListener('click', () => deleteNodeWithConfirm(node));
    bodyEl.querySelector('#ed-add-req').addEventListener('click', () => addRequirementFromInput(node));
    bodyEl.querySelectorAll('[data-remove-req]').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.tr.removeRequirement(node.nodeId, Number(btn.dataset.removeReq));
            renderInspector();
        });
    });
}

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
    node.temperature = temp; // doesn't re-tint the already-loaded star texture — cosmetic only on export

    const moved = fiDeg !== (-node.fi * 180 / Math.PI) || thDeg !== (node.theta * 180 / Math.PI);
    if (moved) {
        node.reposition(fiDeg, thDeg);
        AppState.tr.rebuildArcs(); // arc geometry is baked at draw time — redraw so it follows the move
    }

    setStatus(`Saved "${node.nodeName}".${moved ? ' Position updated.' : ''}`);
    renderInspector();
}

function addRequirementFromInput(node) {
    const raw = bodyEl.querySelector('#ed-new-req').value.trim();
    if (!raw) return;

    const entry = raw.includes(',')
        ? raw.split(',').map(s => s.trim()).filter(Boolean)
        : raw;

    const ok = AppState.tr.addRequirement(node.nodeId, entry);
    setStatus(ok ? `Added requirement to "${node.nodeName}".` : 'Could not add that requirement.', !ok);
    renderInspector();
}


// ============================================================
// New-node form (addNode submode)
// ============================================================
function renderNewNodeForm(fiDeg, thetaDeg) {
    bodyEl.innerHTML = `
        <div class="editor-field readonly">
            <span class="editor-label">Placing new node at</span>
            <span>fi ${fiDeg.toFixed(2)}°, theta ${thetaDeg.toFixed(2)}°</span>
        </div>

        <label class="editor-label" for="new-id">ID (optional — auto-generated if blank)</label>
        <input id="new-id" type="text" placeholder="e.g. 11" />

        <label class="editor-label" for="new-name">Name</label>
        <input id="new-name" type="text" value="New Node" />

        <label class="editor-label" for="new-desc">Description (use &lt;D&gt; for line breaks)</label>
        <textarea id="new-desc" rows="4"></textarea>

        <label class="editor-label" for="new-hover">Hover text</label>
        <input id="new-hover" type="text" />

        <div class="editor-row">
            <div>
                <label class="editor-label" for="new-cost">Cost</label>
                <input id="new-cost" type="number" value="1" />
            </div>
            <div>
                <label class="editor-label" for="new-temp">Temperature (K)</label>
                <input id="new-temp" type="number" value="6000" />
            </div>
        </div>

        <button class="editor-btn editor-save-btn" id="new-create">Create Node</button>
        <button class="editor-btn" id="new-cancel">Cancel</button>
    `;

    bodyEl.querySelector('#new-create').addEventListener('click', () => createNodeFromForm(fiDeg, thetaDeg));
    bodyEl.querySelector('#new-cancel').addEventListener('click', () => {
        AppState.pendingNewNodePos = null;
        setStatus('');
        renderInspector();
    });
}

function createNodeFromForm(fiDeg, thetaDeg) {
    const id    = bodyEl.querySelector('#new-id').value.trim();
    const name  = bodyEl.querySelector('#new-name').value.trim();
    const desc  = bodyEl.querySelector('#new-desc').value;
    const hover = bodyEl.querySelector('#new-hover').value;
    const cost  = Number(bodyEl.querySelector('#new-cost').value);
    const temp  = Number(bodyEl.querySelector('#new-temp').value);

    if (!name) { setStatus('Name can\'t be empty.', true); return; }
    if (!Number.isFinite(cost) || cost < 0) { setStatus('Cost must be a non-negative number.', true); return; }
    if (!Number.isFinite(temp) || temp <= 0) { setStatus('Temperature must be a positive number.', true); return; }

    const node = AppState.tr.addNode({
        id, name, desc, hoverText: hover, cost, temperature: temp, fi: fiDeg, theta: thetaDeg,
    });
    if (!node) { setStatus(`Couldn't create node — id "${id}" is already taken.`, true); return; }

    AppState.editSubMode = 'select';
    AppState.pendingNewNodePos = null;
    AppState.selectedNode = node;
    updateModeButtons();
    setStatus(`Created "${node.nodeName}" (id ${node.nodeId}). Link it up in Connect mode or below.`);
    renderInspector();
}


// ============================================================
// Export
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
