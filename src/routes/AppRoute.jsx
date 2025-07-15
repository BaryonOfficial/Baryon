import { Routes, Route } from 'react-router-dom';
import Homepage from '../pages/Homepage';
import Plugin from '../pages/Plugin';
import Story from '../pages/Story';
import React from 'react';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/plugin" element={<Plugin />} />
      <Route path="/story" element={<Story />} />
    </Routes>
  );
}
