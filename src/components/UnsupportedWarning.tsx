import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { setOverrideBrowserCheck } from '@/utils/browserCheck';

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

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: 'easeOut',
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut',
      },
    },
  };

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8"
      initial="hidden"
      animate="visible"
      variants={containerVariants}>
      <Card className="w-full max-w-2xl bg-background/95 backdrop-blur border-muted">
        <CardHeader>
          <motion.div variants={itemVariants}>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Browser Not Supported</AlertTitle>
              <AlertDescription>
                We've detected compatibility issues with your current setup.
              </AlertDescription>
            </Alert>
          </motion.div>
        </CardHeader>

        <CardContent className="space-y-4">
          <motion.p className="text-lg text-muted-foreground" variants={itemVariants}>
            This music visualizer is not supported on {getWarningMessage()}.
          </motion.p>

          <motion.div className="bg-muted/50 rounded-lg p-4" variants={itemVariants}>
            <h3 className="font-semibold mb-2">Recommended Browsers:</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Google Chrome</li>
              <li>Microsoft Edge</li>
              <li>Brave Browser</li>
            </ul>
          </motion.div>

          <motion.div className="bg-muted/50 rounded-lg p-4" variants={itemVariants}>
            <h3 className="font-semibold mb-2">Required Features:</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>WebGL2</li>
              <li>SharedArrayBuffer</li>
              <li>Modern Audio Processing</li>
            </ul>
          </motion.div>
        </CardContent>

        <CardFooter className="flex justify-end space-x-4">
          <motion.div variants={itemVariants}>
            <Button variant="secondary" onClick={handleTryAnyway}>
              Try Anyway
            </Button>
            <Button variant="default" className="ml-2" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </motion.div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
