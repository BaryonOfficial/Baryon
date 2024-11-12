import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Scene } from './components/Scene';
import { Leva } from 'leva';
import './App.css';

function App() {
  return (
    <>
      <Leva
        oneLineLabels={((label: string) => !label.includes('Debug')) as any}
        collapsed
        titleBar={{
          title: 'Controls',
        }}
      />
      <main className="relative w-full h-screen overflow-hidden bg-black">
        <Scene />
        <Analytics />
        <SpeedInsights />
      </main>
    </>
  );
}

export default App;
