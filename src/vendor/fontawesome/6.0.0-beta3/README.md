Font Awesome Free 6.0.0-beta3 runtime subset.

Source:
- https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css
- https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/*.woff2

This directory intentionally includes only the CSS and WOFF2 webfonts needed by
rich iframe cards. The iframe host rewrites known Font Awesome CDN stylesheet
URLs to the local same-origin CSS to avoid third-party CDN storage warnings and
to keep common icon dependencies available offline.
