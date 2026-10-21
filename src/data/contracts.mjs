// The colour of each API contract, used subtly (a dot, a thin border) wherever a contract is named:
// the home tiles, the API overview, the explorer and the sidebar. Values are design tokens of
// stratastax-design; a contract that is not listed gets the next colour of `fallback`, in the order of
// /openapi/index.json, so a new contract is coloured without a change here.
export const contractColors = {
    platform: { color: 'var(--stx-primary, #4F46E5)', subtle: 'var(--stx-primary-subtle, #EEF0FF)' },
    catalog: { color: 'var(--stx-secondary-strong, #0F766E)', subtle: 'var(--stx-secondary-subtle, #E6FAF7)' },
    i18n: { color: 'var(--stx-highlight, #7C3AED)', subtle: 'var(--stx-highlight-subtle, #F3EEFF)' },
};

const fallback = [
    { color: 'var(--stx-accent, #F97360)', subtle: 'var(--stx-accent-subtle, #FFF0EC)' },
    { color: 'var(--stx-warning, #D97706)', subtle: 'var(--stx-warning-subtle, #FFF7E6)' },
    { color: 'var(--stx-muted, #565C7E)', subtle: 'var(--stx-subtle, #EEF0FB)' },
];

/** The specs of index.json: the listed contracts first, in the order above, then the others. */
export function ordered(specs) {
    const known = Object.keys(contractColors);
    const rank = (spec) => (known.includes(spec.name) ? known.indexOf(spec.name) : known.length);
    return [...specs].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The colours of every spec of index.json, by name. */
export function colorsOf(specs) {
    let next = 0;
    return Object.fromEntries(
        ordered(specs).map((spec) => [spec.name, contractColors[spec.name] ?? fallback[next++ % fallback.length]]),
    );
}

/** CSS that puts a coloured dot before the links to each contract's reference (sidebar, tables). */
export function contractCss(specs) {
    const colors = colorsOf(specs);
    return Object.entries(colors)
        .map(([name, { color }]) => {
            const dot = `content:"";display:inline-block;flex:none;width:.5em;height:.5em;border-radius:50%;background:${color};margin-inline-end:.45em;`;
            // The contract's group in the sidebar (the <details> of starlight-openapi whose first link is the
            // contract's overview), and links to its reference in the content.
            return [
                `details:has(> ul > li > a[href="/technical/api/${name}/"]) > summary .group-label::before{${dot}}`,
                `.sl-markdown-content a[href^="/technical/api/${name}/"]:not(.not-content a)::before{${dot}vertical-align:.08em;}`,
            ].join('\n');
        })
        .join('\n');
}
