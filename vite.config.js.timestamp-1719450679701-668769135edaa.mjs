// vite.config.js
import { defineConfig } from "file:///C:/Users/c1bra/Documents/GitHub/Baryon/node_modules/vite/dist/node/index.js";

// postcss.config.js
import tailwindcss from "file:///C:/Users/c1bra/Documents/GitHub/Baryon/node_modules/tailwindcss/lib/index.js";
import autoprefixer from "file:///C:/Users/c1bra/Documents/GitHub/Baryon/node_modules/autoprefixer/lib/autoprefixer.js";
var postcss_config_default = {
  plugins: [tailwindcss(), autoprefixer()]
};

// vite.config.js
import glsl from "file:///C:/Users/c1bra/Documents/GitHub/Baryon/node_modules/vite-plugin-glsl/src/index.js";
import topLevelAwait from "file:///C:/Users/c1bra/Documents/GitHub/Baryon/node_modules/vite-plugin-top-level-await/exports/import.mjs";
import fs from "fs";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\c1bra\\Documents\\GitHub\\Baryon";
var vite_config_default = defineConfig({
  css: {
    postcss: postcss_config_default
  },
  root: "./",
  publicDir: "static",
  base: "./",
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      // 'Cache-Control': 'public, max-age=31536000, immutable', // for prod
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    },
    host: true,
    // Open to local network and display URL
    open: !("SANDBOX_URL" in process.env || "CODESANDBOX_HOST" in process.env),
    // Open if it's not a CodeSandbox
    https: {
      key: fs.readFileSync(path.resolve(__vite_injected_original_dirname, "localhost.key")),
      cert: fs.readFileSync(path.resolve(__vite_injected_original_dirname, "localhost.crt"))
    }
  },
  build: {
    outDir: "dist",
    // Output in the dist/ folder
    emptyOutDir: true,
    // Empty the folder first
    sourcemap: true,
    // Add sourcemap
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true
      }
    },
    rollupOptions: {
      output: {
        entryFileNames: `[name].[hash].js`,
        chunkFileNames: `[name].[hash].js`,
        assetFileNames: `[name].[hash].[ext]`
      }
    }
    // target: 'esnext',
  },
  optimizeDeps: {
    include: ["@ffmpeg/ffmpeg"]
  },
  plugins: [
    glsl(),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__tla",
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiLCAicG9zdGNzcy5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxjMWJyYVxcXFxEb2N1bWVudHNcXFxcR2l0SHViXFxcXEJhcnlvblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYzFicmFcXFxcRG9jdW1lbnRzXFxcXEdpdEh1YlxcXFxCYXJ5b25cXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2MxYnJhL0RvY3VtZW50cy9HaXRIdWIvQmFyeW9uL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCBwb3N0Y3NzQ29uZmlnIGZyb20gJy4vcG9zdGNzcy5jb25maWcuanMnO1xyXG5pbXBvcnQgZ2xzbCBmcm9tICd2aXRlLXBsdWdpbi1nbHNsJztcclxuaW1wb3J0IHRvcExldmVsQXdhaXQgZnJvbSAndml0ZS1wbHVnaW4tdG9wLWxldmVsLWF3YWl0JztcclxuaW1wb3J0IGZzIGZyb20gJ2ZzJztcclxuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGNzczoge1xyXG4gICAgcG9zdGNzczogcG9zdGNzc0NvbmZpZyxcclxuICB9LFxyXG4gIHJvb3Q6ICcuLycsXHJcbiAgcHVibGljRGlyOiAnc3RhdGljJyxcclxuICBiYXNlOiAnLi8nLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICAnQ3Jvc3MtT3JpZ2luLUVtYmVkZGVyLVBvbGljeSc6ICdyZXF1aXJlLWNvcnAnLFxyXG4gICAgICAnQ3Jvc3MtT3JpZ2luLU9wZW5lci1Qb2xpY3knOiAnc2FtZS1vcmlnaW4nLFxyXG4gICAgICAvLyAnQ2FjaGUtQ29udHJvbCc6ICdwdWJsaWMsIG1heC1hZ2U9MzE1MzYwMDAsIGltbXV0YWJsZScsIC8vIGZvciBwcm9kXHJcbiAgICAgICdDYWNoZS1Db250cm9sJzogJ25vLWNhY2hlLCBuby1zdG9yZSwgbXVzdC1yZXZhbGlkYXRlJyxcclxuICAgICAgUHJhZ21hOiAnbm8tY2FjaGUnLFxyXG4gICAgICBFeHBpcmVzOiAnMCcsXHJcbiAgICB9LFxyXG4gICAgaG9zdDogdHJ1ZSwgLy8gT3BlbiB0byBsb2NhbCBuZXR3b3JrIGFuZCBkaXNwbGF5IFVSTFxyXG4gICAgb3BlbjogISgnU0FOREJPWF9VUkwnIGluIHByb2Nlc3MuZW52IHx8ICdDT0RFU0FOREJPWF9IT1NUJyBpbiBwcm9jZXNzLmVudiksIC8vIE9wZW4gaWYgaXQncyBub3QgYSBDb2RlU2FuZGJveFxyXG4gICAgaHR0cHM6IHtcclxuICAgICAga2V5OiBmcy5yZWFkRmlsZVN5bmMocGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ2xvY2FsaG9zdC5rZXknKSksXHJcbiAgICAgIGNlcnQ6IGZzLnJlYWRGaWxlU3luYyhwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnbG9jYWxob3N0LmNydCcpKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgb3V0RGlyOiAnZGlzdCcsIC8vIE91dHB1dCBpbiB0aGUgZGlzdC8gZm9sZGVyXHJcbiAgICBlbXB0eU91dERpcjogdHJ1ZSwgLy8gRW1wdHkgdGhlIGZvbGRlciBmaXJzdFxyXG4gICAgc291cmNlbWFwOiB0cnVlLCAvLyBBZGQgc291cmNlbWFwXHJcbiAgICBtaW5pZnk6ICd0ZXJzZXInLFxyXG4gICAgdGVyc2VyT3B0aW9uczoge1xyXG4gICAgICBjb21wcmVzczoge1xyXG4gICAgICAgIGRyb3BfY29uc29sZTogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiBgW25hbWVdLltoYXNoXS5qc2AsXHJcbiAgICAgICAgY2h1bmtGaWxlTmFtZXM6IGBbbmFtZV0uW2hhc2hdLmpzYCxcclxuICAgICAgICBhc3NldEZpbGVOYW1lczogYFtuYW1lXS5baGFzaF0uW2V4dF1gLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIC8vIHRhcmdldDogJ2VzbmV4dCcsXHJcbiAgfSxcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGluY2x1ZGU6IFsnQGZmbXBlZy9mZm1wZWcnXSxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIGdsc2woKSxcclxuICAgIHRvcExldmVsQXdhaXQoe1xyXG4gICAgICAvLyBUaGUgZXhwb3J0IG5hbWUgb2YgdG9wLWxldmVsIGF3YWl0IHByb21pc2UgZm9yIGVhY2ggY2h1bmsgbW9kdWxlXHJcbiAgICAgIHByb21pc2VFeHBvcnROYW1lOiAnX190bGEnLFxyXG4gICAgICAvLyBUaGUgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgaW1wb3J0IG5hbWVzIG9mIHRvcC1sZXZlbCBhd2FpdCBwcm9taXNlIGluIGVhY2ggY2h1bmsgbW9kdWxlXHJcbiAgICAgIHByb21pc2VJbXBvcnROYW1lOiAoaSkgPT4gYF9fdGxhXyR7aX1gLFxyXG4gICAgfSksXHJcbiAgXSxcclxufSk7XHJcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcYzFicmFcXFxcRG9jdW1lbnRzXFxcXEdpdEh1YlxcXFxCYXJ5b25cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGMxYnJhXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcQmFyeW9uXFxcXHBvc3Rjc3MuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9jMWJyYS9Eb2N1bWVudHMvR2l0SHViL0Jhcnlvbi9wb3N0Y3NzLmNvbmZpZy5qc1wiO2ltcG9ydCB0YWlsd2luZGNzcyBmcm9tICd0YWlsd2luZGNzcyc7XHJcbmltcG9ydCBhdXRvcHJlZml4ZXIgZnJvbSAnYXV0b3ByZWZpeGVyJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICBwbHVnaW5zOiBbdGFpbHdpbmRjc3MoKSwgYXV0b3ByZWZpeGVyKCldLFxyXG59O1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWdULFNBQVMsb0JBQW9COzs7QUNBdkIsT0FBTyxpQkFBaUI7QUFDOVUsT0FBTyxrQkFBa0I7QUFFekIsSUFBTyx5QkFBUTtBQUFBLEVBQ2IsU0FBUyxDQUFDLFlBQVksR0FBRyxhQUFhLENBQUM7QUFDekM7OztBREhBLE9BQU8sVUFBVTtBQUNqQixPQUFPLG1CQUFtQjtBQUMxQixPQUFPLFFBQVE7QUFDZixPQUFPLFVBQVU7QUFMakIsSUFBTSxtQ0FBbUM7QUFPekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsS0FBSztBQUFBLElBQ0gsU0FBUztBQUFBLEVBQ1g7QUFBQSxFQUNBLE1BQU07QUFBQSxFQUNOLFdBQVc7QUFBQSxFQUNYLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFBQSxJQUNOLFNBQVM7QUFBQSxNQUNQLGdDQUFnQztBQUFBLE1BQ2hDLDhCQUE4QjtBQUFBO0FBQUEsTUFFOUIsaUJBQWlCO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLElBQ1g7QUFBQSxJQUNBLE1BQU07QUFBQTtBQUFBLElBQ04sTUFBTSxFQUFFLGlCQUFpQixRQUFRLE9BQU8sc0JBQXNCLFFBQVE7QUFBQTtBQUFBLElBQ3RFLE9BQU87QUFBQSxNQUNMLEtBQUssR0FBRyxhQUFhLEtBQUssUUFBUSxrQ0FBVyxlQUFlLENBQUM7QUFBQSxNQUM3RCxNQUFNLEdBQUcsYUFBYSxLQUFLLFFBQVEsa0NBQVcsZUFBZSxDQUFDO0FBQUEsSUFDaEU7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUE7QUFBQSxJQUNSLGFBQWE7QUFBQTtBQUFBLElBQ2IsV0FBVztBQUFBO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixVQUFVO0FBQUEsUUFDUixjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLElBQ0Y7QUFBQTtBQUFBLEVBRUY7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxnQkFBZ0I7QUFBQSxFQUM1QjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsS0FBSztBQUFBLElBQ0wsY0FBYztBQUFBO0FBQUEsTUFFWixtQkFBbUI7QUFBQTtBQUFBLE1BRW5CLG1CQUFtQixDQUFDLE1BQU0sU0FBUyxDQUFDO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0g7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
