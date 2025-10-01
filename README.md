# Secure Vault Web Application

This project is a lightweight credential vault built with Node.js and Vue 3. It stores website credentials, SSH keys, credit card data, and miscellaneous secrets locally in an encrypted-like JSON file (unencrypted for demo). The backend exposes a JSON API and serves the Vue single-page application from the same server.

## Features

- 🗂️ Categorise secrets as credentials, SSH keys, credit cards, or misc items.
- 📝 Capture relevant fields for each secret type (e.g., passwords, key material, card details, notes).
- 🔍 Filter and search secrets by type or keyword.
- ✏️ Edit or delete existing secrets with inline feedback.
- 💾 Data persisted to `data/vault.json` on the server.

## Getting Started

> **Prerequisites:** Node.js 18+ (the app uses `fetch` on the server and other modern APIs).

1. Install dependencies (none beyond Node.js standard library).
2. Start the server:

   ```bash
   node server/server.js
   ```

3. Open the application in your browser at [http://localhost:3000](http://localhost:3000).

Secrets are stored in `data/vault.json`. You can back up this file or remove it to reset the vault. **Do not use this project to store real production secrets without adding proper encryption and authentication.**

## API Overview

All endpoints return JSON and live under `/api/secrets`.

- `GET /api/secrets` — List all secrets.
- `POST /api/secrets` — Create a new secret. Body shape:

  ```json
  {
    "type": "credential",
    "name": "Example",
    "details": {
      "site": "https://example.com",
      "username": "alice",
      "password": "hunter2"
    }
  }
  ```

- `PUT /api/secrets/:id` — Update an existing secret (partial updates supported).
- `DELETE /api/secrets/:id` — Remove a secret.

Each secret response contains metadata fields `id`, `createdAt`, and `updatedAt`.

## Security Notes

This demo omits encryption, authentication, rate limiting, and audit logging. Before using it for real secrets, you should:

- Introduce user authentication and authorization.
- Encrypt the persisted vault data and sensitive fields at rest.
- Enforce HTTPS, strong CORS policies, and CSRF protections.
- Add automated backups and rotation policies for key material.

## Development Tips

- The frontend consumes the API directly via `fetch`. If you modify API routes, update `frontend/main.js` accordingly.
- Styling lives in `frontend/style.css`; adjust colors and spacing there.
- Delete `data/vault.json` to reset the local vault state.
