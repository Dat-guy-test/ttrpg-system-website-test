// ============================================================
// CHARACTER SHEET  (Character Data tab)
//
// Builds the whole sheet into an existing #characterPage element
// and wires up every input. Same approach as editMode.js: one
// initCharacterSheet() call builds static structure, event
// delegation handles the rest, small renderX() helpers patch just
// the piece of DOM that changed.
//
// Exports:
//   initCharacterSheet()  — call once, after #characterPage exists
//                            in the DOM (e.g. from main.js, the
//                            same place initEditMode() is called).
//   refreshCharacterSheet() — full re-render; call this if external
//                            code (a future perk system) mutates
//                            CharacterState in bulk.
//
// This module only imports characterState.js — no dependency on
// AppState/Tree/etc — so the character tab is completely decoupled
// from the 3D scene and skill-tree code.
// ============================================================

import {
    CharacterState,
    saveCharacterState,
    resetCharacterState,
    computeStatValue,
    computeDamageTotal,
    CHARACTERISTICS_CONFIG,
    ABILITIES_CONFIG,
    DAMAGE_ROWS_CONFIG,
    MOTYWACJA_COUNT,
} from './characterState.js';

let rootEl = null;

// ============================================================
// initCharacterSheet
// ============================================================
export function initCharacterSheet() {
    rootEl = document.getElementById('characterPage');
    if (!rootEl) {
        console.error('characterSheet: no #characterPage element found in the DOM.');
        return;
    }
    render();
}

/** Full re-render — safe to call any time CharacterState changes in bulk. */
export function refreshCharacterSheet() {
    if (rootEl) render();
}


// ============================================================
// Top-level render
// ============================================================
function render() {
    rootEl.innerHTML = `
        <div class="charSheet">
            <div class="charSheet-toolbar">
                <button class="charBtn" id="char-print-btn"><span>Drukuj</span></button>
                <button class="charBtn charBtn-danger" id="char-reset-btn"><span>Resetuj arkusz</span></button>
            </div>

            ${renderHeader()}
            ${renderResources()}
            ${renderDamageTable()}
            ${renderStatGrid('Charakterystyki', 'characteristics', CHARACTERISTICS_CONFIG, 'charStatGrid')}
            ${renderStatGrid('Umiejętności', 'abilities', ABILITIES_CONFIG, 'charStatGrid charStatGrid-abilities')}
            ${renderProficienciesSection()}
            ${renderMotywacjaSection()}
            ${renderPerksSection()}
        </div>
    `;

    attachHandlers();
}


// ============================================================
// Section templates
// ============================================================

function renderHeader() {
    const { name, potential } = CharacterState;
    return `
        <section class="charHeader" id="characterNameWrapper">
            <div class="charField charField-name">
                <label class="charField-label">Nazwa Postaci</label>
                <input type="text" id="char-name" value="${escapeHtml(name)}" placeholder="Imię postaci" />
            </div>
            <div class="charField">
                <label class="charField-label">Potencjał</label>
                <input type="number" id="char-potential-total" value="${potential.total}" />
            </div>
            <div class="charField">
                <label class="charField-label">Dostępny Potencjał</label>
                <input type="number" id="char-potential-available" value="${potential.available}" />
            </div>
        </section>
    `;
}

function renderResources() {
    const { actionPoints, energyPoints, endurance } = CharacterState.resources;
    return `
        <section class="charSection">
            <h2 class="charSection-title">Zasoby</h2>
            <div class="charResourceGroup">
                ${renderResourceBox('Punkty Akcji', 'actionPoints', actionPoints, true)}
                ${renderResourceBox('Punkty Energii', 'energyPoints', energyPoints, true)}
                ${renderResourceBox('Wytrzymałość', 'endurance', endurance, false)}
            </div>
        </section>
    `;
}

function renderResourceBox(label, key, value, hasCurrent) {
    return `
        <div class="statWrapper charResourceBox">
            <div class="statLabel">${escapeHtml(label)}</div>
            <div class="statValue charResourceBox-value">
                ${hasCurrent ? `
                    <input type="number" class="charResource-input" data-resource="${key}" data-field="current" value="${value.current}" />
                    <span class="charResourceBox-slash">/</span>
                ` : ''}
                <input type="number" class="charResource-input" data-resource="${key}" data-field="max" value="${value.max}" />
            </div>
        </div>
    `;
}

function renderDamageTable() {
    const rows = DAMAGE_ROWS_CONFIG.map(row => {
        const val = CharacterState.damage[row.key];
        return `
            <tr class="${row.critical ? 'dmgTable-critical' : ''}">
                <td class="dmgTable-rowLabel">${escapeHtml(row.label)}</td>
                <td><input type="number" min="0" class="dmgTable-input" data-dmg-row="${row.key}" data-dmg-col="nZal" value="${val.nZal}" /></td>
                <td><input type="number" min="0" class="dmgTable-input" data-dmg-row="${row.key}" data-dmg-col="zal" value="${val.zal}" /></td>
            </tr>
        `;
    }).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">Punkty Obrażeń</h2>
            <table class="dmgTable">
                <thead>
                    <tr><th></th><th>N. Zal.</th><th>Zal.</th></tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr class="dmgTable-totalRow">
                        <td class="dmgTable-rowLabel">Łącznie:</td>
                        <td colspan="2"><output id="char-dmg-total">${computeDamageTotal()}</output></td>
                    </tr>
                </tbody>
            </table>
        </section>
    `;
}

/**
 * Renders a grid of perk-editable stat fields (Charakterystyki or
 * Umiejętności). Each field shows an editable "base" input; if the
 * (future) perk system has added modifiers to that field, a small
 * badge with the effective total appears next to it — invisible
 * until modifiers actually exist, so nothing changes visually today.
 */
function renderStatGrid(title, group, config, gridClass) {
    const fields = config.map(cfg => {
        const field = CharacterState[group][cfg.key];
        const { value, isModified, modifiers } = computeStatValue(field);
        const badge = isModified
            ? `<span class="charStat-badge" title="${escapeHtml(modifierBreakdown(modifiers))}">${value}</span>`
            : '';
        return `
            <div class="statWrapper charStatField">
                <div class="statLabel">${escapeHtml(cfg.label)}</div>
                <div class="statValue charStatField-value">
                    <input type="number" class="charStat-baseInput" data-group="${group}" data-key="${cfg.key}" value="${field.base}" />
                    ${badge}
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">${escapeHtml(title)}</h2>
            <div class="${gridClass}">${fields}</div>
        </section>
    `;
}

function modifierBreakdown(modifiers) {
    return modifiers.map(m => `${m.label || m.sourceId}: ${m.amount > 0 ? '+' : ''}${m.amount}`).join('\n');
}

function renderProficienciesSection() {
    return `
        <section class="charSection">
            <h2 class="charSection-title">Wprawa</h2>
            <div id="char-proficiencies-list">${renderProficienciesList()}</div>
            <div class="charSection-addRow">
                <input type="text" id="char-proficiency-input" placeholder="Nazwa wprawy…" />
                <button class="charBtn" id="char-proficiency-add"><span>Dodaj</span></button>
            </div>
        </section>
    `;
}

function renderProficienciesList() {
    if (CharacterState.proficiencies.length === 0) {
        return '<p class="charSection-hint">Brak wprawy — dodaj poniżej.</p>';
    }
    return '<ul class="charListRows">' + CharacterState.proficiencies.map(p => `
        <li class="charListRow" data-proficiency-id="${p.id}">
            <span>${escapeHtml(p.label)}</span>
            <button class="charBtn charBtn-small charBtn-danger" data-remove-proficiency="${p.id}">✕</button>
        </li>
    `).join('') + '</ul>';
}

function renderMotywacjaSection() {
    const boxes = CharacterState.motywacja.map((checked, i) => `
        <label class="charMotywacja-box">
            <input type="checkbox" data-motywacja-index="${i}" ${checked ? 'checked' : ''} />
            <span></span>
        </label>
    `).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">Motywacja</h2>
            <div class="charMotywacja-row">${boxes}</div>
        </section>
    `;
}

function renderPerksSection() {
    return `
        <section class="charSection">
            <h2 class="charSection-title">Wybrane Perki</h2>
            <div id="char-perks-list">${renderPerksList()}</div>
            <p class="charSection-hint">Ta lista będzie uzupełniana automatycznie przez system perków.</p>
        </section>
    `;
}

function renderPerksList() {
    if (CharacterState.perksTaken.length === 0) {
        return '<p class="charSection-hint">Brak wybranych perków.</p>';
    }
    return '<ul class="charListRows">' + CharacterState.perksTaken.map(p => `
        <li class="charListRow"><span>${escapeHtml(p.name)}</span></li>
    `).join('') + '</ul>';
}


// ============================================================
// Event wiring (delegated on rootEl — attached once per render)
// ============================================================
function attachHandlers() {
    rootEl.querySelector('#char-print-btn').addEventListener('click', () => window.print());
    rootEl.querySelector('#char-reset-btn').addEventListener('click', () => {
        if (window.confirm('Zresetować cały arkusz postaci? Tej operacji nie można cofnąć.')) {
            resetCharacterState();
            render();
        }
    });

    // ---- Header ----
    rootEl.querySelector('#char-name').addEventListener('input', (e) => {
        CharacterState.name = e.target.value;
        saveCharacterState();
    });
    rootEl.querySelector('#char-potential-total').addEventListener('input', (e) => {
        CharacterState.potential.total = Number(e.target.value) || 0;
        saveCharacterState();
    });
    rootEl.querySelector('#char-potential-available').addEventListener('input', (e) => {
        CharacterState.potential.available = Number(e.target.value) || 0;
        saveCharacterState();
    });

    // ---- Resources ---- (event delegation: one listener for all resource inputs)
    rootEl.querySelectorAll('.charResource-input').forEach((input) => {
        input.addEventListener('input', (e) => {
            const { resource, field } = e.target.dataset;
            CharacterState.resources[resource][field] = Number(e.target.value) || 0;
            saveCharacterState();
        });
    });

    // ---- Damage table ----
    rootEl.querySelectorAll('.dmgTable-input').forEach((input) => {
        input.addEventListener('input', (e) => {
            const { dmgRow, dmgCol } = e.target.dataset;
            CharacterState.damage[dmgRow][dmgCol] = Number(e.target.value) || 0;
            saveCharacterState();
            rootEl.querySelector('#char-dmg-total').textContent = computeDamageTotal();
        });
    });

    // ---- Characteristics / Abilities base values ----
    rootEl.querySelectorAll('.charStat-baseInput').forEach((input) => {
        input.addEventListener('input', (e) => {
            const { group, key } = e.target.dataset;
            CharacterState[group][key].base = Number(e.target.value) || 0;
            saveCharacterState();
            // NOTE: the effective-value badge only appears once modifiers exist
            // (see renderStatGrid). Editing base doesn't need a re-render here —
            // once the perk system is wired, call refreshCharacterSheet() after
            // any perk activation/deactivation to keep badges in sync.
        });
    });

    // ---- Proficiencies ----
    const addProficiency = () => {
        const input = rootEl.querySelector('#char-proficiency-input');
        const label = input.value.trim();
        if (!label) return;
        CharacterState.proficiencies.push({ id: `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label });
        saveCharacterState();
        input.value = '';
        rootEl.querySelector('#char-proficiencies-list').innerHTML = renderProficienciesList();
        attachProficiencyRemoveHandlers();
    };
    rootEl.querySelector('#char-proficiency-add').addEventListener('click', addProficiency);
    rootEl.querySelector('#char-proficiency-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addProficiency();
    });
    attachProficiencyRemoveHandlers();

    // ---- Motywacja ----
    rootEl.querySelectorAll('[data-motywacja-index]').forEach((box) => {
        box.addEventListener('change', (e) => {
            const idx = Number(e.target.dataset.motywacjaIndex);
            CharacterState.motywacja[idx] = e.target.checked;
            saveCharacterState();
        });
    });
}

function attachProficiencyRemoveHandlers() {
    rootEl.querySelectorAll('[data-remove-proficiency]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.removeProficiency;
            CharacterState.proficiencies = CharacterState.proficiencies.filter(p => p.id !== id);
            saveCharacterState();
            rootEl.querySelector('#char-proficiencies-list').innerHTML = renderProficienciesList();
            attachProficiencyRemoveHandlers();
        });
    });
}


// ============================================================
// Small helpers
// ============================================================
function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
