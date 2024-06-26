import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Homepage from './components/Homepage';
import Story from './components/Story';
import Plugin from './components/Plugin';
import PluginSignUp from './components/PluginSignUp';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/plugin" element={<Plugin />} />
        <Route path="/story" element={<Story />} />
        <Route path="/signup" element={<PluginSignUp />} />
      </Routes>
    </Router>
  );
}

export default App;
