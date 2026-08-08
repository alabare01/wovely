// What actually counts against a pattern cap.
//
// WHY THIS FILE EXISTS
// The free cap was enforced against `userPatterns.length` — the raw array.
// That array carries soft-deleted rows (delete sets status='deleted' in place;
// the row only disappears on the next full reload, because the fetch filters
// `status=neq.deleted`) and it always carries parked rows, which are never
// filtered out at all. So a free user who added five patterns and parked or
// deleted three still read as 5 of 5 and hit the paywall with two slots they
// had genuinely freed. That blocks real usage AND poisons every conversion
// number, because the paywall fires on users who never reached the cap.
//
// Three separate places already agreed on what "active" means and each spelled
// it out inline: SidebarNav's slot counter, App's inProgress filter, and
// Dashboard's visible filter. The gate was the one place that didn't. This is
// now the single definition all of them import.

// A pattern occupies a slot unless it has been deleted or parked. Parked is a
// deliberate "put this away" gesture — it returns the slot, otherwise parking
// would be strictly worse for the user than deleting.
export const isActivePattern = (p) =>
  !!p && p.status !== 'deleted' && p.status !== 'parked';

// Starters (DEFAULT_STARTERS / is_starter rows) are on the house and never
// count — Dashboard's at-cap banner promises exactly that, so the gate has to
// honour it. Collection parts DO count: they are real rows in the user's
// library and Craft's 100-pattern ceiling is what covers them.
export const countActivePatterns = (patterns = []) =>
  patterns.filter((p) => isActivePattern(p) && !p.isStarter).length;
