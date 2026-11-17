# UsTwo — private two-person chat PWA

Phone-first custom PWA starter with:
- installable dark-mode web app
- private room invite links
- AES-256-GCM message encryption in the browser (PBKDF2-derived room key)
- real-time text messages
- encrypted photo/video/voice-message relay while both people are online
- WebRTC voice/video calling prototype

## Important limitations in this first build

1. **No deployed public link yet.** A shareable link requires deploying this project to an account you control. I cannot publish it to your account without your authorization.
2. **Live-only delivery:** the relay does not save messages or media. Both phones must be online at the same time. There is no offline message queue or push notification service yet.
3. **Media limit:** individual files are limited to 12 MB in this starter. Video is sent in encrypted chunks and can be slow on mobile networks.
4. **Calls are a prototype:** WebRTC uses a public STUN server only. Some mobile networks, carrier NATs, firewalls, or China-side networks may require a TURN relay. TURN service may cost money. Test from both countries before relying on calls.
5. **Security review needed:** this is a starter, not an audited messenger. The room invite is a bearer secret: anyone with it can join. There is no verified identity, key-change warning, account recovery, or independent security audit. Do not use it for highly sensitive information.
6. **China reachability is not guaranteed:** test the deployed domain from her actual network. Some providers and services may be inaccessible or unreliable there.

## Deploy free (Cloudflare)

You need a Cloudflare account. Free plan availability and quotas can change.

On a laptop/desktop:
1. Install Node.js and Wrangler: `npm install -g wrangler`
2. In this project folder run `wrangler login`
3. Run `wrangler deploy`
4. Wrangler will print your `*.workers.dev` URL. Open it on your phone.
5. On your phone, use browser menu → **Add to Home screen** / **Install app**.
6. On your phone create a room and share the invite link privately with your girlfriend. She opens it on her phone and chooses Join.

Phone-only note: you can keep/edit the project in Acode and use Termux with Node.js + Wrangler if the package installs on your device. Deployment from a phone can be awkward; a GitHub-connected Cloudflare deployment is another option.

## Local preview

The app uses a Cloudflare Worker and Durable Objects, so opening `index.html` directly from Acode will not connect. Deploy with Wrangler, or run the Cloudflare local dev environment:
`npm install -g wrangler`
`wrangler dev`

## Security model

- The invite URL contains `room` and `key` after `#`. URL fragments are not sent in HTTP requests.
- The browser derives an AES-256-GCM key from the secret using PBKDF2-SHA-256 (250,000 iterations) and a room-specific salt.
- Message and file payloads are encrypted before they reach the Worker.
- The Worker only relays opaque ciphertext and does not persist it.
- WebRTC media uses browser-managed DTLS-SRTP encryption. Signaling metadata passes through the Worker.
- This does not yet provide forward secrecy, authenticated identity, or protection if either phone is compromised.

## Next production steps

- Add authenticated device pairing and a QR-code verification / safety-number flow.
- Add forward-secret session encryption using a reviewed protocol (e.g. Signal Protocol via a maintained implementation).
- Add encrypted object storage and offline delivery with key separation.
- Add TURN infrastructure for reliable calls across restrictive networks.
- Add push notifications, rate limits, abuse controls, and automated tests.
