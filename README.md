# NoGIF: YouTube GIF Comment Remover

A lightweight browser extension that hides animated GIF comments on YouTube videos and Shorts. Built for Firefox and Chromium-based browsers.

## Features

- Smart filter mode: hides pure GIF comments while keeping text comments with a manual reveal button.
- Hide all mode: collapses any comment or reply containing a GIF.
- Bandwidth saver: prevents loading hidden animated WebP images until revealed.
- Clean header: hides the promotional "GIFs" chip from the comments toolbar.
- Toolbar badge: live counter of blocked GIFs on the active video.
- Zero dependencies: native JavaScript and CSS with no background bloat.

## Installation

Install directly from your browser's extension store:

- **Chrome Web Store** [Install](https://chromewebstore.google.com/detail/nogif-remove-youtube-gif/phiacbiljmlocdaikbifeoklcckjpblp)
- **Firefox Add-ons** [Install](https://addons.mozilla.org/en-US/firefox/addon/nogif-remove-youtube-gifs/)

Manual releases and packaged zips are available under [Releases](https://github.com/Kabir-Sidhu/nogif-youtube/releases).

## Development

```bash
# Run unit tests
npm test

# Build icons
npm run icons
```

## License

MIT © Kabir Sidhu
