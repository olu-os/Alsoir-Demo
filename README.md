<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Alsoir Demo (AI-assisted unified inbox)

This contains everything you need to run your app locally.

Local-first demo that uses Ollama for triage + reply drafting.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Start Ollama locally (default): `http://localhost:11434`
   - Optional env vars in `.env.local`:
     - `VITE_OLLAMA_BASE_URL` (default `http://localhost:11434`)
     - `VITE_OLLAMA_CHAT_MODEL` (default `qwen2.5:7b-instruct`)
3. Run the app:
   `npm run dev`
