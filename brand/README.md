# Brand assets

Source logo masters. **Not served** and not used directly by the app.

| File | Variant |
| --- | --- |
| `html2u.png` | Primary logo (light/dark-on-light) |
| `html2u-w.png` | White variant (for dark backgrounds) |

The copies the app actually ships live under `app/` via Next.js file
conventions — change those to update what users see:

- `app/icon.png`, `app/apple-icon.png` — favicon / home-screen icon
- `app/opengraph-image.png`, `app/twitter-image.png` — social share preview card

When updating the logo, regenerate those `app/` files from the master here.
