# Mobile App Architecture — Archive Notice

## Status: LEGACY / ARCHIVED CANDIDATE

As decided in the GraniteMeasure AI architectural consolidation:
- **Primary Mobile Stack**: **Capacitor** (located in `frontend/`)
  - Directly reuses the Next.js application, eliminating UI divergence
  - Full feature parity: Camera, Geolocation/GPS, 3D point cloud and cutting viewers, voice assistant, and English/Telugu i18n
  - Managed via `@capacitor/core`, `@capacitor/camera`, `@capacitor/geolocation`
- **Expo Mobile App** (`mobile/`):
  - Retained as a reference implementation and fallback archive candidate.
  - Active feature development is consolidated on the Capacitor/Next.js stack.
