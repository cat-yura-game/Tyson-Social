# Tyson E2EE messaging (MVP)

Tyson private messages use libsodium sealed boxes (`crypto_box_seal`). The browser creates one Curve25519 device key pair. The public key and device metadata are registered with the Worker; the private key is stored in IndexedDB and is never sent to Tyson.

For every logical message, the sender encrypts a separate envelope for each recipient device and for the sender's current device. D1 stores only ciphertext envelopes and routing metadata. The Worker validates conversation membership and device ownership but cannot decrypt message bodies. Public posts and comments may be moderated; private message plaintext is unavailable to server-side AI.

## Threat model

This MVP protects message contents from database leaks, Cloudflare/D1 operators, Worker logs, backups, and passive network observers. TLS also protects public-key delivery in transit.

The MVP uses trust on first use (TOFU). It does not yet provide safety-number verification, a Signal-style double ratchet, forward secrecy, or protection from a malicious server substituting a public key on first contact. Those properties require a later audited protocol upgrade (for example, Signal Protocol or MLS), not incremental custom cryptography.

## Device changes and recovery

Opening Messages on a new browser creates a new device key. New messages are encrypted to every registered active recipient device. Existing ciphertext encrypted for an old device cannot be recovered on a new device because Tyson never receives private keys. Clearing browser storage has the same consequence.

The production follow-up must add device listing/revocation, encrypted key backup protected by a user-controlled recovery secret, key-change warnings, and verified fingerprints before claiming Signal-equivalent security.
