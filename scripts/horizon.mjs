// The documentation other repositories contribute to this site, from their horizon/ directory
// (see README.md, "Documentation from other repositories"):
//
//   horizon/horizon.yaml   the manifest: id, title, summary, group, order, optional extra pages
//   horizon/index.md       the component page, /technical/components/<id>/
//   horizon/<name>.md      further pages, /technical/components/<id>/<name>/
//
// sources.yaml lists the repositories. Each is found in STX_<NAME>_DIR, else in _sources/<repository>,
// else next to this repository; with STX_FETCH_SOURCES=1 (CI) a missing one is cloned, a private one with
// STX_SOURCES_TOKEN. A repository that cannot be found or read is skipped with a warning, so one repository
// never breaks the site.
//
// Writes src/content/docs/technical/components/<id>/, public/components/<id>/ (images) and
// src/generated/components.json, which the sidebar (astro.config.mjs) and the component tables read.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, posix, resolve } from 'node:path';
import { parse, stringify } from 'yaml';

/** The groups of the component overview, in this order. */
export const groups = {
    services: 'Services',
    contract: 'Contract and code generation',
    'backend-libraries': 'Backend libraries',
    frontend: 'Frontend',
    'build-ops': 'Build and operations',
};

const pagesBase = '/technical/components';
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

export function syncHorizon(root) {
    const registry = parse(readFileSync(join(root, 'sources.yaml'), 'utf8'));
    const docsDir = join(root, 'src/content/docs/technical/components');
    const assetsDir = join(root, 'public/components');
    rmSync(docsDir, { recursive: true, force: true });
    rmSync(assetsDir, { recursive: true, force: true });

    const components = [];
    for (const entry of registry.sources ?? []) {
        const source = resolveSource(root, entry);
        if (!source) continue;
        const manifestFile = join(source.dir, source.horizonDir, 'horizon.yaml');
        if (!existsSync(manifestFile)) {
            warn(`${source.label}: no ${posix.join(source.horizonDir, 'horizon.yaml')}, skipped`);
            continue;
        }
        let component;
        try {
            component = syncComponent(source, parse(readFileSync(manifestFile, 'utf8')), { docsDir, assetsDir });
        } catch (error) {
            warn(`${source.label}: ${error.message}, skipped`);
            continue;
        }
        if (components.some((other) => other.id === component.id)) {
            warn(`${source.label}: id "${component.id}" is already used, skipped`);
            continue;
        }
        components.push(component);
    }

    components.sort((a, b) => Object.keys(groups).indexOf(a.group) - Object.keys(groups).indexOf(b.group) || a.order - b.order);
    mkdirSync(join(root, 'src/generated'), { recursive: true });
    writeFileSync(join(root, 'src/generated/components.json'), `${JSON.stringify(components, null, 2)}\n`);
    console.log(`Components: ${components.map((c) => c.id).join(', ') || 'none'}`);
}

/** Checks a manifest; the same rules as ci-templates' horizon-docs check. */
export function validateManifest(manifest) {
    const errors = [];
    if (!/^[a-z][a-z0-9-]*$/.test(manifest?.id ?? '')) errors.push('id must be a lowercase slug');
    if (!manifest?.title) errors.push('title is required');
    if (!manifest?.summary) errors.push('summary is required');
    if (!(manifest?.group in groups)) errors.push(`group must be one of ${Object.keys(groups).join(', ')}`);
    if (manifest?.order !== undefined && typeof manifest.order !== 'number') errors.push('order must be a number');
    for (const page of manifest?.pages ?? []) {
        if (!page.file || !/^[a-z][a-z0-9-]*$/.test(page.slug ?? '')) errors.push(`pages: ${page.file ?? '?'} needs a file and a slug`);
    }
    return errors;
}

function syncComponent(source, manifest, { docsDir, assetsDir }) {
    const errors = validateManifest(manifest);
    if (errors.length > 0) throw new Error(`invalid horizon.yaml: ${errors.join('; ')}`);
    const { id } = manifest;

    // repository path (posix) -> slug ('' for the component page)
    const pages = new Map();
    for (const file of readdirSync(join(source.dir, source.horizonDir)).sort()) {
        if (!/\.mdx?$/.test(file)) continue;
        const slug = file.replace(/\.mdx?$/, '');
        pages.set(posix.join(source.horizonDir, file), { slug: slug === 'index' ? '' : slug });
    }
    if (![...pages.values()].some((page) => page.slug === '')) throw new Error('no horizon/index.md');
    for (const page of manifest.pages ?? []) {
        if (!existsSync(join(source.dir, page.file))) throw new Error(`pages: ${page.file} does not exist`);
        pages.set(posix.normalize(page.file), { slug: page.slug, title: page.title });
    }

    const written = [];
    for (const [file, page] of pages) {
        const { data, body } = splitFrontmatter(readFileSync(join(source.dir, file), 'utf8'));
        const heading = /^# (.+)\n+/.exec(body);
        const title = data.title ?? (page.slug === '' ? manifest.title : page.title ?? heading?.[1] ?? page.slug);
        const content = rewriteLinks(heading && !data.title ? body.slice(heading[0].length) : body, {
            source,
            file,
            pages,
            id,
            assetsDir,
        });
        const frontmatter = {
            ...data,
            title,
            description: data.description ?? (page.slug === '' ? manifest.summary : `${title} of ${manifest.title}.`),
            sidebar: { ...(page.slug === '' ? { label: 'Overview', order: 0 } : {}), ...data.sidebar },
            editUrl: source.repo && !source.private ? `https://github.com/${source.repo}/edit/${source.ref}/${file}` : false,
        };
        const target = join(docsDir, id, `${page.slug || 'index'}${extname(file)}`);
        mkdirSync(join(docsDir, id), { recursive: true });
        writeFileSync(target, `---\n${stringify(frontmatter)}---\n\n${content}`);
        written.push({ slug: page.slug, title, order: data.sidebar?.order ?? 100 });
    }

    return {
        id,
        title: manifest.title,
        summary: manifest.summary,
        group: manifest.group,
        order: manifest.order ?? 100,
        repository: source.repo,
        private: source.private,
        pages: written
            .filter((page) => page.slug !== '')
            .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
            .map(({ slug, title }) => ({ slug, title })),
    };
}

function resolveSource(root, entry) {
    if (entry.local) {
        return { dir: root, horizonDir: entry.local, label: entry.local, repo: null, ref: null, private: false };
    }
    const [owner, name] = entry.repo.split('/');
    const ref = entry.ref ?? 'main';
    const variable = `STX_${name.replace(/^stratastax-/, '').replace(/-/g, '_').toUpperCase()}_DIR`;
    const candidates = [process.env[variable], join(root, '_sources', name), join(root, '..', name)].filter(Boolean);
    let dir = candidates.map((candidate) => resolve(root, candidate)).find((candidate) => existsSync(candidate));

    if (!dir && process.env.STX_FETCH_SOURCES === '1') {
        dir = join(root, '_sources', name);
        const token = process.env.STX_SOURCES_TOKEN;
        const url = `https://${token ? `x-access-token:${token}@` : ''}github.com/${owner}/${name}.git`;
        try {
            execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', ref, url, dir], { stdio: 'pipe' });
        } catch {
            warn(`${entry.repo}@${ref}: cannot be cloned${entry.private ? ' (private: STX_SOURCES_TOKEN needs read access)' : ''}, skipped`);
            return null;
        }
    }
    if (!dir) {
        warn(`${entry.repo}: not found (set ${variable}, check it out next to this repository or run with STX_FETCH_SOURCES=1), skipped`);
        return null;
    }
    return { dir, horizonDir: 'horizon', label: entry.repo, repo: entry.repo, ref, private: entry.private === true };
}

function splitFrontmatter(text) {
    const match = /^---\n([\s\S]*?)\n---\n+/.exec(text);
    return match ? { data: parse(match[1]) ?? {}, body: text.slice(match[0].length) } : { data: {}, body: text };
}

// Relative links between contributed pages become site paths; images are copied to /components/<id>/;
// other repository files become links into the repository. Code blocks are left alone.
function rewriteLinks(markdown, { source, file, pages, id, assetsDir }) {
    let fenced = false;
    return markdown
        .split('\n')
        .map((line) => {
            if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
            if (fenced) return line;
            // Inline code is left alone: only the parts outside backticks are rewritten.
            return line
                .split('`')
                .map((part, index) => (index % 2 === 1 ? part : rewritePart(part)))
                .join('`');
        })
        .join('\n');

    function rewritePart(line) {
        return line.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (all, bang, text, target, title) => {
            if (/^([a-z]+:|#|\/)/i.test(target)) return all;
            const [path, hash] = target.split('#');
            const resolved = posix.normalize(posix.join(posix.dirname(file), decodeURI(path)));
            const anchor = hash ? `#${hash}` : '';
            const page = pages.get(resolved);
            if (page) return `${bang}[${text}](${pagesBase}/${id}/${page.slug ? `${page.slug}/` : ''}${anchor}${title})`;

            const absolute = join(source.dir, resolved);
            if (bang && imageExtensions.has(extname(resolved).toLowerCase()) && existsSync(absolute)) {
                const name = resolved.replace(/^horizon\/(assets\/)?/, '').replace(/\//g, '_');
                mkdirSync(join(assetsDir, id), { recursive: true });
                cpSync(absolute, join(assetsDir, id, name));
                return `${bang}[${text}](/components/${id}/${name}${title})`;
            }
            if (!source.repo || resolved.startsWith('..')) return all;
            const kind = existsSync(absolute) && statSync(absolute).isDirectory() ? 'tree' : 'blob';
            return `${bang}[${text}](https://github.com/${source.repo}/${kind}/${source.ref}/${resolved}${anchor}${title})`;
        });
    }
}

function warn(message) {
    console.warn(`::warning::${message}`);
}

