package middleware

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// relayCORSHeaders are the request headers browser relay / API-key clients send
// (Anthropic / OpenAI / Gemini conventions), plus the common web headers.
var relayCORSHeaders = []string{
	"Authorization", "Content-Type", "Accept", "Accept-Language", "Cache-Control",
	"X-Requested-With", "New-Api-User",
	"x-api-key", "x-goog-api-key", "anthropic-version", "anthropic-beta",
	"openai-organization", "openai-project",
}

// pathIs reports whether p equals base or is a sub-path of base at a segment
// boundary (avoids "/api/usage_stats" matching base "/api/usage").
func pathIs(p, base string) bool {
	return p == base || strings.HasPrefix(p, base+"/")
}

// isSessionCorsSurface reports whether a request path is a cookie-session surface
// (needs credentialed CORS) rather than a relay / API-key surface (needs
// any-origin, NO-credentials CORS). Session surfaces are the SPA's /api/* and the
// /pg playground, EXCEPT the token-authenticated relay sub-routes mounted under
// /api (/api/usage*, /api/log/token) — those authenticate via the Authorization
// header (API key), not the session cookie, so they stay on relay CORS.
func isSessionCorsSurface(p string) bool {
	if pathIs(p, "/pg") {
		return true
	}
	if pathIs(p, "/api") {
		if pathIs(p, "/api/usage") || pathIs(p, "/api/log/token") {
			return false
		}
		return true
	}
	return false
}

// relayCORSHandler is the relay / API-key surface CORS: any origin, NO credentials
// (the only legal any-origin combo). These clients authenticate via headers (API
// key), not the session cookie.
func relayCORSHandler() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowCredentials = false
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = relayCORSHeaders
	return cors.New(config)
}

// sessionCORSHandler is the cookie-session surface CORS: credentialed, restricted
// to the CORS_ALLOW_ORIGINS allowlist. Returns nil when no allowlist is set
// (production serves the SPA same-origin, so no CORS is needed and the
// credentialed-wildcard hole stays closed).
func sessionCORSHandler() gin.HandlerFunc {
	origins := parseAllowedOrigins(common.GetEnvOrDefaultString("CORS_ALLOW_ORIGINS", ""))
	if len(origins) == 0 {
		return nil
	}
	config := cors.DefaultConfig()
	config.AllowOrigins = origins
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"New-Api-User", "Content-Type", "Authorization", "Accept", "Accept-Language"}
	return cors.New(config)
}

// CORS is the relay / API-key surface CORS, used on the per-group relay mounts
// (/api/usage, /api/log/token, /dashboard). It never pairs AllowAllOrigins with
// credentials.
func CORS() gin.HandlerFunc {
	return relayCORSHandler()
}

// SessionCORS is the cookie-session CORS mounted on the /api group (actual
// responses). It applies the credentialed allowlist only to session surfaces; for
// the token/relay sub-routes under /api (/api/usage*, /api/log/token) it is a
// no-op, so those keep ONLY their own group's relay CORS and never layer an
// illegal Allow-Origin:* + Allow-Credentials:true combo.
func SessionCORS() gin.HandlerFunc {
	handler := sessionCORSHandler() // nil when no CORS_ALLOW_ORIGINS
	return func(c *gin.Context) {
		if handler != nil && isSessionCorsSurface(c.Request.URL.Path) {
			handler(c)
			return
		}
		c.Next()
	}
}

// GlobalCORS is the engine-global, path-aware CORS. As the only CORS in the gin
// NoRoute chain it answers ALL preflight (OPTIONS) requests, routing each to the
// session policy (credentialed allowlist) or the relay policy by path. It also
// covers the actual responses of relay groups registered after it (/pg → session;
// /v1, /v1beta, /mj, /suno, video, … → relay). Cookie surfaces with no allowlist
// configured get NO cross-origin CORS (correct: same-origin prod needs none, and
// they must never be granted any-origin).
func GlobalCORS() gin.HandlerFunc {
	relay := relayCORSHandler()
	session := sessionCORSHandler() // nil when no CORS_ALLOW_ORIGINS
	return func(c *gin.Context) {
		if isSessionCorsSurface(c.Request.URL.Path) {
			if session != nil {
				session(c)
				return
			}
			c.Next()
			return
		}
		relay(c)
	}
}

// parseAllowedOrigins splits a comma list into exact origins, dropping blanks,
// "*", and normalizing a trailing slash. A credentialed allowlist must never
// contain a wildcard.
func parseAllowedOrigins(raw string) []string {
	var out []string
	for _, p := range strings.Split(raw, ",") {
		o := strings.TrimRight(strings.TrimSpace(p), "/")
		if o == "" || o == "*" {
			continue
		}
		out = append(out, o)
	}
	return out
}

func PoweredBy() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-New-Api-Version", common.Version)
		c.Next()
	}
}
