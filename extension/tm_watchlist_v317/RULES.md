# EvenTrade Architecture Rules & Guidelines

When developing features for EvenTrade, the following architectural boundaries and rules **MUST** be respected to ensure the codebase remains maintainable, performant, and scaleable.

## 1. Separation of Concerns (UI vs Logic)
- **Modularity:** UI components should be split into smaller, modular files inside `src/components/`. Do not bloat `sidebar.js`.
- **No Inline CSS in Javascript:** Do not use `element.style = "..."` or inline style strings. Add semantic class names (e.g., `className="et-btn-tv"`) and manage the styles in `assets/style.css` (for global injection) or inside the shadow DOM style definitions.

## 2. State Management & Storage
- **Global State:** All reactive state should live in `src/store.js`. UI elements must subscribe/react to `Store` updates rather than maintaining independent state logic.
- **Default State:** Any default application state (such as default watchlists or settings for first-time users) must be statically initialized within the `Store.state` object in `src/store.js`.
- **Persistent Data:** Use `chrome.storage.local` for persistent data storage (Watchlists, Settings) and caches (e.g., BSE symbol mapping).
- **No Ephemeral Memory for Important Data:** Do not rely on vanilla Javascript objects (e.g. `new Map()`) for caching data that is expensive to fetch, as this memory drops on page reload. Always write expensive computations to `chrome.storage.local`.

## 3. DOM Interactions (No Polling)
- Rely strictly on `MutationObserver` (as seen in `injector.js`) for injecting into dynamic pages.
- Avoid using `setInterval` or `setTimeout` sniffing mechanisms to wait for elements.

## 4. Modern Javascript Standard
- Use `import` and `export` to define interfaces. Avoid polluting the global scope or attaching logic to the `window` object unless absolutely necessary for external integrations.
