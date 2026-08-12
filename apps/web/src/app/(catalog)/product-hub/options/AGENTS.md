# product-hub/options — Read-Only Sellpia Inventory

`/product-hub/options` owns the complete Sellpia inventory table. Search,
stock, active, link, refresh, and page state are URL-authoritative and
independent from product operations.

Render provider identity, stock, price, active state, provenance, and confirmed
destinations as read-only facts. Destinations come only from organization-fenced
direct option-component relations; unlinked rows remain visible. This route
does not mutate stock, price, active state, product identity, or component
quantity and does not call the Product master list to reconstruct Inventory.
Inventory work links to the inventory hub; recipe work links to matching.
