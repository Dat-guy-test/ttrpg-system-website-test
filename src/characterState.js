// ============================================================
// CHARACTER STATE
//
// Data model + persistence for the Character Data tab.
// Same pattern as appState.js: one mutable singleton object,
// imported and written to directly by whatever module needs it.
//
// ------------------------------------------------------------
// PERK-ONLY STAT FIELDS
// ------------------------------------------------------------
// Charakterystyki, both halves of every Umiejętność (Doświadczenie
// + Improwizacja), and every resource's Maximum are NOT editable on
// the sheet — they only change through the perk tree. Each is
// stored as:
//
//   { base: number, modifiers: [{ sourceId, amount, label }] }
//
// `base` is a code-level starting value (0 unless you set one
// elsewhere, e.g. a future character-creation flow) — there is no
// UI for editing it. `modifiers` is populated by perkEffects.js
// when a tree node with an `effect` is activated/deactivated.
// computeStatValue() sums base + modifiers for display.
//
// Fields are addressed by dot-path string (e.g.
// 'abilities.sila.experience', 'resources.actionPoints.max') so
// setPerkModifier() / clearPerkModifiers() work generically across
// every perk-driven field without special-casing each group.
// ============================================================

const STORAGE_KEY = 'ttrpgCharacterSheet.v2'; // bumped: v1 sheets had editable base stats

// ---- Static config: edit these arrays to add/rename/reorder fields ----

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

// Rows 2-7 (critical: true) get highlighted; "Zwyk." (critical: false)
// does not. "Łącznie" is a single computed field, handled separately.
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

// Improvisation is a 1-6 level; level 0 means "no die yet".
export const IMPROVISATION_DICE = ['—', '+1d4', '+1d6', '+1d8', '+1d10', '+1d12', '+1d20'];

/** @param {number} level @returns {string} e.g. "+1d8", or "—" at level 0 */
export function formatImprovisation(level) {
    const clamped = Math.max(0, Math.min(6, Math.round(Number(level) || 0)));
    return IMPROVISATION_DICE[clamped];
}

// ------------------------------------------------------------
// EFFECT TYPES
// ------------------------------------------------------------
// Single source of truth for what a tree node's `effect` can target.
// Used by editMode.js to build the inspector's effect dropdowns, and
// by perkEffects.js to resolve the actual field to modify. Add a new
// entry here to make a new kind of perk effect available in the
// editor — nothing else needs to change.
export const EFFECT_TYPES = [
    {
        value: 'characteristic',
        label: 'Zwiększ Charakterystykę',
        options: CHARACTERISTICS_CONFIG,
        fieldPath: (key) => `characteristics.${key}`,
    },
    {
        value: 'skillExperience',
        label: 'Zwiększ Doświadczenie Umiejętności',
        options: ABILITIES_CONFIG,
        fieldPath: (key) => `abilities.${key}.experience`,
    },
    {
        value: 'skillImprovisation',
        label: 'Zwiększ Poziom Improwizacji',
        options: ABILITIES_CONFIG,
        fieldPath: (key) => `abilities.${key}.improvisation`,
    },
];


// ---- Helpers to build default shapes -----------------------------------

function makeStatField(base = 0) {
    return { base, modifiers: [] };
}

function buildDefaultState() {
    const characteristics = {};
    for (const c of CHARACTERISTICS_CONFIG) characteristics[c.key] = makeStatField(0);

    const abilities = {};
    for (const a of ABILITIES_CONFIG) {
        abilities[a.key] = {
            experience:    makeStatField(0),
            improvisation: makeStatField(1), // level 1 = +1d4, see IMPROVISATION_DICE
        };
    }

    const damage = {};
    for (const d of DAMAGE_ROWS_CONFIG) damage[d.key] = { nZal: 0, zal: 0 };

    return {
        name: '',
        potential:  { total: 0, available: 0 },
        resources: {
            actionPoints: { current: 0, max: makeStatField(0) },
            energyPoints: { current: 0, max: makeStatField(0) },
            endurance:    { max: makeStatField(0) },
        },
        damage,                 // { [rowKey]: { nZal, zal } } — freely editable
        characteristics,         // { [key]: { base, modifiers } } — perk-only
        abilities,                 // { [key]: { experience, improvisation } } — perk-only
        proficiencies: [],           // [{ id, label }] — freely editable
        motywacja: new Array(MOTYWACJA_COUNT).fill(false),
        perksTaken: [],                 // [{ id, name }] — populated by the perk system
    };
}

/**
 * Merges a saved sheet on top of a fresh default shape. Only restores
 * the parts of the sheet a player can actually edit by hand (name,
 * potential, resource "current", damage, proficiencies, motywacja,
 * perksTaken) plus each perk-field's `base`. Modifiers are never
 * restored from storage — they're derived from which tree nodes are
 * currently active, and re-applied live by perkEffects.js as the
 * player (re)activates nodes each session.
 */
function mergeWithDefaults(defaults, saved) {
    if (!saved || typeof saved !== 'object') return defaults;

    const out = defaults;
    out.name = typeof saved.name === 'string' ? saved.name : out.name;

    if (saved.potential) Object.assign(out.potential, saved.potential);

    if (saved.resources) {
        for (const key of Object.keys(out.resources)) {
            const savedRes = saved.resources[key];
            if (!savedRes) continue;
            if ('current' in savedRes) out.resources[key].current = Number(savedRes.current) || 0;
            if (savedRes.max && typeof savedRes.max.base === 'number') out.resources[key].max.base = savedRes.max.base;
        }
    }

    if (saved.damage) {
        for (const key of Object.keys(out.damage)) {
            if (saved.damage[key]) Object.assign(out.damage[key], saved.damage[key]);
        }
    }

    if (saved.characteristics) {
        for (const key of Object.keys(out.characteristics)) {
            const savedField = saved.characteristics[key];
            if (savedField && typeof savedField.base === 'number') out.characteristics[key].base = savedField.base;
        }
    }

    if (saved.abilities) {
        for (const key of Object.keys(out.abilities)) {
            const savedAbility = saved.abilities[key];
            if (!savedAbility) continue;
            if (savedAbility.experience && typeof savedAbility.experience.base === 'number') {
                out.abilities[key].experience.base = savedAbility.experience.base;
            }
            if (savedAbility.improvisation && typeof savedAbility.improvisation.base === 'number') {
                out.abilities[key].improvisation.base = savedAbility.improvisation.base;
            }
        }
    }

    if (Array.isArray(saved.proficiencies)) out.proficiencies = saved.proficiencies;
    if (Array.isArray(saved.motywacja) && saved.motywacja.length === MOTYWACJA_COUNT) out.motywacja = saved.motywacja;
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


// ---- Perk-system hooks (called by perkEffects.js) -------------------------

function getByPath(path) {
    return path.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), CharacterState);
}

function isStatField(node) {
    return !!node && typeof node === 'object' && Array.isArray(node.modifiers) && 'base' in node;
}

/** Recursively visits every {base, modifiers} field anywhere in CharacterState. */
function walkStatFields(node, cb) {
    if (!node || typeof node !== 'object') return;
    if (isStatField(node)) { cb(node); return; }
    for (const value of Object.values(node)) walkStatFields(value, cb);
}

/**
 * Sets (or clears, if amount is falsy) one perk's contribution to a
 * single perk-ready field, addressed by dot-path — e.g.
 * 'characteristics.forma', 'abilities.sila.experience',
 * 'resources.actionPoints.max'. Safe to call repeatedly for the same
 * sourceId — each call replaces that source's previous modifier on
 * this field instead of stacking duplicates.
 *
 * @param {string} fieldPath
 * @param {string} sourceId  — stable id, e.g. `node:${treeNode.nodeId}`
 * @param {number} amount    — modifier amount (may be negative)
 * @param {string} [label]   — human-readable reason, shown in the tooltip
 */
export function setPerkModifier(fieldPath, sourceId, amount, label = '') {
    const field = getByPath(fieldPath);
    if (!isStatField(field)) {
        console.error(`CharacterState.setPerkModifier: no perk-ready field at "${fieldPath}"`);
        return;
    }
    field.modifiers = field.modifiers.filter(m => m.sourceId !== sourceId);
    if (amount) field.modifiers.push({ sourceId, amount: Number(amount), label });
}

/** Removes every modifier contributed by one source (e.g. one perk node) from every field. */
export function clearPerkModifiers(sourceId) {
    walkStatFields(CharacterState, (field) => {
        field.modifiers = field.modifiers.filter(m => m.sourceId !== sourceId);
    });
}

/** Replaces the "Wybrane Perki" list shown on the sheet. */
export function setPerksTaken(perkList) {
    CharacterState.perksTaken = perkList;
    saveCharacterState();
}