# Nebula Play Landing Page

Responsive landing page implementation for the provided UI engineering task. The site includes the landing page plus Features, Pricing, About, and Contact pages to show how the design system extends beyond the first screen.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Pages

- `/` or `/index.html` - landing page
- `/features.html` - product/features page
- `/pricing.html` - pricing page
- `/about.html` - about page
- `/contact.html` - contact page

Clean routes such as `/features`, `/pricing`, `/about`, and `/contact` are also supported by the local server.

## Responsive Coverage

The CSS includes desktop, tablet, and mobile layout rules:

- Desktop: split hero composition, three-column metrics and feature cards
- Tablet: stacked hero media, one-column pricing/features where needed
- Mobile: compact navigation menu, single-column content, full-width CTAs, reduced device visuals

## Deployment

This project uses a zero-dependency Node static server.

For Render, Railway, Fly.io, or any Node host:

```bash
npm start
```

For Vercel, configure the project as a Node app using `npm start` as the start command, or adapt the `public` folder to a static deployment target.

## Notes

The Figma file was not accessible from this environment, so the implementation follows the brief's visible product cues, especially the Web3/game-oriented navigation hint around Store, Games, and Connect Wallet. Those items were intentionally removed and replaced with Features, Pricing, About, and Contact.
