---
name: warn-auth-bypass
enabled: true
event: file
pattern: (requireAuth|isAuthenticated|checkAuth).*=.*false|\.use\(auth.*skip|bypass
action: warn
---

**Warning: possible authentication bypass detected**

This monitoring dashboard exposes sensitive agent data. Never disable auth middleware, even for development. Use test credentials instead.
