---
name: strelit-zero-raster-icons
description: Patterns for zero-raster SVG CSS mask icons in Strelit UI Kit. Use when replacing legacy PNG assets or styling layout controls across themes.
---

# Strelit UI Kit — Zero-Raster SVG & CSS Mask Icons Skill

Use this skill when implementing resolution-independent, theme-adaptive icons without shipping raster `.png` files.

## 1. CSS Mask Pattern
Instead of `background-image: url('strelit-close-black.png')`, define vector paths as data URIs via `mask-image`:

```css
.strelit-icon {
    display: inline-block;
    width: 14px;
    height: 14px;
    background-color: var(--strelit-icon-color, currentColor);
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    -webkit-mask-size: contain;
}

.strelit-icon--close {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z'/%3E%3C/svg%3E");
}
```

## 2. Dynamic Theme Adaptation
Because the icon's visual color comes from `background-color`, changing `--strelit-icon-color` automatically recolors all icons across Light, Dark, and High-Contrast themes without shipping separate dark/light icon binaries.
