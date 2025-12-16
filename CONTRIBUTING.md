# Contributing to docusaurus-plugin-aws-nova-assistant

Thank you for your interest in contributing! 🎉

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/docusaurus-plugin-aws-nova-assistant.git
   cd docusaurus-plugin-aws-nova-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the plugin**
   ```bash
   npm run build
   ```

4. **Watch mode for development**
   ```bash
   npm run watch
   ```

## Testing Locally

To test the plugin in a Docusaurus project:

1. **Link the plugin locally**
   ```bash
   # In the plugin directory
   npm link
   
   # In your Docusaurus project
   npm link docusaurus-plugin-aws-nova-assistant
   ```

2. **Add to your Docusaurus config**
   ```js
   plugins: [
     ['docusaurus-plugin-aws-nova-assistant', { /* options */ }],
   ],
   ```

3. **Start your Docusaurus site**
   ```bash
   npm start
   ```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure the build passes: `npm run build`
4. Update documentation if needed
5. Submit a pull request

## Code Style

- Use TypeScript for all source files
- Follow existing code patterns
- Keep components modular and reusable

## Releasing (Maintainers)

1. Update version in `package.json`
2. Commit: `git commit -m "chore: bump version to x.x.x"`
3. Tag: `git tag v{x.x.x}`
4. Push: `git push && git push --tags`

The GitHub Action will automatically publish to npm.

## Questions?

Feel free to open an issue for any questions or discussions!

