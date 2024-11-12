declare global {
    interface Window {
        exports: {
            RingBuffer: {
                getStorageForCapacity(capacity: number, type: typeof Float32Array): SharedArrayBuffer
                new(sab: SharedArrayBuffer, type: typeof Float32Array): any
            }
            AudioReader: new (rb: any) => any
        }
    }
}

export { } 