import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Global Error Handler to catch and show errors for remote debugging
window.onerror = function (message, source, lineno, colno, error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.height = '100%';
    errorDiv.style.backgroundColor = 'white';
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '20px';
    errorDiv.style.zIndex = '99999';
    errorDiv.style.overflow = 'auto';
    errorDiv.innerHTML = `
        <h1 style="font-size: 24px;">Application Crashed!</h1>
        <p><strong>Message:</strong> ${message}</p>
        <p><strong>Source:</strong> ${source}</p>
        <p><strong>Line:</strong> ${lineno}:${colno}</p>
        <pre style="background: #f0f0f0; padding: 10px; margin-top: 20px;">${error?.stack || 'No stack trace available'}</pre>
    `;
    document.body.appendChild(errorDiv);
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
)
