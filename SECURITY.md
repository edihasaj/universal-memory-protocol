# Security Policy

## Reporting

Report vulnerabilities privately to **edihasaj@gmail.com**. Do not open public
issues for security reports. Expect an acknowledgement within a few days.

## Threat model notes

AMP treats stored memory as **attacker-controllable input**. Implementers must
follow the injection-resistant rehydration requirements (SPEC Section 5.3):
recalled records are verified, filtered by scope and consent, and structurally
framed as untrusted data; instructions found inside a memory body are never
executed with operator authority.

Integrity and identity rely on Ed25519 signatures over RFC 8785 canonical
records, keyed to the operator's DID (not the model vendor). Capability tokens
(SPEC Section 5.2) are least-privilege grants signed by the owner; treat token
leakage as you would any bearer credential.
