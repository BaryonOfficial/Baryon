import { animate, stagger } from 'motion';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { setOverrideBrowserCheck } from '@/utils/browserCheck';
import { useEffect, useRef } from 'react';

interface UnsupportedWarningProps {
  reasons: {
    isMobile: boolean;
    isFirefox: boolean;
    isSafari: boolean;
    noWebGL2: boolean;
    noSharedArrayBuffer: boolean;
  };
}

export function UnsupportedWarning({ reasons }: UnsupportedWarningProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  function getWarningMessage() {
    const messages = [];
    if (reasons.isMobile) messages.push('mobile devices');
    if (reasons.isFirefox) messages.push('Firefox');
    if (reasons.isSafari) messages.push('Safari');
    if (reasons.noWebGL2) messages.push('browsers without WebGL2');
    if (reasons.noSharedArrayBuffer) messages.push('browsers without SharedArrayBuffer support');

    return messages.join(', ');
  }

  function handleTryAnyway() {
    setOverrideBrowserCheck(true);
    window.location.reload();
  }

  useEffect(() => {
    if (containerRef.current) {
      animate(
        containerRef.current,
        { opacity: [0, 1], scale: [0.95, 1] },
        { duration: 0.3, ease: 'easeOut' }
      );

      animate(
        itemRefs.current.filter(Boolean),
        { opacity: [0, 1], y: [20, 0] },
        {
          duration: 0.5,
          ease: 'easeOut',
          delay: stagger(0.1),
        }
      );
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8"
      style={{ opacity: 0, scale: 0.95 }}>
      <Card className="w-full max-w-2xl bg-background/95 backdrop-blur border-muted">
        <CardHeader>
          <div
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            style={{ opacity: 0, transform: 'translateY(20px)' }}>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Browser Not Supported</AlertTitle>
              <AlertDescription>
                We&apos;ve detected compatibility issues with your current setup.
              </AlertDescription>
            </Alert>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p
            ref={(el) => {
              itemRefs.current[1] = el;
            }}
            className="text-lg text-muted-foreground"
            style={{ opacity: 0, transform: 'translateY(20px)' }}>
            This music visualizer is not supported on {getWarningMessage()}.
          </p>

          <div
            ref={(el) => {
              itemRefs.current[2] = el;
            }}
            className="bg-muted/50 rounded-lg p-4"
            style={{ opacity: 0, transform: 'translateY(20px)' }}>
            <h3 className="font-semibold mb-2">Recommended Browsers:</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Google Chrome</li>
              <li>Microsoft Edge</li>
              <li>Brave Browser</li>
            </ul>
          </div>

          <div
            ref={(el) => {
              itemRefs.current[3] = el;
            }}
            className="bg-muted/50 rounded-lg p-4"
            style={{ opacity: 0, transform: 'translateY(20px)' }}>
            <h3 className="font-semibold mb-2">Required Features:</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>WebGL2</li>
              <li>SharedArrayBuffer</li>
              <li>Modern Audio Processing</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end space-x-4">
          <div
            ref={(el) => {
              itemRefs.current[4] = el;
            }}
            style={{ opacity: 0, transform: 'translateY(20px)' }}>
            <Button variant="secondary" onClick={handleTryAnyway}>
              Try Anyway
            </Button>
            <Button variant="default" className="ml-2" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
