---
status: accepted
---

# Mall registrations submit all the way

Sabangnet registered a product to every mall in one send, while KidItem only filled each mall's form and
left the save to a person, so bulk registration never finished. The owner chose on 2026-09-20 that the
extension also presses each mall's own register button after filling the form, the way it already finishes
sold-out sends, and a registration counts as done only when a re-read of that mall finds the new product.

## Considered options

- **Keep the human save.** Seventeen malls × N products of manual saves is the reason bulk registration
  never finished.
- **A person confirms each mall's first registration, the extension does the rest.** The owner chose not
  to.

## Consequences

This narrows the extension and channels guides' "registrations are never submitted" rule. The extension
presses only for a mall whose register button and result screen were verified (`submit` in its form spec)
and only when the fill left no warnings or manual steps; otherwise the form stays open for a person.
Pressed (`submitted`), accepted by the mall, and published (found by a re-read) remain separate facts, and
an approval-bound mall is not published until it approves. Irreversible states such as deletion or a
sale ban are still never pressed. A registration that submits all the way runs through the Channels
execution fence ([ADR-0014](0014-channels-owns-the-registration-execution-fence.md)), from the mall wizard
or a registration-target execution; the quick register on the product list only fills the form and
never presses (KID-322).
