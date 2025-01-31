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
          <img src="/img/baryon_favicon.svg" alt="Baryon Logo" className={styles.logo} />
          <h1 className={styles.title}>{siteConfig.title}</h1>
          <p className={styles.subtitle}>{siteConfig.tagline}</p>
        </div>
      </main>
    </Layout>
  );
}
