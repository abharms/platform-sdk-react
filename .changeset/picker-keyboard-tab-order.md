---
'@youversion/platform-core': patch
'@youversion/platform-react-hooks': patch
'@youversion/platform-react-ui': patch
---

Fix keyboard tab order in `BibleVersionPicker` and `BibleChapterPicker`.

Three separate defects, all reachable by pressing Tab inside an open picker:

- **Positive `tabIndex` removed from the search inputs.** The version, language, and chapter search inputs each carried `tabIndex={1}`. A positive tabindex moves an element to the front of its tab-order scope regardless of where it sits in the DOM, so each search input was the *first* stop rather than the last — and Shift+Tab out of it was a backwards exit off the front edge of the scope, not the ordinary move it appeared to be. The inputs now take their natural position. **This changes tab order for anyone relying on the old behavior:** Tab now reaches the search field in visual/DOM order instead of first. If a picker should open with the search field focused, that's initial focus, not tab order.

- **Hidden panels are no longer tabbable.** `BibleVersionPicker` keeps both its version panel and its language panel mounted so the crossfade between them can animate, hiding the inactive one with `opacity`/`blur`/`scale`/`pointer-events`. None of those remove elements from sequential focus navigation, so Tab walked into the invisible panel and focus vanished somewhere with no visible focus ring. Both panels now carry `inert` when inactive, which removes them from the tab order and the accessibility tree without affecting layout — the animation is unchanged.

- **Tab-wraparound edge detection corrected.** The shadow-DOM-aware focus handler in the shared `Popover` computed its tabbable candidates with a plain selector match, which also picked up roving-tabindex elements (inactive Radix Tabs triggers are `tabindex="-1"`), elements in hidden subtrees, and `inert` ones. That could put "last" on an element the user can never reach, so the real last element's Tab went unhandled — which, inside a Shadow DOM tree, closed the popover instead of merely leaking focus. Candidate selection now mirrors Radix's own tabbable semantics.

The first two defects affect all consumers; the third only affects components rendered inside a `ShadowRootHost`. See `docs/adr/0005-shadow-dom-style-isolation-spike.md` for the full investigation, including why none of this was caught by the existing tests.
