Below is a draft Product Requirements Document (PRD) that outlines how we can refactor the current codebase into a monorepo with shared UI and core functionality while accommodating multiple targets (web, desktop, and a JUCE plugin version).

---

# Product Requirements Document (PRD)

## Baryon Monorepo Refactor

### 1. Overview

The existing codebase is a single-application repository (everything under the src folder) that currently forms the base app. This base app serves as the core for both desktop and website usage, sharing most of the user interface (UI) components and front-end logic. However, going forward, we must support additional targets:

- A **web version** of the app (with separate design and upload workflows) that will be served on its own subdomain.
- A **JUCE plugin version** in which the front end continues to use the shared UI components, but the audio processing is rearchitected and rewritten in C++ (using the JUCE framework).

This PRD defines the requirements, architectural considerations, and proposed folder structure for refactoring the existing codebase into a monorepo.

---

### 2. Goals and Objectives

- **Modularity & Code Reuse:**  
  Centralize shared UI and core front-end logic into reusable packages that can be consumed across multiple apps (web, desktop, and JUCE-based plugin).

- **Separation of Concerns:**  
  Isolate platform-specific code (e.g., audio processing for the JUCE plugin written in C++) while keeping the presentation layer consistent between platforms.

- **Scalability & Maintainability:**  
  Use a monorepo approach (using PNPM workspaces or a similar tool) to ensure that dependencies, shared utilities, and application-specific modules can be versioned and maintained together.

- **Multi-Target Delivery:**  
  Support the following delivery targets:
  - **Web App:** A self-contained design upload and website configuration tool.
  - **Desktop App:** The primary application that runs on desktop environments, leveraging the shared UI.
  - **JUCE Plugin:** A plugin module where the back-end audio processing is redeveloped in C++ using JUCE while leveraging the core front-end for visualization and controls.

---

### 3. Stakeholders

- **Development Team:** Needs a modular and scalable code structure for rapid iteration.
- **Audio Processing Team:** Responsible for reimplementing the core audio processing in C++ (JUCE) separate from the front-end.
- **UI/UX Designers:** Rely on a shared set of polished UI components to maintain consistency across platforms.
- **Product & Business Owners:** Require the flexibility to deploy a unified brand experience while supporting multiple application targets.

---

### 4. Functional Requirements

#### 4.1. Shared Components

- **UI Components Library:**  
  Create a package (e.g., `packages/shared-ui`) containing all common UI elements, layouts, and styling. This should include:

  - Navigation elements (buttons, menus)
  - Form controls (file upload, inputs)
  - Canvas components (for 3D rendering)
  - Theming and style configuration

- **Core Application Logic:**  
  Abstract core front-end application logic (such as scene management, Three.js initialization, audio callbacks, and state management) into a separate package (e.g., `packages/core-app`).

#### 4.2. App Variants

- **Web Application:**

  - Provide a dedicated UI for design upload and website configuration.
  - Host the full application on a subdomain so that the same core logic and shared UI components are reused.
  - Include an independent routing and layout system tailored for a browser-based experience.

- **Desktop Application:**

  - Package the current base app into a desktop deliverable (e.g., via Electron or an alternative desktop solution).
  - Ensure that desktop-specific integrations (such as file system access) are encapsulated separately from the shared UI.

- **JUCE Plugin Version:**
  - Implement a new audio processing backend in C++ using JUCE.
  - Define a clear contract (e.g., through an API or IPC mechanism) between the core front-end (still in JavaScript/React) and the JUCE-based C++ audio engine.
  - Reuse the front-end shared UI from `packages/shared-ui` while stripping out or conditionally including the web audio processing code.

---

### 5. Non-Functional Requirements

- **Performance:**  
  The shared code (especially the 3D visualization and real-time audio processing hooks) must maintain high performance and fast HMR (Hot Module Replacement) both on the web and desktop.

- **Developer Experience:**  
  The monorepo setup should allow simultaneous development across multiple app targets, with clear tooling (e.g., ESLint, Prettier, TS configurations) and fast integration testing.

- **Maintainability:**  
  Clear separation of project boundaries coupled with strict dependency management via PNPM (or yarn/npm workspaces) will be essential.

- **Cross-Platform Consistency:**  
  Ensure that UI components are styled consistently and behave similarly across web and desktop versions, with special considerations on retina displays and accessibility.

---

### 6. Proposed Monorepo Structure

The refactored monorepo could be organized as follows:

```
monorepo-root/
├── apps/
│   ├── desktop/          # Desktop specific application (e.g., Electron-based)
│   │   ├── src/
│   │   └── package.json
│   ├── web/              # Web version with design upload and configuration
│   │   ├── src/
│   │   └── package.json
│   └── juce-plugin/      # JUCE plugin project (includes C++ code and UI integration)
│       ├── src/
│       └── CMakeLists.txt
├── packages/
│   ├── shared-ui/        # Shared React components and styling
│   │   ├── src/
│   │   └── package.json
│   ├── core-app/         # Core app logic, such as Three.js scenes, audio hooks, state management, etc.
│   │   ├── src/
│   │   └── package.json
│   └── audio-processing/ # Shared interface or bridge code for JS/C++ communications
│       ├── src/
│       └── package.json
├── configs/              # Shared configuration files
│   ├── vite.config.base.ts      # Base Vite configuration
│   ├── postcss.config.js        # PostCSS configuration
│   ├── tailwind.config.js       # Tailwind configuration
│   ├── eslint.config.js         # ESLint configuration
│   └── tsconfig.base.json       # Base TypeScript configuration
├── types/               # Global type definitions
│   ├── vite-env.d.ts            # Vite environment types
│   └── global.d.ts              # Shared type definitions
├── documentation/        # Documentation project using Docusaurus
│   ├── docs/             # Markdown source files for your docs
│   ├── docusaurus.config.js  # Docusaurus configuration file
│   ├── package.json      # (Optional) Dependencies and scripts for building the docs site
│   └── static/           # Static assets for the documentation site
├── tools/                # Dev tooling, scripts, and utilities if necessary
├── package.json          # Root package definition (manages overall dependencies and workspaces)
└── pnpm-workspace.yaml   # Workspace configuration that includes apps, packages, and the documentation folder
```

**Key Points:**

- **apps/** contains the final deliverables for each target.
- **packages/** houses the shared functionality and UI libraries.
- **configs/** centralizes shared configuration files to avoid duplication across apps and packages.
- **types/** contains global type definitions that can be referenced by all packages.
- **Separate C++ Code:** The `juce-plugin` folder will handle its own build system (for example, using CMake) but can still share UI contracts via interfaces defined in the `audio-processing` package.

---

### 7. Implementation Plan

#### 7.1. Initial Refactoring Phase

- **Audit the Current Codebase:**  
  Identify all components, utilities, and logic in the current src folder. Map out what should become part of the shared UI (presentation), and what is core app logic.
- **Create Shared Packages:**

  - Move common React components, Three.js scenes, and styling into `packages/shared-ui`.
  - Abstract core functionality (scene setup, audio hooks) into `packages/core-app`.

- **Establish the Monorepo Foundation:**
  - Set up a `pnpm-workspace.yaml` that includes all new packages and apps.
  - Ensure consistent TypeScript, ESLint, and Prettier configurations across the workspace.

#### 7.2. Application Variant Transition

- **Web Application:**

  - Create an `apps/web` folder that initially imports the shared UI and core-app packages.
  - Develop or adjust routes and state management to support design uploads and website configuration.

- **Desktop Application:**

  - Create an `apps/desktop` folder and integrate the shared packages.
  - Integrate any desktop-specific modules (e.g., file system APIs if using Electron).

- **JUCE Plugin Version:**
  - In parallel, start a project in `apps/juce-plugin` where the audio processing layer is reworked using C++ and JUCE.
  - Establish a binding or IPC contract between the C++ backend and the common JavaScript front end. This may include developing shared interface definitions within `packages/audio-processing`.

#### 7.3. Testing and Integration

- **Continuous Integration:**  
  Establish CI/CD pipelines for each package and app variant.
- **Automated Testing:**  
  Write unit and end-to-end tests for shared UI and core logic, ensuring no regressions occur during refactoring.
- **Performance Benchmarking:**  
  Verify that refactoring the shared code does not degrade the performance of the high-performance visualizations and real-time audio processing.

#### 7.4. Rollout

- **Staged Rollout:**  
  Begin with limited deployments for each target (web and desktop), and iterate rapidly based on feedback.
- **Documentation:**  
  Update README and internal documentation to reflect the monorepo structure and the development workflow.

---

### 8. Risks & Mitigations

- **Risk: Integration Complexity:**  
  _Mitigation:_ Maintain clear API contracts between shared packages and platform-specific code. Use TypeScript interfaces and comprehensive integration tests.
- **Risk: Performance Regressions:**  
  _Mitigation:_ Benchmark visual rendering and audio processing after each major change. Optimize shared components as needed.

- **Risk: Divergence Between Platforms:**  
  _Mitigation:_ Enforce strict style and unit testing across packages to ensure a consistent user experience; designate a core team member as the "UI guardian."

- **Risk: Complexity in Managing a C++ (JUCE) Codebase alongside JavaScript:**  
  _Mitigation:_ Clearly separate the build systems and use well-defined interface layers (possibly using a JSON-based protocol or shared native bindings) between the C++ and JS components.

- **Common pitfalls:**
  - If you're using TypeScript, you likely don't need a tsconfig.json in the root of your workspace. Packages should independently specify their own configurations, usually building off of a shared tsconfig.json from a separate package in the workspace. For more information, visit the TypeScript guide.
  - You want to avoid accessing files across package boundaries as much as possible. If you ever find yourself writing ../ to get from one package to another, you likely have an opportunity to re-think your approach by installing the package where it's needed and importing it into your code.

---

### 9. Milestones & Timeline

1. **Week 1–2: Planning & Codebase Audit**

   - Map current functionality
   - Define API contracts for shared packages

2. **Week 3–4: Set Up Monorepo and Shared Packages**

   - Create `packages/shared-ui` and `packages/core-app`
   - Update pnpm-workspace and configuration files

3. **Week 5–6: Migrate Core App & UI Components**

   - Refactor existing src into shared packages
   - Verify integration via a minimal working prototype

4. **Week 7–8: Web & Desktop App Setup**

   - Initialize `apps/web` and `apps/desktop`
   - Integrate shared packages and test for consistency

5. **Week 9–10: Start JUCE Plugin Development**

   - Set up the JUCE project structure within `apps/juce-plugin`
   - Develop a minimal audio processing module in C++ and bridge interface

6. **Week 11–12: Integration Testing & Optimization**
   - Cross-platform testing of shared UI and core components
   - Benchmark performance and iterate on CI/CD pipelines

---

### 10. Conclusion

By refactoring the current codebase into a monorepo, we can centralize and share UI and core application logic while addressing platform-specific needs. The proposed structure separates concerns into dedicated packages and apps, facilitating a unified and consistent development experience across web, desktop, and a high-performance JUCE plugin. This approach not only improves maintainability and scalability but also sets the stage for future enhancements with clear modular boundaries.

---

This PRD serves as a roadmap for the refactoring process. Each phase will be broken down into tasks during sprint planning sessions, and progress will be monitored via the project management tool.
