import React from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout description="Technical documentation for the Baryon audio visualization system">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.logoWrapper}>
            <img
              src="/img/baryon_logo_black.svg"
              alt="Baryon Logo"
              className={styles.logo}
              style={{ filter: 'var(--ifm-logo-filter)' }}
            />
          </div>
          <h1 className={styles.title}>{siteConfig.title}</h1>
          <p className={styles.subtitle}>{siteConfig.tagline}</p>
        </div>
      </main>
    </Layout>
  );
}
