import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { PlasmicRootProvider } from '@plasmicapp/react-web';
import Homepage from './components/Homepage';
import Story from './components/Story';
import Plugin from './components/Plugin';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/story" element={<Story />} />
        <Route path="/plugin" element={<Plugin />} />
      </Routes>
    </Router>
  );
}

export default App;
