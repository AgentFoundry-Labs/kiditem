---
status: superseded by ADR-0025
---

# Window-sharing collections start through the extension, with no queue

> **Superseded by [ADR-0025](0025-operations-are-one-contract.md).** The
> extension start contract this decision governed (`startCollection` and the
> window-sharing producers — ad campaign sweep, manual report, ad keyword, ad
> profitability) was deleted with the old advertising collection path
> (KID-373, wave6). Under ADR-0025 every collection is one operation, and the
> server refuses an overlapping start through lock keys such as
> `resource:ad-center:<channelAccountId>` (`OPERATION_IN_PROGRESS`) — the
> server-side exclusion rejected below is now the contract because the
> operation row records what the browser window used to hold. Retained for
> decision history.

Coupang collections that share one collection window per browser environment (ad campaign sweep and manual report, ad keyword, ad profitability, Wing traffic, Wing itemwinner) start only through the extension's start contract: the extension takes the window turn and opens the attempt with the source owner when the window is free, and otherwise refuses at once, naming the collection that holds the window. Screens never open these attempts themselves, and no start waits for the window, because a waiting start expired unseen behind a long sweep and a start refused after its attempt opened left operators with only "the extension did not respond". Source owners still decide same-source duplicates, and attempts record no browser environment.

## Considered Options

- **Server-side exclusion across sources:** attempts would have to record producers and browser environments, and the server would guard a resource that exists only inside one browser.
- **A queue in the extension:** a 44-minute campaign sweep outlived the 30-minute leases of the starts waiting behind it, so queued starts expired without ever running.
