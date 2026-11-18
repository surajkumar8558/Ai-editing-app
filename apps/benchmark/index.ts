import { registerRootComponent } from 'expo';

// Log uncaught JS errors with a fixed tag so they are easy to find in `adb logcat`.
const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
if (errorUtils) {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((e, fatal) => {
    console.error('BENCH_JS_ERROR', fatal ? 'fatal' : 'non-fatal', e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    previous(e, fatal);
  });
}

// Required after the handler is installed so import-time errors in the app are logged too.
const App = require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
registerRootComponent(App);
