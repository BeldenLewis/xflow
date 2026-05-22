<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:product-design-rules -->
# Product UI Principle: Calm Hierarchy First

Apply this to every future product/admin UI change in this repository.

- Prioritize visual hierarchy, order, spacing, and cognitive ease before adding more visible controls.
- A page should guide the eye naturally: headline first, short explanation second, primary action third, details afterward.
- When there is a lot to show, show it smaller and quieter. Do not give every metric, list, button, and setting the same visual weight.
- Keep the first screen focused on the user's next decision. Move reference data, repeated controls, and destructive actions lower, smaller, or behind disclosure.
- Use whitespace as structure. Prefer fewer, clearer sections over dense dashboards packed with same-weight cards.
- Buttons should become visible when the user understands why they need them. Avoid making action-heavy rows the default reading experience.
- Add microinteraction animation to product UI by default. Use subtle motion for hover, press, focus, expand/collapse, loading, success, and state transitions so the interface feels responsive and understandable.
- Keep motion calm and purposeful: short durations, small distance/scale changes, no distracting decorative movement, and respect reduced-motion preferences when adding custom animation.
- Complex operational pages should feel premium by being easy to scan, not by showing everything at once.
- Before finishing frontend work, review whether a tired user can understand where to look first without reading every label.
<!-- END:product-design-rules -->
