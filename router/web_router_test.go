package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// TestReservedPrefixesCoverRouteTable pins the "API surfaces never fall back to
// a SPA index" invariant against the ACTUAL route table: every registered route
// must live under one of reservedPrefixes, so an unmatched sibling path gets
// the relay JSON 404 instead of 200+HTML. A new top-level route group added
// without extending reservedPrefixes fails here instead of silently shipping a
// SPA-swallowed API surface.
func TestReservedPrefixesCoverRouteTable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)
	SetDashboardRouter(engine)
	SetRelayRouter(engine)
	SetVideoRouter(engine)

	// Approved exceptions: the dynamic /:mode/mj relay prefix cannot be matched
	// by a static prefix list (pre-existing upstream gap), and /setup is an
	// HTML-adjacent bootstrap path.
	approvedDynamic := func(path string) bool {
		return strings.HasPrefix(path, "/:mode/")
	}

	for _, route := range engine.Routes() {
		if approvedDynamic(route.Path) {
			continue
		}
		require.True(t, isReservedAPIPath(route.Path),
			"route %s %s is not under any reservedPrefixes entry — unmatched siblings would fall back to the SPA index; extend reservedPrefixes in web-router.go",
			route.Method, route.Path)
	}
}

// TestReservedAPIPathBypassSpellings pins the predicate against alternative
// spellings of an API path that gin would still route/miss as that path:
// duplicate slashes, dot segments, and (via the httptest below) percent
// encoding. The SPA fallback must never serve HTML for any of them.
func TestReservedAPIPathBypassSpellings(t *testing.T) {
	reserved := []string{
		"/api/nonexistent",
		"//api/nonexistent",
		"/assets/../api/nonexistent",
		"/pg/../v1/messages",
		"/api",
		// Loose prefix is the deliberate conservative direction: an API-shaped
		// path gets JSON 404, never HTML ("/v1" covering "/v1beta" relies on it).
		"/apifoo",
		"/v1beta/nonexistent",
	}
	for _, p := range reserved {
		require.True(t, isReservedAPIPath(p), "expected %q to be reserved", p)
	}

	spa := []string{
		"/", "/chat/123", "/console", "/admin", "/admin/users/1",
		"/login", "/setup",
	}
	for _, p := range spa {
		require.False(t, isReservedAPIPath(p), "expected %q to be a SPA path", p)
	}
}

// TestNoRouteDecisionSeesDecodedPath pins the net/http → gin contract the
// NoRoute handler relies on: the fallback decision reads c.Request.URL.Path
// (percent-DECODED), so an encoded spelling like /%61pi/x is classified as the
// /api/x gin actually tried to route, and a query string never leaks into the
// match (both would slip through a raw RequestURI prefix check).
func TestNoRouteDecisionSeesDecodedPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.NoRoute(func(c *gin.Context) {
		if isReservedAPIPath(c.Request.URL.Path) {
			c.JSON(http.StatusNotFound, gin.H{"error": "reserved"})
			return
		}
		c.String(http.StatusOK, "spa")
	})

	cases := []struct {
		target   string
		reserved bool
	}{
		{"/%61pi/nonexistent", true}, // decodes to /api/nonexistent
		{"/api/nonexistent?x=1", true},
		{"//api/nonexistent", true},
		{"/chat/123", false},
		{"/admin/users/1", false},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, tc.target, nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if tc.reserved {
			require.Equal(t, http.StatusNotFound, rec.Code, "target %q", tc.target)
			require.Contains(t, rec.Header().Get("Content-Type"), "application/json", "target %q", tc.target)
		} else {
			require.Equal(t, http.StatusOK, rec.Code, "target %q", tc.target)
			require.Equal(t, "spa", rec.Body.String(), "target %q", tc.target)
		}
	}
}
