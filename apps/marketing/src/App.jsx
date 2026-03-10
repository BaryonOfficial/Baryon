import React from 'react';

export default function App() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background:
          'radial-gradient(circle at top, rgba(42, 101, 255, 0.22), transparent 28%), linear-gradient(160deg, #07101d 0%, #08131a 48%, #0f1e18 100%)',
        color: '#f4f7fb',
        fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(42rem, 100%)',
          padding: '2.5rem',
          borderRadius: '1.5rem',
          background: 'rgba(5, 9, 16, 0.72)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#8fb4ff',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          Baryon
        </p>
        <h1 style={{ margin: '0.75rem 0 0', fontSize: 'clamp(2.8rem, 7vw, 5rem)', lineHeight: 0.95 }}>
          Open source by default. Commercial when redistribution needs it.
        </h1>
        <p style={{ margin: '1.25rem 0 0', maxWidth: '38rem', color: 'rgba(244, 247, 251, 0.78)', fontSize: '1.05rem' }}>
          Baryon is licensed under AGPL-3.0-only in the public repo, with a separate commercial
          license for proprietary embedding, OEM, white-label, and client delivery.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <a
            href="https://github.com/BaryonOfficial/Baryon"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '0.85rem 1.15rem',
              borderRadius: '999px',
              background: '#f4f7fb',
              color: '#08111d',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Source
          </a>
          <a
            href="https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '0.85rem 1.15rem',
              borderRadius: '999px',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: '#f4f7fb',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            License
          </a>
        </div>
      </section>
    </main>
  );
}
