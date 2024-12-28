export function useAsyncResource<T extends Record<string, unknown>>(
  resources: T,
  options?: {
    suspense?: boolean;
    timeout?: number;
  }
) {
  // Check if all resources are loaded
  const isReady = Object.values(resources).every(Boolean);

  if (!isReady) {
    if (options?.suspense) {
      throw new Promise((resolve) => setTimeout(resolve, options?.timeout ?? 0));
    }
    return false;
  }

  return true;
}
