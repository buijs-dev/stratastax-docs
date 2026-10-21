// Copies the generated content of other repositories into the site (npm run sync):
//   - the bundled OpenAPI specs of stratastax-contract into public/openapi/, with an index.json that the
//     config (starlight-openapi) and the API explorer read;
//   - the schema docs of stratastax-contract (tbls, one directory per service) into
//     src/content/docs/technical/database/<service>/, with their ER diagrams in public/schema/<service>/;
//   - the export of stratastax-design into public/design/ (the stable URLs of the design system) and
//     src/styles/design/ (the theme of this site);
//   - the horizon/ directory of every repository in sources.yaml into technical/components/ (see
//     scripts/horizon.mjs).
//
// Each repository is found in STX_<NAME>_DIR, else in _sources/<repository> (CI, see
// .github/workflows/pages.yml), else next to this repository (a sibling checkout).
//
// Options (environment):
//   STX_SKIP_GRADLE=1   use the existing build output of the contract instead of building it
//   STX_SKIP_SCHEMA=1   leave out the schema docs (they need Docker)
//   STX_FETCH_SOURCES=1 clone the repositories of sources.yaml that are not found (CI); private ones
//                       with STX_SOURCES_TOKEN
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';

import { contractCss } from '../src/data/contracts.mjs';
import { syncHorizon } from './horizon.mjs';

const root = resolve(import.meta.dirname, '..');
const skipGradle = process.env.STX_SKIP_GRADLE === '1';
const skipSchema = process.env.STX_SKIP_SCHEMA === '1';

const contractDir = locate('stratastax-contract', process.env.STX_CONTRACT_DIR, 'gradlew');
const designDir = locate('stratastax-design', process.env.STX_DESIGN_DIR, 'stratastax.tokens.yaml');

console.log(`Contract: ${contractDir}`);
console.log(`Design: ${designDir}`);

if (!skipGradle) {
    const tasks = [':stratastax-openapi:build'];
    if (!skipSchema) tasks.push(':stratastax-schema:generateSchemaDocs');
    execFileSync('./gradlew', [...tasks, '--console=plain'], { cwd: contractDir, stdio: 'inherit' });
}

syncOpenApi(join(contractDir, 'stratastax-openapi/build/openapi'));
if (!skipSchema) syncSchemaDocs(join(contractDir, 'stratastax-schema/build/schema-docs'));
syncDesign(designDir);
syncHorizon(root);

function locate(repository, override, marker) {
    const dir = [override, join(root, '_sources', repository), join(root, '..', repository)]
        .filter(Boolean)
        .map((candidate) => resolve(root, candidate))
        .find((candidate) => existsSync(join(candidate, marker)));
    if (!dir) {
        const variable = `STX_${repository.replace('stratastax-', '').toUpperCase()}_DIR`;
        console.error(`${repository} not found: set ${variable} or check it out next to this repository`);
        process.exit(1);
    }
    return dir;
}

// The export of stratastax-design: public/design/ for everyone (apps and tools read the tokens from
// docs.stratastax.dev/design/), src/styles/design/ for the theme of this site (astro.config.mjs).
function syncDesign(sourceDir) {
    if (!existsSync(join(sourceDir, 'node_modules'))) {
        execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: sourceDir, stdio: 'inherit' });
    }
    const publicDir = join(root, 'public/design');
    rmSync(publicDir, { recursive: true, force: true });
    execFileSync('node', ['scripts/export.mjs', publicDir], { cwd: sourceDir, stdio: 'inherit' });

    const stylesDir = join(root, 'src/styles/design');
    rmSync(stylesDir, { recursive: true, force: true });
    mkdirSync(stylesDir, { recursive: true });
    for (const file of ['tokens.css', 'starlight.css', 'swagger.css', 'tokens.json']) {
        cpSync(join(publicDir, file), join(stylesDir, file));
    }
}

function syncOpenApi(sourceDir) {
    const targetDir = join(root, 'public/openapi');
    const files = readdirSync(sourceDir).filter((file) => file.endsWith('.yaml')).sort();
    if (files.length === 0) throw new Error(`No bundled specs in ${sourceDir}`);

    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });

    const index = files.map((file) => {
        const content = readFileSync(join(sourceDir, file));
        writeFileSync(join(targetDir, file), content);
        const { info } = parse(content.toString());
        // stratastax.platform.api-v1.yaml -> platform
        const name = file.replace(/^stratastax\./, '').replace(/\.api-v\d+\.yaml$/, '');
        return {
            name,
            file,
            title: info.title,
            version: info.version,
            // The first sentence of the description, for the tiles of the home page.
            summary: shorten(/^[^.]*\.?/.exec((info.description ?? '').replace(/\s+/g, ' ').trim())[0], 110),
            sha256: createHash('sha256').update(content).digest('hex'),
        };
    });

    writeFileSync(join(targetDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    // The colour of each contract in the sidebar and tables (src/data/contracts.mjs).
    mkdirSync(join(root, 'src/styles/generated'), { recursive: true });
    writeFileSync(join(root, 'src/styles/generated/contracts.css'), `${contractCss(index)}\n`);
    console.log(`OpenAPI: ${index.map((spec) => `${spec.name} ${spec.version}`).join(', ')}`);
}

// At most max characters, cut at a word.
function shorten(text, max) {
    if (text.length <= max) return text;
    return `${text.slice(0, text.lastIndexOf(' ', max - 1)).replace(/[,;:(]+$/, '')}…`;
}

function syncSchemaDocs(sourceDir) {
    const docsDir = join(root, 'src/content/docs/technical/database');
    const imagesDir = join(root, 'public/schema');
    const services = readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    rmSync(imagesDir, { recursive: true, force: true });

    services.forEach((service, order) => {
        const serviceDocs = join(docsDir, service);
        const serviceImages = join(imagesDir, service);
        rmSync(serviceDocs, { recursive: true, force: true });
        mkdirSync(serviceDocs, { recursive: true });
        mkdirSync(serviceImages, { recursive: true });

        for (const file of readdirSync(join(sourceDir, service))) {
            const source = join(sourceDir, service, file);
            if (file.endsWith('.svg')) {
                cpSync(source, join(serviceImages, tableName(file, '.svg') + '.svg'));
            } else if (file === 'README.md') {
                writeFileSync(join(serviceDocs, 'index.md'), toPage(readFileSync(source, 'utf8'), service, {
                    title: service,
                    description: `Tables and relations of the ${service} database.`,
                    order: order + 1,
                }));
            } else if (file.endsWith('.md')) {
                const table = tableName(file, '.md');
                writeFileSync(join(serviceDocs, `${table}.md`), toPage(readFileSync(source, 'utf8'), service, {
                    title: table,
                    description: `The ${table} table of the ${service} database.`,
                }));
            }
        }
    });

    console.log(`Schema docs: ${services.join(', ')}`);
}

// public.app_user.md -> app_user (every table is in the public schema)
function tableName(file, extension) {
    return basename(file, extension).replace(/^public\./, '');
}

// Turns a tbls page into a Starlight page: frontmatter instead of the H1, links and images pointing at the
// generated pages and diagrams, and without the NOT NULL rows that PostgreSQL 18 reports as constraints
// (the Nullable column says the same).
function toPage(markdown, service, { title, description, order }) {
    const body = markdown
        .replace(/^# .*\n+/, '')
        .replace(/\]\(public\.([a-z0-9_]+)\.md\)/g, `](/technical/database/${service}/$1/)`)
        // A wide diagram is scaled down to the page, so it links to the full size.
        .replace(/!\[er\]\((?:public\.)?([a-z0-9_]+)\.svg\)/g, `[![ER diagram](/schema/${service}/$1.svg)](/schema/${service}/$1.svg)`)
        .split('\n')
        .filter((line) => !/^\| \S+ +\| n +\| NOT NULL /.test(line))
        .join('\n');

    const sidebar = order === undefined ? '' : `sidebar:\n  label: ${title}\n  order: ${order}\n`;
    return `---\ntitle: ${title}\ndescription: ${description}\n${sidebar}editUrl: false\n---\n\n${body}`;
}
