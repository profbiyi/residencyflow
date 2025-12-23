import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './auth/keycloak';

keycloak
  .init({
    onLoad: "check-sso",
    checkLoginIframe: false,
  })
  .then(() => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error("Keycloak init failed", err);
  });
