---
name: require-tests-before-stop
enabled: true
event: stop
pattern: .*
action: warn
---

**Before finishing: did you run tests?**

- [ ] `npm test` (440+ Jest tests) passed?
- [ ] No exposed internal OpenClaw paths in API responses?
- [ ] Security middleware (auth, rate limiting) intact?

If tests were already run and passed, proceed. Otherwise, run them first.
