---
status: accepted
---

# Owners expose business capabilities

Mandatory reader modules couple callers to storage layout without defining a business boundary, so owners expose cohesive application capabilities while retaining canonical mutation authority, organization scope, evidence completeness, and required transaction consistency. Cross-owner references use scalar IDs validated through owner contracts, including organization, user, and collection-attempt identities when they cross an owner boundary; same-owner constraints remain. Channels implements reads and writes through input adapters, application input ports and services, output ports, and output adapters to isolate persistence and provider IO; backend code may use NestJS directly so framework independence does not require forwarding layers or manual constructor factories.

## Consequences

Backend services and internal ledger helpers may use NestJS injection, logging
and exceptions while preserving the registered error-response contract
(ADR-0023). This removes the earlier framework exclusion, including ADR-0009's
NestJS DI restriction; it does not move transaction or lock ownership. Retained
ledger helpers still query the caller's transaction and verify its lock evidence.
Shared web/extension contracts remain framework-neutral, and ordinary calculation
functions need no provider wrapper.

This replaces the dedicated-reader and fixed-reader-path requirements of
[ADR-0009](0009-one-ledger-one-reader.md) and the retained-single-reader
requirement of [ADR-0015](0015-inventory-reads-use-a-transaction-port.md).
Their evidence, organization, lock, and transaction rules remain. Products'
existing direct read-port binding is not a template for new Channels work;
its implementation is outside this Channels migration.

Owner persistence adapters may query their canonical ledgers without
registering each query file. Transitional owner `read/` helpers remain valid
internal implementations. Other owners consume public capabilities, and
existing direct consumers remain explicit migration exceptions. The ledger
guard continues to restrict mutations to declared owner publication paths;
permission to read does not grant permission to publish.

The automatic platform-target exceptions in
[ADR-0013](0013-cross-owner-references-are-ids-not-foreign-keys.md) no longer
apply to Channels-related cross-owner references. Existing relations are
enumerated migration exceptions until their callers use owner contracts;
unrelated domains keep their current migration policy. Removal preserves IDs,
history, indexes, and intra-owner organization constraints. Owner contracts
validate existence, organization, lifecycle, and required versions, including
concurrent changes; missing evidence is not zero, and removing a foreign key
does not authorize cross-owner cascade deletion.

Each migrated capability contracts its obsolete paths after public-contract
and PostgreSQL regression checks. This decision does not declare the remaining
Channels schema, account writers, or provider paths already migrated.
