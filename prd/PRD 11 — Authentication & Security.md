---
title: "PRD 11 — Authentication & Security"
project: 1111 School
prd_number: 11
prd_count: 11
phase: Production
depends_on:
  - PRD 1 (Backend Foundation)
integrates_after: PRD 5 (API Integration & Frontend Migration)
agents: None
status: Draft
size: Large (cross-cutting, touches all endpoints)
created: 2025-02-24
---

# PRD 11 — Authentication & Security

## Overview

PRD 11 transforms 1111 School from a single-user development system into a production-ready multi-user platform with proper authentication, authorization, data isolation, and security hardening. During PRDs 1-10, the system operates with a stubbed user; this PRD wraps authentication and security around every existing endpoint, adds user registration and login flows, enforces data isolation between users, encrypts sensitive data at rest, manages LLM API keys server-side, and provides data privacy controls including account deletion.

This is the final PRD in the 11-PRD decomposition. It is intentionally last because it is cross-cutting: it touches every router, every database query, and every frontend API call. Developing it in parallel with PRD 1 (shared User entity) and integrating after PRD 5 (when all endpoints exist) minimizes rework.

## Goals

1. **Secure multi-user authentication** -- Users register with email/password, log in, maintain persistent sessions, and log out. Optional Google OAuth provides a frictionless alternative.
2. **Complete data isolation** -- User A cannot read, modify, or infer the existence of User B's courses, profiles, activities, assessments, agent logs, or uploads. Every database query is scoped to the authenticated user.
3. **Defense in depth** -- No single security control is sufficient alone. Layered protections: secure session tokens, CSRF protection, rate limiting, input validation, output encoding, encrypted storage, and secure headers.
4. **Data privacy and user control** -- Users can delete their account and all associated data. Minimal audit retention only where legally required.
5. **Server-side secret management** -- LLM API keys are never exposed to the client. Per-user usage tracking prevents abuse.
6. **Agent log hygiene** -- Stored agent logs are scrubbed of access tokens, passwords, and optionally PII before persistence.

## Non-Goals

- Social login providers beyond Google (Apple, GitHub, etc.) -- future consideration
- Role-based access control (admin vs. user) -- all users are equal in v1
- Two-factor authentication (2FA/MFA) -- future enhancement
- SSO / SAML / enterprise identity federation
- Compliance certifications (SOC 2, HIPAA) -- design with them in mind but do not pursue certification
- Real-time session revocation across devices (logout invalidates current session only)
- API key self-service (users do not bring their own LLM keys in production)

## Scope

### Authentication

- Email/password registration with validation (email format, password strength)
- Email/password login returning a secure session
- Optional Google OAuth 2.0 flow (authorization code grant)
- Session management using httpOnly, Secure, SameSite=Lax cookies containing a signed session token (not raw JWT in localStorage)
- Session persistence across browser restarts (cookie expiry aligned with session TTL)
- Logout endpoint that invalidates the server-side session
- Password reset flow (email-based token, not in v1 MVP -- stubbed endpoint returning 501)

### User Management

- User entity (already defined in PRD 1): id, email, hashed_password, display_name, created_at, updated_at, oauth_provider, oauth_subject
- All existing entities gain enforced `user_id` foreign key: CourseInstance, LearnerProfile, Activity, Assessment, Badge, AgentLog
- Every database query in every router is scoped by `WHERE user_id = :current_user_id`
- Multi-user data isolation verified at the query layer, not just the API layer

### Security

- Encrypt sensitive fields at rest using application-level encryption (AES-256-GCM via `cryptography` library): LearnerProfile preferences, activity submissions, assessment responses
- Image uploads served via secure object storage (S3-compatible) with time-limited signed URLs (15-minute expiry)
- No raw authentication tokens, session IDs, or API keys stored in localStorage or sessionStorage
- CSRF protection via double-submit cookie pattern (SameSite=Lax + CSRF token header)
- Rate limiting per user per endpoint category (auth endpoints: stricter; content endpoints: standard)
- Security headers: Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Content-Security-Policy

### Agent Log Redaction

- Pre-persistence scrubbing of agent log content: remove access tokens, API keys, passwords, bearer tokens
- Regex-based pattern matching for common secret formats
- Optional PII masking (email addresses, names) configurable per deployment policy
- Raw unscrubbed logs never persisted; redaction happens before database write

### Data Privacy

- `DELETE /api/auth/account` endpoint: cascading deletion of all user data (profile, courses, lessons, activities, assessments, badges, agent logs, uploaded files)
- Confirmation required (request body must include `{"confirm": "DELETE_MY_DATA"}`)
- Uploaded files removed from object storage
- Minimal audit log retained only if legally mandated (tombstone record: user_id, deletion_timestamp, no PII)

### API Key Management

- LLM API keys (Gemini, OpenAI, etc.) stored server-side in environment variables or a secrets manager
- No client-side API key configuration or exposure
- Per-user usage tracking: token counts and request counts per day/month
- Configurable per-user usage limits with graceful degradation (429 with retry-after header when exceeded)

## Technical Design

### Auth System

#### Password Handling

```python
# Using passlib with bcrypt (or argon2id for new deployments)
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

**Password requirements**:
- Minimum 8 characters
- No maximum length (bcrypt truncates at 72 bytes; if using argon2id, no practical limit)
- Checked against a breach dictionary (top 100k compromised passwords) on registration
- No composition rules (no "must include uppercase + number" -- these reduce entropy in practice)

#### Registration Flow

```
Client                          Server
  |                               |
  |  POST /api/auth/register      |
  |  {email, password, name}      |
  |------------------------------>|
  |                               |  Validate email format
  |                               |  Check email uniqueness (409 if duplicate)
  |                               |  Validate password strength
  |                               |  Hash password (bcrypt)
  |                               |  Create User row
  |                               |  Create server-side session
  |                               |  Set httpOnly cookie
  |  201 {user_id, email, name}   |
  |<------------------------------|
```

#### Login Flow

```
Client                          Server
  |                               |
  |  POST /api/auth/login         |
  |  {email, password}            |
  |------------------------------>|
  |                               |  Look up user by email (constant-time on miss)
  |                               |  Verify password hash
  |                               |  Create/refresh server-side session
  |                               |  Set httpOnly cookie
  |  200 {user_id, email, name}   |
  |<------------------------------|
```

**Timing attack mitigation**: On login with a non-existent email, still run `pwd_context.verify()` against a dummy hash to prevent timing-based user enumeration.

#### OAuth Flow (Google)

```
Client                          Server                      Google
  |                               |                           |
  |  GET /api/auth/oauth/google   |                           |
  |------------------------------>|                           |
  |  302 -> Google consent URL    |                           |
  |<------------------------------|                           |
  |                               |                           |
  |  (user consents at Google)    |                           |
  |                               |                           |
  |  GET /api/auth/oauth/callback |                           |
  |  ?code=AUTH_CODE&state=STATE  |                           |
  |------------------------------>|                           |
  |                               |  Exchange code for tokens |
  |                               |-------------------------->|
  |                               |  {access_token, id_token} |
  |                               |<--------------------------|
  |                               |  Verify id_token (nonce, aud, iss)
  |                               |  Extract email, sub, name
  |                               |  Find or create User (by oauth_subject)
  |                               |  Create session, set cookie
  |  302 -> /app (with cookie)    |
  |<------------------------------|
```

- State parameter prevents CSRF on the OAuth flow
- Nonce in id_token prevents replay attacks
- If email from Google matches an existing email/password account, link them (same User row, add oauth fields)

### Session Management

#### Server-Side Session Store

Sessions are stored in the database (or Redis in high-traffic deployments):

```python
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # cryptographic random
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    expires_at: Mapped[datetime] = mapped_column(index=True)
    last_active_at: Mapped[datetime] = mapped_column(default=func.now())
    ip_address: Mapped[str | None] = mapped_column(String(45))  # IPv6 max length
    user_agent: Mapped[str | None] = mapped_column(String(512))
```

#### Cookie Configuration

```python
response.set_cookie(
    key="session_id",
    value=session.id,
    httponly=True,       # Not accessible via JavaScript
    secure=True,         # HTTPS only (disable in dev)
    samesite="lax",      # CSRF protection baseline
    max_age=86400 * 7,   # 7-day session TTL
    path="/",
    domain=None,         # Current domain only
)
```

#### Session Lifecycle

| Event | Action |
|-------|--------|
| Login / Register | Create new session row, set cookie |
| Authenticated request | Validate session exists, not expired, refresh `last_active_at` |
| Logout | Delete session row, clear cookie |
| Session expired | Reject request with 401, clear cookie |
| Account deletion | Delete all sessions for user |

**Sliding window expiry**: On each authenticated request, if the session is within 1 day of expiry, extend it by another 7 days. This keeps active users logged in without infinite sessions.

#### FastAPI Dependency for Auth

```python
from fastapi import Depends, Request, HTTPException

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.get(Session, session_id)
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired")

    # Sliding window refresh
    if session.expires_at - datetime.utcnow() < timedelta(days=1):
        session.expires_at = datetime.utcnow() + timedelta(days=7)

    session.last_active_at = datetime.utcnow()
    await db.commit()

    return await db.get(User, session.user_id)
```

Every protected router uses `current_user: User = Depends(get_current_user)` and passes `current_user.id` into all database queries.

### Encryption

#### Application-Level Field Encryption

Sensitive fields are encrypted at the application layer before database persistence using AES-256-GCM:

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

# Encryption key from environment (32 bytes for AES-256)
ENCRYPTION_KEY = bytes.fromhex(os.environ["FIELD_ENCRYPTION_KEY"])

def encrypt_field(plaintext: str) -> bytes:
    """Encrypt a field value. Returns nonce + ciphertext."""
    aesgcm = AESGCM(ENCRYPTION_KEY)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ciphertext  # Store as single blob

def decrypt_field(data: bytes) -> str:
    """Decrypt a field value."""
    aesgcm = AESGCM(ENCRYPTION_KEY)
    nonce, ciphertext = data[:12], data[12:]
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
```

**Encrypted fields**:
| Entity | Fields | Rationale |
|--------|--------|-----------|
| LearnerProfile | preferences, udl_preferences, constraints | Personal learning accommodations are sensitive |
| Activity | submission_content | User-generated content may contain personal info |
| Assessment | response_content | User-generated assessment answers |

**Key management**:
- `FIELD_ENCRYPTION_KEY` stored in environment variables (or secrets manager in production)
- Key rotation: add new key, re-encrypt on read (decrypt with old, encrypt with new, save), remove old key after migration
- Column type: `LargeBinary` in SQLAlchemy for encrypted fields

### Data Isolation

#### Query-Level Enforcement

Every database query is scoped to the authenticated user. This is enforced at two levels:

**Level 1 -- Router level**: Every endpoint receives `current_user` from the auth dependency and passes the user_id explicitly:

```python
@router.get("/courses")
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CourseInstance).where(CourseInstance.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()
```

**Level 2 -- Repository pattern** (defense in depth): A `UserScopedRepository` base class ensures all queries include the user filter, even if a router accidentally omits it:

```python
class UserScopedRepository:
    def __init__(self, db: AsyncSession, user_id: UUID):
        self.db = db
        self.user_id = user_id

    async def get_by_id(self, model: type[T], id: UUID) -> T | None:
        stmt = select(model).where(model.id == id, model.user_id == self.user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self, model: type[T], **filters) -> list[T]:
        stmt = select(model).where(model.user_id == self.user_id)
        for key, value in filters.items():
            stmt = stmt.where(getattr(model, key) == value)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
```

**Isolation guarantee**: If User A requests `/api/courses/{course_id}` where `course_id` belongs to User B, the query returns `None` and the endpoint returns 404 (not 403 -- avoids information disclosure about resource existence).

### Rate Limiting

#### Per-User Rate Limiting with slowapi

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_user_identifier(request: Request) -> str:
    """Rate limit by user ID if authenticated, else by IP."""
    session_id = request.cookies.get("session_id")
    if session_id:
        return f"user:{session_id}"
    return f"ip:{get_remote_address(request)}"

limiter = Limiter(key_func=get_user_identifier)
```

#### Rate Limit Tiers

| Endpoint Category | Limit | Window | Rationale |
|-------------------|-------|--------|-----------|
| `POST /api/auth/register` | 3 | per hour per IP | Prevent account spam |
| `POST /api/auth/login` | 10 | per 15 min per IP | Brute force protection |
| `POST /api/courses/generate` | 5 | per hour per user | LLM cost protection |
| `POST /api/activities/{id}/submit` | 20 | per hour per user | Allow iteration but prevent abuse |
| `POST /api/courses/{id}/assessment/*` | 10 | per hour per user | LLM cost protection |
| `GET /api/*` (reads) | 100 | per minute per user | General abuse prevention |
| `DELETE /api/auth/account` | 1 | per day per user | Prevent accidental deletion loops |

**Response on limit exceeded**:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 847
Content-Type: application/json

{"detail": "Rate limit exceeded. Try again in 847 seconds."}
```

### Data Privacy

#### Account Deletion Flow

```
Client                          Server
  |                               |
  |  DELETE /api/auth/account     |
  |  Cookie: session_id=...       |
  |  {"confirm": "DELETE_MY_DATA"}|
  |------------------------------>|
  |                               |  Verify session (authenticated)
  |                               |  Verify confirmation string matches
  |                               |  Begin transaction:
  |                               |    Delete uploads from object storage
  |                               |    DELETE AgentLog WHERE user_id = X
  |                               |    DELETE Badge WHERE user_id = X
  |                               |    DELETE Assessment WHERE course_id IN (user's courses)
  |                               |    DELETE Activity WHERE lesson_id IN (user's lessons)
  |                               |    DELETE Lesson WHERE course_id IN (user's courses)
  |                               |    DELETE CourseInstance WHERE user_id = X
  |                               |    DELETE LearnerProfile WHERE user_id = X
  |                               |    DELETE Session WHERE user_id = X
  |                               |    INSERT DeletionAudit {user_id, deleted_at} (tombstone)
  |                               |    DELETE User WHERE id = X
  |                               |  Commit transaction
  |                               |  Clear session cookie
  |  204 No Content               |
  |<------------------------------|
```

**Cascading deletion order**: Respects foreign key constraints by deleting leaf entities first.

**Tombstone record** (`DeletionAudit`): Contains only `id`, `original_user_id` (UUID, not email), and `deleted_at`. No PII retained. Used only if legally required to prove data was deleted.

#### LLM Usage Tracking

```python
class UsageRecord(Base):
    __tablename__ = "usage_records"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(index=True)
    input_tokens: Mapped[int] = mapped_column(default=0)
    output_tokens: Mapped[int] = mapped_column(default=0)
    request_count: Mapped[int] = mapped_column(default=0)
```

**Usage limits** (configurable per deployment):

| Metric | Default Limit | Period |
|--------|--------------|--------|
| Total tokens (input + output) | 500,000 | per day |
| Total requests | 100 | per day |
| Monthly token cap | 10,000,000 | per month |

When a user approaches 80% of their limit, include a warning header: `X-Usage-Warning: 82% of daily token limit used`.

When the limit is exceeded, return 429 with detail explaining the usage limit (distinct from rate limiting).

### Agent Log Redaction

#### Redaction Pipeline

Redaction runs as a pre-persistence step in the agent logging wrapper (defined in PRD 1):

```python
import re

REDACTION_PATTERNS = [
    # API keys and tokens
    (re.compile(r"(sk-[a-zA-Z0-9]{20,})"), "[REDACTED_API_KEY]"),
    (re.compile(r"(Bearer\s+[a-zA-Z0-9\-._~+/]+=*)"), "[REDACTED_BEARER_TOKEN]"),
    (re.compile(r"(AIza[a-zA-Z0-9\-_]{35})"), "[REDACTED_GOOGLE_KEY]"),
    (re.compile(r"(ghp_[a-zA-Z0-9]{36})"), "[REDACTED_GITHUB_TOKEN]"),

    # Passwords in JSON/form payloads
    (re.compile(r'("password"\s*:\s*)"[^"]*"'), r'\1"[REDACTED]"'),
    (re.compile(r"(password=)[^&\s]+"), r"\1[REDACTED]"),

    # Session tokens
    (re.compile(r"(session_id=)[a-f0-9]{64}"), r"\1[REDACTED_SESSION]"),
]

PII_PATTERNS = [
    # Email addresses (optional, policy-gated)
    (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "[REDACTED_EMAIL]"),
]

def redact_log_content(text: str, redact_pii: bool = False) -> str:
    """Scrub sensitive patterns from agent log text before storage."""
    for pattern, replacement in REDACTION_PATTERNS:
        text = pattern.sub(replacement, text)
    if redact_pii:
        for pattern, replacement in PII_PATTERNS:
            text = pattern.sub(replacement, text)
    return text
```

**Integration point**: The agent logging wrapper from PRD 1 calls `redact_log_content()` on both the prompt and output text before writing the AgentLog row.

## API Endpoints

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | None | Create account with email, password, display name |
| `POST` | `/api/auth/login` | None | Authenticate and receive session cookie |
| `POST` | `/api/auth/logout` | Required | Invalidate current session |
| `GET` | `/api/auth/me` | Required | Return current user profile |
| `GET` | `/api/auth/oauth/google` | None | Initiate Google OAuth flow |
| `GET` | `/api/auth/oauth/callback` | None | Handle OAuth callback |
| `DELETE` | `/api/auth/account` | Required | Delete user and all associated data |

### Request/Response Schemas

#### POST /api/auth/register

**Request:**
```json
{
  "email": "learner@example.com",
  "password": "securepassword123",
  "display_name": "Alex"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "email": "learner@example.com",
  "display_name": "Alex",
  "created_at": "2025-02-24T00:00:00Z"
}
```

**Errors:**
- 409: Email already registered
- 422: Invalid email format, password too short, missing required fields

#### POST /api/auth/login

**Request:**
```json
{
  "email": "learner@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "email": "learner@example.com",
  "display_name": "Alex"
}
```

**Errors:**
- 401: Invalid email or password (generic message to prevent enumeration)

#### POST /api/auth/logout

**Request:** Empty body, session cookie required.

**Response (204):** No content. Session cookie cleared.

#### GET /api/auth/me

**Response (200):**
```json
{
  "id": "uuid",
  "email": "learner@example.com",
  "display_name": "Alex",
  "created_at": "2025-02-24T00:00:00Z",
  "oauth_provider": null,
  "usage": {
    "daily_tokens_used": 42000,
    "daily_token_limit": 500000,
    "daily_requests_used": 12,
    "daily_request_limit": 100
  }
}
```

#### DELETE /api/auth/account

**Request:**
```json
{
  "confirm": "DELETE_MY_DATA"
}
```

**Response (204):** No content. All data deleted, session cookie cleared.

**Errors:**
- 400: Confirmation string does not match
- 429: Rate limited (1 per day)

### Protected Endpoint Pattern

All existing endpoints from PRDs 2-10 gain the `get_current_user` dependency:

```python
# Before (PRDs 1-10, single-user stub)
@router.get("/courses")
async def list_courses(db: AsyncSession = Depends(get_db)):
    ...

# After (PRD 11)
@router.get("/courses")
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ...
```

## Security Requirements

### Threat Model

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| **Credential stuffing** | Automated login attempts with breached credentials | Rate limiting (10/15min per IP on login), breached password check on registration |
| **Session hijacking** | XSS stealing session cookie | httpOnly cookie (no JS access), CSP headers, input sanitization |
| **Session fixation** | Attacker sets session before login | Generate new session ID on every login, never reuse |
| **CSRF** | Forged requests from malicious sites | SameSite=Lax cookie + CSRF token header on state-changing requests |
| **User enumeration** | Timing differences on login/register | Constant-time password verification on miss, generic error messages |
| **Privilege escalation** | Manipulating user_id in requests | user_id derived from session server-side, never from request body/params |
| **IDOR** | Accessing other users' resources by guessing IDs | All queries scoped by authenticated user_id, UUIDs for resource IDs |
| **Data exfiltration** | Database breach exposes PII | Field-level encryption for sensitive data, hashed passwords |
| **Token leakage** | API keys in client-side code or logs | Server-side key management, agent log redaction |
| **XSS** | Script injection via course/activity content | React auto-escapes by default, CSP headers, no `dangerouslySetInnerHTML` on user input |
| **Brute force** | Password guessing | bcrypt work factor (cost=12), account lockout after 10 failed attempts (30-min cooldown) |
| **Denial of service** | Excessive LLM generation requests | Per-user rate limiting, usage caps, request queue depth limits |

### Security Headers

Applied via FastAPI middleware to all responses:

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"  # Disabled; CSP is the modern replacement
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "  # Required for Tailwind
        "img-src 'self' blob: data: https://*.googleapis.com; "  # Signed URLs
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response
```

### CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Vite dev server
        "https://app.1111.school",    # Production frontend
    ],
    allow_credentials=True,           # Required for cookie-based auth
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
```

### CSRF Protection

```python
import secrets

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    # Set CSRF cookie on every response (readable by JS, not httpOnly)
    if request.method in ("GET", "HEAD", "OPTIONS"):
        response = await call_next(request)
        if CSRF_COOKIE_NAME not in request.cookies:
            csrf_token = secrets.token_urlsafe(32)
            response.set_cookie(
                CSRF_COOKIE_NAME, csrf_token,
                httponly=False,  # JS must read this to send as header
                secure=True,
                samesite="lax",
            )
        return response

    # Validate CSRF on state-changing methods
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)

    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(status_code=403, detail="CSRF validation failed")

    return await call_next(request)
```

**Frontend integration**: The React API client reads the `csrf_token` cookie and includes it as the `X-CSRF-Token` header on all POST/PATCH/DELETE requests.

### Input Validation

All request bodies validated by Pydantic models with strict constraints:

```python
from pydantic import BaseModel, EmailStr, Field

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)

class DeleteAccountRequest(BaseModel):
    confirm: str = Field(pattern=r"^DELETE_MY_DATA$")
```

### Account Lockout

After 10 consecutive failed login attempts for an email address, the account enters a 30-minute lockout period. The lockout is tracked in the database, not in memory, to survive server restarts:

```python
class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), index=True)
    attempted_at: Mapped[datetime] = mapped_column(default=func.now())
    success: Mapped[bool] = mapped_column(default=False)
```

On successful login, reset the failure count. During lockout, return 429 with a Retry-After header (not 401, to avoid confirming the account exists to an attacker -- but the rate limit per IP on login already mitigates enumeration).

## Frontend Changes

### Auth State Management

```typescript
// stores/authStore.ts
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}
```

**Session check on app load**: On mount, call `GET /api/auth/me`. If 401, redirect to login. If 200, populate user state. This replaces the stubbed user from PRDs 1-10.

### Route Protection

```typescript
// components/ProtectedRoute.tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}
```

### Auth Pages

- `/login` -- Email/password form, "Sign in with Google" button, link to register
- `/register` -- Email/password/name form, "Sign up with Google" button, link to login
- `/settings` -- Account section with "Delete My Account" button (danger zone, confirmation dialog)

### API Client CSRF Integration

```typescript
// lib/api.ts
function getCsrfToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const csrfToken = getCsrfToken();
  if (csrfToken && ["POST", "PATCH", "DELETE"].includes(options.method ?? "GET")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",  // Send cookies
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new AuthError("Session expired");
  }

  return response;
}
```

## Database Migrations

### Migration: Add auth-related tables and columns

```python
# alembic/versions/xxx_add_auth_tables.py

def upgrade():
    # Sessions table
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_active_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.String(512)),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    # Login attempts table
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("attempted_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("success", sa.Boolean(), default=False),
    )
    op.create_index("ix_login_attempts_email", "login_attempts", ["email"])

    # Usage records table
    op.create_table(
        "usage_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), default=0),
        sa.Column("output_tokens", sa.Integer(), default=0),
        sa.Column("request_count", sa.Integer(), default=0),
    )
    op.create_index("ix_usage_records_user_date", "usage_records", ["user_id", "date"], unique=True)

    # Deletion audit table (tombstone)
    op.create_table(
        "deletion_audits",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("original_user_id", sa.Uuid(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # Add OAuth fields to users table
    op.add_column("users", sa.Column("oauth_provider", sa.String(50)))
    op.add_column("users", sa.Column("oauth_subject", sa.String(255)))
    op.create_index("ix_users_oauth", "users", ["oauth_provider", "oauth_subject"], unique=True)

    # Add user_id to all existing entities (if not already present from PRD 1)
    # These are idempotent -- skip if column exists
    for table in ["course_instances", "learner_profiles", "agent_logs"]:
        try:
            op.add_column(table, sa.Column(
                "user_id", sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=True,  # Nullable during migration, enforce NOT NULL after backfill
            ))
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        except Exception:
            pass  # Column already exists

def downgrade():
    op.drop_table("deletion_audits")
    op.drop_table("usage_records")
    op.drop_table("login_attempts")
    op.drop_table("sessions")
    op.drop_column("users", "oauth_subject")
    op.drop_column("users", "oauth_provider")
```

## Acceptance Criteria

### Authentication
- [ ] User can register with email, password, and display name
- [ ] Duplicate email registration returns 409
- [ ] User can log in with correct credentials and receives httpOnly session cookie
- [ ] Invalid credentials return 401 with generic message (no enumeration)
- [ ] User session persists across browser restarts (cookie-based)
- [ ] User can log out; subsequent requests return 401
- [ ] Google OAuth flow completes and creates/links user account
- [ ] Password is hashed with bcrypt; plaintext is never stored or logged

### Data Isolation
- [ ] User A's courses are not visible in User B's course list
- [ ] User A requesting User B's course by ID returns 404 (not 403)
- [ ] User A's learner profile, activities, assessments, badges, and agent logs are all isolated
- [ ] All database queries include `user_id` filter (verified by code review)

### Security
- [ ] Session cookie has httpOnly, Secure, SameSite=Lax flags
- [ ] No tokens, session IDs, or API keys appear in localStorage or sessionStorage
- [ ] CSRF protection rejects state-changing requests without valid CSRF token
- [ ] Rate limiting returns 429 after threshold exceeded on auth endpoints
- [ ] Rate limiting returns 429 after threshold exceeded on generation endpoints
- [ ] Security headers present on all responses (HSTS, CSP, X-Frame-Options, etc.)
- [ ] Account locks after 10 failed login attempts for 30 minutes

### Encryption
- [ ] LearnerProfile sensitive fields are encrypted at rest in the database
- [ ] Activity submission content is encrypted at rest
- [ ] Assessment response content is encrypted at rest
- [ ] Decryption produces original plaintext (round-trip test)

### Agent Log Redaction
- [ ] Agent logs do not contain API keys, bearer tokens, or passwords after storage
- [ ] Redaction does not corrupt non-sensitive log content
- [ ] PII masking is configurable and disabled by default

### Data Privacy
- [ ] `DELETE /api/auth/account` removes all user data (courses, profile, activities, assessments, badges, logs)
- [ ] Uploaded files are removed from object storage on account deletion
- [ ] Tombstone audit record contains only UUID and timestamp, no PII
- [ ] Deletion requires explicit confirmation string

### API Key Management
- [ ] LLM API keys are never sent to or accessible from the frontend
- [ ] Per-user usage is tracked (tokens and requests per day)
- [ ] Users exceeding usage limits receive 429 with informative message
- [ ] Usage warning header appears when approaching limit (80%+)

### Frontend
- [ ] Login and registration pages render and function correctly
- [ ] Protected routes redirect unauthenticated users to login
- [ ] Session check on app load populates user state or redirects
- [ ] CSRF token is included in all state-changing API requests
- [ ] Account deletion flow includes confirmation dialog
- [ ] Auth error (401) triggers redirect to login

## Verification

### Unit Tests -- Auth Logic

| Test | Assertion |
|------|-----------|
| `test_password_hash_differs_from_plaintext` | `hash_password("secret") != "secret"` |
| `test_password_verify_correct` | `verify_password("secret", hash_password("secret")) == True` |
| `test_password_verify_incorrect` | `verify_password("wrong", hash_password("secret")) == False` |
| `test_session_token_generation` | Session ID is 64 hex chars, cryptographically random |
| `test_session_expiry_check` | Expired session raises 401 |
| `test_session_sliding_window` | Session within 1 day of expiry gets extended |
| `test_rate_limiter_allows_under_threshold` | 9 requests in window -> all pass |
| `test_rate_limiter_blocks_at_threshold` | 11th request -> 429 |
| `test_field_encryption_roundtrip` | `decrypt_field(encrypt_field("hello")) == "hello"` |
| `test_field_encryption_produces_different_ciphertext` | Two encryptions of same plaintext differ (unique nonce) |
| `test_redaction_strips_api_keys` | `"sk-abc123..."` replaced with `[REDACTED_API_KEY]` |
| `test_redaction_strips_bearer_tokens` | `"Bearer eyJ..."` replaced with `[REDACTED_BEARER_TOKEN]` |
| `test_redaction_strips_passwords` | `"password": "secret"` replaced with `[REDACTED]` |
| `test_redaction_preserves_normal_text` | Non-sensitive text unchanged |
| `test_pii_masking_optional` | Email preserved when `redact_pii=False`, redacted when `True` |
| `test_account_lockout_after_10_failures` | 10 failed logins -> lockout active |
| `test_account_lockout_resets_on_success` | Successful login resets failure count |
| `test_password_rejects_breached` | Password in breach list rejected on registration |

### Unit Tests -- Data Isolation

| Test | Assertion |
|------|-----------|
| `test_user_scoped_repo_filters_by_user` | Repository query includes `WHERE user_id = X` |
| `test_user_a_courses_not_in_user_b_list` | User B's list_all returns empty when only User A has courses |
| `test_user_a_course_not_accessible_by_user_b` | User B's get_by_id returns None for User A's course |
| `test_user_a_activities_isolated` | User B cannot retrieve User A's activity submissions |
| `test_user_a_logs_isolated` | User B cannot retrieve User A's agent logs |

### Integration Tests -- API

| Test | Steps | Expected |
|------|-------|----------|
| `test_register_login_session` | Register -> login -> GET /me | 201, 200, 200 with user data |
| `test_protected_endpoint_no_auth` | GET /api/courses without cookie | 401 |
| `test_protected_endpoint_with_auth` | Login -> GET /api/courses | 200 |
| `test_logout_invalidates_session` | Login -> logout -> GET /me | 200, 204, 401 |
| `test_delete_account_removes_all_data` | Register -> create course -> delete account -> verify DB empty | All user rows removed |
| `test_duplicate_email_register` | Register email@test.com twice | 201 first, 409 second |
| `test_invalid_credentials_login` | POST /api/auth/login with wrong password | 401 |
| `test_expired_session_rejected` | Manually expire session in DB -> GET /me | 401 |
| `test_oauth_google_redirect` | GET /api/auth/oauth/google | 302 to Google |
| `test_data_isolation_between_users` | Register 2 users, User A creates course, User B lists courses | User B sees empty list |

### Security Tests

| Test | Steps | Expected |
|------|-------|----------|
| `test_cors_allowed_origin` | Request from localhost:5173 | CORS headers present |
| `test_cors_disallowed_origin` | Request from evil.com | CORS headers absent |
| `test_csrf_missing_token` | POST without X-CSRF-Token header | 403 |
| `test_csrf_mismatched_token` | POST with wrong X-CSRF-Token | 403 |
| `test_csrf_valid_token` | POST with matching cookie + header token | Request succeeds |
| `test_rate_limit_login` | 11 login attempts in 15 min | 429 on 11th |
| `test_rate_limit_generation` | 6 course generations in 1 hour | 429 on 6th |
| `test_security_headers_present` | Any response | HSTS, CSP, X-Frame-Options present |
| `test_session_cookie_flags` | Login response | Cookie has httpOnly, Secure, SameSite=Lax |
| `test_no_user_enumeration_timing` | Login with existing vs. non-existing email | Response times within 100ms of each other |

### ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/10_auth_flow.py
uv run tests/adw/11_multi_user.py
uv run tests/adw/12_security_audit.py
uv run tests/adw/12_accessibility.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Auth Flow — register, login, logout, persistence."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
<the ADW prompt content — see each test section below>
"""

def main() -> int:
    # 1. Preflight checks
    if not shutil.which("claude"):
        print("SKIP: 'claude' CLI not found on PATH. Install Claude Code to run ADW tests.")
        return 0  # Skip, don't fail

    if not shutil.which("agent-browser"):
        print("SKIP: 'agent-browser' not found. Run: npm install -g agent-browser && agent-browser install")
        return 0

    # 2. Ensure results directory exists
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    # 3. Run Claude Code in headless mode
    print(f"Running ADW test: {Path(__file__).stem}")
    result = subprocess.run(
        [
            "claude", "-p", PROMPT,
            "--output-format", "json",
            "--allowedTools", "Bash,Read",
            "--max-turns", "25",
            "--model", "claude-sonnet-4-6",
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),  # project root
        timeout=300,  # 5 minute timeout
    )

    if result.returncode != 0:
        print(f"FAIL: claude exited with code {result.returncode}")
        print(result.stderr)
        return 1

    # 4. Parse and save results
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"FAIL: Could not parse claude output as JSON")
        print(result.stdout[:500])
        return 1

    result_file = results_dir / f"{Path(__file__).stem}.json"
    result_file.write_text(json.dumps(output, indent=2))
    print(f"Results saved to {result_file}")

    # 5. Report
    agent_result = output.get("result", "")
    print(f"\nAgent response:\n{agent_result[:1000]}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Orchestrator** — `tests/adw/run_all.py` runs all ADW tests in sequence:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Run all ADW tests in order."""

import subprocess
import sys
from pathlib import Path

def main() -> int:
    tests_dir = Path(__file__).parent
    test_files = sorted(tests_dir.glob("[0-9]*.py"))

    results = []
    for test_file in test_files:
        print(f"\n{'='*60}")
        print(f"Running: {test_file.name}")
        print(f"{'='*60}")
        ret = subprocess.run([sys.executable, str(test_file)]).returncode
        results.append((test_file.name, ret))

    print(f"\n{'='*60}")
    print("ADW Test Summary")
    print(f"{'='*60}")
    for name, ret in results:
        status = "PASS" if ret == 0 else "FAIL"
        print(f"  {status}: {name}")

    passed = sum(1 for _, r in results if r == 0)
    print(f"\n{passed}/{len(results)} passed")
    return 0 if all(r == 0 for _, r in results) else 1

if __name__ == "__main__":
    sys.exit(main())
```

Each of the four ADW tests below follows this structure. The `PROMPT` variable in each script contains the prompt content shown in its respective section.

### ADW Test -- Auth Flow (`10_auth_flow.py`)

The `PROMPT` value for `tests/adw/10_auth_flow.py`:

```
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Authentication flow -- register, login, logout, persistence

Steps:
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` -- expect redirect to login/register page
3. Click "Register" or navigate to registration form
4. Fill in: email "testuser@example.com", password "TestPassword123!", name "Test User"
5. Submit registration form
6. Wait for redirect to main app (Setup Course or dashboard)
7. Snapshot -- verify user is authenticated (name displayed, no login form)
8. Find and click "Logout" button/link
9. Snapshot -- verify redirect back to login page
10. Fill in login form with same credentials
11. Submit login
12. Snapshot -- verify user is authenticated again, courses/data persist
13. Close and reopen browser: `agent-browser open http://localhost:5173`
14. Snapshot -- verify session persists (user still logged in)

VERIFY and report pass/fail for each:
- [ ] Registration form accepts valid input and creates account
- [ ] After registration, user is redirected to authenticated area
- [ ] User's display name is visible in the UI
- [ ] Logout redirects to login page
- [ ] Login with existing credentials succeeds
- [ ] Session persists across page reload
- [ ] Take annotated screenshots: `agent-browser screenshot --annotate ./test-results/auth-flow-{step}.png`

Output a JSON object: {"test": "auth_flow", "passed": true/false, "checks": [...], "notes": "..."}
```

### ADW Test -- Multi-User Isolation (`11_multi_user.py`)

The `PROMPT` value for `tests/adw/11_multi_user.py`:

```
You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser sessions to simulate two separate users.

TEST: Multi-user data isolation

Steps:
1. SESSION A:
   `agent-browser --session user-a open http://localhost:5173`
   Register as "user-a@test.com" / "PasswordA123!" / "Alice"
   Create a course with description "Introduction to Cooking"
   Wait for course generation, verify course appears
   Snapshot the course list

2. SESSION B:
   `agent-browser --session user-b open http://localhost:5173`
   Register as "user-b@test.com" / "PasswordB123!" / "Bob"
   Snapshot the course list -- should be EMPTY (no courses)

3. SESSION B:
   Create a different course "Introduction to Photography"
   Wait for generation, verify it appears

4. SESSION A:
   `agent-browser --session user-a snapshot -i`
   Verify: only "Introduction to Cooking" visible, NOT "Introduction to Photography"

5. SESSION B:
   `agent-browser --session user-b snapshot -i`
   Verify: only "Introduction to Photography" visible, NOT "Introduction to Cooking"

VERIFY and report pass/fail for each:
- [ ] User A's course list shows only their courses
- [ ] User B's course list is initially empty
- [ ] User B cannot see User A's course
- [ ] User A cannot see User B's course
- [ ] Each user's profile is independent
- [ ] Take screenshots of both sessions: `agent-browser --session user-a screenshot --annotate ./test-results/isolation-a.png`

Output a JSON object: {"test": "multi_user_isolation", "passed": true/false, "checks": [...], "notes": "..."}
```

### ADW Test -- Security Audit (`12_security_audit.py`)

The `PROMPT` value for `tests/adw/12_security_audit.py`:

```
You are a security auditor for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to perform a security audit.

TEST: Client-side security audit

Steps:
1. `agent-browser open http://localhost:5173`
2. Register and login as a test user

3. CHECK: localStorage for sensitive data
   `agent-browser storage local`
   Verify: NO API keys, session tokens, passwords, or bearer tokens in localStorage

4. CHECK: sessionStorage for sensitive data
   `agent-browser storage session`
   Verify: NO sensitive tokens in sessionStorage

5. CHECK: Cookie security flags
   `agent-browser cookies`
   Verify: session_id cookie has httpOnly=true, Secure=true, SameSite=Lax

6. CHECK: XSS resistance
   Navigate to course creation
   Enter `<script>alert('xss')</script>` as course description
   Submit and snapshot -- verify script renders as escaped text, not executed
   `agent-browser console` -- verify no script execution in console

7. CHECK: Console for leaked credentials
   `agent-browser console`
   Read all console messages, search for: API keys, passwords, tokens, "Bearer", "sk-"
   Verify: no credentials leaked in console output

8. CHECK: Network for credential exposure
   Navigate through several pages, submit an activity
   Check: are any API keys visible in request/response data accessible to JS?

VERIFY and report with severity ratings:
- [ ] [CRITICAL] No auth tokens in localStorage/sessionStorage
- [ ] [CRITICAL] Session cookie has httpOnly flag
- [ ] [HIGH] Session cookie has Secure flag
- [ ] [HIGH] Session cookie has SameSite flag
- [ ] [HIGH] XSS attempt is properly escaped
- [ ] [MEDIUM] No credentials in console output
- [ ] [MEDIUM] No API keys exposed to client
- [ ] Take screenshots of storage/cookie inspection

Output a JSON object: {"test": "security_audit", "passed": true/false, "findings": [...], "severity_summary": {...}}
```

### ADW Test -- Accessibility Audit (`12_accessibility.py`)

The `PROMPT` value for `tests/adw/12_accessibility.py`:

```
You are an accessibility auditor for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to perform an accessibility audit of the auth-related pages.

TEST: Accessibility audit of authentication pages

Steps:
1. `agent-browser open http://localhost:5173`
   `agent-browser snapshot` (full a11y tree)

2. LOGIN PAGE:
   - Verify heading hierarchy (h1 for page title, no skipped levels)
   - Verify all form inputs have associated labels (visible in snapshot refs)
   - Verify submit button has accessible name
   - Verify error messages are associated with inputs (aria-describedby or similar)
   - Tab through the page: `agent-browser press Tab` (repeat 10x), verify focus order is logical
   - Verify focus is visible on each element

3. REGISTRATION PAGE:
   Navigate to registration
   `agent-browser snapshot`
   - Same checks as login: headings, labels, buttons, focus order
   - Verify password requirements are announced (aria-describedby)

4. AUTHENTICATED AREA:
   Register and login
   `agent-browser snapshot`
   - Verify navigation has proper ARIA roles (nav, main, etc.)
   - Verify user menu/logout is keyboard accessible
   - Verify active page is indicated (aria-current)

5. SETTINGS/DELETE ACCOUNT:
   Navigate to settings
   `agent-browser snapshot`
   - Verify danger zone has appropriate visual and semantic indicators
   - Verify confirmation dialog is modal with proper focus trap
   - Verify dialog has accessible name and description

VERIFY and report:
- [ ] All form inputs have visible labels
- [ ] Heading hierarchy is correct (no skipped levels)
- [ ] Focus order is logical on all auth pages
- [ ] Submit buttons have accessible names
- [ ] Error messages are programmatically associated with inputs
- [ ] Navigation landmarks present (nav, main)
- [ ] Keyboard navigation works throughout auth flow
- [ ] Confirmation dialog has proper focus management

Output a JSON object: {"test": "accessibility_audit", "passed": true/false, "issues": [...], "pages_audited": [...]}
```

## Definition of Done

- [ ] All API endpoints implemented and returning correct status codes
- [ ] All acceptance criteria passing
- [ ] All unit tests passing (password hashing, JWT, rate limiter, encryption, redaction, data isolation)
- [ ] All integration tests passing (register/login/logout/delete flow, protected endpoints, CORS, CSRF, rate limits)
- [ ] All security tests passing (cookie flags, header presence, timing attack resistance)
- [ ] All ADW tests passing (10_auth_flow, 11_multi_user, 12_security_audit, 12_accessibility)
- [ ] Database migration applies cleanly (up and down)
- [ ] All existing PRD 1-10 endpoints retrofitted with `get_current_user` dependency
- [ ] All existing database queries scoped by `user_id`
- [ ] Agent log redaction integrated into logging wrapper
- [ ] Field encryption applied to sensitive columns
- [ ] Frontend auth pages (login, register, settings) implemented and styled
- [ ] Frontend route protection in place (unauthenticated users redirected)
- [ ] CSRF token integration in frontend API client
- [ ] No secrets, tokens, or API keys in localStorage, sessionStorage, or console output
- [ ] Usage tracking recording per-user LLM consumption
- [ ] Code review completed with security-focused reviewer
- [ ] Manual penetration testing checklist completed (OWASP Top 10 spot-check)
