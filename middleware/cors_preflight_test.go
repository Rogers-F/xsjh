package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestIsSessionCorsSurface pins the path classification that decides credentialed
// (cookie session) vs relay (API-key) CORS. The /api/log and /api/usage split is
// the one that bit us: only /api/log/token + the /api/usage subtree are relay; the
// rest of /api/log* (self/search/stat) are session surfaces.
func TestIsSessionCorsSurface(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api", true},
		{"/api/user/self", true},
		{"/api/user/login", true},
		{"/api/log/self", true},
		{"/api/log/self/stat", true},
		{"/api/log/search", true},
		{"/api/log/token", false},   // token / relay
		{"/api/usage", false},       // relay group
		{"/api/usage/token", false}, // relay
		{"/api/usage_stats", true},  // segment boundary: NOT under /api/usage
		{"/pg", true},
		{"/pg/chat/completions", true},
		{"/v1/chat/completions", false},
		{"/v1beta/models", false},
		{"/dashboard/billing/usage", false},
		{"/mj/submit/imagine", false},
		{"/", false},
	}
	for _, c := range cases {
		if got := isSessionCorsSurface(c.path); got != c.want {
			t.Errorf("isSessionCorsSurface(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

// newCorsTestEngine mirrors the real router order: SetApiRouter (the /api group +
// SessionCORS) runs BEFORE the engine-global GlobalCORS, so /api matched routes
// rely on SessionCORS for actual responses while unmatched OPTIONS preflight falls
// to GlobalCORS via the NoRoute chain. /pg and /v1 are registered after the global
// mount, so GlobalCORS is in their matched chain too.
func newCorsTestEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	noop := func(c *gin.Context) { c.Status(http.StatusOK) }

	api := r.Group("/api")
	api.Use(SessionCORS())
	{
		api.GET("/user/self", noop)
		api.GET("/log/self", noop)
		usage := api.Group("/usage")
		usage.Use(CORS())
		usage.GET("/token", noop)
		logTok := api.Group("/log")
		logTok.Use(CORS())
		logTok.GET("/token", noop)
	}

	r.Use(GlobalCORS())

	pg := r.Group("/pg")
	pg.POST("/chat/completions", noop)
	v1 := r.Group("/v1")
	v1.POST("/chat/completions", noop)
	return r
}

func corsPreflight(r *gin.Engine, method, path, origin string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, path, nil)
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", method)
	req.Header.Set("Access-Control-Request-Headers", "New-Api-User,Content-Type")
	r.ServeHTTP(w, req)
	return w
}

// TestGlobalCORSPreflight verifies that the engine-global path-aware CORS answers
// preflight per surface: session surfaces get the credentialed allowlist; relay /
// token surfaces get any-origin with NO credentials.
func TestGlobalCORSPreflight(t *testing.T) {
	const origin = "https://app.example.com"
	t.Setenv("CORS_ALLOW_ORIGINS", origin)
	r := newCorsTestEngine()

	sessionCases := []struct {
		path   string
		method string
	}{
		{"/api/user/self", http.MethodGet},
		{"/api/log/self", http.MethodGet},
		{"/pg/chat/completions", http.MethodPost},
	}
	for _, c := range sessionCases {
		w := corsPreflight(r, c.method, c.path, origin)
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Errorf("%s preflight Allow-Origin = %q, want %q", c.path, got, origin)
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
			t.Errorf("%s preflight Allow-Credentials = %q, want true", c.path, got)
		}
	}

	for _, p := range []string{"/api/log/token", "/api/usage/token", "/v1/chat/completions"} {
		w := corsPreflight(r, http.MethodPost, p, origin)
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got == "true" {
			t.Errorf("%s preflight must NOT set Allow-Credentials:true (relay surface)", p)
		}
		if ao := w.Header().Get("Access-Control-Allow-Origin"); ao != "*" && ao != "" {
			t.Errorf("%s preflight Allow-Origin = %q, want * (relay)", p, ao)
		}
	}
}

// TestCorsActualResponseNoIllegalCombo guards the resurrected `*` + credentials
// hole: SessionCORS must no-op on the token/relay subpaths so only relay CORS
// applies there, while session surfaces still get credentialed headers.
func TestCorsActualResponseNoIllegalCombo(t *testing.T) {
	const origin = "https://app.example.com"
	t.Setenv("CORS_ALLOW_ORIGINS", origin)
	r := newCorsTestEngine()

	for _, p := range []string{"/api/log/token", "/api/usage/token"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, p, nil)
		req.Header.Set("Origin", origin)
		r.ServeHTTP(w, req)
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got == "true" {
			t.Errorf("%s actual response must NOT set Allow-Credentials:true", p)
		}
	}

	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	req2.Header.Set("Origin", origin)
	r.ServeHTTP(w2, req2)
	if got := w2.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("/api/user/self actual Allow-Credentials = %q, want true", got)
	}
	if got := w2.Header().Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("/api/user/self actual Allow-Origin = %q, want %q", got, origin)
	}
}
