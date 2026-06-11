package router

import (
	"bytes"
	"embed"
	"net/http"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets: the React console themes
// (served under /admin) and the Xingsuan Vue user face (served at the root).
type ThemeAssets struct {
	DefaultBuildFS    embed.FS
	DefaultIndexPage  []byte
	ClassicBuildFS    embed.FS
	ClassicIndexPage  []byte
	XingsuanBuildFS   embed.FS
	XingsuanIndexPage []byte
}

// appConfigPlaceholder is replaced per request in the root SPA index with the
// current public settings (see controller.RenderAppConfigScript).
var appConfigPlaceholder = []byte("<!--app-config-->")

// reservedPrefixes are API surfaces that must NEVER fall back to a SPA index:
// an unmatched path under them returns the relay JSON 404. "/v1" also covers
// "/v1beta" by string prefix. (The dynamic /:mode/mj relay prefix cannot be
// listed statically — pre-existing upstream gap.) Completeness against the
// actual route table is pinned by TestReservedPrefixesCoverRouteTable.
var reservedPrefixes = []string{
	"/v1", "/api", "/assets", "/pg", "/mj", "/suno", "/dashboard", "/kling", "/jimeng",
}

// isReservedAPIPath reports whether a request path belongs to an API surface
// that must never fall back to a SPA index. It must see the same path
// representation gin matched routes against (URL.Path, percent-decoded) and
// additionally cleans it, so encoded ("/%61pi/x"), duplicate-slash ("//api/x")
// and dot-segment ("/assets/../api/x") spellings cannot reach the HTML
// fallback. The prefix match is deliberately loose ("/v1" also covers
// "/v1beta", "/apifoo" matches "/api"): the conservative failure mode is a
// JSON 404, never HTML for something API-shaped.
func isReservedAPIPath(urlPath string) bool {
	cleaned := path.Clean(urlPath)
	for _, prefix := range reservedPrefixes {
		if strings.HasPrefix(cleaned, prefix) {
			return true
		}
	}
	return false
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)
	xingsuanFS := common.EmbedFolder(assets.XingsuanBuildFS, "web/xingsuan/dist")

	// Fonts are already compressed; re-gzipping the font-heavy root FS per
	// request is wasted work.
	router.Use(gzip.Gzip(gzip.DefaultCompression, gzip.WithExcludedExtensions([]string{".woff", ".woff2"})))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	// React console assets live under /admin (their build uses an /admin/ asset
	// prefix); the Xingsuan Vue user face owns the root. Both embed FSes return
	// ErrNotExist for "/" so index renders always go through NoRoute below,
	// where the per-request injection happens.
	router.Use(static.Serve("/admin", themeFS))
	router.Use(static.Serve("/", xingsuanFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		// Decoded + cleaned, NOT RequestURI: gin matched (and missed) routes on
		// the decoded URL.Path, so the fallback decision must use the same view.
		uri := path.Clean(c.Request.URL.Path)
		if isReservedAPIPath(uri) {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if strings.HasPrefix(uri, "/admin") {
			// React console SPA fallback (theme-aware, analytics-injected bytes).
			if common.GetTheme() == "classic" {
				c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
			} else {
				c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
			}
			return
		}
		// Root SPA fallback: inject the CURRENT public settings on every render
		// so admin option changes reach new page loads without a restart (the
		// frontend skips its settings fetch when the injected config exists).
		page := assets.XingsuanIndexPage
		if script := controller.RenderAppConfigScript(); script != nil {
			page = bytes.Replace(page, appConfigPlaceholder, script, 1)
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", page)
	})
}
