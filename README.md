# Alsoir Demo (AI-assisted unified inbox)

Live demo: https://alsoir.vercel.app

## Demo Options (start here)

### Option 1 — Demo Mode (no sign-in required)
This is the fastest way to try the product. You can explore the UI, filtering, and AI drafts using pre-seeded messages.

**Limitations:**
- You cannot send your own custom emails to test categorization and similarity features.
- Messages do not refresh or get categorized in real time.

### Option 2 — Full Gmail Test (using test inbox)
If you want to send your own emails to test the real-time categorization and similarity features, request delegate access to the test gmail account.

**Simplest request flow:**
1. Fill out the [Access Form](https://docs.google.com/forms/d/e/1FAIpQLScSgsIjFk-MQytDVqrqTZBN--pGqv9FlWHMUeohpVvsDGNH2g/viewform) and provide the email you want to use.
2. I will grant you access to alsoirtest@gmail.com within 24 hours.

**Sign in steps:**
1. Click “Sign in with Google.”
2. Sign in with the test email.
3. Accept the Gmail API permission prompts.

Once approved, you’ll see live inbox sync and auto-categorization.

## How the key features work

- **Find Similar:** Select a message and use “Find Similar” to locate other messages about the same issue, then reply in bulk.
- **Bulk Reply Mode:** After clicking Find Similar, choose the messages you want to send the current reply to (names will be auto-adjusted). 
   - In Settings, you can choose whether messages are Bulk drafted or automatically sent when you click the send button.
- **Generate with AI:** Drafts are generated from the selected message text + sender name, and the AI is guided by your policies, business name, and signature.
- **Filters:** Use category and urgency filters to narrow the inbox view.
- **AI Personality Option:**vYou can choose the tone and style of your AI-generated replies using the AI Personality setting (found in Settings and above the Generate with AI button).

## Tailor Generated Drafts

Go to **Settings → Identity** to set your **Business Name** and **Email Signature**. The AI uses these in generated replies.

If you add policies (returns, shipping, guarantees, etc.), the AI references them automatically to tailor responses to your business rules.

## Devs: Run Locally

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

## About the app

Alsoir is a human-centered organized inbox for small businesses that don’t want chatbots but do want efficiency and speed.

I designed it because managing customer messages across platforms is overwhelming, and most tools solve the problem with chatbots, which many users find impersonal or ineffective.

It solves that problem by organizing messages by topic, highlighting urgency, and letting users generate custom AI responses that can route customers to the right FAQ in one click.

Also, there's an AI Personality setting that lets you tailor responses to match your brand’s voice or just have fun with customer interactions.

With features like the bulk-reply mode and AI Draft Generation, users can save time responding to customer messages and spend more time building their businesses.

## Gmail API Reply Limitation

**Note:** Currently, messages cannot be replied to directly through the Gmail API to the recipient's actual email address in this demo. This is due to the sensitive nature of email sending permissions and the detailed information required to ensure secure, responsible handling of user data.

However, after the app is approved and authorized, this will be in development.