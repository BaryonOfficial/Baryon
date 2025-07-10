# Contributing to Baryon

Thank you for your interest in contributing to Baryon! As an open source project licensed under the **GNU AGPL v3**, we welcome contributions from anyone who wants to help improve the project. Whether you’re fixing bugs, adding features, improving documentation, or just sharing ideas, you’re part of our community.

## Who Can Contribute?

**Everyone!**  
You don’t need to be a member of any organization or team to contribute. All development happens in the open, and anyone can participate by forking the repository, opening issues, or submitting pull requests.

- **Core Contributors**: Maintainers with direct write access to the repository (typically organization members or trusted long-term contributors).
- **Community Contributors**: Anyone from the public who forks the repo and submits pull requests.

## Development Process

We use the OODA Loop framework to guide our development:

- **Observe**: Understand the current state of the project, user needs, and technical requirements.
- **Orient**: Analyze how your proposed changes fit into the larger project goals.
- **Decide**: Choose the best approach for implementation.
- **Act**: Execute your solution effectively.

## How to Contribute

1. **Find or Propose an Issue**

   - Check [open issues](https://github.com/BaryonOfficial/Baryon/issues) or open a new one to suggest an idea or report a bug.

2. **Fork the Repository**

   - Click the “Fork” button on the [Baryon GitHub page](https://github.com/BaryonOfficial/Baryon).

3. **Clone Your Fork**

   - Copy your fork to your computer:
     ```
     git clone https://github.com/<your-username>/Baryon.git
     cd Baryon
     ```

4. **Create a Branch**

   - Make a new branch for your work:
     ```
     git checkout -b feature/my-feature
     ```
     (Replace `feature/my-feature` with a short description.)

5. **Make Your Changes**

   - Edit code or documentation as needed.

6. **Test Your Changes**

   - Run:
     ```
     npm run lint
     npm run build
     ```
     (If tests exist: `npm test`)

7. **Commit and Push**

   - Save your changes:
     ```
     git add .
     git commit -m "feat: describe your change"
     git push origin feature/my-feature
     ```

8. **Open a Pull Request**
   - Go to your fork on GitHub and click “Compare & pull request.”
   - Fill out the form and submit.

---

**Tip:**  
If you’re new to git or GitHub, check out [GitHub’s Hello World guide](https://guides.github.com/activities/hello-world/)!

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issue numbers in the footer

**Types:**  
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Scope:**  
Optional, e.g. `(shader)`, `(ui)`, `(core)`, `(deps)`, `(test)`, `(css)`, `(api)`

**Example:**

```
feat(shader): add new particle simulation algorithm
fix(ui): resolve memory leak in visualization component
docs(api): update WebGL interface documentation
```

## Branch Structure

- `main`: Production-ready code
- `develop`: Primary development branch
- `feature/*`: New features
- `fix/*`: Bug fixes
- `hotfix/*`: Urgent production fixes

## Labels

- `good first issue`: Great for newcomers
- `help wanted`: Maintainers are seeking help
- `bug`: Confirmed bugs
- `enhancement`: Feature requests
- `documentation`: Docs updates
- `breaking-change`: Backward-incompatible changes

## Code of Conduct

We are committed to fostering a welcoming and respectful community. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

- Do not disclose security vulnerabilities publicly. Please report them privately to the maintainers.
- Follow security best practices in your contributions.

## Getting Help

- Open a [GitHub issue](https://github.com/BaryonOfficial/Baryon/issues) for questions, suggestions, or discussions.
- Join our community chat (link, if available).
- See the [README](../readme.md) for more information.

---

**Let’s build something amazing together!**
