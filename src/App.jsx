import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ThreeScene from './ThreeScene';
import './App.css';

function App() {
  return (
    <div className="app">
      <ThreeScene />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
