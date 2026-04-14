# L'Oréal Smart Routine & Product Advisor

An AI-powered beauty advisor that lets users browse L'Oréal brand products, build a personalized selection, and generate a custom skincare or beauty routine via an AI chat interface.

## Features

- **Product catalog** — 35 products across 10 categories (Cleansers, Moisturizers, Skincare, Haircare, Makeup, Hair Color, Hair Styling, Men's Grooming, Suncare, Fragrance)
- **Category pills + live search** — filter products by category or search by name/brand in real time
- **Selection panel** — add/remove products with one click; selections persist across page reloads via `localStorage`
- **Skin type selector** — choose Normal, Oily, Dry, Combination, or Sensitive to tailor the generated routine
- **AI routine generator** — sends selected products and skin type to a Cloudflare Worker backed by Claude; formats the response with Markdown (headers, bullets, bold)
- **Follow-up chat** — ask the AI follow-up questions about ingredients, layering order, or tips
- **Copy to clipboard** — copy the generated routine with a single click
- **Toast notifications** — instant feedback when products are added, removed, or cleared

## Project Structure

```
09-prj-loreal-routine-builder/
├── index.html        # App shell and markup
├── script.js         # All app logic (state, events, API calls)
├── style.css         # Styles and responsive layout
├── products.json     # Product catalog (35 products)
├── secrets.js        # Cloudflare Worker URL (not committed)
└── img/              # L'Oréal logo
```

## Setup

1. **Clone the repo** and open the project folder.
2. Create a `secrets.js` file in the project root to point to your Cloudflare Worker:

   ```js
   window.CLOUDFLARE_WORKER_URL = "https://your-worker.workers.dev/";
   ```

3. Open `index.html` in a browser (or serve locally with any static server).

   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```

> If `secrets.js` is missing the app falls back to the default Worker URL defined in `script.js`.

## How It Works

1. On load, `products.json` is fetched and parsed into an in-memory array.
2. Saved product IDs are restored from `localStorage`.
3. When the user clicks **Generate My Routine**, the selected products (full JSON) and skin type are sent as a structured prompt to the Cloudflare Worker, which forwards the request to the AI model.
4. The AI response (Markdown) is rendered into HTML and displayed in the chat window.
5. Subsequent messages in the chat form are appended to the conversation history so the AI retains context.

## API / Worker

The app posts to a Cloudflare Worker with the following JSON body:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user",   "content": "..." }
  ]
}
```

The worker is expected to return a JSON object with one of: `reply`, `response`, `output_text`, or a standard OpenAI-style `choices[0].message.content` field.

## Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| > 700 px | 3-column product grid |
| 440 – 700 px | 2-column product grid, horizontal pill scroll |
| < 440 px | 1-column product grid |

## Technologies

- Vanilla HTML, CSS, JavaScript (no build tools or frameworks)
- [Montserrat](https://fonts.google.com/specimen/Montserrat) via Google Fonts
- [Font Awesome 6](https://fontawesome.com/) for icons
- Cloudflare Workers for the AI proxy
