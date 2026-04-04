module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make ownership and execution order harder to reason about.",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-packages-to-apps",
      severity: "error",
      comment: "Shared packages must not depend on application code.",
      from: {
        path: "^packages/",
      },
      to: {
        path: "^apps/",
      },
    },
    {
      name: "desktop-no-direct-visualizer-subpaths",
      severity: "error",
      comment:
        "Desktop should centralize engine-facing imports in apps/desktop/shared/desktopShell.js so private adapter seams stay explicit.",
      from: {
        path: "^apps/desktop/",
        pathNot: "^apps/desktop/shared/(desktopShell|renderPolicy)\\.js$",
      },
      to: {
        path: "^@baryon/visualizer/",
      },
    },
    {
      name: "desktop-no-direct-app-shell-desktop-subpaths",
      severity: "error",
      comment:
        "Desktop should consume camera/runtime helper subpaths through its private desktopShell adapter instead of scattering deep app-shell imports.",
      from: {
        path: "^apps/desktop/",
        pathNot: "^apps/desktop/shared/desktopShell\\.js$",
      },
      to: {
        path: "^@baryon/app-shell/(camera-control-events|camera-view-presets|live-input-runtime-status)$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "^node_modules",
    },
    exclude: {
      path: "(^|/)(dist|coverage|test-results|tmp|node_modules)/",
    },
    reporterOptions: {
      dot: {
        collapsePattern: "^(apps|packages)/[^/]+/",
      },
    },
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
  },
};
