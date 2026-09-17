# CSS Modules

Javelin UI supports locally scoped CSS classes together with Tailwind CSS.

Create a file ending in `.module.css` under one of the configured `cssModuleDirectories`:

```css
.panel {
  border-radius: 1rem;
}
```

Reference the class from Java using a project-relative path:

```java
div(
    cssModule("styles/card.module.css", "panel"),
    tw("bg-white p-6")
)
```

The build deterministically rewrites `panel` to a scoped class name. It also verifies that the referenced module and local class exist. Multiple `className`, `tw`, `twWhen`, and `cssModule` properties on the same element are combined.

Both `cssModule` arguments must be string literals so mistakes are caught during compilation and CSS processing.

Current limitations: `composes`, full `:global` behavior, keyframe scoping, and URL rewriting are not supported. Module paths must use the same project-relative spelling in Java and on disk.
