# Window-sharing collections start through the extension, with no queue

Coupang collections that share one collection window per browser environment (ad campaign sweep and manual report, ad keyword, ad profitability, Wing traffic, Wing itemwinner) start only through the extension's start contract: the extension takes the window turn and opens the attempt with the source owner when the window is free, and otherwise refuses at once, naming the collection that holds the window. Screens never open these attempts themselves, and no start waits for the window, because a waiting start expired unseen behind a long sweep and a start refused after its attempt opened left operators with only "the extension did not respond". Source owners still decide same-source duplicates, and attempts record no browser environment.

## Considered Options

- **Server-side exclusion across sources:** attempts would have to record producers and browser environments, and the server would guard a resource that exists only inside one browser.
- **A queue in the extension:** a 44-minute campaign sweep outlived the 30-minute leases of the starts waiting behind it, so queued starts expired without ever running.
