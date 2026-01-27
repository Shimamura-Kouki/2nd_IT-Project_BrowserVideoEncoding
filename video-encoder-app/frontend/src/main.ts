import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// Register service worker for PWA offline functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/2nd_IT-Project_BrowserVideoEncoding/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful:', registration.scope);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

mount(App, {
    target: document.getElementById('app')!,
});