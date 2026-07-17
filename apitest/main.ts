import './styles.css';
import './strelit-layout.less';
import { App } from './app';

declare global {
  interface Window {
    strelitApiTestApp: App;
  }
}

if (document.readyState !== 'loading') run();
// in case the document is already rendered
else document.addEventListener('DOMContentLoaded', run, { passive: true });

function run() {
  const app = new App();
  window.strelitApiTestApp = app;
  app.start();
}
