// ============================================================
// CHARACTER SHEET  (Character Data tab)
//
// Builds the whole sheet into an existing #characterPage element
// and wires up every editable input. Same approach as editMode.js:
// one initCharacterSheet() call builds static structure, event
// delegation handles the rest.
//
// Editable by the player: Nazwa, Potencjał, resource "current"
// values, damage table, proficiencies, motywacja checkboxes.
// Everything else (Charakterystyki, Umiejętności, resource maxima)
// is perk-only — displayed read-only here, see characterState.js.
//
// Exports:
//   initCharacterSheet()    — call once, after #characterPage exists.
//   refreshCharacterSheet() — full re-render; called by perkEffects.js
//                             whenever a perk's contribution changes,
//                             and safe to call any other time
//                             CharacterState changes in bulk.
// ============================================================

import {
    CharacterState,
    saveCharacterState,
    resetCharacterState,
    computeStatValue,
    computeDamageTotal,
    formatImprovisation,
    CHARACTERISTICS_CONFIG,
    ABILITIES_CONFIG,
    DAMAGE_ROWS_CONFIG,
    POINT_POOLS_CONFIG,
    computePoolSpent,
    computePoolAvailable,
    getFieldPoolAllocation,
    adjustPoolAllocation,
} from './characterState.js';

const CHARACTERISTIC_POOL = POINT_POOLS_CONFIG.find(p => p.key === 'characteristicPoints');

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
            ${renderPointPoolsSection()}
            ${renderCharacteristicsSection()}
            ${renderAbilitiesSection()}
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
            <p class="charSection-hint">Maksimum ustala System Perków. Wartość bieżącą śledzisz ręcznie podczas gry.</p>
        </section>
    `;
}

/** Current is player-editable (spent during play); Max is perk-only. */
function renderResourceBox(label, key, value, hasCurrent) {
    const max = computeStatValue(value.max);
    const maxTitle = max.isModified ? escapeHtml(modifierBreakdown(max.modifiers)) : '';
    return `
        <div class="statWrapper charResourceBox">
            <div class="statLabel">${escapeHtml(label)}</div>
            <div class="statValue charResourceBox-value">
                ${hasCurrent ? `
                    <input type="number" class="charResource-input" data-resource="${key}" value="${value.current}" />
                    <span class="charResourceBox-slash">/</span>
                ` : ''}
                <span class="charStat-readonly charResourceBox-max" ${maxTitle ? `title="${maxTitle}"` : ''}>${max.value}</span>
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

/** Summary boxes: how many points each pool has granted vs. how many are still unspent. */
function renderPointPoolsSection() {
    const boxes = POINT_POOLS_CONFIG.map(cfg => {
        const granted   = computeStatValue(CharacterState.pointPools[cfg.key].granted).value;
        const available = computePoolAvailable(cfg.key);
        return `
            <div class="statWrapper charResourceBox">
                <div class="statLabel">${escapeHtml(cfg.label)}</div>
                <div class="statValue charResourceBox-value">
                    <span class="charStat-readonly">${available}</span>
                    <span class="charResourceBox-slash">/</span>
                    <span class="charStat-readonly charResourceBox-max">${granted}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">Punkty do Rozdania</h2>
            <div class="charResourceGroup">${boxes}</div>
            <p class="charSection-hint">Przyznawane przez perki. Rozdzielaj je przyciskami +/- przy Charakterystykach i Umiejętnościach poniżej.</p>
        </section>
    `;
}

/** A +/- pair for spending one point from `poolKey` into `fieldPath`. Buttons disable themselves when spending/refunding isn't possible. */
function renderPointSpender(poolKey, fieldPath) {
    const allocatedHere = getFieldPoolAllocation(fieldPath, poolKey);
    const available     = computePoolAvailable(poolKey);
    return `
        <button class="charSpend-btn" data-spend-pool="${poolKey}" data-spend-path="${fieldPath}" data-spend-delta="-1" ${allocatedHere <= 0 ? 'disabled' : ''} title="Odbierz 1 punkt">–</button>
        <button class="charSpend-btn" data-spend-pool="${poolKey}" data-spend-path="${fieldPath}" data-spend-delta="1" ${available <= 0 ? 'disabled' : ''} title="Wydaj 1 punkt">+</button>
    `;
}

/** Charakterystyki — single perk-only value per stat. Forma/Bystrość/Siła Woli also get +/- spenders for Punkty Charakterystyki. */
function renderCharacteristicsSection() {
    const fields = CHARACTERISTICS_CONFIG.map(cfg => {
        const fieldPath = `characteristics.${cfg.key}`;
        const { value, isModified, modifiers } = computeStatValue(CharacterState.characteristics[cfg.key]);
        const title = isModified ? escapeHtml(modifierBreakdown(modifiers)) : '';
        const spendable = CHARACTERISTIC_POOL && CHARACTERISTIC_POOL.allowedCharacteristics.includes(cfg.key);

        return `
            <div class="statWrapper charStatField">
                <div class="statLabel">${escapeHtml(cfg.label)}</div>
                <div class="statValue charStatField-value">
                    <span class="charStat-readonly" ${title ? `title="${title}"` : ''}>${value}</span>
                    ${spendable ? renderPointSpender('characteristicPoints', fieldPath) : ''}
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">Charakterystyki</h2>
            <div class="charStatGrid">${fields}</div>
        </section>
    `;
}

/**
 * Umiejętności — each ability has two independent perk-only tracks,
 * each spendable from its own pool:
 *   Doświadczenie (Experience) — a plain number, spent from Punkty Doświadczenia
 *   Improwizacja (Improvisation) — a 1-6 level, spent from Punkty Improwizacji
 */
function renderAbilitiesSection() {
    const fields = ABILITIES_CONFIG.map(cfg => {
        const ability = CharacterState.abilities[cfg.key];
        const expPath    = `abilities.${cfg.key}.experience`;
        const improvPath = `abilities.${cfg.key}.improvisation`;
        const exp    = computeStatValue(ability.experience);
        const improv = computeStatValue(ability.improvisation);
        const expTitle    = exp.isModified    ? escapeHtml(modifierBreakdown(exp.modifiers))    : '';
        const improvTitle = improv.isModified ? escapeHtml(modifierBreakdown(improv.modifiers)) : '';

        return `
            <div class="statWrapper charStatField charStatField-ability">
                <div class="statLabel">${escapeHtml(cfg.label)}</div>
                <div class="statValue charStatField-value charStatField-value-ability">
                    <div class="charAbility-sub">
                        <span class="charAbility-subLabel">Dośw.</span>
                        <span class="charStat-readonly" ${expTitle ? `title="${expTitle}"` : ''}>${exp.value}</span>
                        ${renderPointSpender('skillExperiencePoints', expPath)}
                    </div>
                    <div class="charAbility-sub">
                        <span class="charAbility-subLabel">Improw.</span>
                        <span class="charStat-readonly" ${improvTitle ? `title="${improvTitle}"` : ''}>${formatImprovisation(improv.value)}</span>
                        ${renderPointSpender('skillImprovisationPoints', improvPath)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="charSection">
            <h2 class="charSection-title">Umiejętności</h2>
            <div class="charStatGrid charStatGrid-abilities">${fields}</div>
        </section>
    `;
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
        </section>
    `;
}

function renderPerksList() {
    if (CharacterState.perksTaken.length === 0) {
        return '<p class="charSection-hint">Brak wybranych perków — aktywuj węzły w drzewku umiejętności.</p>';
    }
    return '<ul class="charListRows">' + CharacterState.perksTaken.map(p => `
        <li class="charListRow"><span>${escapeHtml(p.name)}</span></li>
    `).join('') + '</ul>';
}

function modifierBreakdown(modifiers) {
    return modifiers.map(m => `${m.label || m.sourceId}: ${m.amount > 0 ? '+' : ''}${m.amount}`).join('\n');
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

    // ---- Resources ("current" only — "max" is perk-only, not editable) ----
    rootEl.querySelectorAll('.charResource-input').forEach((input) => {
        input.addEventListener('input', (e) => {
            const { resource } = e.target.dataset;
            CharacterState.resources[resource].current = Number(e.target.value) || 0;
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

    // ---- Point pool spending (Charakterystyki + Umiejętności +/- buttons) ----
    // A full re-render is needed (not just a local DOM patch) because spending
    // from a pool changes that pool's "available" balance everywhere it's
    // shown, not just next to the field that was just clicked.
    rootEl.querySelectorAll('[data-spend-pool]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const { spendPool, spendPath, spendDelta } = btn.dataset;
            if (adjustPoolAllocation(spendPool, spendPath, Number(spendDelta))) render();
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
