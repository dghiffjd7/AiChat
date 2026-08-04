# Device Compatibility Smoke Checklist

Scope: Android WebView/Tauri layout compatibility for viewport, keyboard, short-screen panels, and back navigation.

## Device Matrix

Run the checklist on at least one device from each bucket before release:

- Compact/narrow Android: width <= 393 CSS px, display size default and large.
- Tall Android: 1080x2400 class devices, display size default.
- Short visual viewport: landscape or large system font/display scale.
- OEM WebView variants: vivo, Xiaomi/Redmi, Samsung/Pixel where available.
- Desktop dev WebView: Windows Tauri dev build, no touch keyboard.

Current target regressions:

- vivo y500: keyboard must not cover composer.
- Redmi Note12T Pro: preset detail/binding content must remain readable on short visual viewport.
- Xiaomi/Redmi: editing a creative-writing user bubble or the maid persona prompt must not jump in height.
- Conversation reopen: the newest assistant floor must render once after leaving and reopening a room.
- Rich regex output: the blank area below a rendered card must stop growing after layout settles.
- Android back gesture/key: must navigate app state before exiting.

## Viewport And Keyboard

1. Open a chat room.
2. Tap the composer.
3. Verify the top bar remains visible and the composer is above the keyboard.
4. Type multiple lines; verify the latest message area is still reachable.
5. Close keyboard; verify chat room height returns to full visual viewport.
6. Open Settings -> UI/debug options, enable the diagnostic button, then open:

   Diagnostic -> Keyboard

```js
window.__chatappViewportDebugInfo?.()
```

The console function is kept as a fallback for developer builds.

For Xiaomi/Redmi editing reports, reproduce one surface at a time before exporting:

- Creative writing: open a user bubble with the pencil action, type/edit, then save or cancel.
- Maid settings: open Prompt -> Persona, focus the editable prompt, then type/edit.

The keyboard inspector keeps a rolling window of the latest 120 viewport/keyboard events. The same events are also
mirrored into Diagnostic -> Timeline, so a combined reproduction can use one Timeline TXT export. The two tracked
editors add focus, IME composition, and layout-change events under `creative-user-bubble-edit` or
`maid-persona-prompt`. Text values are not captured.

Expected:

- `keyboard.visible` is `true` while keyboard is open.
- `cssVars.appVisualHeight` changes when visual viewport changes.
- `activeElement.id` is `composer-input` or another focused editor.

## Preset Panel Short-Screen

1. Open Settings menu -> Preset.
2. Enter a preset detail page.
3. On short viewport or large display scale, verify:
   - header and footer are visible;
   - editor/content area has meaningful height;
   - save/cancel buttons do not overlap content;
   - detail page can scroll independently.
4. Repeat on binding page.

## Android Back

1. With keyboard open, press Android back once: keyboard closes, app stays in place.
2. With a modal/panel open, press back once: the top panel closes.
3. In a chat room, press back once: app returns to chat list/RP previous state.
4. On Contacts or Moments tab, press back once: app switches to Chat tab.
5. On Chat tab root, press back once: app shows exit hint.
6. Press back again after the hint: native exit flow is allowed.

Expected: the second root-level back exits the Tauri application instead of showing the hint again or remaining open.

## Conversation Reopen And Rich Regex

Before reproducing, enable the diagnostic button under Settings -> Advanced.

For one combined diagnostic run, reproduce in this order:

1. Edit the creative-writing user bubble.
2. Edit the maid Prompt -> Persona field.
3. Leave and reopen the affected conversation to check the newest assistant floor.
4. Trigger the rich-regex blank-space growth last, leave it visible for a few seconds, then immediately export
   Diagnostic -> Timeline.

Android back events are also mirrored into the same timeline. Test the final root-level second-back exit only after
the TXT has been exported: a successful result closes the process, while a failed result leaves the app open and can
be followed by another Timeline export.

For a duplicated newest assistant floor:

1. Note that the newest assistant reply appears once.
2. Leave the room, then reopen the same conversation.
3. If the newest reply appears twice, do not edit or delete either copy.
4. Immediately open Diagnostic -> Timeline and export the TXT file.

For continuously growing blank space below regex-rendered output:

1. Open the affected conversation with the same enabled regex/card configuration.
2. Leave the growing blank area visible for several seconds.
3. Open Diagnostic -> Timeline and export the TXT file while the issue is still active.

The timeline records message IDs, roles, lengths, duplicate group positions, and iframe height decisions. It does not
export chat text, prompt text, or regex replacement content.

## Release Notes

- Capture screenshot/video on any failed matrix item.
- Prefer one Diagnostic -> Timeline export for the combined keyboard/editor, Android back, duplicated-history, and
  rich-regex reproduction. Use the separate Keyboard or Back export only when deeper follow-up is requested.
- `window.__chatappViewportDebugInfo?.()` remains available as a developer-build fallback for keyboard or
  visual-offset issues.
- If an OEM device differs, record WebView version, Android version, display size, font size, and whether gesture navigation is enabled.
