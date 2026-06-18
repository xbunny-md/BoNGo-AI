# BoNGo AI - Repo 2
A complete WhatsApp AI Agent Bot named "BoNGo AI" driven by Groq API (llama-3.1-70b) and Gemini API as fallback.

## Setup
This agent connects using the `SESSION_ID` generated from Repo-1.
ZERO QR CODE, ZERO PAIR CODE, ZERO LOGIN LOGIC is included.

## Configuration
Copy `.env.example` to `.env` and fill in the required variables:
- `SESSION_ID`: Derived from Repo-1 starting with `SWIFTBOT~`
- `GROQ_API_KEY`: Groq API Key
- `GEMINI_API_KEY`: Gemini API Fallback Key
- `OWNER_NUMBER`: Your phone number (e.g., 254712345678)
- `BOT_NAME`: Preferred bot name (default: BoNGo AI)
- `PREFIX`: Command prefix (default: .)

## AI Execution Plan
The AI returns a structural JSON execution plan that dispatches WhatsApp API actions matching Baileys dynamically. No hardcoded commands exist.

## Deployment
This project is configured out-of-the-box for:
- Render
- Heroku
- Pterodactyl
- VPS
- Railway
- Fly.io
- Koyeb
