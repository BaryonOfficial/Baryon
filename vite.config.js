import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';

export default defineConfig ({
    root: 'src/',
    publicDir: '../static/',
    base: './',
    server:
    {
        host: true, // Open to local network and display URL
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) // Open if it's not a CodeSandbox
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: true // Add sourcemap
    },
    plugins:
    [
        glsl({
            include: [                   // Glob pattern, or array of glob patterns to import
              '**/*.glsl', '**/*.wgsl',
              '**/*.vert', '**/*.frag',
              '**/*.vs', '**/*.fs'
            ],
            exclude: undefined,          // Glob pattern, or array of glob patterns to ignore
            warnDuplicatedImports: true, // Warn if the same chunk was imported multiple times
            defaultExtension: 'glsl',    // Shader suffix when no extension is specified
            compress: false,             // Compress output shader code
            watch: true,                 // Recompile shader on change
            root: '/'                    // Directory for root imports
          })
    ]
});