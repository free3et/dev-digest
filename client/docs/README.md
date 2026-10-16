# client/docs

How the studio works today. Deep dives too long for `README.md`.

Good candidates: the TanStack Query cache/invalidation strategy, the app-shell
and `g`-then-key shortcut map, the `next-intl` message workflow, diff-rendering
internals, loading/error conventions for RSC boundaries.

Not here: the UI route map (that is `../README.md`), intent for unbuilt screens
(`../specs/`), rejected approaches (`../INSIGHTS.md`).

| File | What |
|------|------|
| [`eval-ui.md`](eval-ui.md) | eval screens: `/eval` dashboard and recent runs, agent Evals tab (regression banner, compare dialog), metric formats, shared dialog a11y hook, FindingCard "Turn into eval case" and its EvalCaseModal, local timestamps with UTC tooltip, uppercase captions, per-agent eval page, metric trend, sparklines, and the hooks/endpoints they use |
