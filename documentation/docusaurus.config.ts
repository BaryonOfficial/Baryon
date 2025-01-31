import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Baryon Documentation',
  tagline: 'Technical Documentation for the Baryon Audio Visualization System',
  favicon: 'img/baryon_favicon.svg',

  // Set the production url of your site here
  url: 'https://docs.baryon.live',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'baryonoffical', // Usually your GitHub org/user name.
  projectName: 'baryon', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          path: 'docs',
          editUrl: 'https://github.com/baryon/baryon/tree/main/documentation/',
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/baryon-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      logo: {
        alt: 'Baryon Logo',
        src: 'img/baryon_logo_white.svg',
        width: 24,
        height: 24,
        href: '/',
      },
      items: [
        {
          to: '/docs',
          label: 'Docs',
          position: 'right',
        },
        {
          href: 'https://github.com/BaryonOfficial/Baryon',
          label: 'GitHub',
          position: 'right',
        },
      ],
      style: 'dark',
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs',
            },
            {
              label: 'Technical Overview',
              to: '/docs/technical/architecture',
            },
            {
              label: 'Audio Analysis',
              to: '/docs/technical/audio-analysis',
            },
            {
              label: 'GPU Compute',
              to: '/docs/technical/gpu-compute',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Contributing Guide',
              href: 'https://github.com/BaryonOfficial/Baryon/blob/main/.github/CONTRIBUTING.md',
            },
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/BaryonOfficial/Baryon/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/BaryonOfficial/Baryon/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Baryon`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
