import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Scene } from './components/Scene';
import { Leva } from 'leva';
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip';
import { UnsupportedWarning } from '@/components/UnsupportedWarning';
import { isUnsupportedBrowser, setOverrideBrowserCheck } from './utils/browserCheck';
import { ErrorBoundary } from 'react-error-boundary';
import './App.css';

const levaTheme = {
  colors: {
    highlight1: '#ffffff',
  },
  sizes: {
    rootWidth: '340px',
  },
};

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-bold text-red-500">Something went wrong</h2>
        <p className="text-white/80">
          {error.message ||
            'The application encountered an error, possibly due to browser compatibility issues.'}
        </p>
        <button
          onClick={() => {
            setOverrideBrowserCheck(false);
            resetErrorBoundary();
            window.location.reload();
          }}
          className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200"
        >
          Try again with compatibility check
        </button>
      </div>
    </div>
  );
}

function App() {
  const { isUnsupported, reasons } = isUnsupportedBrowser();

  if (isUnsupported) {
    return <UnsupportedWarning reasons={reasons} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <TooltipProvider>
        <Leva
          oneLineLabels={false}
          collapsed
          titleBar={{
            title: 'Controls',
          }}
          theme={levaTheme}
        />
      </TooltipProvider>
      <main className="relative w-full h-screen overflow-hidden bg-black">
        <Scene />
        <Analytics />
        <SpeedInsights />
      </main>
    </ErrorBoundary>
  );
}

export default App;
