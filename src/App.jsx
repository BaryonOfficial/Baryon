import React from 'react';
import { BrowserRouter as Router} from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';
import AppRoutes from './routes/AppRoute';

function App() {
  return (
    <>
      <Router>
          <AppRoutes />
      </Router>
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default App;
