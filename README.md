# Alsoir Demo (AI-assisted unified inbox)

This contains everything you need to run the demo locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Start Ollama locally (default): `http://localhost:11434`
    - Pull the required embedding model:
       `ollama pull nomic-embed-text`
    - Optional env vars in `.env.local`:
       - `VITE_OLLAMA_BASE_URL` (default `http://localhost:11434`)
       - `VITE_OLLAMA_CHAT_MODEL` (default `gpt-oss:120b-cloud`)
3. Run the app:
   `npm run dev`
