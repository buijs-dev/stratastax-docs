import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import vue from '@astrojs/vue';

import { groups } from './scripts/horizon.mjs';
import { ordered } from './src/data/contracts.mjs';

const json = (path, fallback) => {
    const url = new URL(path, import.meta.url);
    return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback;
};

// Written by `npm run sync`: the bundled specs of stratastax-contract (without them the site is built
// without the API reference) and the components contributed by the horizon/ directories of sources.yaml.
const specs = ordered(json('./public/openapi/index.json', []));
const components = json('./src/generated/components.json', []);

// The theme from stratastax-design, also copied by `npm run sync`; global.css falls back to its own values.
const designCss = ['./src/styles/design/tokens.css', './src/styles/design/starlight.css', './src/styles/generated/contracts.css']
    .filter((file) => existsSync(new URL(file, import.meta.url)));

// Components per group; a component with more pages is a group of its own.
const componentItems = Object.entries(groups)
    .map(([group, label]) => ({
        label,
        collapsed: true,
        items: components
            .filter((component) => component.group === group)
            .map((component) => component.pages.length === 0
                ? { label: component.title, link: `/technical/components/${component.id}/` }
                : {
                    label: component.title,
                    collapsed: true,
                    items: [
                        { label: 'Overview', link: `/technical/components/${component.id}/` },
                        ...component.pages.map((page) => ({ label: page.title, link: `/technical/components/${component.id}/${page.slug}/` })),
                    ],
                }),
    }))
    .filter((group) => group.items.length > 0);

export default defineConfig({
  site: 'https://docs.stratastax.dev',
  redirects: {
      '/development/01-philosophy/': '/development/',
  },
  integrations: [
      starlight({
          title: 'Stratastax Docs',
          social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/buijs-dev' }],
          components: {
              SocialIcons: './src/components/HeaderLinks.astro',
          },
          plugins: specs.length === 0 ? [] : [
              starlightOpenAPI(specs.map((spec) => ({
                  base: `technical/api/${spec.name}`,
                  schema: `./public/openapi/${spec.file}`,
                  sidebar: { label: spec.title, collapsed: true, operations: { badges: true } },
              }))),
          ],
          sidebar: [
              {
                  label: 'API',
                  items: [
                      { slug: 'technical/api' },
                      { label: 'Explorer', link: '/technical/api/explorer/' },
                      ...(specs.length === 0 ? [] : openAPISidebarGroups),
                  ],
              },
              {
                  label: 'Technical',
                  items: [
                      { slug: 'technical' },
                      ...(componentItems.length === 0 ? [] : [{ label: 'Components', collapsed: true, items: componentItems }]),
                      {
                          label: 'Database',
                          collapsed: true,
                          items: [{ autogenerate: { directory: 'technical/database' } }],
                      },
                      { slug: 'technical/contributing-docs' },
                  ],
              },
              {
                  label: 'Development',
                  collapsed: true,
                  items: [{autogenerate: { directory: 'development' }}]
              },
              {
                  label: 'Design',
                  collapsed: true,
                  items: [{autogenerate: {directory: 'design'}}]
              },
              {
                  label: 'Product',
                  collapsed: true,
                  items: [{autogenerate: { directory: 'product' }}]
              },
          ],
          customCss: [...designCss, './src/styles/global.css'],
      }),
      vue(),
  ],
});
