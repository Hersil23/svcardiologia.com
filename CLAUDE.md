# SVC App - Sociedad Venezolana de Cardiologia

## Stack
- **Frontend**: HTML + CSS + Vanilla JS + GSAP animations (SPA, hash-based routing)
- **Backend**: PHP 8 + MySQL (PDO) on cPanel shared hosting
- **PWA**: Service worker, manifest, offline support

## Design System
- Dark luxury aesthetic (#0A0A0F background)
- Brand red: #D11039 (primary), #FF2D55 (accent)
- Fonts: Syne (headings) + DM Sans (body)
- Glassmorphism cards with subtle borders (rgba(255,255,255,0.07))
- GSAP page transitions and micro-interactions

## Project Structure
```
/                    → index.html (SPA shell)
/api/config/db.php   → DB connection, JWT, auth middleware, helpers
/api/                → PHP API endpoints
/assets/css/         → Stylesheets
/assets/js/          → JavaScript modules
/assets/img/         → Images and icons
/assets/fonts/       → Web fonts
/public/.htaccess    → SPA routing, HTTPS, caching
/sw.js               → Service worker
/manifest.json       → PWA manifest
/database.sql        → Full schema
```

## Modules (build order)
0. Base (structure + DB + shell) ✅
1. Auth (login screen) ✅
2. Members ✅
3. Payments ✅
4. Events ✅
5. Tickets + QR ✅
6. QR Scanner ✅
7. Admin Panel ✅
8. PWA Finalization ✅
9. Deploy Config ✅

## API Conventions
- All endpoints return `{ success: true/false, data/message }`
- Auth via Bearer JWT token in Authorization header
- Input via `getInput()` helper (handles JSON and form data)
- Use `respond()`, `respondError()`, `respondPaginated()` helpers
- CORS handled automatically by `setCorsHeaders()`

## JS Modules
- `SVC` — Core (router, api client, toast, modal, auth state)
- `SVCUtils` — Utilities (dates, currency, DOM helpers, animations, CSV export)
- `SVCAuth` — Auth (login/logout, session, role checks)
- `SVCMembers` — Members (list, search, detail, create, update)
- `SVCPayments` — Payments (history, submit, admin approve/reject)
- `SVCEvents` — Events (list, detail, countdown, ticket purchase)
- `SVCTickets` — Tickets (list, detail, QR generation)
- `SVCScanner` — Scanner (camera, QR validation, manual entry, scan log)
- `SVCAdmin` — Admin (dashboard, metrics, sparklines, CSV export)

## Credits
- Developed by @herasi.dev & Zivi Dynamics C.A

## Git Rules
- NEVER add Co-Authored-By or any trailer lines to commit messages
- Commit messages must only contain the user's requested message, nothing else

## Security Notes
- Toast and modal systems use DOM methods (textContent, createElement), not innerHTML
- JWT tokens stored in localStorage, verified server-side with hash in auth_tokens table
- All DB queries use PDO prepared statements
- API config directory blocked by .htaccess
