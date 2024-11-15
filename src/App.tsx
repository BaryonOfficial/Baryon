import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Scene } from './components/Scene';
import { Leva } from 'leva';
import './App.css';

const levaTheme = {
  colors: {
    highlight1: '#ffffff', // This will change the panel title color
  },
  sizes: {
    rootWidth: '340px',
  },
};

function App() {
  return (
    <>
      <Leva
        oneLineLabels={false}
        collapsed
        titleBar={{
          title: 'Controls',
        }}
        theme={levaTheme}
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
