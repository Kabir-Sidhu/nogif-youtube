# Chrome Web Store Listing — NoGIF

> Last Updated: 2026-10-31

## Store Listing

**Extension Name**
NoGIF - Remove YouTube GIF Comments

**Short Description**
Removes animated GIF comments from YouTube videos and Shorts.

**Detailed Description**
Take control of your YouTube comment section with NoGIF.

Animated GIFs in YouTube comment sections can be loud, distracting, and resource-heavy on your browser. NoGIF keeps your discussions clean and focused.

Features:
- Smart Filter (Default): Replaces noisy animated GIFs with a clean, unobtrusive "Show GIF" toggle button. View GIFs only when you want to.
- Hide All Mode: Completely eliminates GIF noise, placeholders, and buttons for a 100% distraction-free text reading experience.
- Works Everywhere on YouTube: Full support for regular YouTube videos, YouTube Shorts, comment replies, and infinite-scrolling comment threads.
- Instant Live Switching: Change settings inside the popup and watch them take effect immediately without reloading your open tabs.
- Lightweight and Private: Zero external tracking, zero analytics, zero background battery drain. Runs completely client-side.

How to Use:
1. Install NoGIF.
2. Browse YouTube normally — animated GIFs in comments are automatically kept under control.
3. Click the NoGIF extension icon in your toolbar to switch between Smart Filter, Hide All, or Disabled modes anytime.

Privacy:
NoGIF does not collect, track, or share any personal data, accounts, or browsing history. Everything is processed locally on your device.

Support:
Found a bug or have a suggestion? Open an issue at:
https://github.com/Kabir-Sidhu/nogif-youtube
or contact: kabirssidhu@gmail.com

**Category**
Productivity

**Publisher Contact Email**
kabirssidhu@gmail.com

**Single Purpose**
Removes animated GIF comments from YouTube videos and Shorts.

**Primary Language**
English

---

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| `storage` | permissions | Used to save user preferences locally (filtering mode: Smart Filter, Hide All, or Off, and badge display toggle) and keep track of session statistics (number of GIF comments blocked/revealed) across browser sessions. |
| `*://*.youtube.com/*` | host_permissions | Required to run content scripts on YouTube pages (*://*.youtube.com/*) to identify animated GIF comments in the video and Shorts comment sections and replace them with a toggle button or hide them according to user settings. The extension does not access any other websites. |

---

## Remote Code

- **Are you using remote code?** No, I am not using remote code.
- All JavaScript, stylesheets, and assets are packaged and executed locally within the extension bundle.

---

## Data Use Disclosures

- **Data Collected:** None. All checkboxes remain unchecked.
- **Certifications:** All three certified (data is not sold, not used for unrelated purposes, not used for creditworthiness).
- **Privacy Policy URL:** https://github.com/Kabir-Sidhu/nogif-youtube/blob/main/PRIVACY.md

