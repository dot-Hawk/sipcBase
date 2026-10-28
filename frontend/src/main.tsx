import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@/shared/styles/tokens.css';
import '@/shared/styles/base.css';
import '@/shared/styles/ui.css';
import { App } from '@/app/App';
import { registerServiceWorker } from '@/pwa/updates';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Production only: the worker would otherwise cache dev modules and fight HMR.
if (import.meta.env.PROD) registerServiceWorker();
