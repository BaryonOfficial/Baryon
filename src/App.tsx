import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ThreeScene from './components/Scene/ThreeScene';

import './App.css';

function App() {
  return (
    <>
      <ThreeScene />
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default App;
