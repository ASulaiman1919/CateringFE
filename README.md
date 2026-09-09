# Degi Kitchen

Afghan catering website at https://degikitchen.com, deployed from this repository's
`main` branch to Netlify project `glittering-vacherin-c530d6`.

## Website Files

- `index.html`: page content, all 30 dishes, checkout markup, and the hidden Netlify form declaration.
- `styles.css`: existing modern Afghan green/white/charcoal/red design.
- `script.js`: navigation and menu category tabs.
- `order-model.mjs`: shared cart, choices, quantity totals, validation, and readable summaries.
- `order-planner.js` / `order-planner.css`: dish configurator, editable cart, details, review, and receipt.
- `customer-account.js`: verified registration, sign-in, recovery, profile, and request history.
- `order-assistant.js` / `order-assistant.css`: order assistant interface.
- `assets/editorial/README.md`: food image sources, licenses, and generated-image disclosures.

## Ordering Rules

Servings are the default. Half trays and full trays are available without invented
serving-capacity conversions. Totals show each unit separately. Guest count is a
separate field, never inferred from dish quantities. All prices are personally quoted.

Rice & Meat allows Qabuli rice (carrots and raisins) or white rice, each with lamb,
beef, chicken, or no meat. Other supported dishes offer a rice accompaniment.
Different options and units remain separate cart entries; exact duplicates merge.

Customers review every item's options and quantity, date, time (Eastern), location,
guest count, and contact details before sending. Submission is a request, not a
confirmed booking. No payment is collected. Carts persist only on the current device;
contact details and chat messages are not put in local storage. A receipt can be
downloaded, and sent requests can be changed by contacting the kitchen with their reference.

## Notifications And Request Storage

`netlify/functions/order-request.mjs` validates the request again on the server and
submits numbered items and labeled details to Netlify Forms (`degi-order-request`).
The existing all-forms email notification targets the owner's personal Gmail; that
recipient is not embedded in public HTML. The `email` field supplies the customer
reply-to address. A unique subject/reference separates requests in the inbox.
The public `order@degikitchen.com` email still forwards to the owner's Gmail.

Netlify Blobs (`degi-orders`) stores idempotency fingerprints and verified customers'
request histories. Timeouts retain the send lock because acceptance may already have
happened; the UI asks the customer to contact the kitchen instead of silently sending
duplicates. Notification failures never clear the cart. Netlify Forms retains the
kitchen's business copy, including guest submissions.

## Customer Accounts

Netlify Identity is enabled with open registration and required email confirmation.
The current `@netlify/identity` SDK handles authentication, sessions, verification,
and password recovery. Guest ordering remains available. Account history includes
only requests made while signed in, not old submissions matched by an unverified email.

`netlify/functions/customer-account.mjs` derives ownership from the verified session,
never from a client-supplied ID. History responses are private/no-store. Customers can
save contact details, reorder with a new date, change their password, and delete
their account/history. Deletion does not remove the kitchen's retained request records;
this is disclosed in the account screen. Passwords are managed by Identity and never
stored in application records.

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
