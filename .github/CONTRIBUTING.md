# Contributing to Baryon

Thank you for being part of the Baryon development team! This guide will help you understand our development process and contribution guidelines.

## Project Access

As Baryon is a private repository, there are two ways to contribute:

1. **Direct Collaborators** need to ensure they have:

   - Been granted appropriate write access to the repository
   - Signed any required NDAs or agreements (if applicable)
   - Received necessary development environment setup instructions

2. **Read-only Collaborators** need to:
   - Have been granted read access to the repository
   - Fork the repository (your fork will remain private)
   - Signed any required NDAs or agreements (if applicable)
   - Received necessary development environment setup instructions

## Development Process

We use the OODA Loop framework to guide our development process:

- **Observe**: Understand the current state of the project, user needs, and technical requirements
- **Orient**: Analyze how your proposed changes fit into the larger project goals
- **Decide**: Choose the best approach for implementation
- **Act**: Execute your solution effectively

## How to Contribute

1. **Core Development**

   - Implement new features
   - Improve existing functionality
   - Optimize performance
   - Fix bugs and issues

2. **Documentation**

   - Update technical documentation
   - Create internal guides
   - Document APIs and components

## Development Workflow

1. **Repository Setup**

   - **Direct Collaborators**: Create your feature branch from `develop`
   - **Read-only Collaborators**:
     - Fork the repository to your GitHub account (fork remains private)
     - Clone your fork locally
     - Add the original repository as upstream: `git remote add upstream [repository-url]`
     - Keep your fork in sync: `git fetch upstream && git merge upstream/develop`

2. Create your feature branch

   - Branch naming convention: `feature/description` or `fix/description`
   - Example: `feature/add-3d-viz` or `fix/memory-leak`

3. Development Guidelines:

   - Write tests for new functionality (no tests have been written yet, but we should start writing them)
   - Ensure all tests pass locally
   - Follow the project's code style
   - Update documentation as needed

4. Code Review Process:
   - **Direct Collaborators**: Create a pull request to `develop`
   - **Read-only Collaborators**:
     - Push changes to your fork
     - Create a pull request from your fork's branch to the original repository's `develop` branch
   - Request review from appropriate team members
   - Address review feedback
   - Maintain security best practices

## Git Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Each commit message should be structured as follows:

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

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to our CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

**Scope:**
The scope provides additional contextual information and is optional:

- `(shader)`: Changes to shader code
- `(ui)`: User interface changes
- `(core)`: Core functionality
- `(deps)`: Dependency updates
- `(test)`: Test infrastructure changes
- `(css)`: Styling changes
- `(api)`: API-related changes

Example commit messages:

```
feat(shader): add new particle simulation algorithm
fix(ui): resolve memory leak in visualization component
refactor(core): restructure flow field calculations
perf(shader): optimize vertex processing
docs(api): update WebGL interface documentation
test(core): add unit tests for particle system
chore(deps): update three.js to v0.150.0
revert: feat(shader): remove problematic particle algorithm
```

## Branch Structure

- `main`: Production-ready code
- `develop`: Primary development branch
- `feature/*`: New features
- `fix/*`: Bug fixes
- `hotfix/*`: Urgent production fixes

## Issue and Pull Request Labels

- `priority-high`: Urgent issues needing immediate attention
- `bug`: Issues that are bugs
- `enhancement`: New feature requests
- `documentation`: Documentation updates
- `breaking-change`: Changes that affect backward compatibility

## Testing Requirements

- Run the test suite: `npm test` (doesn't exist yet)
- Ensure linting passes: `npm run lint`
- Check build succeeds: `npm run build`

## Getting Help

- Contact the project lead
- Create GitHub issues for technical discussions
- Use internal communication channels

## Security

- Do not share access to the repository
- Keep all project discussions internal
- Follow security best practices
- Report security concerns immediately to project leads

---

Remember that all project code and discussions should be kept confidential within the development team.
