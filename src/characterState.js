// ============================================================
// CHARACTER STATE
//
// Data model + persistence for the Character Data tab.
// Same pattern as appState.js: one mutable singleton object,
// imported and written to directly by whatever module needs it.
//
//   import { CharacterState, saveCharacterState } from './characterState.js';
//   CharacterState.name = 'Aldric';
//   saveCharacterState();
//
// ------------------------------------------------------------
// PERK-READY STAT FIELDS
// ------------------------------------------------------------
// Charakterystyki and Umiejętności are the fields your perk system
// will eventually write to. Instead of storing them as plain
// numbers, each one is:
//
//   { base: number, modifiers: [{ sourceId, amount, label }] }
//
// `base` is what the player edits by hand (racial/starting value).
// `modifiers` is an array the (future) perk system populates via
// setPerkModifier() below — one entry per perk that touches this
// stat. computeStatValue() sums base + modifiers for display.
//
// Nothing about the render layer or the saved JSON shape needs to
// change when perks start writing to this — they just start
// calling setPerkModifier() and the UI picks it up.
// ============================================================

const STORAGE_KEY = 'ttrpgCharacterSheet.v1';

// ---- Static config: edit these arrays to add/rename/reorder fields ----
// Labels are shown verbatim in the UI — rename freely, keys are only
// used internally (storage + perk targeting) so avoid renaming keys
// once players have saved sheets, or add a migration in mergeWithDefaults().

export const CHARACTERISTICS_CONFIG = [
    { key: 'forma',    label: 'Forma' },
    { key: 'bystrosc', label: 'Bystrość' },
    { key: 'silaWoli', label: 'Siła Woli' },
    { key: 'szybkosc', label: 'Szybkość' },
    { key: 'udzwig',   label: 'Udźwig' },
];

export const ABILITIES_CONFIG = [
    { key: 'sila',              label: 'Siła' },
    { key: 'wigor',              label: 'Wigor' },
    { key: 'czasReakcji',        label: 'Czas Reakcji' },
    { key: 'determinacja',       label: 'Determinacja' },
    { key: 'charyzma',           label: 'Charyzma' },
    { key: 'skradanieSie',       label: 'Skradanie się' },
    { key: 'zrecznosc',          label: 'Zręczność' },
    { key: 'spostrzegawczosc',   label: 'Spostrzegawczość' },
    { key: 'instynkt',           label: 'Instynkt' },
    { key: 'wiedzaMedyczna',     label: 'Wiedza Medyczna' },
    { key: 'alchemia',           label: 'Alchemia' },
    { key: 'inzynieria',         label: 'Inżynieria' },
    { key: 'majsterkowanie',     label: 'Majsterkowanie' },
    { key: 'metalurgia',         label: 'Metalurgia' },
    { key: 'zaklinanie',         label: 'Zaklinanie' },
    { key: 'badawczosc',         label: 'Badawczość' },
    { key: 'uczenieSie',         label: 'Uczenie się' },
    { key: 'wiedzaPowszechna',   label: 'Wiedza Powszechna' },
    { key: 'wiedzaMagiczna',     label: 'Wiedza Magiczna' },
    { key: 'wykuwanieZaklec',    label: 'Wykuwanie Zaklęć' },
    { key: 'kreacja',            label: 'Kreacja' },
    { key: 'projekcja',          label: 'Projekcja' },
    { key: 'transmutacja',       label: 'Transmutacja' },
    { key: 'przywolywanie',      label: 'Przywoływanie' },
    { key: 'destrukcja',         label: 'Destrukcja' },
];

// Rows 2-7 (critical: true) get highlighted in the UI.
// "Zwyk." is ordinary damage — not highlighted. "Łącznie" (total)
// is handled separately below since it's a single computed field.
export const DAMAGE_ROWS_CONFIG = [
    { key: 'rany',        label: 'Rany',   critical: true  },
    { key: 'zlamania',    label: 'Złam.',  critical: true  },
    { key: 'wewnetrzne',  label: 'Wewn.',  critical: true  },
    { key: 'temperatura', label: 'Temp.',  critical: true  },
    { key: 'choroby',     label: 'Chor.',  critical: true  },
    { key: 'krytyczne',   label: 'Kryt.',  critical: true  },
    { key: 'zwykle',      label: 'Zwyk.',  critical: false },
];

export const MOTYWACJA_COUNT = 5;


// ---- Helpers to build default shapes -----------------------------------

function makeStatField(base = 0) {
    return { base, modifiers: [] };
}

function buildDefaultState() {
    const characteristics = {};
    for (const c of CHARACTERISTICS_CONFIG) characteristics[c.key] = makeStatField(0);

    const abilities = {};
    for (const a of ABILITIES_CONFIG) abilities[a.key] = makeStatField(0);

    const damage = {};
    for (const d of DAMAGE_ROWS_CONFIG) damage[d.key] = { nZal: 0, zal: 0 };

    return {
        name: '',
        potential:  { total: 0, available: 0 },
        resources: {
            actionPoints: { current: 0, max: 0 },
            energyPoints: { current: 0, max: 0 },
            endurance:    { max: 0 },
        },
        damage,               // { [rowKey]: { nZal, zal } }
        characteristics,       // { [key]: { base, modifiers } }
        abilities,              // { [key]: { base, modifiers } }
        proficiencies: [],       // [{ id, label }]
        motywacja: new Array(MOTYWACJA_COUNT).fill(false),
        perksTaken: [],            // [{ id, name }] — populated by the perk system later
    };
}

/**
 * Merges a saved sheet on top of a fresh default shape so that any
 * fields added later (a new ability, a new resource, …) show up with
 * sane defaults for sheets saved before that field existed, instead
 * of the page crashing on a missing key.
 */
function mergeWithDefaults(defaults, saved) {
    if (!saved || typeof saved !== 'object') return defaults;

    const out = defaults;
    out.name = typeof saved.name === 'string' ? saved.name : out.name;

    if (saved.potential) Object.assign(out.potential, saved.potential);
    if (saved.resources) {
        for (const key of Object.keys(out.resources)) {
            if (saved.resources[key]) Object.assign(out.resources[key], saved.resources[key]);
        }
    }
    if (saved.damage) {
        for (const key of Object.keys(out.damage)) {
            if (saved.damage[key]) Object.assign(out.damage[key], saved.damage[key]);
        }
    }
    for (const group of ['characteristics', 'abilities']) {
        if (!saved[group]) continue;
        for (const key of Object.keys(out[group])) {
            const savedField = saved[group][key];
            if (savedField && typeof savedField.base === 'number') {
                out[group][key].base = savedField.base;
                // Modifiers are NOT restored from storage — they're owned by
                // whatever perk state is currently active, and get re-applied
                // by the perk system on load rather than trusted from a stale save.
            }
        }
    }
    if (Array.isArray(saved.proficiencies)) out.proficiencies = saved.proficiencies;
    if (Array.isArray(saved.motywacja) && saved.motywacja.length === MOTYWACJA_COUNT) {
        out.motywacja = saved.motywacja;
    }
    if (Array.isArray(saved.perksTaken)) out.perksTaken = saved.perksTaken;

    return out;
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return buildDefaultState();
        return mergeWithDefaults(buildDefaultState(), JSON.parse(raw));
    } catch (e) {
        console.error('CharacterState: failed to load saved sheet — starting fresh.', e);
        return buildDefaultState();
    }
}

export const CharacterState = load();

export function saveCharacterState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(CharacterState));
    } catch (e) {
        console.error('CharacterState: failed to save.', e);
    }
}

export function resetCharacterState() {
    Object.assign(CharacterState, buildDefaultState());
    saveCharacterState();
}


// ---- Computed values -----------------------------------------------------

/**
 * @param {{base:number, modifiers:{sourceId:string,amount:number,label:string}[]}} field
 * @returns {{ value:number, isModified:boolean, modifiers:object[] }}
 */
export function computeStatValue(field) {
    if (!field) return { value: 0, isModified: false, modifiers: [] };
    const value = field.modifiers.reduce((sum, m) => sum + Number(m.amount || 0), Number(field.base) || 0);
    return { value, isModified: field.modifiers.length > 0, modifiers: field.modifiers };
}

/** Sums every damage row's two columns into the "Łącznie" total. */
export function computeDamageTotal() {
    let total = 0;
    for (const row of Object.values(CharacterState.damage)) {
        total += Number(row.nZal || 0) + Number(row.zal || 0);
    }
    return total;
}


// ---- Perk-system hooks (call these once perks are wired up) --------------

/**
 * Sets (or clears, if amount is falsy) one perk's contribution to a
 * single characteristic/ability. Safe to call repeatedly for the same
 * perk — each call replaces that perk's previous modifier on this
 * field rather than stacking duplicates, so re-running this after
 * every perk-tree change is the intended usage pattern.
 *
 * @param {'characteristics'|'abilities'} group
 * @param {string} key        — e.g. 'forma', 'sila'
 * @param {string} sourceId   — stable id for the perk, e.g. its TreeNode nodeId
 * @param {number} amount     — modifier amount (may be negative)
 * @param {string} [label]    — human-readable reason, shown in the tooltip
 */
export function setPerkModifier(group, key, sourceId, amount, label = '') {
    const field = CharacterState[group] && CharacterState[group][key];
    if (!field) {
        console.error(`CharacterState.setPerkModifier: no field "${group}.${key}"`);
        return;
    }
    field.modifiers = field.modifiers.filter(m => m.sourceId !== sourceId);
    if (amount) field.modifiers.push({ sourceId, amount: Number(amount), label });
}

/** Removes every modifier contributed by one perk (e.g. on deactivation). */
export function clearPerkModifiers(sourceId) {
    for (const group of ['characteristics', 'abilities']) {
        for (const field of Object.values(CharacterState[group])) {
            field.modifiers = field.modifiers.filter(m => m.sourceId !== sourceId);
        }
    }
}

/** Replaces the "Perki" list shown on the sheet. */
export function setPerksTaken(perkList) {
    CharacterState.perksTaken = perkList;
    saveCharacterState();
}
