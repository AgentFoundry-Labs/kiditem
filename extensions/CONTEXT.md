# Browser extension

The KidItem Chrome extension. It captures and transports marketplace data for
server-issued collection attempts; the server's source owners own every
canonical fact.

## Language

### Collections

**Operation client**:
The one extension component that opens a server operation, sends its chunks
and progress under the server-issued token, and reports its finish. A kind's
collector only produces chunks; it never talks to the server about the
operation itself. Any rejection of a fenced write stops the collection and
releases the browser resources it held.
_Avoid_: source owner, attempt transport, owner client

**Collection session**:
The extension's record that one server-issued attempt is being collected in one
browser environment. A session whose attempt has already ended is a leftover,
and the next collection clears it.
_Avoid_: run, job, owner session

**Attention**:
A collection session paused for the operator while its attempt is still
running, such as when a marketplace login is required. Once the server has ended
the attempt there is nothing left to attend to.
_Avoid_: awaiting confirmation, 확인 대기, stuck session

**Catalog import**:
One store account's Wing catalog collection, basics then details, run as the
operation kinds `channels.wing_catalog_*` (KID-354). It reads Wing through the browser's single Wing
login, so an environment runs one import at a time: a start for another account
is refused before any attempt opens, naming the account whose import runs.
_Avoid_: catalog sync, product sync
