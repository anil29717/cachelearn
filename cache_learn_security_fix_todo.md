# 🔐 CacheLearn Security Fix TODO

Based on SAST + AquilaX reports

---

# 🔴 CRITICAL / HIGH (Fix Immediately)

## 1. SQL Injection
- **File:** `libraryRoutes.js`
- **Issue:** Raw SQL with user input

### Fix:
```js
const placeholders = idList.map(() => '?').join(',');
await query(`SELECT * FROM table WHERE id IN (${placeholders})`, idList);
```

---

## 2. Hardcoded Secrets
- **File:** `docker-compose.yml`

### Fix:
- Move to `.env`
```env
DB_PASSWORD=strong_password
JWT_SECRET=super_secure_key
```

---

## 3. HTTP Instead of HTTPS
- **File:** `index.js`

### Fix:
- Use HTTPS or Nginx reverse proxy

---

## 4. CSRF Protection Missing

### Fix:
```js
cookie: { sameSite: 'strict' }
```
OR
```bash
npm install csurf
```

---

## 5. XSS Vulnerability

### Fix:
```js
DOMPurify.sanitize(input)
```

---

## 6. Path Traversal

### Fix:
```js
const safePath = path.normalize(input);
if (!safePath.startsWith(storageRoot)) throw Error("Invalid path");
```

---

## 7. Prototype Pollution

### Fix:
```js
delete req.body.__proto__;
```

---

## 8. Vulnerable Dependencies

### Fix:
```bash
npm audit fix
npm update
```

---

# 🟠 HIGH / MEDIUM

## 9. No Rate Limiting

### Fix:
```js
import rateLimit from "express-rate-limit";

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

---

## 10. File Upload Abuse

### Fix:
```js
limits: { fileSize: 10 * 1024 * 1024 }
```

---

## 11. Open Redirect

### Fix:
- Allow only trusted URLs

---

## 12. Cookie Security

### Fix:
```js
res.cookie("token", value, {
  httpOnly: true,
  secure: true,
  sameSite: "strict"
});
```

---

## 13. JWT / Crypto Issues

### Fix:
```js
jwt.verify(token, secret, { algorithms: ['HS256'] })
```

---

## 14. Timing Attack

### Fix:
```js
crypto.timingSafeEqual()
```

---

# 🟡 MEDIUM / LOW

## 15. Uncaught Exceptions

### Fix:
```js
app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal error" });
});
```

---

## 16. Memory / Resource Cleanup

### Fix:
```js
await fs.promises.unlink()
```

---

## 17. ReDoS
- Fix unsafe regex

---

## 18. Cache Sensitive Data

### Fix:
```http
Cache-Control: no-store
```

---

## 19. Docker Security

### Fix:
```yaml
cap_drop:
  - ALL
```

```yaml
127.0.0.1:8080:8080
```

---

# 🚀 PRIORITY PLAN

## Phase 1 (Immediate)
- SQL Injection
- Secrets
- HTTPS
- Dependencies
- CSRF + XSS

## Phase 2
- Rate limiting
- File validation
- Path security
- Cookies

## Phase 3
- Cleanup
- Docker hardening

---

# ✅ Notes
- Total Issues: 40+ (SAST) + 97 (AquilaX)
- Focus on HIGH first

---

**End of Document**

