import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Scene from './components/Scene/Scene';
import './App.css';

function App() {
  return (
    <div className="app">
      <Scene />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
