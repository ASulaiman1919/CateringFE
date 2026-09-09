# Degi Kitchen

Afghan catering website at https://degikitchen.com, deployed from this repository's
`main` branch to Netlify project `glittering-vacherin-c530d6`.

## Website Files

- `index.html`: page content, 28 menu entries, checkout markup, and the hidden Netlify form declaration.
- `styles.css`: existing modern Afghan green/white/charcoal/red design.
- `script.js`: navigation and menu category tabs.
- `order-model.mjs`: shared cart, choices, quantity totals, validation, and readable summaries.
- `order-planner.js` / `order-planner.css`: dish configurator, editable cart, details, review, and receipt.
- `customer-account.js`: verified registration, sign-in, recovery, profile, and request history.
- `order-document.mjs`: shared branded HTML email and downloadable/printable summary.
- `order-assistant.js` / `order-assistant.css`: order assistant interface.
- `assets/editorial/README.md`: food image sources, licenses, and generated-image disclosures.

## Ordering Rules

Servings are the default where appropriate. Catering dishes also support half/full
trays, without invented capacities. Kababs use servings only; platters use a size
(for 4, for 8, half, full) and platter count. Naan, bolani, and sambosa use pieces.
Bolani has four fillings and all combinations, with each mix a separate line item.
Baklava uses pieces or quarter-pound increments; Jalebi pounds or servings. Sauces
use servings or half-cup increments; Chutney Trio uses sets. Totals show each unit
separately. Guest count is optional, never inferred. Prices are personally quoted.

Rice & Meat allows Qabuli rice (carrots and raisins) or white rice, each with lamb,
beef, chicken, lamb shank, or no meat. This replaces the former Qabuli, Chicken Palaw,
and Lamb Shank Palaw entries. Seasoned Rice remains a distinct meat-free side.
Other supported dishes offer a rice accompaniment.
Different options and units remain separate cart entries; exact duplicates merge.

Customers review every item's options and quantity, date, time (Eastern), full delivery
address, and contact details before sending. Signed-in contacts are fixed from the
verified profile; a separate recipient can have their own name and phone. Guests
provide name, email, and phone without signing up. Submission is a request, not a
confirmed booking. No payment is collected. Carts persist only on the current device;
contact details and chat messages are not put in local storage. A receipt can be
downloaded as a styled, printable HTML document. Successful submission clears the
cart, all order details, and chat immediately. The thank-you screen offers a download
before returning home. Sent requests can be changed by contacting the kitchen.
Downloads use a direct attachment response, not a browser blob URL. The unguessable
request UUID authorizes a guest download for two hours via a same-origin POST body;
it is never put in a URL or email. Past-request downloads require the owning account.

## Notifications And Request Storage

`netlify/functions/order-request.mjs` validates the request again on the server.
When Resend is configured, it sends a single idempotent batch of two branded emails:
the kitchen notification (reply-to customer) and customer receipt (reply-to kitchen).
Do not enable this until the owner approves the free account/terms and the domain is
verified. Server-only environment variables: `RESEND_API_KEY`,
`ORDER_NOTIFICATION_EMAIL`, and optional `ORDER_EMAIL_FROM` (defaults to
`Degi Kitchen <order@degikitchen.com>`). Never expose these in client bundles.

Until configured, numbered items and labeled details go to Netlify Forms (`degi-order-request`).
The existing all-forms email notification targets the owner's personal Gmail; that
recipient is not embedded in public HTML. The `email` field supplies the customer
reply-to address. A unique subject/reference separates requests in the inbox.
The public `order@degikitchen.com` email still forwards to the owner's Gmail.

Netlify Blobs (`degi-orders`) stores the kitchen's full business request records,
idempotency fingerprints, and verified customers' request histories. Timeouts retain
the send lock because acceptance may already have
happened; the UI asks the customer to contact the kitchen instead of silently sending
duplicates. Notification failures never clear the cart. Netlify Forms retains the
kitchen's business copy on the fallback path. Resend batches bypass the basic Forms
notification to avoid duplicates. The success screen only promises an emailed copy
when the email service has accepted both messages, not merely on form submission.

## Customer Accounts

Netlify Identity is enabled with open registration and required email confirmation.
The current `@netlify/identity` SDK handles authentication, sessions, verification,
and password recovery. Guest ordering remains available. Account history includes
only requests made while signed in, not old submissions matched by an unverified email.

`netlify/functions/customer-account.mjs` derives ownership from the verified session,
never from a client-supplied ID. History responses are private/no-store. Customers can
open a profile dropdown, edit name/phone/photo (not email), reorder with a new date,
change their password, and delete their account/history/photo. Profile photos are
decoded, center-cropped to 512px WebP, and stripped of source metadata in the browser.
The bounded `/api/customer-avatar` endpoint stores/serves only the verified user's
photo, with private/no-store headers. Deletion does not remove business request records;
this is disclosed in the account screen. Passwords are managed by Identity and never
stored in application records.

## Address Suggestions

`/api/address-suggestions` proxies bounded, debounced searches to Photon using
OpenStreetMap data, with attribution. Only complete Virginia/DC/Maryland addresses
are returned. The public provider has no availability guarantee; full manual entry
always works. Suggestions are not proof of deliverability or service availability.
Queries are not logged by this application. Review provider limits before scaling.

## Order Assistant

The server function uses GPT-4.1 mini via Netlify AI Gateway with server-only
credentials. It uses hosting credits; no paid plan or automatic recharge is enabled
by this code. Model alias: `gpt-4.1-mini`.

The build extracts the published menu for the assistant. It proposes only catalog
dishes and approved choices. Suggested items open the same configurator as the menu;
the visitor must explicitly add them. Structured date/time/guest/city suggestions
fill only empty fields. Chat transcripts are not copied into order notes. Prices,
availability, allergens, tray capacity, and final arrangements require kitchen confirmation.

Chat stays in browser memory and is processed by OpenAI via Netlify, as disclosed in
the widget. Visitor messages are not logged by this application; provider policies
still apply. AI requests are bounded by input/output limits and 10 requests per minute
per IP/domain. Order submission allows 5 per minute; account endpoints allow 20.
These are not a global credit-spending cap. An AI outage does not block the normal cart.

## Development And Publishing

Use Node 22 or later. Run `npm install`, `npm test`, and `npm run dev`.
The local preview is http://127.0.0.1:5173. `npm start` serves the last built `dist/`.
The static preview supports cart/review UI; authentication, notifications, and stored
history require the deployed Netlify runtime. Opening the source HTML directly is
not sufficient because the account and planner modules are bundled during the build.
For local UI integration checks, `node tests/preview-server.mjs` serves the built
site with fixture accounts and emails on port 5173. It must never be deployed. No
email is sent; `/__test/receipt` shows the last fixture receipt for visual inspection.

`npm test` builds the site and exercises cart variants/merging, input validation,
quantity summaries, notification idempotency, concurrent requests, account ownership,
deletion safeguards, assistant output validation, and the public build allowlist.

Push reviewed changes to `main` for automatic deployment. `netlify.toml` publishes
only `dist/` and deploys the server functions separately. Never upload the entire
working directory: it may contain private outputs, tests, or working files.

When changing menu names, update `choicesFor` if necessary and run the tests; the
build regenerates `netlify/data/menu.json`. Phone/email links also appear in the
planner and assistant, so search the whole source when changing them. Use only
appropriately licensed photos and preserve image disclosures.
