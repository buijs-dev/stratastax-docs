# Stratastax Docs
[![](https://img.shields.io/badge/Buijs-Software-blue)](https://buijs.dev/)
[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

The documentation of Stratastax, published at [docs.stratastax.dev](https://docs.stratastax.dev): the API
reference of every contract (with a Swagger UI explorer and the bundled specs), the architecture, the component
pages of every repository, the database schemas, the development guidelines and the design. The product site is
[stratastax.dev](https://stratastax.dev) ([stratastax-horizon](https://github.com/buijs-dev/stratastax-horizon)).

## Development
```shell
npm ci
npm run sync    # specs, schema docs, design tokens and the horizon/ docs of other repositories
npm run dev
```

`npm run sync` ([scripts/sync-sources.mjs](scripts/sync-sources.mjs)) builds
[stratastax-contract](https://github.com/buijs-dev/stratastax-contract) with Gradle, exports the tokens of
[stratastax-design](https://github.com/buijs-dev/stratastax-design), and includes the `horizon/` directory of
every repository in [sources.yaml](sources.yaml). Everything it writes is in `.gitignore`. Each repository is
found in `STX_<NAME>_DIR`, else in `_sources/<repository>`, else next to this repository. It needs Java (see the
contract's `.sdkmanrc`) and, for the schema docs, Docker.

| Variable              | Effect                                                                   |
|-----------------------|--------------------------------------------------------------------------|
| `STX_CONTRACT_DIR`    | Location of the stratastax-contract checkout (likewise for every source) |
| `STX_SKIP_GRADLE=1`   | Use the existing build output of the contract                            |
| `STX_SKIP_SCHEMA=1`   | Leave out the schema docs (no Docker needed)                             |
| `STX_FETCH_SOURCES=1` | Clone the repositories of `sources.yaml` that are not found (CI)         |
| `STX_SOURCES_TOKEN`   | Token for cloning the private ones                                       |

| Output                                        | Published at                                                       |
|-----------------------------------------------|--------------------------------------------------------------------|
| `public/openapi/*.yaml`, `index.json`         | `/openapi/<file>`, a stable URL for tools such as the stx compiler |
| starlight-openapi pages                       | `/technical/api/<contract>/`                                       |
| Swagger UI                                    | `/technical/api/explorer/?spec=<file>`                             |
| `src/content/docs/technical/database/*/`      | `/technical/database/<service>/`                                   |
| `src/content/docs/technical/components/*/`    | `/technical/components/<id>/`, from the `horizon/` directories     |
| `public/design/`                              | `/design/<file>`: the tokens of the design system                  |
| `src/styles/design/`, `src/styles/generated/` | The theme of this site and the colour of each contract             |

## Documentation from other repositories
A repository contributes its documentation with a `horizon/` directory: a `horizon.yaml` manifest and an
`index.md`, plus any further pages. How to write and register one is on
[docs.stratastax.dev/technical/contributing-docs](https://docs.stratastax.dev/technical/contributing-docs/)
([source](src/content/docs/technical/contributing-docs.mdx)). Components without a repository of their own (the
i18n service, for now) live in [components/](components).

Each contract gets a colour in [src/data/contracts.mjs](src/data/contracts.mjs); a new contract gets one from a
fixed sequence until it is listed there.

## Deployment
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the site to GitHub Pages with the
`astro-pages` workflow of [ci-templates](https://github.com/buijs-dev/ci-templates): on every push to `main`,
when stratastax-contract sends `contract-updated`, stratastax-design `design-updated`, or a repository of
`sources.yaml` `docs-updated`, and by hand. The secret `DOCS_SOURCES_TOKEN` (optional) gives read access to the
private repositories.

## Related Stratastax projects
- [stratastax-horizon](https://github.com/buijs-dev/stratastax-horizon) - the product site, stratastax.dev
- [stratastax-contract](https://github.com/buijs-dev/stratastax-contract) - the API contracts and database schemas this site publishes
- [stratastax-design](https://github.com/buijs-dev/stratastax-design) - the design tokens this site is styled with and publishes
- [ci-templates](https://github.com/buijs-dev/ci-templates) - the workflows that build this site and check `horizon/` directories
