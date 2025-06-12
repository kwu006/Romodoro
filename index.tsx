import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// You can include a global CSS file here if desired.
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
