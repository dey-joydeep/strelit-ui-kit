import './styles.css';
import './strelit-layout.less';
import { App } from './app';

declare global {
  interface Window {
    strelitApiTestApp: App;
  }
}

const smokeMode = new URLSearchParams(globalThis.location.search).has('smoke');
if (smokeMode) {
  document.documentElement.dataset.strelitSmoke = 'running';
  const recordFailure = (reason: unknown) => {
    document.documentElement.dataset.strelitSmoke = 'failed';
    document.documentElement.dataset.strelitSmokeError = String(reason);
  };
  globalThis.addEventListener('error', (event) => recordFailure(event.error));
  globalThis.addEventListener('unhandledrejection', (event) =>
    recordFailure(event.reason),
  );
}

if (document.readyState !== 'loading') run();
// in case the document is already rendered
else document.addEventListener('DOMContentLoaded', run, { passive: true });

function run() {
  try {
    const app = new App();
    window.strelitApiTestApp = app;
    app.start();
    if (smokeMode) {
      document.querySelector<HTMLButtonElement>('#loadLayoutButton')?.click();
      document.querySelector<HTMLButtonElement>('#saveLayoutButton')?.click();
      globalThis.setTimeout(() => {
        if (document.documentElement.dataset.strelitSmoke === 'running') {
          document.documentElement.dataset.strelitSmoke = 'passed';
        }
      }, 0);
    }
  } catch (error) {
    if (smokeMode) {
      document.documentElement.dataset.strelitSmoke = 'failed';
      document.documentElement.dataset.strelitSmokeError = String(error);
    }
    throw error;
  }
}
